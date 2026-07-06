import { buildPlantContext } from "../../agent/buildPlantContext.js";
import {
  generateDailyCarePlan,
  getPendingCareWeatherAdjustment,
  toPendingPlantEvent
} from "../../agent/dailyCareAgent.js";
import { buildPlantEventStatusUpdate } from "../../agent/plantArchive.js";
import { getSupabaseClient } from "../lib/supabaseClient.js";
import { getWeather } from "../tools/weatherTool.js";

function recentDate(today, days) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function toApiTask(event, plantNames) {
  return {
    id: event.id,
    plantId: event.plant_id,
    plantName: plantNames.get(event.plant_id) || "Plant",
    type: event.event_type,
    action: event.title,
    timing: event.due_date,
    priority: event.priority,
    reason: event.ai_reason || "Recommended for today.",
    status: event.status,
    suggestedValue:
      event.suggested_value == null
        ? null
        : { value: event.suggested_value, unit: event.unit || "" }
  };
}

async function readTodayInputs(supabase, today) {
  const [plantsResult, historyResult, tasksResult, photosResult] = await Promise.all([
    supabase
      .from("plants")
      .select("*")
      .is("archived_at", null),
    supabase
      .from("plant_events")
      .select(
        "id, plant_id, event_type, title, status, priority, due_date, event_date, completed_at, suggested_value, actual_value, unit, ai_reason, notes"
      )
      .eq("status", "completed")
      .neq("event_type", "photo")
      .gte("event_date", recentDate(today, 60)),
    supabase
      .from("plant_events")
      .select(
        "id, plant_id, event_type, title, status, priority, due_date, suggested_value, unit, ai_reason"
      )
      .eq("due_date", today)
      .neq("event_type", "photo")
      .in("status", ["pending", "completed", "delayed", "skipped"]),
    supabase
      .from("plant_photos")
      .select("plant_id, image_url, created_at")
      .order("created_at", { ascending: false })
  ]);

  if (plantsResult.error) throw plantsResult.error;
  if (historyResult.error) throw historyResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (photosResult.error) throw photosResult.error;

  return {
    plants: plantsResult.data || [],
    history: historyResult.data || [],
    tasks: tasksResult.data || [],
    photos: photosResult.data || []
  };
}

async function generateAndReadTodayCare(today, supabase, weatherProvider, weatherOptions) {
  const inputs = await readTodayInputs(supabase, today);
  const plantEvents = [...inputs.history, ...inputs.tasks];
  const weather = await weatherProvider(weatherOptions);
  const latestPhotoByPlant = new Map();
  for (const photo of inputs.photos) {
    if (!latestPhotoByPlant.has(photo.plant_id)) {
      latestPhotoByPlant.set(photo.plant_id, photo.image_url);
    }
  }
  const contexts = inputs.plants.map((plant) =>
    buildPlantContext({
      plant,
      plantEvents,
      currentDate: today,
      weather,
      latestPhotoReference: latestPhotoByPlant.get(plant.id) || null
    })
  );

  // Reconcile persisted watering with today's weather before returning one action.
  for (const context of contexts) {
    for (const task of context.existingPendingTasks) {
      const adjustment = getPendingCareWeatherAdjustment(context, task);
      if (!adjustment) continue;

      const { error } = await supabase
        .from("plant_events")
        .update(adjustment)
        .eq("id", task.id)
        .eq("status", "pending");
      if (error) throw error;
    }
  }

  const carePlan = generateDailyCarePlan(contexts);
  const contextByPlantId = new Map(
    contexts.map((context) => [context.plantProfile.id, context])
  );
  const generatedEvents = carePlan.plantAssessments.flatMap((assessment) =>
    assessment.suggestedCare.map((care) =>
      toPendingPlantEvent(contextByPlantId.get(assessment.plantId), care)
    )
  );

  if (generatedEvents.length > 0) {
    const { error } = await supabase.from("plant_events").insert(generatedEvents);
    if (error) throw error;
  }

  const { data, error } = await supabase
    .from("plant_events")
    .select(
      "id, plant_id, event_type, title, status, priority, due_date, suggested_value, unit, ai_reason"
    )
    .eq("due_date", today)
    .neq("event_type", "photo")
    .in("status", ["pending", "completed", "delayed", "skipped"])
    .order("created_at", { ascending: true });

  if (error) throw error;

  const plantNames = new Map(
    inputs.plants.map((plant) => [plant.id, plant.nickname])
  );
  const activePlantIds = new Set(inputs.plants.map((plant) => plant.id));
  return {
    gardenBrief: carePlan.gardenBrief,
    weather,
    plantAssessments: carePlan.plantAssessments,
    tasks: (data || [])
      .filter((event) => activePlantIds.has(event.plant_id))
      .map((event) => toApiTask(event, plantNames))
  };
}

const todayCareRuns = new WeakMap();

export function getTodayCare(
  today,
  supabase = getSupabaseClient(),
  { weatherProvider = getWeather, weatherOptions = {} } = {}
) {
  let clientRuns = todayCareRuns.get(supabase);
  if (!clientRuns) {
    clientRuns = new Map();
    todayCareRuns.set(supabase, clientRuns);
  }
  const runKey = `${today}:${weatherOptions.location || ""}:${weatherOptions.latitude ?? ""}:${weatherOptions.longitude ?? ""}`;
  if (clientRuns.has(runKey)) return clientRuns.get(runKey);

  const run = generateAndReadTodayCare(today, supabase, weatherProvider, weatherOptions).finally(() => {
    clientRuns.delete(runKey);
  });
  clientRuns.set(runKey, run);
  return run;
}

export async function completeCareTask(
  taskId,
  { actualValue, actualAction, notes, note },
  supabase = getSupabaseClient()
) {
  const numericValue =
    actualValue === null || actualValue === undefined || actualValue === ""
      ? null
      : Number(actualValue);

  if (numericValue !== null && !Number.isFinite(numericValue)) {
    throw new TypeError("Actual value must be numeric.");
  }

  const { data, error } = await supabase
    .from("plant_events")
    .update(
      buildPlantEventStatusUpdate({
        status: "completed",
        actualValue: numericValue,
        actualAction,
        note:
          typeof (notes ?? note) === "string" && (notes ?? note).trim()
            ? (notes ?? note).trim()
            : null
      })
    )
    .eq("id", taskId)
    .eq("status", "pending")
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function delayCareTask(taskId, supabase = getSupabaseClient()) {
  const { data, error } = await supabase
    .from("plant_events")
    .update(buildPlantEventStatusUpdate({ status: "delayed" }))
    .eq("id", taskId)
    .eq("status", "pending")
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function skipCareTask(
  taskId,
  { note = null } = {},
  supabase = getSupabaseClient()
) {
  const { data, error } = await supabase
    .from("plant_events")
    .update(buildPlantEventStatusUpdate({ status: "skipped", note }))
    .eq("id", taskId)
    .eq("status", "pending")
    .select("id")
    .single();

  if (error) throw error;
  return data;
}
