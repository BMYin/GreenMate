const AUCKLAND = {
  location: "Auckland",
  latitude: -36.8485,
  longitude: 174.7633
};

const rainyWeatherCodes = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82,
  85, 86, 95, 96, 99
]);
const cloudyWeatherCodes = new Set([1, 2, 3, 45, 48]);
const SUFFICIENT_RAINFALL_MM = 1;

function nullableNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function conditionFor(weatherCode, precipitationMm) {
  if ((precipitationMm ?? 0) > 0 || rainyWeatherCodes.has(weatherCode)) {
    return "rainy";
  }
  if (weatherCode === 0) return "sunny";
  if (cloudyWeatherCodes.has(weatherCode)) return "cloudy";
  return "unknown";
}

export function fallbackWeather(now = new Date()) {
  return {
    location: AUCKLAND.location,
    temperatureC: 18,
    humidity: 70,
    precipitationMm: null,
    rainExpected: false,
    condition: "cloudy",
    fetchedAt: now.toISOString(),
    source: "fallback"
  };
}

export function normalizeOpenMeteoWeather(
  payload,
  now = new Date(),
  location = AUCKLAND.location
) {
  const current = payload?.current;
  const temperatureC = nullableNumber(current?.temperature_2m);
  if (temperatureC === null) {
    throw new Error("Open-Meteo did not return a current temperature.");
  }

  const humidity = nullableNumber(current.relative_humidity_2m);
  const currentPrecipitationMm = nullableNumber(current.precipitation);
  const forecastPrecipitationMm = nullableNumber(
    payload?.daily?.precipitation_sum?.[0]
  );
  const precipitationMm = forecastPrecipitationMm ?? currentPrecipitationMm;
  const weatherCode = nullableNumber(current.weather_code);
  const condition = conditionFor(weatherCode, currentPrecipitationMm);
  // Daily rainfall, rather than only current rain, determines watering suppression.
  const rainExpected =
    precipitationMm !== null && precipitationMm >= SUFFICIENT_RAINFALL_MM;

  return {
    location,
    temperatureC,
    humidity,
    precipitationMm,
    rainExpected,
    condition,
    fetchedAt: now.toISOString(),
    source: "Open-Meteo"
  };
}

export async function getWeather({
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = 5000,
  location = AUCKLAND.location,
  latitude,
  longitude
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable.");

    let resolvedLocation = location.trim() || AUCKLAND.location;
    let resolvedLatitude = latitude;
    let resolvedLongitude = longitude;

    if (!Number.isFinite(resolvedLatitude) || !Number.isFinite(resolvedLongitude)) {
      if (resolvedLocation.toLowerCase() === "auckland") {
        resolvedLatitude = AUCKLAND.latitude;
        resolvedLongitude = AUCKLAND.longitude;
      } else {
        // Manual settings are resolved once per request; GPS bypasses this lookup.
        const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
        geocodingUrl.searchParams.set("name", resolvedLocation);
        geocodingUrl.searchParams.set("count", "1");
        geocodingUrl.searchParams.set("language", "en");
        const geocodingResponse = await fetchImpl(geocodingUrl, { signal: controller.signal });
        if (!geocodingResponse.ok) {
          throw new Error(`Open-Meteo geocoding returned ${geocodingResponse.status}.`);
        }
        const [place] = (await geocodingResponse.json()).results || [];
        if (!place) throw new Error("Garden location was not found.");
        resolvedLatitude = place.latitude;
        resolvedLongitude = place.longitude;
        resolvedLocation = place.name || resolvedLocation;
      }
    }

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(resolvedLatitude));
    url.searchParams.set("longitude", String(resolvedLongitude));
    url.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,precipitation,weather_code"
    );
    url.searchParams.set("daily", "precipitation_sum");
    url.searchParams.set("timezone", "auto");

    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}.`);

    return normalizeOpenMeteoWeather(
      await response.json(),
      now(),
      resolvedLocation
    );
  } catch {
    return fallbackWeather(now());
  } finally {
    clearTimeout(timeout);
  }
}
