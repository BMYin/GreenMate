import { getCareRule } from "./careRules.js";

function evidenceValue(decision, code) {
  return decision.evidence.find((item) => item.code === code)?.value;
}

function withDays(template, decision) {
  return template.replace(
    "{days}",
    String(evidenceValue(decision, "days_since_watering") ??
      evidenceValue(decision, "days_since_fertilizing"))
  );
}

export function explainCareDecision(decision) {
  const rule = getCareRule(decision.ruleId);
  let title = rule.title;
  let instruction = rule.instruction;
  let reason = withDays(rule.reason, decision);

  if (decision.variant === "rain_observation") {
    title = rule.rainTitle;
    instruction = rule.rainInstruction;
    reason = rule.rainReason;
  } else if (decision.variant === "dryness_confirmed") {
    title = rule.strongEvidenceTitle;
    instruction = rule.strongEvidenceInstruction;
    reason = withDays(rule.strongEvidenceReason, decision);
  } else if (decision.variant === "warm_moisture_check") {
    reason = `${reason} ${rule.warmReason}`;
  } else if (decision.variant === "cool_moisture_check") {
    reason = `${reason} ${rule.coolReason}`;
  }

  return {
    type: decision.type,
    title,
    instruction,
    reason,
    priority: decision.priority,
    confidence: decision.confidence,
    due: decision.due,
    suggestedValue: decision.suggestedValue,
    unit: decision.unit
  };
}

export function explainPlantAssessment(ruleAssessment) {
  const suggestedCare = ruleAssessment.decisions.map(explainCareDecision);
  let summary = "No care action is recommended today.";

  if (ruleAssessment.hasPendingRecommendation) {
    summary = "A GreenMate recommendation is already waiting for review.";
  } else if (ruleAssessment.status === "urgent") {
    summary = `${suggestedCare[0].title} needs attention today.`;
  } else if (ruleAssessment.status === "observation_needed") {
    summary = "GreenMate recommends a quick observation before taking action.";
  } else if (ruleAssessment.status === "needs_attention") {
    summary = `${suggestedCare[0].title} is recommended.`;
  }

  const explainedReasons = suggestedCare.map((care) => care.reason);

  return {
    summary,
    reasons: [...new Set([...explainedReasons, ...ruleAssessment.pendingReasons])],
    suggestedCare
  };
}

export function explainGardenBrief(counts) {
  if (counts.needsAttention === 0) {
    return {
      title: "Your garden looks calm today.",
      summary: `I checked ${counts.totalPlants} ${counts.totalPlants === 1 ? "plant" : "plants"}. No care is needed today.`
    };
  }

  return {
    title: `${counts.needsAttention} ${counts.needsAttention === 1 ? "plant may" : "plants may"} need attention.`,
    summary:
      counts.urgent > 0
        ? `${counts.urgent} ${counts.urgent === 1 ? "care suggestion is" : "care suggestions are"} high priority.`
        : `I checked ${counts.totalPlants} ${counts.totalPlants === 1 ? "plant" : "plants"}. Here’s what may help today.`
  };
}
