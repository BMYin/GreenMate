import test from "node:test";
import assert from "node:assert/strict";

import { buildPlantEventStatusUpdate } from "./plantArchive.js";

test("completed archive write-back preserves actual action and feedback", () => {
  const update = buildPlantEventStatusUpdate({
    status: "completed",
    actualValue: 220,
    actualAction: "Watered lightly",
    note: "Soil was still slightly moist.",
    completedAt: "2026-07-02T09:30:00Z"
  });

  assert.deepEqual(update, {
    status: "completed",
    actual_value: 220,
    notes: JSON.stringify({
      actualAction: "Watered lightly",
      notes: "Soil was still slightly moist."
    }),
    completed_at: "2026-07-02T09:30:00Z"
  });
});

test("delayed and skipped write-back keep their archive status", () => {
  assert.deepEqual(buildPlantEventStatusUpdate({ status: "delayed" }), {
    status: "delayed"
  });
  assert.deepEqual(
    buildPlantEventStatusUpdate({ status: "skipped", note: "Soil is wet." }),
    { status: "skipped", notes: "Soil is wet." }
  );
});
