import test from "node:test";
import assert from "node:assert/strict";

import {
  loadSettings,
  saveSettings,
  settingsStorageKey,
  weatherLocationLabel
} from "./settings.js";

function memoryStorage(initialValue = null) {
  const values = new Map(
    initialValue === null ? [] : [[settingsStorageKey, initialValue]]
  );
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test("settings migrate the original garden location key", () => {
  const settings = loadSettings(memoryStorage(JSON.stringify({
    gardenLocation: "Napier",
    careStyle: "beginner"
  })));

  assert.equal(settings.defaultGardenLocation, "Napier");
  assert.equal(settings.careStyle, "beginner");
  assert.equal(Object.hasOwn(settings, "gardenLocation"), false);
});

test("settings persist through the shared storage helper", () => {
  const storage = memoryStorage();
  saveSettings({ defaultGardenLocation: "Wellington" }, storage);

  assert.deepEqual(JSON.parse(storage.getItem(settingsStorageKey)), {
    defaultGardenLocation: "Wellington"
  });
});

test("weather labels hide technical GPS placeholders", () => {
  const settings = {
    locationMode: "gps",
    resolvedLocation: "Auckland"
  };

  assert.equal(
    weatherLocationLabel(settings, { location: "Current Location" }),
    "Auckland"
  );
});
