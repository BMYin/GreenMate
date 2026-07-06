export function localDate(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}

export function formatTaskType(type) {
  return type
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function fallbackCareInstruction(task) {
  const action = `${task.type || ""} ${task.action || ""}`.toLowerCase();

  if (action.includes("check") && action.includes("soil")) {
    return "Check whether the top layer of soil feels dry before deciding whether to water.";
  }
  if (action.includes("skip") && action.includes("water")) {
    return "Rain is expected to provide sufficient moisture today. Check the soil again tomorrow.";
  }
  if (action.includes("water")) {
    return "Check whether the top layer of soil looks dry or feels dry to the touch before watering. Then record how much water you gave.";
  }
  if (action.includes("fertiliz") || action.includes("fertilis")) {
    return "Apply the recommended amount, then record the care.";
  }
  if (action.includes("prune")) {
    return "Remove dead or damaged growth if needed, then record the care.";
  }
  if (action.includes("monitor") || action.includes("observe")) {
    return "Observe the plant over the next few days and record any changes.";
  }
  if (action.includes("move")) {
    return "Move the plant to the suggested position, then record the care.";
  }
  if (action.includes("repot")) {
    return "Use the suggested pot size if repotting is needed, then record the care.";
  }

  return "Follow the suggested care, then record what you did.";
}
