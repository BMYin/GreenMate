import test from "node:test";
import assert from "node:assert/strict";

import {
  getWeather,
  normalizeOpenMeteoWeather
} from "./weatherTool.js";

const fetchedAt = new Date("2026-07-04T08:00:00.000Z");

test("normalizes Open-Meteo current weather", () => {
  assert.deepEqual(
    normalizeOpenMeteoWeather({
      current: {
        temperature_2m: 13.4,
        relative_humidity_2m: 86,
        precipitation: 0.7,
        weather_code: 61
      },
      daily: { precipitation_sum: [4.2] }
    }, fetchedAt),
    {
      location: "Auckland",
      temperatureC: 13.4,
      humidity: 86,
      precipitationMm: 4.2,
      rainExpected: true,
      condition: "rainy",
      fetchedAt: fetchedAt.toISOString(),
      source: "Open-Meteo"
    }
  );
});

test("uses today's forecast rainfall even when it is not raining yet", () => {
  const weather = normalizeOpenMeteoWeather({
    current: {
      temperature_2m: 17,
      relative_humidity_2m: 72,
      precipitation: 0,
      weather_code: 2
    },
    daily: { precipitation_sum: [3.5] }
  }, fetchedAt);

  assert.equal(weather.condition, "cloudy");
  assert.equal(weather.precipitationMm, 3.5);
  assert.equal(weather.rainExpected, true);
});

test("returns fallback weather when Open-Meteo fails", async () => {
  const weather = await getWeather({
    fetchImpl: async () => { throw new Error("offline"); },
    now: () => fetchedAt
  });

  assert.equal(weather.source, "fallback");
  assert.equal(weather.location, "Auckland");
  assert.equal(weather.fetchedAt, fetchedAt.toISOString());
  assert.equal(typeof weather.temperatureC, "number");
});

test("uses supplied GPS coordinates and display label", async () => {
  let requestedUrl;
  const weather = await getWeather({
    latitude: -41.2865,
    longitude: 174.7762,
    location: "Current Location",
    now: () => fetchedAt,
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 12,
            relative_humidity_2m: 80,
            precipitation: 0,
            weather_code: 2
          },
          daily: { precipitation_sum: [0] }
        })
      };
    }
  });

  assert.equal(requestedUrl.searchParams.get("latitude"), "-41.2865");
  assert.equal(requestedUrl.searchParams.get("longitude"), "174.7762");
  assert.equal(weather.location, "Current Location");
});

test("resolves a manual garden location before fetching weather", async () => {
  const requestedUrls = [];
  const weather = await getWeather({
    location: "Wellington",
    now: () => fetchedAt,
    fetchImpl: async (url) => {
      requestedUrls.push(new URL(url));
      if (String(url).includes("geocoding-api")) {
        return {
          ok: true,
          json: async () => ({
            results: [{ name: "Wellington", latitude: -41.2865, longitude: 174.7762 }]
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          current: {
            temperature_2m: 12,
            relative_humidity_2m: 80,
            precipitation: 0,
            weather_code: 2
          },
          daily: { precipitation_sum: [0] }
        })
      };
    }
  });

  assert.equal(requestedUrls.length, 2);
  assert.equal(weather.location, "Wellington");
});
