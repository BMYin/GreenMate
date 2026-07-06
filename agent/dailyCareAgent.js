import {
  explainCareDecision,
  explainGardenBrief,
  explainPlantAssessment
} from "./aiGardenerExplanation.js";
import { evaluateCareRules, getTaskOutputDefaults } from "./careRules.js";

function alreadyRecordedForToday(context, careType) {
  return context.plantArchive.recentEvents.some(
    (event) =>
      event.type === careType &&
      event.dueDate === context.currentDate &&
      ["pending", "completed", "delayed", "skipped"].includes(event.status)
  );
}

function alreadyAssessedToday(context) {
  return context.plantArchive.recentEvents.some(
    (event) =>
      event.dueDate === context.currentDate &&
      ["pending", "completed", "delayed", "skipped"].includes(event.status)
  );
}

function ruleStatus(context, decisions) {
  const pendingToday = context.existingPendingTasks.filter(
    (task) => task.dueDate === context.currentDate
  );
  if (pendingToday.some((task) => task.priority === "high")) return "urgent";
  if (pendingToday.length > 0) return "needs_attention";
  if (decisions.length === 0) return "healthy";
  if (decisions.some((care) => care.priority === "high")) return "urgent";
  if (decisions.every((care) => ["check", "observe"].includes(care.type))) {
    return "observation_needed";
  }
  return "needs_attention";
}

function assessmentConfidence(context, decisions) {
  const pendingConfidence = context.existingPendingTasks.length > 0
    ? "high"
    : null;
  return pendingConfidence || decisions[0]?.confidence || "high";
}

export function generateRuleAssessment(context) {
  const hasPendingRecommendation = context.existingPendingTasks.some(
    (task) => task.dueDate === context.currentDate
  );
  const decisions = alreadyAssessedToday(context)
    ? []
    : evaluateCareRules(context)
        .filter((decision) => !alreadyRecordedForToday(context, decision.type))
        .slice(0, 1);
  const pendingReasons = context.existingPendingTasks
    .filter((task) => task.dueDate === context.currentDate && task.reason)
    .map((task) => task.reason);
  const evidence = decisions.flatMap((decision) => decision.evidence);

  return {
    plantId: context.plantProfile.id,
    plantName: context.plantProfile.nickname,
    status: ruleStatus(context, decisions),
    confidence: assessmentConfidence(context, decisions),
    evidence,
    decisions,
    hasPendingRecommendation,
    pendingReasons
  };
}

export function generatePlantAssessment(context) {
  const ruleAssessment = generateRuleAssessment(context);
  const explanation = explainPlantAssessment(ruleAssessment);

  return {
    plantId: ruleAssessment.plantId,
    plantName: ruleAssessment.plantName,
    status: ruleAssessment.status,
    confidence: ruleAssessment.confidence,
    evidence: ruleAssessment.evidence,
    summary: explanation.summary,
    reasons: explanation.reasons,
    suggestedCare: explanation.suggestedCare
  };
}

function gardenCounts(plantAssessments) {
  const totalPlants = plantAssessments.length;
  const healthy = plantAssessments.filter(
    (assessment) => assessment.status === "healthy"
  ).length;
  const urgent = plantAssessments.filter(
    (assessment) => assessment.status === "urgent"
  ).length;

  return {
    totalPlants,
    healthy,
    needsAttention: totalPlants - healthy,
    urgent
  };
}

export function generateDailyCarePlan(contexts) {
  const plantAssessments = contexts.map(generatePlantAssessment);
  const counts = gardenCounts(plantAssessments);

  return {
    gardenBrief: { ...explainGardenBrief(counts), counts },
    plantAssessments
  };
}

export function getPendingCareWeatherAdjustment(context, task) {
  if (task.status !== "pending" || task.type !== "water") return null;

  const rainDecision = evaluateCareRules(context).find(
    (care) => care.variant === "rain_observation"
  );
  if (!rainDecision) return null;

  const care = explainCareDecision(rainDecision);
  return {
    event_type: care.type,
    title: care.title,
    priority: care.priority,
    suggested_value: care.suggestedValue,
    unit: care.unit,
    ai_reason: care.reason
  };
}

export function toPendingPlantEvent(context, care) {
  const outputDefaults = getTaskOutputDefaults();

  return {
    plant_id: context.plantProfile.id,
    event_type: care.type,
    title: care.title,
    event_date: context.currentDate,
    status: outputDefaults.defaultStatus,
    priority: care.priority,
    due_date: context.currentDate,
    suggested_value: care.suggestedValue,
    actual_value: outputDefaults.actualValue,
    unit: care.unit,
    ai_reason: care.reason
  };
}

export function generateDailyCareEvent(context) {
  const [care] = generatePlantAssessment(context).suggestedCare;
  return care ? toPendingPlantEvent(context, care) : null;
}
