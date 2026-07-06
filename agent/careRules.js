import { readFileSync } from "node:fs";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function loadSkill(fileName) {
  return readFileSync(new URL(`../skills/${fileName}`, import.meta.url), "utf8");
}

function readAdapterConfiguration(skillDocument, fileName) {
  const match = skillDocument.match(
    /## MVP Adapter Configuration\s*```json\s*([\s\S]*?)```/
  );

  if (!match) {
    throw new Error(`${fileName} is missing its MVP adapter configuration.`);
  }

  return JSON.parse(match[1]);
}

const skillDocuments = {
  plantData: loadSkill("plant-data-skill.md"),
  careDecision: loadSkill("care-decision-skill.md"),
  weatherDecision: loadSkill("weather-decision-skill.md"),
  taskOutput: loadSkill("task-output-skill.md")
};

const plantDataConfiguration = readAdapterConfiguration(
  skillDocuments.plantData,
  "plant-data-skill.md"
);
const careDecisionConfiguration = readAdapterConfiguration(
  skillDocuments.careDecision,
  "care-decision-skill.md"
);
const weatherConfiguration = readAdapterConfiguration(
  skillDocuments.weatherDecision,
  "weather-decision-skill.md"
);
const taskOutputConfiguration = readAdapterConfiguration(
  skillDocuments.taskOutput,
  "task-output-skill.md"
);

function daysBetween(from, to) {
  return Math.floor(
    (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_IN_MS
  );
}

function eventDescription(event) {
  return `${event.type || ""} ${event.title || ""}`.toLowerCase();
}

function latestCompleted(events, terms = []) {
  return events
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
}

function completedDate(event) {
  return (event.completedAt || event.eventDate).slice(0, 10);
}

function evidence(code, value, source, unit = null) {
  return { code, value, unit, source };
}

function decision(rule, overrides = {}) {
  return {
    ruleId: rule.id,
    variant: "default",
    type: rule.type,
    priority: rule.priority,
    due: rule.priority === "low" ? "soon" : "today",
    suggestedValue: rule.suggestedValue,
    unit: rule.unit,
    confidence: "medium",
    evidence: [],
    ...overrides
  };
}

function elapsedHistoryDecision(rule, context) {
  const latestEvent = latestCompleted(
    context.plantArchive.recentEvents,
    rule.historyTerms
  );
  if (!latestEvent) return null;

  const elapsedDays = daysBetween(
    completedDate(latestEvent),
    context.currentDate
  );
  if (elapsedDays < rule.minimumDays) return null;

  return decision(rule, {
    confidence: "high",
    evidence: [
      evidence("days_since_fertilizing", elapsedDays, "plant_archive", "days")
    ]
  });
}

function wateringDecision(rule, context) {
  if (!context.plantArchive.lastWateringDate) return null;

  const elapsedDays = daysBetween(
    context.plantArchive.lastWateringDate,
    context.currentDate
  );
  if (elapsedDays < rule.minimumDays) return null;

  const isOutdoor = context.plantProfile.indoorOutdoor === "outdoor";
  const rainBlocksWatering = isOutdoor && (
    context.weather.rainExpected ||
    context.weather.condition === "rainy" ||
    (typeof context.weather.precipitationMm === "number" &&
      context.weather.precipitationMm >=
        weatherConfiguration.sufficientRainfallMm)
  );
  const observations = context.plantArchive.observations.join(" ").toLowerCase();
  const matchingDrynessTerm = rule.strongEvidenceTerms.find((term) =>
    observations.includes(term)
  );
  const warmOrSunny =
    context.weather.condition === "sunny" ||
    (typeof context.weather.temperatureC === "number" &&
      context.weather.temperatureC >= weatherConfiguration.warmTemperatureC) ||
    (typeof context.weather.humidity === "number" &&
      context.weather.humidity <= weatherConfiguration.dryHumidityPercent);
  const coldOrWet =
    (typeof context.weather.temperatureC === "number" &&
      context.weather.temperatureC <= weatherConfiguration.coldTemperatureC) ||
    (isOutdoor &&
      weatherConfiguration.wetConditions.includes(context.weather.condition));
  const baseEvidence = [
    evidence("days_since_watering", elapsedDays, "plant_archive", "days"),
    evidence("weather_condition", context.weather.condition, "weather"),
    evidence("temperature", context.weather.temperatureC, "weather", "celsius")
  ];

  if (rainBlocksWatering) {
    // Weather may replace a watering action, but never bypasses the plant archive.
    return decision(rule, {
      variant: "rain_observation",
      type: "observe",
      priority: "low",
      due: "today",
      suggestedValue: null,
      unit: null,
      confidence: "high",
      evidence: [
        ...baseEvidence,
        evidence("rain_expected", true, "weather")
      ]
    });
  }

  if (matchingDrynessTerm) {
    const highPriority =
      warmOrSunny ||
      elapsedDays >=
        rule.minimumDays + rule.highPriorityAfterAdditionalDays;

    return decision(rule, {
      variant: "dryness_confirmed",
      type: rule.strongEvidenceType,
      priority: highPriority ? "high" : rule.priority,
      due: "today",
      confidence: "high",
      evidence: [
        ...baseEvidence,
        evidence("dryness_observed", matchingDrynessTerm, "plant_archive")
      ]
    });
  }

  return decision(rule, {
    variant: warmOrSunny
      ? "warm_moisture_check"
      : coldOrWet
        ? "cool_moisture_check"
        : "moisture_check",
    priority: coldOrWet ? "low" : rule.priority,
    due: coldOrWet ? "soon" : "today",
    suggestedValue: null,
    unit: null,
    confidence: "medium",
    evidence: baseEvidence
  });
}

function noteSignalDecision(rule, context) {
  const notes = context.plantArchive.observations.join(" ").toLowerCase();
  const matchingTerm = rule.noteTerms.find((term) => notes.includes(term));
  if (!matchingTerm) return null;

  const latestEvent = latestCompleted(
    context.plantArchive.recentEvents,
    rule.historyTerms
  );
  if (
    latestEvent &&
    daysBetween(completedDate(latestEvent), context.currentDate) <
      rule.cooldownDays
  ) {
    return null;
  }

  return decision(rule, {
    confidence: "medium",
    evidence: [evidence("issue_note", matchingTerm, "plant_archive")]
  });
}

function evaluateRule(rule, context) {
  if (rule.trigger === "watering_assessment") {
    return wateringDecision(rule, context);
  }
  if (rule.trigger === "elapsed_history") {
    return elapsedHistoryDecision(rule, context);
  }
  if (rule.trigger === "note_signal") return noteSignalDecision(rule, context);
  if (rule.trigger === "empty_history") {
    return context.plantArchive.recentEvents.some(
      (event) => event.status === "completed"
    )
      ? null
      : decision(rule, {
          confidence: "high",
          evidence: [evidence("no_care_history", true, "plant_archive")]
        });
  }

  return null;
}

export function selectPlantCareData(plant) {
  return Object.fromEntries(
    plantDataConfiguration.profileFields
      .filter((field) => Object.hasOwn(plant, field))
      .map((field) => [field, plant[field]])
  );
}

export function getTaskOutputDefaults() {
  return { ...taskOutputConfiguration };
}

export function getCareRule(ruleId) {
  return careDecisionConfiguration.rules.find((rule) => rule.id === ruleId);
}

export function evaluateCareRules(context) {
  return careDecisionConfiguration.rules
    .map((rule) => evaluateRule(rule, context))
    .filter(Boolean)
    .sort(
      (a, b) =>
        careDecisionConfiguration.priorityWeight[b.priority] -
        careDecisionConfiguration.priorityWeight[a.priority]
    );
}

export const dailyCareSkillSources = Object.freeze({
  plantData: "skills/plant-data-skill.md",
  careDecision: "skills/care-decision-skill.md",
  weatherDecision: "skills/weather-decision-skill.md",
  taskOutput: "skills/task-output-skill.md"
});
