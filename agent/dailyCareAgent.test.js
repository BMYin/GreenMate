import test from "node:test";
import assert from "node:assert/strict";

import { buildPlantContext } from "./buildPlantContext.js";
import {
  generateDailyCarePlan,
  generatePlantAssessment,
  generateRuleAssessment,
  getPendingCareWeatherAdjustment
} from "./dailyCareAgent.js";

const today = "2026-07-02";
const cloudyWeather = {
  location: "Auckland",
  condition: "cloudy",
  temperatureC: 18,
  rainExpected: false,
  humidity: 70
};

function plant(overrides = {}) {
  return {
    id: "plant-1",
    nickname: "Blueberry",
    species: "Vaccinium",
    location: "Patio",
    indoorOutdoor: "outdoor",
    notes: "",
    ...overrides
  };
}

function completedEvent({
  plantId = "plant-1",
  type = "water",
  title = "Water",
  date
}) {
  return {
    plant_id: plantId,
    event_type: type,
    title,
    status: "completed",
    event_date: date,
    completed_at: `${date}T09:00:00Z`,
    due_date: date
  };
}

function contextFor({ selectedPlant = plant(), events = [], weather = cloudyWeather }) {
  return buildPlantContext({
    plant: selectedPlant,
    plantEvents: events,
    currentDate: today,
    weather
  });
}

test("recent watering prevents another watering recommendation", () => {
  const assessment = generatePlantAssessment(
    contextFor({ events: [completedEvent({ date: "2026-06-30" })] })
  );

  assert.equal(
    assessment.suggestedCare.some((care) => care.type === "water"),
    false
  );
  assert.equal(assessment.status, "healthy");
});

test("outdoor plant with sufficient rain gets a skip-watering action", () => {
  const assessment = generatePlantAssessment(
    contextFor({
      events: [completedEvent({ date: "2026-06-22" })],
      weather: {
        location: "Auckland",
        condition: "rainy",
        temperatureC: 13,
        rainExpected: true,
        humidity: 90
      }
    })
  );

  assert.equal(assessment.suggestedCare[0].type, "observe");
  assert.equal(assessment.suggestedCare[0].title, "Skip watering today");
  assert.equal(assessment.suggestedCare[0].due, "today");
  assert.equal(assessment.suggestedCare[0].priority, "low");
  assert.equal(assessment.suggestedCare.some((care) => care.type === "water"), false);
  assert.ok(assessment.suggestedCare[0].reason.includes("Enough rain is expected"));
});

test("rain replaces an existing pending outdoor watering action", () => {
  const context = contextFor({
    events: [
      completedEvent({ date: "2026-06-22" }),
      {
        id: "pending-water",
        plant_id: "plant-1",
        event_type: "water",
        title: "Water",
        status: "pending",
        due_date: today
      }
    ],
    weather: {
      location: "Auckland",
      condition: "cloudy",
      temperatureC: 16,
      precipitationMm: 4,
      rainExpected: true,
      humidity: 85
    }
  });

  assert.deepEqual(
    getPendingCareWeatherAdjustment(context, context.existingPendingTasks[0]),
    {
      event_type: "observe",
      title: "Skip watering today",
      priority: "low",
      suggested_value: null,
      unit: null,
      ai_reason: "Enough rain is expected today, so this outdoor plant does not need additional watering."
    }
  );
});

test("plant with no archive gets a condition check", () => {
  const assessment = generatePlantAssessment(contextFor({}));

  assert.equal(assessment.status, "observation_needed");
  assert.deepEqual(assessment.suggestedCare[0], {
    type: "check",
    title: "Check plant condition",
    instruction: "Look at the leaves and feel the soil, then record anything unusual.",
    reason: "There is no recent care history, so begin with a quick condition check.",
    priority: "normal",
    confidence: "high",
    due: "today",
    suggestedValue: null,
    unit: null
  });
});

test("old fertilizer record creates a fertilizer suggestion", () => {
  const assessment = generatePlantAssessment(
    contextFor({
      events: [
        completedEvent({
          type: "fertilize",
          title: "Fertilize",
          date: "2026-05-20"
        })
      ]
    })
  );

  const fertilizer = assessment.suggestedCare.find(
    (care) => care.type === "fertilize"
  );
  assert.equal(fertilizer.suggestedValue, 5);
  assert.equal(fertilizer.unit, "ml");
  assert.equal(fertilizer.priority, "normal");
});

test("dryness evidence can produce a measured watering recommendation", () => {
  const assessment = generatePlantAssessment(
    contextFor({
      selectedPlant: plant({ notes: "Soil is dry and leaves are wilting" }),
      events: [completedEvent({ date: "2026-06-22" })],
      weather: {
        ...cloudyWeather,
        condition: "sunny",
        temperatureC: 26
      }
    })
  );

  const watering = assessment.suggestedCare.find((care) => care.type === "water");
  assert.equal(watering.priority, "high");
  assert.equal(watering.suggestedValue, 250);
  assert.equal(watering.unit, "ml");
});

test("duplicate pending care type is removed from suggestions", () => {
  const assessment = generatePlantAssessment(
    contextFor({
      events: [
        completedEvent({ date: "2026-06-22" }),
        {
          plant_id: "plant-1",
          event_type: "check",
          title: "Check soil moisture",
          status: "pending",
          due_date: today,
          event_date: today
        }
      ]
    })
  );

  assert.equal(assessment.suggestedCare.some((care) => care.type === "check"), false);
});

test("garden brief counts match plant assessments", () => {
  const contexts = [
    contextFor({
      selectedPlant: plant({ id: "healthy", nickname: "Monstera" }),
      events: [completedEvent({ plantId: "healthy", date: "2026-06-30" })]
    }),
    contextFor({
      selectedPlant: plant({ id: "observe", nickname: "Fern" }),
      events: []
    }),
    contextFor({
      selectedPlant: plant({
        id: "urgent",
        nickname: "Avocado",
        notes: "Soil is dry and leaves are wilting"
      }),
      events: [completedEvent({ plantId: "urgent", date: "2026-06-20" })],
      weather: { ...cloudyWeather, condition: "sunny", temperatureC: 27 }
    })
  ];
  const result = generateDailyCarePlan(contexts);

  assert.deepEqual(Object.keys(result), ["gardenBrief", "plantAssessments"]);
  assert.deepEqual(Object.keys(result.gardenBrief), ["title", "summary", "counts"]);
  assert.deepEqual(Object.keys(result.plantAssessments[0]), [
    "plantId",
    "plantName",
    "status",
    "confidence",
    "evidence",
    "summary",
    "reasons",
    "suggestedCare"
  ]);
  assert.equal(result.plantAssessments.length, 3);
  assert.deepEqual(Object.keys(result.plantAssessments[1].suggestedCare[0]), [
    "type",
    "title",
    "instruction",
    "reason",
    "priority",
    "confidence",
    "due",
    "suggestedValue",
    "unit"
  ]);
  assert.deepEqual(result.gardenBrief.counts, {
    totalPlants: 3,
    healthy: 1,
    needsAttention: 2,
    urgent: 1
  });
});

test("rule decisions are deterministic and separate from explanation", () => {
  const context = contextFor({
    selectedPlant: plant({ notes: "Soil is dry and leaves are wilting" }),
    events: [completedEvent({ date: "2026-06-22" })],
    weather: { ...cloudyWeather, condition: "sunny", temperatureC: 26 }
  });
  const first = generateRuleAssessment(context);
  const second = generateRuleAssessment(context);

  assert.deepEqual(first, second);
  assert.equal(Object.hasOwn(first.decisions[0], "reason"), false);
  assert.equal(Object.hasOwn(first.decisions[0], "instruction"), false);
  assert.equal(first.decisions[0].evidence[0].code, "days_since_watering");
});

test("explanations are generated from rule evidence", () => {
  const context = contextFor({
    events: [completedEvent({ date: "2026-06-22" })],
    weather: { ...cloudyWeather, condition: "sunny", temperatureC: 26 }
  });
  const ruleAssessment = generateRuleAssessment(context);
  const assessment = generatePlantAssessment(context);
  const elapsedDays = ruleAssessment.evidence.find(
    (item) => item.code === "days_since_watering"
  ).value;

  assert.ok(assessment.reasons[0].includes(String(elapsedDays)));
  assert.ok(assessment.suggestedCare[0].instruction);
  assert.equal(assessment.suggestedCare[0].confidence, "medium");
  assert.equal(assessment.suggestedCare[0].type, ruleAssessment.decisions[0].type);
  assert.equal(
    assessment.suggestedCare[0].priority,
    ruleAssessment.decisions[0].priority
  );
  assert.equal(
    assessment.suggestedCare[0].suggestedValue,
    ruleAssessment.decisions[0].suggestedValue
  );
});
