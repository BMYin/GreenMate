import { useCallback, useEffect, useState } from "react";

import { getSupabaseClient } from "./lib/supabaseClient.js";
import { createPlantWithInitialPhoto } from "./lib/createPlant.js";
import {
  fallbackCareInstruction,
  formatTaskType,
  localDate
} from "./lib/careFormatting.js";
import {
  listPlantPhotos,
  uploadPlantPhoto,
  validatePlantPhoto
} from "./lib/plantPhotos.js";
import {
  loadSettings,
  resolveGpsLocation,
  saveSettings,
  weatherLocationLabel
} from "./lib/settings.js";

const emptyPlantForm = {
  nickname: "",
  species: "",
  location: "",
  growingSetup: "",
  potSizeCm: "",
  soilType: "",
  sunlightExposure: "",
  environment: "",
  growthStage: "",
  notes: ""
};

const historyEventIcons = {
  plant_added: "🌿",
  plant_archived: "↘",
  photo: "📷",
  water: "💧",
  fertilize: "🌱",
  fertilise: "🌱",
  check: "◉",
  observe: "◉",
  move: "↗",
  prune: "✂",
  repot: "♧"
};

function historyEventDate(event) {
  const value = event.completed_at || event.created_at || event.event_date;
  if (!value) return null;
  return new Date(value.length === 10 ? `${value}T12:00:00` : value);
}

function historyGroupLabel(date) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfEvent = new Date(date);
  startOfEvent.setHours(0, 0, 0, 0);
  const dayDifference = Math.round((startOfToday - startOfEvent) / 86400000);

  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  return "Earlier";
}

function HistoryTimeline({ events, loading, error, onOpenPlant }) {
  const groups = ["Today", "Yesterday", "Earlier"]
    .map((label) => ({
      label,
      events: events.filter((event) => historyGroupLabel(event.date) === label)
    }))
    .filter((group) => group.events.length > 0);

  return (
    <section className="page-section history-page" aria-labelledby="history-heading">
      <div className="section-heading">
        <div>
          <h1 id="history-heading">History</h1>
        </div>
      </div>
      {loading && <p className="empty-state">Loading garden history…</p>}
      {error && <p className="empty-state" role="alert">{error}</p>}
      {!loading && !error && events.length === 0 && (
        <div className="history-empty">
          <span aria-hidden="true">◷</span>
          <h2>No activity yet.</h2>
          <p>Your garden history will appear here as you care for your plants.</p>
        </div>
      )}
      {!loading && !error && groups.map((group) => (
        <section className="history-group" key={group.label} aria-labelledby={`history-${group.label.toLowerCase()}-heading`}>
          <h2 id={`history-${group.label.toLowerCase()}-heading`}>{group.label}</h2>
          <div className="history-list">
            {group.events.map((event) => (
              <button className="history-event" type="button" key={event.id} onClick={() => onOpenPlant(event.plantId)}>
                <span className="history-event__icon" aria-hidden="true">
                  {historyEventIcons[event.eventType] || "✓"}
                </span>
                <span className="history-event__content">
                  <strong>{event.plantName}</strong>
                  <span>{event.description}</span>
                </span>
                <time dateTime={event.date.toISOString()}>
                  {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(event.date)}
                </time>
              </button>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function SettingsPage({ settings, onChange }) {
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const displayedLocation = settings.locationMode === "gps"
    ? settings.resolvedLocation || "Location unavailable"
    : settings.defaultGardenLocation;
  const [locationDraft, setLocationDraft] = useState(displayedLocation);

  useEffect(() => {
    if (!editingLocation) {
      setLocationDraft(displayedLocation);
    }
  }, [displayedLocation, editingLocation]);

  function updateSetting(event) {
    const { name, type, checked, value } = event.target;
    onChange(name, type === "checkbox" ? checked : value);
  }

  function saveLocation() {
    const defaultGardenLocation = locationDraft.trim();
    if (!defaultGardenLocation) {
      setLocationError("Enter a garden location before saving.");
      return;
    }

    // A manual save intentionally clears GPS so future weather uses this city.
    onChange({
      defaultGardenLocation,
      locationMode: "manual",
      latitude: null,
      longitude: null,
      resolvedLocation: null
    });
    setEditingLocation(false);
    setLocationError("");
  }

  function cancelLocationEdit() {
    setLocationDraft(displayedLocation);
    setEditingLocation(false);
    setLocationError("");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError(
        "Location is not available in this browser. You can still enter your garden location manually."
      );
      return;
    }

    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        let resolvedLocation = null;
        try {
          resolvedLocation = await resolveGpsLocation(
            coords.latitude,
            coords.longitude
          );
        } catch {
          resolvedLocation = null;
        }
        onChange({
          defaultGardenLocation: resolvedLocation || "Using GPS",
          locationMode: "gps",
          latitude: coords.latitude,
          longitude: coords.longitude,
          resolvedLocation
        });
        setEditingLocation(false);
        setLocating(false);
      },
      () => {
        setLocationError(
          "GreenMate could not access your location. Check browser permission or use the manual location field."
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  return (
    <section className="page-section settings-page" aria-labelledby="settings-heading">
      <div className="section-heading">
        <div>
          <h1 id="settings-heading">Settings</h1>
        </div>
      </div>

      <section className="settings-card" aria-labelledby="garden-settings-heading">
        <h2 id="garden-settings-heading">Garden</h2>
        <div className="settings-location-block">
          <div className="settings-field">
            <span>Garden Location</span>
            <div className="settings-location-editor">
              {editingLocation ? (
                <>
                  <input
                    name="defaultGardenLocation"
                    value={locationDraft}
                    onChange={(event) => setLocationDraft(event.target.value)}
                  />
                  <div className="settings-location-actions">
                    <button className="button button--secondary" type="button" onClick={saveLocation}>Save</button>
                    <button className="button button--ghost" type="button" onClick={cancelLocationEdit}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="settings-location-value-row">
                    <span className="settings-location-primary">
                      {displayedLocation}
                    </span>
                  </div>
                  <div className="settings-location-change-actions">
                    <button className="button button--secondary settings-location-action" type="button" onClick={() => {
                      setLocationDraft(
                        settings.locationMode === "gps"
                          ? settings.resolvedLocation || ""
                          : settings.defaultGardenLocation
                      );
                      setLocationError("");
                      setEditingLocation(true);
                    }}>Edit</button>
                    <button className="button button--secondary settings-location-action" type="button" onClick={useCurrentLocation} disabled={locating}>
                      {locating ? "Finding location…" : "Use current location"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {locationError && <p className="form-error" role="alert">{locationError}</p>}
        </div>
        <label className="settings-field">
          <span>Default Growing Environment</span>
          <select name="defaultEnvironment" value={settings.defaultEnvironment} onChange={updateSetting}>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
      </section>

      <section className="settings-card" aria-labelledby="care-settings-heading">
        <h2 id="care-settings-heading">Care Preferences</h2>
        <label className="settings-field">
          <span>Care Style</span>
          <select name="careStyle" value={settings.careStyle} onChange={updateSetting}>
            <option value="beginner">Beginner</option>
            <option value="balanced">Balanced</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <label className="settings-toggle">
          <span>
            <strong>Photo Reminder</strong>
            <small>Remember to record plant growth regularly.</small>
          </span>
          <input
            type="checkbox"
            name="photoReminder"
            checked={settings.photoReminder}
            onChange={updateSetting}
            role="switch"
          />
        </label>
      </section>

      <section className="settings-card" aria-labelledby="display-settings-heading">
        <h2 id="display-settings-heading">Display</h2>
        <label className="settings-field">
          <span>Units</span>
          <select name="units" value={settings.units} onChange={updateSetting}>
            <option value="metric">Metric</option>
            <option value="imperial">Imperial</option>
          </select>
        </label>
        <label className="settings-field">
          <span>Date Format</span>
          <select name="dateFormat" value={settings.dateFormat} onChange={updateSetting}>
            <option value="local">Local</option>
            <option value="long">Long</option>
          </select>
        </label>
      </section>

      <section className="settings-card settings-about" aria-labelledby="about-settings-heading">
        <div>
          <p className="eyebrow">GreenMate MVP</p>
          <h2 id="about-settings-heading">Version 1.0</h2>
          <p>GreenMate helps you understand what your plants need, one day at a time.</p>
        </div>
        <div className="settings-about__how">
          <h3>How GreenMate Works</h3>
          <p>Every day, GreenMate checks in on each of your plants and lets you know what needs attention. As it learns more about your plants over time, its care advice becomes more personal and more helpful.</p>
        </div>
      </section>
    </section>
  );
}

const navigationItems = [
  { id: "garden", label: "Garden", icon: "⌂" },
  { id: "plants", label: "Plants", icon: "♧" },
  { id: "add", label: "Add", icon: "+", action: "add" },
  { id: "history", label: "History", icon: "◷" },
  { id: "settings", label: "Settings", icon: "⚙" }
];

function AppNavigation({ activeView, onNavigate, onAdd }) {
  return (
    <nav className="app-navigation" aria-label="Primary navigation">
      <div className="app-navigation__brand">
        <span className="brand-mark" aria-hidden="true">G</span>
        <span>GREENMATE</span>
      </div>
      <div className="app-navigation__items">
        {navigationItems.map((item) => (
          <button
            className="nav-item"
            data-active={item.id === activeView ? "true" : undefined}
            key={item.id}
            type="button"
            disabled={item.disabled}
            title={item.disabled ? "Coming soon" : undefined}
            data-action={item.action}
            onClick={() => item.action === "add" ? onAdd() : onNavigate(item.id)}
          >
            <span className="nav-item__icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function PlantVisual({ name, imageUrl = null, compact = false }) {
  return (
    <div className={`plant-visual${compact ? " plant-visual--compact" : ""}`}>
      {imageUrl ? (
        <img src={imageUrl} alt={`${name} plant`} />
      ) : (
        <>
          <span aria-hidden="true">🌿</span>
          <small>{name}</small>
        </>
      )}
    </div>
  );
}

function gardenStatus(status) {
  if (status === "completed" || status === "healthy") return "Good";
  if (status === "delayed") return "On Track";
  return "Needs Attention";
}

function DailyGardenBrief({ totalPlants, weather, locationLabel }) {
  const gardenContext = weather?.condition === "rainy"
    ? {
        title: "Rain is replenishing outdoor soil today.",
        summary: "Pause watering and check exposed containers after conditions settle."
      }
    : weather?.condition === "sunny"
      ? {
          title: "Outdoor pots may dry faster today.",
          summary: "Check exposed containers before watering this afternoon."
        }
      : weather?.condition === "cloudy"
        ? {
            title: "Gentle conditions are helping moisture last.",
            summary: "Give the soil time before deciding whether more water is needed."
          }
        : {
            title: "Today’s garden context is ready.",
            summary: `${totalPlants} active ${totalPlants === 1 ? "plant is" : "plants are"} being followed.`
          };

  return (
    <section className="garden-brief" aria-labelledby="garden-brief-heading">
      <div>
        <p className="eyebrow">Daily Garden Brief</p>
        <h1 id="garden-brief-heading">{gardenContext.title}</h1>
        <p>{gardenContext.summary}</p>
        {weather && (
          <p className="garden-brief__weather">
            {weather.condition === "sunny" ? "☀️" : weather.condition === "rainy" ? "☔" : "☁️"} {locationLabel || weather.location || "Auckland"} · {Math.round(weather.temperatureC)}°C · {formatTaskType(weather.condition)}
          </p>
        )}
      </div>
    </section>
  );
}

function PlantCollectionCard({ plant, onOpen, units = "metric" }) {
  const potSize = plant.pot_size_cm
    ? units === "imperial"
      ? `${(plant.pot_size_cm / 2.54).toFixed(1)} in pot`
      : `${plant.pot_size_cm} cm pot`
    : "Pot size not set";

  return (
    <button className="collection-card" type="button" onClick={() => onOpen(plant.id)}>
      <div className="collection-card__visual">
        <PlantVisual name={plant.nickname} imageUrl={plant.photoUrl} />
        <span className="garden-status" data-status={plant.status}>
          {gardenStatus(plant.status)}
        </span>
      </div>
      <div className="collection-card__body">
        <h3>{plant.nickname}</h3>
        <p className="collection-card__species">
          {plant.species || "Species not provided"}
        </p>
        <div className="collection-card__meta">
          <span>⌖ {plant.location || "Location not set"}</span>
          <span>◯ {potSize}</span>
          <span>◷ {plant.lastCareDate ? `Last care ${plant.lastCareDate}` : "No care yet"}</span>
        </div>
      </div>
    </button>
  );
}

function AICareCard({ plant, task, assessment, onComplete, onSkip, onOpen }) {
  const needsAction = task?.status === "pending";
  const isUrgent = needsAction && task.priority === "high";
  const statusLabel = isUrgent
    ? "Urgent"
    : needsAction
      ? "Needs attention"
      : "Healthy";

  return (
    <article className="ai-care-card" data-compact={!needsAction || undefined}>
      <div className="ai-care-card__photo">
        <PlantVisual name={plant.nickname} imageUrl={plant.photoUrl} compact />
      </div>
      <div className="ai-care-card__content">
        <div className="ai-care-card__heading">
          <div>
            <h3>{plant.nickname}</h3>
            <p>{plant.species || "Species not provided"}</p>
          </div>
          <span className="care-status" data-status={isUrgent ? "urgent" : needsAction ? "attention" : "healthy"}>
            {statusLabel}
          </span>
        </div>

        {needsAction ? (
          <>
            <div className="ai-care-card__recommendation">
              <span>Suggested care</span>
              <strong>{task.action}</strong>
              {task.suggestedValue && (
                  <span className="ai-care-card__amount-value">
                  ≈{task.suggestedValue.value} {task.suggestedValue.unit}
                 </span>
              )}      
              
              <p className="ai-care-card__instruction">
                {assessment?.suggestedCare?.[0]?.instruction ||
                  fallbackCareInstruction(task)}
              </p>
            </div>
            <div className="ai-care-card__actions">
              <button className="button button--primary" type="button" onClick={() => onComplete(task)}>
                Care Recorded
              </button>
              <button className="button button--ghost" type="button" onClick={() => onSkip(task)}>
                Not Now
              </button>
              <button className="button button--ghost" type="button" onClick={() => onOpen(plant.id)}>
                View Details
              </button>
            </div>
          </>
        ) : (
          <div className="ai-care-card__healthy-row">
            <p>{task?.status === "skipped" ? "Care paused for today." : "No care needed today."}</p>
            <button className="button button--ghost" type="button" onClick={() => onOpen(plant.id)}>
              View Details
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function readableProfileValue(value) {
  const labels = {
    pot: "Pot / Container",
    garden_bed: "Garden Bed",
    in_ground: "In the Ground",
    hanging_basket: "Hanging Basket",
    potting_mix: "Potting Mix",
    indoor_plant_mix: "Indoor Plant Mix",
    succulent_cactus_mix: "Succulent & Cactus Mix",
    orchid_mix: "Orchid Mix",
    seed_raising_mix: "Seed Raising Mix",
    acidic_mix: "Acidic Mix",
    direct_sun_most_of_day: "In direct sun most of the day",
    morning_sun: "Gets morning sun",
    afternoon_sun: "Gets afternoon sun",
    near_bright_window: "Near a bright window",
    bright_room: "In a bright room",
    mostly_shaded: "Mostly in the shade",
    indoor: "Indoors",
    outdoor: "Outdoors",
    growing: "Growing new leaves",
    flowering: "Flowering",
    fruiting: "Producing fruit",
    looks_same: "Looks about the same"
  };
  return value ? labels[value] || String(value).replaceAll("_", " ") : "Not provided";
}

function readableEvidence(item) {
  const labels = {
    days_since_watering: "Days since watering",
    days_since_fertilizing: "Days since feeding",
    weather_condition: "Current conditions",
    temperature: "Temperature",
    rain_expected: "Rain expected",
    dryness_observed: "Plant Archive note",
    issue_note: "Plant Archive note",
    no_care_history: "Care history"
  };
  const value = item.code === "no_care_history"
    ? "No recent care recorded"
    : item.code === "rain_expected"
      ? "Yes"
      : `${item.value}${item.unit === "days" ? " days" : item.unit === "celsius" ? "°C" : ""}`;
  return `${labels[item.code] || "Observation"}: ${value}`;
}

function PlantDetail({ plantId, currentTask, currentAssessment, onBack, onPlantUpdated, onPlantArchived, onPlantDeleted, onComplete, onSkip }) {
  const [plant, setPlant] = useState(null);
  const [events, setEvents] = useState([]);
  const [archiveEvents, setArchiveEvents] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [editError, setEditError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [editForm, setEditForm] = useState(emptyPlantForm);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPlantDetail() {
      setLoading(true);
      setDetailError("");

      try {
        const supabase = getSupabaseClient();
        const [plantResult, eventsResult, photoData] = await Promise.all([
          supabase.from("plants").select("*").eq("id", plantId).single(),
          supabase
            .from("plant_events")
            .select("*")
            .eq("plant_id", plantId)
            .in("status", ["completed", "skipped"])
            .order("created_at", { ascending: false }),
          listPlantPhotos(supabase, plantId)
        ]);

        if (plantResult.error) throw plantResult.error;
        if (eventsResult.error) throw eventsResult.error;

        if (active) {
          setPlant(plantResult.data);
          setArchiveEvents(eventsResult.data || []);
          setEvents((eventsResult.data || []).filter((event) => (
            event.status === "completed" && event.event_type !== "photo"
          )));
          setPhotos(photoData);
        }
      } catch {
        if (active) setDetailError("Unable to load plant details.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPlantDetail();
    return () => {
      active = false;
    };
  }, [plantId, currentTask?.status]);

  useEffect(() => {
    if (!editOpen && !previewPhoto && !manageOpen && !archiveOpen && !deleteOpen) return undefined;

    function closeOnEscape(event) {
      if (event.key === "Escape" && !saving) setEditOpen(false);
      if (event.key === "Escape") setPreviewPhoto(null);
      if (event.key === "Escape") setManageOpen(false);
      if (event.key === "Escape" && !archiving) setArchiveOpen(false);
      if (event.key === "Escape" && !deleting) setDeleteOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [archiveOpen, archiving, deleteOpen, deleting, editOpen, manageOpen, previewPhoto, saving]);

  function openEditForm() {
    setEditError("");
    setEditForm({
      nickname: plant.nickname || "",
      species: plant.species || "",
      location: plant.location || "",
      notes: plant.notes || ""
    });
    setEditOpen(true);
  }

  function updateEditForm(event) {
    setEditForm((currentForm) => ({
      ...currentForm,
      [event.target.name]: event.target.value
    }));
  }

  async function savePlant(event) {
    event.preventDefault();
    setSaving(true);
    setEditError("");

    const updates = {
      nickname: editForm.nickname.trim(),
      species: editForm.species.trim() || null,
      location: editForm.location.trim() || null,
      notes: editForm.notes.trim() || null
    };

    try {
      const { data, error } = await getSupabaseClient()
        .from("plants")
        .update(updates)
        .eq("id", plantId)
        .select("*")
        .single();

      if (error) throw error;

      setPlant(data);
      await onPlantUpdated();
      setEditOpen(false);
    } catch {
      setEditError("Unable to update plant.");
    } finally {
      setSaving(false);
    }
  }

  async function addPhoto(event) {
    const input = event.currentTarget;
    const [file] = event.target.files || [];
    if (!file) return;

    setUploadingPhoto(true);
    setPhotoError("");

    try {
      const photo = await uploadPlantPhoto(getSupabaseClient(), {
        plantId,
        file
      });
      setPhotos((currentPhotos) => [photo, ...currentPhotos]);
      setArchiveEvents((currentEvents) => [{
        id: `photo-${photo.id}`,
        plant_id: plantId,
        photo_id: photo.id,
        event_type: "photo",
        title: "Photo added",
        status: "completed",
        completed_at: photo.created_at,
        created_at: photo.created_at
      }, ...currentEvents]);
      await onPlantUpdated();
    } catch (error) {
      setPhotoError(error.message || "Unable to upload this photo.");
    } finally {
      setUploadingPhoto(false);
      input.value = "";
    }
  }

  async function archivePlant() {
    setArchiving(true);
    setArchiveError("");
    const archivedAt = new Date().toISOString();

    try {
      const supabase = getSupabaseClient();
      const { error: plantUpdateError } = await supabase
        .from("plants")
        .update({ archived_at: archivedAt })
        .eq("id", plantId);
      if (plantUpdateError) throw plantUpdateError;

      const { error: eventError } = await supabase.from("plant_events").insert({
        plant_id: plantId,
        event_type: "plant_archived",
        title: "Plant archived",
        notes: null,
        event_date: archivedAt.slice(0, 10),
        status: "completed",
        priority: "low",
        due_date: archivedAt.slice(0, 10),
        completed_at: archivedAt,
        created_at: archivedAt
      });
      if (eventError) throw eventError;

      await onPlantArchived(plant.nickname);
    } catch (error) {
      setArchiveError(error.message || "Unable to archive this plant.");
    } finally {
      setArchiving(false);
    }
  }

  async function deletePlant() {
    setDeleting(true);
    setDeleteError("");

    try {
      const { error } = await getSupabaseClient()
        .from("plants")
        .delete()
        .eq("id", plantId);
      if (error) throw error;

      await onPlantDeleted(plant.nickname);
    } catch (error) {
      setDeleteError(error.message || "Unable to delete this plant.");
    } finally {
      setDeleting(false);
    }
  }

  const plantArchiveEvents = plant ? [
    ...archiveEvents.map((archiveEvent) => ({
      id: archiveEvent.id,
      eventType: archiveEvent.event_type,
      description: archiveEvent.event_type === "photo"
        ? "Photo added"
        : archiveEvent.status === "skipped"
          ? `${formatTaskType(archiveEvent.event_type)} marked Not Now`
          : archiveEvent.title || `${formatTaskType(archiveEvent.event_type)} care recorded`,
      date: historyEventDate(archiveEvent)
    })),
    {
      id: `plant-${plant.id}`,
      eventType: "plant_added",
      description: "Plant added",
      date: plant.created_at ? new Date(plant.created_at) : null
    }
  ]
    .filter((archiveEvent) => archiveEvent.date && !Number.isNaN(archiveEvent.date.getTime()))
    .sort((left, right) => right.date - left.date) : [];
  const detailStatus = currentTask?.status === "pending"
    ? currentTask.priority === "high" ? "urgent" : "attention"
    : currentAssessment?.status === "urgent"
      ? "urgent"
      : currentAssessment?.status === "needs_attention" || currentAssessment?.status === "observation_needed"
        ? "attention"
        : "healthy";
  const detailStatusLabel = detailStatus === "urgent"
    ? "Urgent"
    : detailStatus === "attention"
      ? "Needs attention"
      : "Healthy";

  return (
    <main className="page-shell">
      <button className="back-button" type="button" onClick={onBack}>
        ← Back
      </button>

      {loading && <p className="empty-state">Loading plant details…</p>}
      {detailError && (
        <p className="empty-state" role="alert">
          {detailError}
        </p>
      )}

      {!loading && !detailError && plant && (
        <>
          <header className="detail-header">
            <PlantVisual name={plant.nickname} imageUrl={photos[0]?.image_url || null} />
            <div className="detail-header__content">
              <div>
                <p className="eyebrow">Plant profile</p>
                <h1>{plant.nickname}</h1>
                <p className="date">{plant.species || "Species not provided"}</p>
              </div>
              <span className="care-status" data-status={detailStatus}>
                {detailStatusLabel}
              </span>
            </div>
          </header>

          <section className="detail-section" aria-labelledby="plant-info-heading">
            <div className="section-heading">
              <h2 id="plant-info-heading">Plant Profile</h2>
              <button
                className="button button--secondary"
                type="button"
                onClick={openEditForm}
              >
                Edit
              </button>
            </div>
            <dl className="plant-info">
              <div>
                <dt>Location</dt>
                <dd>{plant.location || "Not provided"}</dd>
              </div>
              <div>
                <dt>Where is this plant growing?</dt>
                <dd>{readableProfileValue(plant.growing_setup)}</dd>
              </div>
              {plant.growing_setup === "pot" && <div>
                <dt>How big is the pot?</dt>
                <dd>{plant.pot_size_cm ? `${plant.pot_size_cm} cm` : "Not provided"}</dd>
              </div>}
              <div>
                <dt>What is it currently growing in?</dt>
                <dd>{readableProfileValue(plant.soil_type)}</dd>
              </div>
              <div>
                <dt>Where does it spend most of the day?</dt>
                <dd>{readableProfileValue(plant.sunlight_exposure)}</dd>
              </div>
              <div>
                <dt>Where is it kept?</dt>
                <dd>{readableProfileValue(plant.environment)}</dd>
              </div>
              <div>
                <dt>What does it look like right now?</dt>
                <dd>{readableProfileValue(plant.growth_stage)}</dd>
              </div>
              {plant.notes && <div className="plant-info__notes"><dt>Anything worth remembering?</dt><dd>{plant.notes}</dd></div>}
            </dl>
          </section>

          <section className="detail-section today-care-detail" aria-labelledby="care-detail-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">For today</p>
                <h2 id="care-detail-heading">Today’s Care</h2>
              </div>
              {currentTask?.status === "pending" && (
                <span className="priority-dot" data-priority={currentTask.priority}>{formatTaskType(currentTask.priority)}</span>
              )}
            </div>
            {currentTask?.status === "pending" ? (
              <>
                <strong className="today-care-detail__action">{currentTask.action}</strong>
                <p>{currentAssessment?.suggestedCare?.[0]?.instruction || "Follow this suggestion if it matches what you see today."}</p>
                <div className="today-care-detail__actions">
                  <button className="button button--primary" type="button" onClick={() => onComplete(currentTask)}>Care Recorded</button>
                  <button className="button button--ghost" type="button" onClick={() => onSkip(currentTask)}>Not Now</button>
                </div>
              </>
            ) : (
              <div className="detail-all-clear">
                <span aria-hidden="true">✓</span>
                <div><strong>No care needed today.</strong><p>This plant looks settled for now.</p></div>
              </div>
            )}
          </section>

          <section className="detail-section care-detail" aria-labelledby="why-care-heading">
            <p className="eyebrow">A closer look</p>
            <h2 id="why-care-heading">Why this matters</h2>
            <div className="care-detail__block">
              <h3>What GreenMate noticed</h3>
              <p>{currentAssessment?.summary || currentTask?.reason || "This plant looks settled today."}</p>
              {currentAssessment?.evidence?.length > 0 && <ul>{currentAssessment.evidence.map((item, index) => <li key={`${item.code}-${index}`}>{readableEvidence(item)}</li>)}</ul>}
            </div>
            <div className="care-detail__block">
              <h3>Profile details used</h3>
              <dl className="care-detail__profile">
                <div><dt>Growing setup</dt><dd>{readableProfileValue(plant.growing_setup)}</dd></div>
                <div><dt>Current soil</dt><dd>{readableProfileValue(plant.soil_type)}</dd></div>
                <div><dt>Current sunlight</dt><dd>{readableProfileValue(plant.sunlight_exposure)}</dd></div>
                <div><dt>Environment</dt><dd>{readableProfileValue(plant.environment)}</dd></div>
                <div><dt>Current growth</dt><dd>{readableProfileValue(plant.growth_stage)}</dd></div>
              </dl>
            </div>
            <div className="care-detail__block">
              <h3>Recent care</h3>
              {events.length === 0 ? <p>No recent care recorded.</p> : <ul>{events.slice(0, 3).map((careEvent) => <li key={careEvent.id}>{careEvent.title} · {(careEvent.completed_at || careEvent.event_date)?.slice(0, 10)}</li>)}</ul>}
            </div>
            <div className="care-detail__block">
              <h3>Suggested care</h3>
              <p>{currentTask?.reason || currentAssessment?.suggestedCare?.[0]?.reason || "No action is needed while this plant remains settled."}</p>
            </div>
          </section>

          <section className="detail-section" aria-labelledby="photos-heading">
            <div className="section-heading">
              <div>
                <h2 id="photos-heading">Photos</h2>
                <p className="section-supporting-copy">Plant growth archive</p>
              </div>
              <label
                className="button button--secondary photo-upload-button"
                aria-disabled={uploadingPhoto}
              >
                {uploadingPhoto ? "Uploading…" : "+ Add Photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  onChange={addPhoto}
                  disabled={uploadingPhoto}
                />
              </label>
            </div>
            {photoError && (
              <p className="form-error" role="alert">{photoError}</p>
            )}
            {photos.length === 0 ? (
              <div className="photo-empty-state">
                <span aria-hidden="true">▧</span>
                <div>
                  <h3>No photos yet</h3>
                  <p>Add photos to build this plant’s growth archive.</p>
                </div>
              </div>
            ) : (
              <div className="photo-grid">
                {photos.map((photo) => (
                  <button
                    className="photo-card"
                    key={photo.id}
                    type="button"
                    aria-label={`View ${plant.nickname} photo from ${photo.created_at?.slice(0, 10)}`}
                    onClick={() => setPreviewPhoto(photo)}
                  >
                    <img
                      src={photo.image_url}
                      alt={`${plant.nickname} on ${photo.created_at?.slice(0, 10)}`}
                      loading="lazy"
                    />
                    <span>{photo.created_at?.slice(0, 10)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="detail-section" aria-labelledby="plant-archive-heading">
            <div className="section-heading">
              <div>
                <h2 id="plant-archive-heading">Plant Archive</h2>
                <p className="section-supporting-copy">This plant’s care and growth story</p>
              </div>
            </div>
            <div className="plant-archive-list">
              {plantArchiveEvents.map((archiveEvent) => (
                <article className="plant-archive-event" key={archiveEvent.id}>
                  <span aria-hidden="true">{historyEventIcons[archiveEvent.eventType] || "✓"}</span>
                  <div>
                    <strong>{archiveEvent.description}</strong>
                    <time dateTime={archiveEvent.date.toISOString()}>
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(archiveEvent.date)}
                    </time>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="plant-management-action">
            <button className="button button--ghost" type="button" onClick={() => setManageOpen(true)}>
              Manage Plant
            </button>
          </div>

          {editOpen && (
            <div
              className="modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !saving) {
                  setEditOpen(false);
                }
              }}
            >
              <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-plant-heading"
              >
                <div className="modal__header">
                  <div>
                    <p className="eyebrow">Plant info</p>
                    <h2 id="edit-plant-heading">Edit Plant</h2>
                  </div>
                  <button
                    className="modal__close"
                    type="button"
                    aria-label="Close edit plant form"
                    onClick={() => setEditOpen(false)}
                    disabled={saving}
                  >
                    ×
                  </button>
                </div>

                <form className="plant-form" onSubmit={savePlant}>
                  <label>
                    Nickname
                    <input
                      autoFocus
                      name="nickname"
                      value={editForm.nickname}
                      onChange={updateEditForm}
                      required
                    />
                  </label>
                  <label>
                    Species
                    <input
                      name="species"
                      value={editForm.species}
                      onChange={updateEditForm}
                    />
                  </label>
                  <label>
                    Location
                    <input
                      name="location"
                      value={editForm.location}
                      onChange={updateEditForm}
                    />
                  </label>
                  <label className="plant-form__wide">
                    Notes
                    <textarea
                      name="notes"
                      rows="3"
                      value={editForm.notes}
                      onChange={updateEditForm}
                    />
                  </label>
                  {editError && (
                    <p className="form-error" role="alert">
                      {editError}
                    </p>
                  )}
                  <div className="modal__actions">
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => setEditOpen(false)}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {manageOpen && (
            <div className="modal-backdrop" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setManageOpen(false);
            }}>
              <section className="modal manage-plant-sheet" role="dialog" aria-modal="true" aria-labelledby="manage-plant-heading">
                <div className="modal__header">
                  <div>
                    <p className="eyebrow">Plant management</p>
                    <h2 id="manage-plant-heading">Manage {plant.nickname}</h2>
                  </div>
                  <button className="modal__close" type="button" aria-label="Close plant management" onClick={() => setManageOpen(false)}>×</button>
                </div>
                <div className="manage-plant-options">
                  {!plant.archived_at && (
                    <button type="button" onClick={() => {
                      setManageOpen(false);
                      setArchiveError("");
                      setArchiveOpen(true);
                    }}>
                      <span aria-hidden="true">↘</span>
                      <div><strong>Archive Plant</strong><small>Remove it from active care while keeping its history.</small></div>
                    </button>
                  )}
                  <button className="manage-plant-options__delete" type="button" onClick={() => {
                    setManageOpen(false);
                    setDeleteError("");
                    setDeleteOpen(true);
                  }}>
                    <span aria-hidden="true">×</span>
                    <div><strong>Delete Plant</strong><small>Permanently remove this plant and its records.</small></div>
                  </button>
                </div>
              </section>
            </div>
          )}

          {archiveOpen && (
            <div className="modal-backdrop" onMouseDown={(event) => {
              if (event.target === event.currentTarget && !archiving) setArchiveOpen(false);
            }}>
              <section className="modal archive-confirmation" role="dialog" aria-modal="true" aria-labelledby="archive-plant-heading">
                <div className="modal__header">
                  <div>
                    <p className="eyebrow">Plant management</p>
                    <h2 id="archive-plant-heading">Archive {plant.nickname}?</h2>
                  </div>
                  <button className="modal__close" type="button" aria-label="Close archive confirmation" onClick={() => setArchiveOpen(false)} disabled={archiving}>×</button>
                </div>
                <p>This plant will leave your active garden and stop receiving daily care suggestions. Its history will remain in the Plant Archive.</p>
                {archiveError && <p className="form-error" role="alert">{archiveError}</p>}
                <div className="modal__actions">
                  <button className="button button--secondary" type="button" onClick={() => setArchiveOpen(false)} disabled={archiving}>Keep Plant</button>
                  <button className="button button--archive" type="button" onClick={archivePlant} disabled={archiving}>{archiving ? "Archiving…" : "Archive Plant"}</button>
                </div>
              </section>
            </div>
          )}

          {deleteOpen && (
            <div className="modal-backdrop" onMouseDown={(event) => {
              if (event.target === event.currentTarget && !deleting) setDeleteOpen(false);
            }}>
              <section className="modal archive-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="delete-plant-heading" aria-describedby="delete-plant-description">
                <div className="modal__header">
                  <div>
                    <p className="eyebrow">Permanent removal</p>
                    <h2 id="delete-plant-heading">Delete this plant permanently?</h2>
                  </div>
                  <button className="modal__close" type="button" aria-label="Close delete confirmation" onClick={() => setDeleteOpen(false)} disabled={deleting}>×</button>
                </div>
                <p id="delete-plant-description">This will remove the plant, photos, and history. This action cannot be undone.</p>
                {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
                <div className="modal__actions">
                  <button className="button button--secondary" type="button" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</button>
                  <button className="button button--danger" type="button" onClick={deletePlant} disabled={deleting}>{deleting ? "Deleting…" : "Delete Permanently"}</button>
                </div>
              </section>
            </div>
          )}

          {previewPhoto && (
            <div
              className="modal-backdrop photo-lightbox"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setPreviewPhoto(null);
              }}
            >
              <section
                className="photo-preview"
                role="dialog"
                aria-modal="true"
                aria-labelledby="photo-preview-heading"
              >
                <div className="modal__header">
                  <div>
                    <p className="eyebrow">Growth archive</p>
                    <h2 id="photo-preview-heading">{plant.nickname}</h2>
                  </div>
                  <button
                    className="modal__close"
                    type="button"
                    aria-label="Close photo preview"
                    onClick={() => setPreviewPhoto(null)}
                  >
                    ×
                  </button>
                </div>
                <img
                  src={previewPhoto.image_url}
                  alt={`${plant.nickname} full-size preview`}
                />
                <time dateTime={previewPhoto.created_at}>
                  Added {previewPhoto.created_at?.slice(0, 10)}
                </time>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}

export function App() {
  const today = localDate();
  const [settings, setSettings] = useState(loadSettings);
  const [tasks, setTasks] = useState([]);
  const [weather, setWeather] = useState(null);
  const [plantAssessments, setPlantAssessments] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [taskError, setTaskError] = useState("");
  const [plants, setPlants] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [plantsLoading, setPlantsLoading] = useState(true);
  const [plantError, setPlantError] = useState("");
  const [plantForm, setPlantForm] = useState(emptyPlantForm);
  const [initialPhoto, setInitialPhoto] = useState(null);
  const [initialPhotoPreview, setInitialPhotoPreview] = useState("");
  const [addPlantError, setAddPlantError] = useState("");
  const [plantNotice, setPlantNotice] = useState("");
  const [savingPlant, setSavingPlant] = useState(false);
  const [addPlantOpen, setAddPlantOpen] = useState(false);
  const [activeView, setActiveView] = useState("garden");
  const [selectedPlantId, setSelectedPlantId] = useState(null);
  const [completionTask, setCompletionTask] = useState(null);
  const [completionForm, setCompletionForm] = useState({
    actualValue: "",
    notes: ""
  });
  const [savingTask, setSavingTask] = useState(false);

  useEffect(() => {
    if (
      settings.locationMode !== "gps" ||
      settings.resolvedLocation ||
      !Number.isFinite(settings.latitude) ||
      !Number.isFinite(settings.longitude)
    ) {
      return undefined;
    }

    let active = true;
    resolveGpsLocation(settings.latitude, settings.longitude)
      .then((resolvedLocation) => {
        if (!active || !resolvedLocation) return;
        setSettings((currentSettings) => {
          if (currentSettings.locationMode !== "gps") return currentSettings;
          const nextSettings = {
            ...currentSettings,
            defaultGardenLocation: resolvedLocation,
            resolvedLocation
          };
          saveSettings(nextSettings);
          return nextSettings;
        });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [
    settings.latitude,
    settings.locationMode,
    settings.longitude,
    settings.resolvedLocation
  ]);

  const loadPlants = useCallback(async () => {
    setPlantsLoading(true);
    setPlantError("");

    try {
      const supabase = getSupabaseClient();
      const [plantsResult, eventsResult, photosResult, historyResult] = await Promise.all([
        supabase
          .from("plants")
          .select("*")
          .order("created_at", { ascending: true }),
        supabase
          .from("plant_events")
          .select("id, plant_id, event_type, title, completed_at, event_date, created_at")
          .eq("status", "completed")
          .neq("event_type", "photo")
          .order("completed_at", { ascending: false }),
        supabase
          .from("plant_photos")
          .select("plant_id, image_url, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("plant_events")
          .select("id, plant_id, event_type, title, status, completed_at, event_date, created_at")
          .in("status", ["completed", "skipped"])
      ]);

      if (plantsResult.error) throw plantsResult.error;
      if (eventsResult.error) throw eventsResult.error;
      if (photosResult.error) throw photosResult.error;
      if (historyResult.error) throw historyResult.error;

      const latestCareByPlant = new Map();
      for (const event of eventsResult.data || []) {
        if (!latestCareByPlant.has(event.plant_id)) {
          latestCareByPlant.set(
            event.plant_id,
            (event.completed_at || event.event_date)?.slice(0, 10)
          );
        }
      }

      const latestPhotoByPlant = new Map();
      for (const photo of photosResult.data || []) {
        if (!latestPhotoByPlant.has(photo.plant_id)) {
          latestPhotoByPlant.set(photo.plant_id, photo.image_url);
        }
      }

      const allPlants = (plantsResult.data || []).map((plant) => ({
          ...plant,
          lastCareDate: latestCareByPlant.get(plant.id) || null,
          photoUrl: latestPhotoByPlant.get(plant.id) || null
        }));
      setPlants(allPlants.filter((plant) => !plant.archived_at));

      const plantNames = new Map(
        (plantsResult.data || []).map((plant) => [plant.id, plant.nickname])
      );
      const careDescriptions = {
        water: "Watering recorded",
        fertilize: "Fertilizing recorded",
        fertilise: "Fertilizing recorded",
        check: "Plant check recorded",
        move: "Move recorded",
        prune: "Pruning recorded",
        repot: "Repotting recorded",
        observe: "Observation recorded"
      };
      const timeline = [
        ...(historyResult.data || []).map((event) => ({
          id: `event-${event.id}`,
          plantId: event.plant_id,
          plantName: plantNames.get(event.plant_id) || "Plant",
          eventType: event.event_type,
          description: event.event_type === "photo"
            ? "Photo added"
            : event.status === "skipped"
              ? `${formatTaskType(event.event_type)} marked Not Now`
              : careDescriptions[event.event_type] || event.title || "Care recorded",
          date: historyEventDate(event)
        })),
        ...(plantsResult.data || []).map((plant) => ({
          id: `plant-${plant.id}`,
          plantId: plant.id,
          plantName: plant.nickname,
          eventType: "plant_added",
          description: "Plant added",
          date: plant.created_at ? new Date(plant.created_at) : null
        }))
      ]
        .filter((event) => event.date && !Number.isNaN(event.date.getTime()))
        .sort((left, right) => right.date - left.date);
      setHistoryEvents(timeline);
      setRecentActivity(timeline.slice(0, 3).map((event) => ({
        id: event.id,
        label: `${event.description} · ${event.plantName}`,
        date: event.date.toISOString()
      })));
    } catch {
      setPlantError("Unable to load plants.");
    } finally {
      setPlantsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlants();
  }, [loadPlants]);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTaskError("");

    try {
      const activeLocation = settings.locationMode === "gps"
        ? settings.resolvedLocation || "Using GPS"
        : settings.defaultGardenLocation || "Auckland";
      const query = new URLSearchParams({ date: today, location: activeLocation });
      if (
        settings.locationMode === "gps" &&
        Number.isFinite(settings.latitude) &&
        Number.isFinite(settings.longitude)
      ) {
        query.set("latitude", String(settings.latitude));
        query.set("longitude", String(settings.longitude));
      }
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "";
      const response = await fetch(`${apiBaseUrl}/api/today?${query}`);
      if (!response.ok) throw new Error("Today’s care could not be refreshed. Please try again.");

      const carePlan = await response.json();
      setTasks(carePlan.tasks || []);
      setWeather(carePlan.weather || null);
      setPlantAssessments(carePlan.plantAssessments || []);
    } catch (error) {
      setTaskError(error.message || "Today’s care could not be refreshed. Please try again.");
    } finally {
      setTasksLoading(false);
    }
  }, [
    settings.defaultGardenLocation,
    settings.latitude,
    settings.locationMode,
    settings.longitude,
    settings.resolvedLocation,
    today
  ]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!initialPhotoPreview) return undefined;

    return () => URL.revokeObjectURL(initialPhotoPreview);
  }, [initialPhotoPreview]);

  useEffect(() => {
    if (!addPlantOpen && !completionTask) return undefined;

    function closeOnEscape(event) {
      if (event.key === "Escape" && !savingPlant) closeAddPlant();
      if (event.key === "Escape" && !savingTask) setCompletionTask(null);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [addPlantOpen, completionTask, savingPlant, savingTask]);

  function updatePlantForm(event) {
    setPlantForm((currentForm) => ({
      ...currentForm,
      [event.target.name]: event.target.value
    }));
  }

  function selectInitialPhoto(event) {
    const [file] = event.target.files || [];
    if (!file) return;

    try {
      validatePlantPhoto(file);
      setAddPlantError("");
      setInitialPhoto(file);
      setInitialPhotoPreview(URL.createObjectURL(file));
    } catch (error) {
      setInitialPhoto(null);
      setInitialPhotoPreview("");
      setAddPlantError(error.message || "Choose a valid plant photo.");
    } finally {
      event.target.value = "";
    }
  }

  function removeInitialPhoto() {
    setInitialPhoto(null);
    setInitialPhotoPreview("");
  }

  function closeAddPlant() {
    setAddPlantOpen(false);
    setAddPlantError("");
    removeInitialPhoto();
  }

  function openAddPlant() {
    setPlantForm((currentForm) => ({
      ...currentForm,
      environment: currentForm.environment || (
        settings.defaultEnvironment === "mixed" ? "" : settings.defaultEnvironment
      )
    }));
    setAddPlantOpen(true);
  }

  function updateSetting(name, value) {
    setSettings((currentSettings) => {
      const updates = typeof name === "object" ? name : { [name]: value };
      const nextSettings = { ...currentSettings, ...updates };
      saveSettings(nextSettings);
      return nextSettings;
    });
  }

  async function addPlant(event) {
    event.preventDefault();
    if (!initialPhoto) {
      setAddPlantError("Add a plant photo before creating this profile.");
      return;
    }

    setSavingPlant(true);
    setAddPlantError("");
    setPlantNotice("");

    const plant = {
      nickname: plantForm.nickname.trim(),
      species: plantForm.species.trim(),
      location: plantForm.location.trim(),
      growing_setup: plantForm.growingSetup || null,
      pot_size_cm:
        plantForm.growingSetup === "pot" && plantForm.potSizeCm
          ? Number(plantForm.potSizeCm)
          : null,
      soil_type: plantForm.soilType.trim() || null,
      sunlight_exposure: plantForm.sunlightExposure || null,
      environment: ["garden_bed", "in_ground"].includes(plantForm.growingSetup)
        ? "outdoor"
        : plantForm.environment || null,
      growth_stage: plantForm.growthStage || null,
      notes: plantForm.notes.trim() || null
    };

    try {
      const result = await createPlantWithInitialPhoto(getSupabaseClient(), {
        plant,
        initialPhoto
      });

      if (result.photoUploadError) {
        console.error("Initial plant photo upload failed:", result.photoUploadError);
        setPlantNotice(
          `Plant added, but its photo was not saved: ${result.photoUploadError.message}. You can retry from Plant Detail.`
        );
      }

      setPlantForm(emptyPlantForm);
      removeInitialPhoto();
      await loadPlants();
      closeAddPlant();
    } catch (error) {
      setAddPlantError(error.message || "Unable to add plant.");
    } finally {
      setSavingPlant(false);
    }
  }

  function openCompletion(task) {
    setCompletionTask(task);
    setCompletionForm({
      actualValue: task.suggestedValue?.value?.toString() || "",
      notes: ""
    });
  }

  async function completeTask(event) {
    event.preventDefault();
    setSavingTask(true);
    setTaskError("");

    const actualValue = completionTask.suggestedValue
      ? Number(completionForm.actualValue)
      : null;

    try {
      const response = await fetch(`/api/tasks/${completionTask.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualValue,
          notes: completionForm.notes
        })
      });
      if (!response.ok) throw new Error("Unable to complete task.");

      await Promise.all([loadTasks(), loadPlants()]);
      setPlantNotice(`Care recorded for ${completionTask.plantName}. Your garden history has been updated.`);
      setCompletionTask(null);
    } catch {
      setTaskError("Unable to complete task.");
    } finally {
      setSavingTask(false);
    }
  }

  async function delayTask(taskToDelay) {
    setTaskError("");

    try {
      const response = await fetch(`/api/tasks/${taskToDelay.id}/delay`, {
        method: "POST"
      });
      if (!response.ok) throw new Error("Unable to delay task.");

      await Promise.all([loadTasks(), loadPlants()]);
      setPlantNotice(`${taskToDelay.plantName} is delayed for today.`);
    } catch {
      setTaskError("Unable to delay task.");
    }
  }

  async function skipTask(taskToSkip) {
    setTaskError("");

    try {
      const response = await fetch(`/api/tasks/${taskToSkip.id}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!response.ok) throw new Error("Unable to skip recommendation.");

      await Promise.all([loadTasks(), loadPlants()]);
      setPlantNotice(`${taskToSkip.plantName} is marked Not Now. GreenMate will remember this for today.`);
    } catch {
      setTaskError("Unable to skip recommendation.");
    }
  }

  async function handlePlantArchived(plantName) {
    await Promise.all([loadPlants(), loadTasks()]);
    setSelectedPlantId(null);
    setActiveView("plants");
    setPlantNotice(`${plantName} has been archived. Its history is still available.`);
  }

  async function handlePlantDeleted(plantName) {
    await Promise.all([loadPlants(), loadTasks()]);
    setSelectedPlantId(null);
    setActiveView("plants");
    setPlantNotice(`${plantName} was permanently deleted.`);
  }

  const formattedDate = new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(settings.dateFormat === "long" ? { year: "numeric" } : {})
  }).format(new Date(`${today}T00:00:00`));
  const pendingCount = tasks.filter((task) => task.status === "pending").length;
  const taskByPlant = new Map(tasks.map((task) => [task.plantId, task]));
  const assessmentByPlant = new Map(
    plantAssessments.map((assessment) => [assessment.plantId, assessment])
  );
  const careFeed = plants
    .map((plant) => ({
      plant,
      task: taskByPlant.get(plant.id) || null,
      assessment: assessmentByPlant.get(plant.id) || null
    }))
    .sort((left, right) => {
      const rank = ({ task }) => {
        if (task?.status === "pending" && task.priority === "high") return 0;
        if (task?.status === "pending") return 1;
        return 2;
      };
      return rank(left) - rank(right);
    });

  function navigateTo(section) {
    if (selectedPlantId) setSelectedPlantId(null);
    setActiveView(section);
    requestAnimationFrame(() => {
      document.getElementById(section)?.scrollIntoView({ behavior: "smooth" });
    });
  }

  if (selectedPlantId) {
    return (
      <div className="app-shell">
        <AppNavigation
          activeView={activeView}
          onNavigate={navigateTo}
          onAdd={() => {
            setSelectedPlantId(null);
            openAddPlant();
          }}
        />
        <div className="app-main">
          <PlantDetail
            plantId={selectedPlantId}
            currentTask={taskByPlant.get(selectedPlantId) || null}
            currentAssessment={assessmentByPlant.get(selectedPlantId) || null}
            onBack={() => setSelectedPlantId(null)}
            onPlantUpdated={loadPlants}
            onPlantArchived={handlePlantArchived}
            onPlantDeleted={handlePlantDeleted}
            onComplete={(task) => {
              setSelectedPlantId(null);
              openCompletion(task);
            }}
            onSkip={skipTask}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppNavigation
        activeView={activeView}
        onNavigate={navigateTo}
        onAdd={openAddPlant}
      />
      <div className="app-main">
        <main className="page-shell" id={activeView}>
          <header className="dashboard-header">
            <div className="dashboard-header__brand">
              <span className="brand-mark" aria-hidden="true">G</span>
              <div>
                <strong>GREENMATE</strong>
              </div>
            </div>
          </header>

          {plantNotice && (
            <p className="photo-save-notice" role="alert">{plantNotice}</p>
          )}

          {activeView === "garden" ? (
            <>
              <DailyGardenBrief
                totalPlants={plants.length}
                weather={weather}
                locationLabel={
                  weatherLocationLabel(settings, weather)
                }
              />
              <section className="page-section" id="care-feed" aria-labelledby="care-feed-heading">
                <div className="section-heading">
                  <div>
                    <h2 id="care-feed-heading">Today’s Care</h2>
                  </div>
                  {!tasksLoading && !taskError && (
                    <span className="task-count" aria-live="polite">{pendingCount} tasks</span>
                  )}
                </div>
                <div className="ai-care-feed">
                  {(plantsLoading || tasksLoading) && (
                    <p className="empty-state">Checking your garden for today…</p>
                  )}
                  {(plantError || taskError) && (
                    <p className="empty-state" role="alert">{plantError || taskError}</p>
                  )}
                  {!plantsLoading && !tasksLoading && !plantError && !taskError && plants.length === 0 && (
                    <div className="empty-state active-garden-empty">
                      <strong>Your active garden is empty.</strong>
                      <span>Add a plant to start your garden.</span>
                    </div>
                  )}
                  {!plantsLoading && !tasksLoading && !plantError && !taskError && plants.length > 0 && pendingCount === 0 && (
                    <div className="all-clear-state">
                      <span aria-hidden="true">✓</span>
                      <div>
                        <h3>Nothing needs your attention today.</h3>
                        <p>Enjoy your garden and check back tomorrow.</p>
                      </div>
                    </div>
                  )}
                  {!plantsLoading && !tasksLoading && !plantError && !taskError && pendingCount > 0 && careFeed.map(({ plant, task, assessment }) => (
                    <AICareCard
                      key={plant.id}
                      plant={plant}
                      task={task}
                      assessment={assessment}
                      onComplete={openCompletion}
                      onSkip={skipTask}
                      onOpen={setSelectedPlantId}
                    />
                  ))}
                </div>
              </section>
              {!plantsLoading && !plantError && pendingCount === 0 && recentActivity.length > 0 && (
                <section className="page-section recent-activity" aria-labelledby="recent-activity-heading">
                  <div className="section-heading">
                    <div>
                      <h2 id="recent-activity-heading">Recent Activity</h2>
                    </div>
                  </div>
                  <ul>
                    {recentActivity.map((activity) => (
                      <li key={activity.id}>
                        <span aria-hidden="true">✓</span>
                        <div>
                          <strong>{activity.label}</strong>
                          <time dateTime={activity.date}>
                            {new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(activity.date))}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : activeView === "plants" ? (
            <section className="page-section plants-page" id="plants" aria-labelledby="plant-list-heading">
              <div className="section-heading">
                <div>
                  <h1 id="plant-list-heading">My Plants</h1>
                </div>
                {!plantsLoading && !plantError && (
                  <span className="task-count" aria-live="polite">
                    {plants.length} {plants.length === 1 ? "plant" : "plants"}
                  </span>
                )}
              </div>
              <div className="plant-grid">
                {plantsLoading && <p className="empty-state">Loading plants…</p>}
                {plantError && <p className="empty-state" role="alert">{plantError}</p>}
                {!plantsLoading && !plantError && plants.length === 0 && (
                  <div className="empty-state active-garden-empty">
                    <strong>Your active garden is empty.</strong>
                    <span>Add a plant to start your garden.</span>
                  </div>
                )}
                {plants.map((plant) => (
                  <PlantCollectionCard key={plant.id} plant={plant} onOpen={setSelectedPlantId} units={settings.units} />
                ))}
                {!plantsLoading && !plantError && (
                  <button className="add-plant-card" type="button" onClick={openAddPlant}>
                    <span aria-hidden="true">＋</span>
                    <strong>Add New Plant</strong>
                    <small>Grow your GreenMate garden</small>
                  </button>
                )}
              </div>
            </section>
          ) : activeView === "history" ? (
            <HistoryTimeline
              events={historyEvents}
              loading={plantsLoading}
              error={plantError}
              onOpenPlant={setSelectedPlantId}
            />
          ) : (
            <SettingsPage settings={settings} onChange={updateSetting} />
          )}

          <div className="mobile-safe-area" aria-hidden="true" />

          {addPlantOpen && (
            <div
              className="modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !savingPlant) {
                  closeAddPlant();
                }
              }}
            >
              <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-plant-heading"
              >
                <div className="modal__header">
                  <div>
                    <p className="eyebrow">New plant</p>
                    <h2 id="add-plant-heading">Add Plant</h2>
                  </div>
                  <button
                    className="modal__close"
                    type="button"
                    aria-label="Close add plant form"
                    onClick={closeAddPlant}
                    disabled={savingPlant}
                  >
                    ×
                  </button>
                </div>

                <form className="plant-form" onSubmit={addPlant}>
                  <div className="plant-form__identity">
                    <div className="initial-photo-field">
                      {initialPhotoPreview ? (
                        <div className="initial-photo-preview">
                          <img src={initialPhotoPreview} alt="Selected plant preview" />
                          <div className="initial-photo-preview__actions">
                            <label className="button button--secondary">
                              Replace
                              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={selectInitialPhoto} />
                            </label>
                            <button className="button button--ghost" type="button" onClick={removeInitialPhoto}>Remove</button>
                          </div>
                        </div>
                      ) : (
                        <label className="initial-photo-upload">
                          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={selectInitialPhoto} />
                          <span className="initial-photo-upload__icon" aria-hidden="true">◉</span>
                          <strong>Add plant photo</strong>
                          <small>This will become the plant’s first archive photo.</small>
                        </label>
                      )}
                    </div>
                    <label>
                      Nickname
                      <input autoFocus name="nickname" value={plantForm.nickname} onChange={updatePlantForm} required />
                    </label>
                    <label>
                      Species
                      <input name="species" value={plantForm.species} onChange={updatePlantForm} required />
                    </label>
                    <label>
                      Location
                      <input name="location" value={plantForm.location} onChange={updatePlantForm} required />
                    </label>
                  </div>
                  {addPlantError && (
                    <p className="form-error" role="alert">{addPlantError}</p>
                  )}
                  <fieldset className="plant-form__section">
                    <legend>Growing Setup &amp; Conditions</legend>
                    <label>
                      Where is your plant growing?
                      <select name="growingSetup" value={plantForm.growingSetup} onChange={updatePlantForm}>
                        <option value="">Select</option>
                        <option value="pot">Pot / Container</option>
                        <option value="garden_bed">Garden Bed</option>
                        <option value="in_ground">In the Ground</option>
                        <option value="hanging_basket">Hanging Basket</option>
                      </select>
                    </label>
                    <div className="plant-form__row" data-pot-visible={plantForm.growingSetup === "pot"}>
                      {plantForm.growingSetup === "pot" && (
                        <label>
                          How big is the pot?
                          <span className="unit-input">
                            <input type="number" min="1" step="1" name="potSizeCm" value={plantForm.potSizeCm} onChange={updatePlantForm} inputMode="numeric" />
                            <span aria-hidden="true">cm</span>
                          </span>
                        </label>
                      )}
                      <label>
                        What is your plant currently growing in?
                        <select name="soilType" value={plantForm.soilType} onChange={updatePlantForm}>
                          <option value="">I'm not sure</option>
                          <option value="potting_mix">Potting Mix</option>
                          <option value="indoor_plant_mix">Indoor Plant Mix</option>
                          <option value="succulent_cactus_mix">Succulent &amp; Cactus Mix</option>
                          <option value="orchid_mix">Orchid Mix</option>
                          <option value="seed_raising_mix">Seed Raising Mix</option>
                          <option value="acidic_mix">Acidic Mix</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Where does your plant spend most of the day?
                      <select name="sunlightExposure" value={plantForm.sunlightExposure} onChange={updatePlantForm}>
                        <option value="direct_sun_most_of_day">In direct sun most of the day</option>
                        <option value="morning_sun">Gets morning sun</option>
                        <option value="afternoon_sun">Gets afternoon sun</option>
                        <option value="near_bright_window">Near a bright window</option>
                        <option value="bright_room">In a bright room</option>
                        <option value="mostly_shaded">Mostly in the shade</option>
                        <option value="">I'm not sure</option>
                      </select>
                    </label>
                    {["pot", "hanging_basket"].includes(plantForm.growingSetup) && (
                      <label>
                        Where is it kept?
                        <select name="environment" value={plantForm.environment} onChange={updatePlantForm}>
                          <option value="">Select</option>
                          <option value="indoor">Indoors</option>
                          <option value="outdoor">Outdoors</option>
                        </select>
                      </label>
                    )}
                  </fieldset>
                  <fieldset className="plant-form__section">
                    <legend>Additional Information</legend>
                    <label>
                      What does your plant look like right now?
                      <select name="growthStage" value={plantForm.growthStage} onChange={updatePlantForm}>
                        <option value="growing">Growing new leaves</option>
                        <option value="flowering">Flowering</option>
                        <option value="fruiting">Producing fruit</option>
                        <option value="looks_same">Looks about the same</option>
                        <option value="">I'm not sure</option>
                      </select>
                    </label>
                    <label>
                      Notes
                      <textarea name="notes" rows="3" value={plantForm.notes} onChange={updatePlantForm} placeholder="Anything you'd like GreenMate to know about this plant?" />
                      <small>For example: recently repotted, recovering from pests, a gift from a friend, or not growing well.</small>
                    </label>
                  </fieldset>
                  <div className="modal__actions">
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={closeAddPlant}
                      disabled={savingPlant}
                    >
                      Cancel
                    </button>
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={savingPlant}
                    >
                      {savingPlant ? "Saving…" : "Add Plant"}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {completionTask && (
            <div
              className="modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !savingTask) {
                  setCompletionTask(null);
                }
              }}
            >
              <section
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="complete-task-heading"
              >
                <div className="modal__header">
                  <div>
                    <p className="eyebrow">Suggested care</p>
                    <h2 id="complete-task-heading">
                      Record {completionTask.action}
                    </h2>
                  </div>
                  <button
                    className="modal__close"
                    type="button"
                    aria-label="Close task confirmation"
                    onClick={() => setCompletionTask(null)}
                    disabled={savingTask}
                  >
                    ×
                  </button>
                </div>

                <form className="completion-form" onSubmit={completeTask}>
                  <div className="recommendation-summary">
                    <span>GreenMate suggests</span>
                    <strong>{completionTask.action}</strong>
                    {completionTask.suggestedValue && (
                      <p>
                        Recommended: {completionTask.suggestedValue.value}{" "}
                        {completionTask.suggestedValue.unit}
                      </p>
                    )}
                    <p>
                      Why GreenMate suggests this: {completionTask.reason}
                    </p>
                  </div>

                  {completionTask.suggestedValue && (
                    <div className="actual-value-field">
                      <label>
                        Actual amount ({completionTask.suggestedValue.unit})
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          step="any"
                          value={completionForm.actualValue}
                          onChange={(event) =>
                            setCompletionForm((currentForm) => ({
                              ...currentForm,
                              actualValue: event.target.value
                            }))
                          }
                          required
                        />
                      </label>
                      <p>
                        Already filled from GreenMate’s suggestion. Adjust only
                        if needed.
                      </p>
                    </div>
                  )}

                  <label>
                    Notes
                    <textarea
                      autoFocus={!completionTask.suggestedValue}
                      rows="3"
                      value={completionForm.notes}
                      onChange={(event) =>
                        setCompletionForm((currentForm) => ({
                          ...currentForm,
                          notes: event.target.value
                        }))
                      }
                      placeholder="Optional care notes"
                    />
                  </label>

                  <div className="modal__actions">
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => setCompletionTask(null)}
                      disabled={savingTask}
                    >
                      Cancel
                    </button>
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={savingTask}
                    >
                      {savingTask ? "Saving…" : "Record Care"}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
