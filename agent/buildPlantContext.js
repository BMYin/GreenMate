import { selectPlantCareData } from "./careRules.js";

const DEFAULT_MOCK_WEATHER = {
  location: "Auckland",
  condition: "cloudy",
  temperatureC: 18,
  rainExpected: false,
  humidity: 70,
  precipitationMm: null,
  fetchedAt: null,
  source: "fallback"
};

function normalizeEvent(event) {
  return {
    id: event.id || null,
    plantId: event.plant_id,
    type: event.event_type,
    title: event.title,
    status: event.status,
    priority: event.priority || null,
    dueDate: event.due_date || null,
    eventDate: event.event_date || null,
    completedAt: event.completed_at || null,
    suggestedValue: event.suggested_value ?? null,
    actualValue: event.actual_value ?? null,
    unit: event.unit || null,
    reason: event.ai_reason || null,
    notes: event.notes || null
  };
}

function seasonForDate(currentDate, hemisphere) {
  const month = Number(currentDate.slice(5, 7));
  const northernSeason =
    month >= 3 && month <= 5
      ? "spring"
      : month >= 6 && month <= 8
        ? "summer"
        : month >= 9 && month <= 11
          ? "autumn"
          : "winter";

  if (hemisphere !== "southern") return northernSeason;

  return {
    spring: "autumn",
    summer: "winter",
    autumn: "spring",
    winter: "summer"
  }[northernSeason];
}

function eventDescription(event) {
  return `${event.type || ""} ${event.title || ""}`.toLowerCase();
}

function latestCompletedDate(events, terms) {
  const latest = events
    .filter(
      (event) =>
        event.status === "completed" &&
        terms.some((term) => eventDescription(event).includes(term))
    )
    .sort((a, b) => {
      const aDate = a.completedAt || a.eventDate;
      const bDate = b.completedAt || b.eventDate;
      return bDate.localeCompare(aDate);
    })[0];

  const completedDate = latest?.completedAt || latest?.eventDate;

  return completedDate ? String(completedDate).slice(0, 10) : null;
}

function readableNote(notes) {
  if (!notes) return null;

  try {
    const parsed = JSON.parse(notes);
    return parsed.notes || parsed.note || null;
  } catch {
    return notes;
  }
}

export function buildPlantContext({
  plant,
  plantEvents = [],
  currentDate,
  currentSeason = null,
  hemisphere = "southern",
  weather = DEFAULT_MOCK_WEATHER,
  latestPhotoReference = null,
  aiPhotoAnalysis = null,
  userWateringPreferences = null,
  plantGrowthStage = null,
  lightConditions = null,
  sensorData = null
}) {
  const normalizedPlant = {
    ...plant,
    growingSetup: plant.growingSetup ?? plant.growing_setup ?? null,
    indoorOutdoor: plant.indoorOutdoor ?? plant.environment ?? null,
    potSize: plant.potSize ?? plant.pot_size_cm ?? null,
    sunlight: plant.sunlight ?? plant.sunlight_exposure ?? null,
    soil: plant.soil ?? plant.soil_type ?? null,
    growthStage: plant.growthStage ?? plant.growth_stage ?? null
  };
  const recentEvents = plantEvents
    .filter((event) => event.plant_id === plant.id)
    .map(normalizeEvent);
  const issueNotes = [
    plant.notes,
    ...recentEvents.map((event) => readableNote(event.notes))
  ].filter(Boolean);

  return {
    plantProfile: selectPlantCareData(normalizedPlant),
    plantArchive: {
      recentEvents,
      lastWateringDate: latestCompletedDate(recentEvents, ["water"]),
      lastFertilizingDate: latestCompletedDate(recentEvents, [
        "fertiliz",
        "fertilis"
      ]),
      observations: issueNotes,
      latestPhotoReference
    },
    currentDate,
    currentSeason: currentSeason || seasonForDate(currentDate, hemisphere),
    existingPendingTasks: recentEvents.filter(
      (event) => event.status === "pending"
    ),
    weather: { ...DEFAULT_MOCK_WEATHER, ...weather },
    aiPhotoAnalysis,
    userWateringPreferences,
    plantGrowthStage: plantGrowthStage ?? normalizedPlant.growthStage,
    lightConditions,
    sensorData
  };
}
