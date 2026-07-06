import test from "node:test";
import assert from "node:assert/strict";

import {
  completeCareTask,
  getTodayCare,
  skipCareTask
} from "./todayCareService.js";

const today = "2026-07-02";
const fallbackWeatherProvider = async () => ({
  location: "Auckland",
  temperatureC: 18,
  humidity: 70,
  precipitationMm: null,
  rainExpected: false,
  condition: "cloudy",
  fetchedAt: `${today}T08:00:00.000Z`,
  source: "fallback"
});
const weatherOptions = { weatherProvider: fallbackWeatherProvider };

function createMemorySupabase(seed) {
  const tables = structuredClone(seed);
  let nextEventId = tables.plant_events.length + 1;

  class Query {
    constructor(table) {
      this.table = table;
      this.operation = "select";
      this.filters = [];
      this.ordering = null;
      this.payload = null;
      this.expectSingle = false;
    }

    select() {
      return this;
    }

    insert(rows) {
      this.operation = "insert";
      this.payload = Array.isArray(rows) ? rows : [rows];
      return this;
    }

    update(values) {
      this.operation = "update";
      this.payload = values;
      return this;
    }

    eq(field, value) {
      this.filters.push((row) => row[field] === value);
      return this;
    }

    neq(field, value) {
      this.filters.push((row) => row[field] !== value);
      return this;
    }

    gte(field, value) {
      this.filters.push((row) => row[field] >= value);
      return this;
    }

    in(field, values) {
      this.filters.push((row) => values.includes(row[field]));
      return this;
    }

    is(field, value) {
      this.filters.push((row) => value === null ? row[field] == null : row[field] === value);
      return this;
    }

    order(field, { ascending }) {
      this.ordering = { field, ascending };
      return this;
    }

    single() {
      this.expectSingle = true;
      return this;
    }

    async execute() {
      const rows = tables[this.table];

      if (this.operation === "insert") {
        const inserted = this.payload.map((row) => ({
          id: `event-${nextEventId++}`,
          created_at: `${today}T08:00:00Z`,
          ...row
        }));
        rows.push(...inserted);
        return { data: inserted, error: null };
      }

      let matches = rows.filter((row) =>
        this.filters.every((filter) => filter(row))
      );

      if (this.operation === "update") {
        matches.forEach((row) => Object.assign(row, this.payload));
      }

      if (this.ordering) {
        const direction = this.ordering.ascending ? 1 : -1;
        matches = [...matches].sort((a, b) =>
          String(a[this.ordering.field]).localeCompare(
            String(b[this.ordering.field])
          ) * direction
        );
      }

      if (this.expectSingle) {
        return matches.length === 1
          ? { data: matches[0], error: null }
          : { data: null, error: new Error("Expected one row.") };
      }

      return { data: matches, error: null };
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    tables,
    from(table) {
      return new Query(table);
    }
  };
}

function completedEvent({ id, plantId, type, title, date }) {
  return {
    id,
    plant_id: plantId,
    event_type: type,
    title,
    status: "completed",
    priority: "normal",
    due_date: date,
    event_date: date,
    completed_at: `${date}T09:00:00Z`,
    suggested_value: null,
    actual_value: null,
    unit: null,
    ai_reason: null,
    notes: null,
    created_at: `${date}T08:00:00Z`
  };
}

test("full daily care loop persists, completes, and scopes plant history", async () => {
  const supabase = createMemorySupabase({
    plants: [
      {
        id: "blueberry-id",
        nickname: "Blueberry",
        species: "Vaccinium",
        location: "Patio",
        status: "healthy",
        notes: "Soil is dry and leaves are wilting"
      },
      {
        id: "avocado-id",
        nickname: "Avocado",
        species: "Persea americana",
        location: "Window",
        status: "healthy",
        notes: "Receiving too much direct sun"
      },
      {
        id: "monstera-id",
        nickname: "Monstera",
        species: "Monstera deliciosa",
        location: "Living room",
        status: "healthy",
        notes: ""
      },
      {
        id: "archived-id",
        nickname: "Archived Fern",
        species: "Nephrolepis",
        location: "Archive",
        status: "healthy",
        notes: "",
        archived_at: "2026-07-01T08:00:00Z"
      }
    ],
    plant_events: [
      completedEvent({
        id: "blueberry-history",
        plantId: "blueberry-id",
        type: "water",
        title: "Water",
        date: "2026-06-24"
      }),
      {
        id: "archived-pending",
        plant_id: "archived-id",
        event_type: "water",
        title: "Water",
        status: "pending",
        priority: "normal",
        due_date: today,
        event_date: today,
        completed_at: null,
        suggested_value: 200,
        actual_value: null,
        unit: "ml",
        ai_reason: "Old pending recommendation",
        notes: null,
        created_at: `${today}T07:00:00Z`
      }
    ],
    plant_photos: [
      {
        plant_id: "blueberry-id",
        image_url: "https://example.test/blueberry.jpg",
        created_at: "2026-07-01T08:00:00Z"
      }
    ]
  });

  const firstDashboard = await getTodayCare(today, supabase, weatherOptions);
  const pending = firstDashboard.tasks.filter((task) => task.status === "pending");

  assert.deepEqual(Object.keys(firstDashboard), [
    "gardenBrief",
    "weather",
    "plantAssessments",
    "tasks"
  ]);
  assert.equal(firstDashboard.gardenBrief.counts.totalPlants, 3);
  assert.equal(firstDashboard.tasks.some((task) => task.plantId === "archived-id"), false);
  assert.equal(firstDashboard.plantAssessments.length, 3);

  assert.equal(pending.length, 3);
  assert.equal(new Set(pending.map((task) => task.plantId)).size, 3);
  assert.deepEqual(
    pending.map((task) => [task.plantName, task.type]),
    [
      ["Blueberry", "water"],
      ["Avocado", "move"],
      ["Monstera", "check"]
    ]
  );

  const eventCountAfterGeneration = supabase.tables.plant_events.length;
  await getTodayCare(today, supabase, weatherOptions);
  assert.equal(supabase.tables.plant_events.length, eventCountAfterGeneration);

  const blueberryTask = pending.find((task) => task.plantName === "Blueberry");
  const blueberryRowBeforeCompletion = supabase.tables.plant_events.find(
    (event) => event.id === blueberryTask.id
  );
  const originalCreatedAt = blueberryRowBeforeCompletion.created_at;
  await completeCareTask(
    blueberryTask.id,
    { actualValue: 220, notes: "Soil was still slightly moist." },
    supabase
  );

  const completedRow = supabase.tables.plant_events.find(
    (event) => event.id === blueberryTask.id
  );
  assert.equal(supabase.tables.plant_events.length, eventCountAfterGeneration);
  assert.equal(completedRow.status, "completed");
  assert.equal(completedRow.suggested_value, 250);
  assert.equal(completedRow.actual_value, 220);
  assert.equal(completedRow.notes, "Soil was still slightly moist.");
  assert.ok(completedRow.completed_at);
  assert.equal(completedRow.created_at, originalCreatedAt);

  const dashboardAfterCompletion = await getTodayCare(today, supabase, weatherOptions);
  assert.equal(
    dashboardAfterCompletion.tasks.find((task) => task.id === blueberryTask.id).status,
    "completed"
  );
  assert.equal(supabase.tables.plant_events.length, eventCountAfterGeneration);

  const avocadoTask = pending.find((task) => task.plantName === "Avocado");
  await skipCareTask(avocadoTask.id, {}, supabase);
  const dashboardAfterSkip = await getTodayCare(today, supabase, weatherOptions);
  assert.equal(
    dashboardAfterSkip.tasks.find((task) => task.id === avocadoTask.id).status,
    "skipped"
  );
  assert.equal(supabase.tables.plant_events.length, eventCountAfterGeneration);

  const blueberryHistory = supabase.tables.plant_events.filter(
    (event) =>
      event.plant_id === "blueberry-id" && event.status === "completed"
  );
  const avocadoHistory = supabase.tables.plant_events.filter(
    (event) =>
      event.plant_id === "avocado-id" && event.status === "completed"
  );

  assert.equal(blueberryHistory.some((event) => event.id === blueberryTask.id), true);
  assert.equal(avocadoHistory.some((event) => event.id === blueberryTask.id), false);
});
