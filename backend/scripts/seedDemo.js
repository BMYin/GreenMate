import { createClient } from "@supabase/supabase-js";

const demoPlantNames = [
  "Cherry Tomato01",
  "Avocado01",
  "Lemon01",
  "Swan River Daisy01",
  "Indoor Fern"
];

function aucklandDate() {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function daysBefore(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function timestamp(date, hour = 0) {
  return `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function completedEvent({ plantId, type, title, daysAgo, today, notes = null, actualValue = null, suggestedValue = null, unit = null, reason = null, priority = "normal" }) {
  const date = daysBefore(today, daysAgo);
  return {
    plant_id: plantId,
    event_type: type,
    title,
    notes,
    event_date: date,
    status: "completed",
    priority,
    due_date: date,
    suggested_value: suggestedValue,
    actual_value: actualValue,
    unit,
    ai_reason: reason,
    completed_at: timestamp(date, 1),
    created_at: timestamp(date)
  };
}

function addedEvent(plantId, daysAgo, today) {
  return completedEvent({
    plantId,
    type: "plant_added",
    title: "Plant added",
    daysAgo,
    today,
    priority: "low",
    notes: "Added to the Demo Garden."
  });
}

async function seedDemoGarden() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const fetchWithTimeout = async (input, init = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    if (init.signal) {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout }
  });
  const today = aucklandDate();

  // Reruns replace only the named Demo Garden plants. Foreign-key cascades
  // remove their plant_events and plant_photos rows without touching users.
  console.log("Replacing any existing Demo Garden plants…");
  const { error: cleanupError } = await supabase
    .from("plants")
    .delete()
    .in("nickname", demoPlantNames);
  if (cleanupError) throw cleanupError;
  console.log("Existing Demo Garden rows cleared.");

  const plants = [
    {
      nickname: "Cherry Tomato01",
      species: "Cherry Tomato",
      location: "Back garden bed",
      growing_setup: "garden_bed",
      pot_size_cm: null,
      soil_type: "potting_mix",
      sunlight_exposure: "direct_sun_most_of_day",
      environment: "outdoor",
      growth_stage: "growing",
      status: "healthy",
      notes: "The soil is dry near the surface and a few leaves are starting to wilt."
    },
    {
      nickname: "Avocado01",
      species: "Avocado",
      location: "Sheltered patio",
      growing_setup: "pot",
      pot_size_cm: 17,
      soil_type: "potting_mix",
      sunlight_exposure: "morning_sun",
      environment: "outdoor",
      growth_stage: "growing",
      status: "healthy",
      notes: "Young tree with steady new leaf growth."
    },
    {
      nickname: "Lemon01",
      species: "Lemon",
      location: "Sunny patio",
      growing_setup: "pot",
      pot_size_cm: 21,
      soil_type: "potting_mix",
      sunlight_exposure: "direct_sun_most_of_day",
      environment: "outdoor",
      growth_stage: "growing",
      status: "healthy",
      notes: "New leaves look bright and healthy."
    },
    {
      nickname: "Swan River Daisy01",
      species: "Swan River Daisy",
      location: "Front step",
      growing_setup: "pot",
      pot_size_cm: 15,
      soil_type: "potting_mix",
      sunlight_exposure: "direct_sun_most_of_day",
      environment: "outdoor",
      growth_stage: "growing",
      status: "healthy",
      notes: "Compact new growth is forming before flowering."
    },
    {
      nickname: "Indoor Fern",
      species: "Fern — variety unknown",
      location: "Living room",
      growing_setup: "pot",
      pot_size_cm: null,
      soil_type: "indoor_plant_mix",
      sunlight_exposure: "bright_room",
      environment: "indoor",
      growth_stage: "looks_same",
      status: "healthy",
      notes: "Kept indoors in bright, indirect light away from outdoor rain."
    }
  ];

  const { data: insertedPlants, error: plantError } = await supabase
    .from("plants")
    .insert(plants)
    .select("id, nickname");
  if (plantError) throw plantError;
  console.log("Five Demo Garden plant profiles inserted.");

  const plantId = new Map(insertedPlants.map((plant) => [plant.nickname, plant.id]));
  const events = [
    addedEvent(plantId.get("Cherry Tomato01"), 24, today),
    addedEvent(plantId.get("Avocado01"), 21, today),
    addedEvent(plantId.get("Lemon01"), 28, today),
    addedEvent(plantId.get("Swan River Daisy01"), 16, today),
    addedEvent(plantId.get("Indoor Fern"), 30, today),

    completedEvent({
      plantId: plantId.get("Cherry Tomato01"),
      type: "water",
      title: "Watered garden bed",
      daysAgo: 10,
      today,
      suggestedValue: 500,
      actualValue: 500,
      unit: "ml",
      reason: "The garden bed needed steady moisture while establishing.",
      notes: "Watered slowly around the roots."
    }),
    completedEvent({
      plantId: plantId.get("Avocado01"),
      type: "water",
      title: "Watered Avocado",
      daysAgo: 2,
      today,
      suggestedValue: 250,
      actualValue: 220,
      unit: "ml",
      reason: "The potting mix was dry at the surface.",
      notes: "Soil was still slightly moist lower down."
    }),
    completedEvent({
      plantId: plantId.get("Lemon01"),
      type: "water",
      title: "Watered Lemon",
      daysAgo: 3,
      today,
      suggestedValue: 300,
      actualValue: 300,
      unit: "ml",
      reason: "The container needed even moisture.",
      notes: "Water drained cleanly from the pot."
    }),
    completedEvent({
      plantId: plantId.get("Lemon01"),
      type: "fertilize",
      title: "Fed Lemon",
      daysAgo: 10,
      today,
      suggestedValue: 5,
      actualValue: 5,
      unit: "ml",
      reason: "A light feed supported new leaf growth.",
      notes: "Used diluted citrus feed."
    }),
    completedEvent({
      plantId: plantId.get("Swan River Daisy01"),
      type: "check",
      title: "Checked new growth",
      daysAgo: 2,
      today,
      reason: "New growth was monitored before flowering.",
      notes: "Compact growth looks healthy."
    }),
    completedEvent({
      plantId: plantId.get("Indoor Fern"),
      type: "water",
      title: "Watered Indoor Fern",
      daysAgo: 9,
      today,
      suggestedValue: 200,
      actualValue: 180,
      unit: "ml",
      reason: "Indoor potting mix was beginning to dry.",
      notes: "Kept water away from the crown."
    }),
    {
      plant_id: plantId.get("Swan River Daisy01"),
      event_type: "observe",
      title: "Check flower buds",
      notes: "Not needed today; growth still looks steady.",
      event_date: daysBefore(today, 1),
      status: "skipped",
      priority: "low",
      due_date: daysBefore(today, 1),
      suggested_value: null,
      actual_value: null,
      unit: null,
      ai_reason: "The plant was approaching its flowering stage.",
      completed_at: null,
      created_at: timestamp(daysBefore(today, 1))
    }
  ];

  const { error: eventError } = await supabase.from("plant_events").insert(events);
  if (eventError) throw eventError;
  console.log("Demo Garden history inserted.");

  console.log(`Demo Garden seeded for ${today}.`);
  console.log(`Plants: ${demoPlantNames.join(", ")}`);
  console.log(`Events: ${events.length}. Photos: 0 (upload manually in Plant Detail).`);
}

seedDemoGarden().catch((error) => {
  console.error(`Demo Garden seed failed: ${error.message}`);
  process.exitCode = 1;
});
