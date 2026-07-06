/** Plant Archive holds long-term information; decision contexts are derived from it. */
export function createPlantArchive({
  plantProfiles = [],
  careHistory = [],
  diagnosisHistory = [],
  growthRecords = []
}) {
  return plantProfiles.map(({ notes, ...plantProfile }) => ({
    plantProfile,
    careHistory: careHistory.filter((entry) => entry.plantId === plantProfile.id),
    diagnosisHistory: diagnosisHistory.filter(
      (entry) => entry.plantId === plantProfile.id
    ),
    growthRecords: growthRecords.filter(
      (entry) => entry.plantId === plantProfile.id
    ),
    notes: notes || ""
  }));
}

export function buildPlantEventStatusUpdate({
  status,
  actualValue,
  actualAction,
  note,
  completedAt = new Date().toISOString()
}) {
  const update = { status };

  if (actualValue !== undefined) update.actual_value = actualValue;
  if (actualAction || note) {
    update.notes = actualAction
      ? JSON.stringify({ actualAction, notes: note || "" })
      : note;
  }
  if (status === "completed") update.completed_at = completedAt;

  return update;
}
