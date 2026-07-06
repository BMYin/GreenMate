import test from "node:test";
import assert from "node:assert/strict";

import { buildPlantContext } from "./buildPlantContext.js";

function event({ type, date, status = "completed", notes = null }) {
  return {
    id: `${type}-${date}`,
    plant_id: "blueberry-id",
    event_type: type,
    title: type === "water" ? "Water" : "Fertilize",
    status,
    priority: "normal",
    due_date: date,
    event_date: date,
    completed_at: status === "completed" ? `${date}T09:00:00Z` : null,
    notes
  };
}

test("buildPlantContext derives complete plant memory and weather inputs", () => {
  const weather = {
    location: "Auckland",
    condition: "rainy",
    temperatureC: 13,
    rainExpected: true,
    humidity: 88,
    precipitationMm: 1.2,
    fetchedAt: "2026-07-02T08:00:00.000Z",
    source: "Open-Meteo"
  };
  const context = buildPlantContext({
    plant: {
      id: "blueberry-id",
      nickname: "Blueberry",
      species: "Vaccinium",
      location: "Patio",
      growing_setup: "pot",
      environment: "outdoor",
      pot_size_cm: 28,
      soil_type: "Acidic mix",
      sunlight_exposure: "full_sun",
      growth_stage: "fruiting",
      notes: "A few leaves are curling"
    },
    plantEvents: [
      event({ type: "water", date: "2026-06-24" }),
      event({
        type: "fertilize",
        date: "2026-05-20",
        notes: "Growth looked steady"
      }),
      event({ type: "check", date: "2026-07-02", status: "pending" }),
      { plant_id: "another-plant", event_type: "water", status: "completed" }
    ],
    currentDate: "2026-07-02",
    weather,
    latestPhotoReference: "https://example.test/blueberry.jpg"
  });

  assert.equal(context.plantProfile.nickname, "Blueberry");
  assert.equal(context.plantProfile.growingSetup, "pot");
  assert.equal(context.plantProfile.indoorOutdoor, "outdoor");
  assert.equal(context.plantProfile.potSize, 28);
  assert.equal(context.plantProfile.soil, "Acidic mix");
  assert.equal(context.plantProfile.sunlight, "full_sun");
  assert.equal(context.plantProfile.growthStage, "fruiting");
  assert.equal(context.plantGrowthStage, "fruiting");
  assert.equal(context.plantArchive.recentEvents.length, 3);
  assert.equal(context.plantArchive.lastWateringDate, "2026-06-24");
  assert.equal(context.plantArchive.lastFertilizingDate, "2026-05-20");
  assert.deepEqual(context.plantArchive.observations, [
    "A few leaves are curling",
    "Growth looked steady"
  ]);
  assert.equal(
    context.plantArchive.latestPhotoReference,
    "https://example.test/blueberry.jpg"
  );
  assert.equal(context.existingPendingTasks.length, 1);
  assert.deepEqual(context.weather, weather);
  assert.equal(context.currentSeason, "winter");
  assert.deepEqual(Object.keys(context), [
    "plantProfile",
    "plantArchive",
    "currentDate",
    "currentSeason",
    "existingPendingTasks",
    "weather",
    "aiPhotoAnalysis",
    "userWateringPreferences",
    "plantGrowthStage",
    "lightConditions",
    "sensorData"
  ]);
  assert.deepEqual(Object.keys(context.plantArchive), [
    "recentEvents",
    "lastWateringDate",
    "lastFertilizingDate",
    "observations",
    "latestPhotoReference"
  ]);
});

test("buildPlantContext supplies fallback weather when no response is available", () => {
  const context = buildPlantContext({
    plant: { id: "plant-1", nickname: "Monstera" },
    currentDate: "2026-07-02"
  });

  assert.deepEqual(context.weather, {
    location: "Auckland",
    condition: "cloudy",
    temperatureC: 18,
    rainExpected: false,
    humidity: 70,
    precipitationMm: null,
    fetchedAt: null,
    source: "fallback"
  });
  assert.equal(context.plantArchive.latestPhotoReference, null);
});
