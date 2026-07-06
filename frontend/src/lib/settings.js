export const settingsStorageKey = "greenmate.settings";

export const defaultSettings = Object.freeze({
  defaultGardenLocation: "Auckland",
  locationMode: "manual",
  latitude: null,
  longitude: null,
  resolvedLocation: null,
  defaultEnvironment: "mixed",
  careStyle: "balanced",
  photoReminder: true,
  units: "metric",
  dateFormat: "local"
});

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const storedSettings = JSON.parse(storage?.getItem(settingsStorageKey));
    const {
      gardenLocation: legacyGardenLocation,
      ...currentSettings
    } = storedSettings || {};

    // Preserve existing installations while keeping one canonical location key.
    return {
      ...defaultSettings,
      ...currentSettings,
      defaultGardenLocation:
        storedSettings?.defaultGardenLocation ||
        legacyGardenLocation ||
        defaultSettings.defaultGardenLocation
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  storage?.setItem(settingsStorageKey, JSON.stringify(settings));
}

export async function resolveGpsLocation(
  latitude,
  longitude,
  fetchImpl = globalThis.fetch
) {
  const url = new URL(
    "https://api.bigdatacloud.net/data/reverse-geocode-client"
  );
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("localityLanguage", "en");

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error("Location lookup failed.");

  const location = await response.json();
  return location.city || location.locality || location.principalSubdivision || null;
}

export function weatherLocationLabel(settings, weather) {
  if (settings.locationMode !== "gps") {
    return settings.defaultGardenLocation || weather?.location || "Auckland";
  }

  const apiLocation = weather?.location;
  const hasResolvedApiLocation =
    apiLocation && !["Current Location", "Using GPS"].includes(apiLocation);

  return settings.resolvedLocation || (
    hasResolvedApiLocation ? apiLocation : "Using GPS"
  );
}
