# GreenMate Agent Flow

GreenMate’s Daily Care Agent is a deterministic, rule-based care planner. It uses the project’s care skill documents as configuration and keeps evidence-driven decisions separate from friendly wording.

## Flow

1. The backend reads each active plant, recent `plant_events`, the latest photo reference, and normalized Open-Meteo weather.
2. `buildPlantContext` normalizes those inputs into one temporary `PlantContext`.
3. `dailyCareAgent` evaluates the configured care rules and selects at most one care suggestion per plant.
4. `aiGardenerExplanation` converts the decision and evidence into beginner-friendly language without changing the decision.
5. The backend stores new pending care in `plant_events` and returns `GardenBrief`, `PlantAssessment`, and the persisted care records used by the UI.
6. Care Recorded or Not Now updates that same event row. Those records become Plant Archive evidence and prevent repeated same-day suggestions.

## Stable shapes

`PlantContext` contains `plantProfile`, `plantArchive`, `currentDate`, `currentSeason`, `existingPendingTasks`, `weather`, and reserved future inputs. `plantArchive` contains recent events, last watering and fertilizing dates, observations, and the latest photo reference.

`GardenBrief` contains `title`, `summary`, and counts for total, healthy, attention, and urgent plants.

`PlantAssessment` contains plant identity, status, confidence, evidence, summary, reasons, and `suggestedCare`.

`SuggestedCare` contains type, title, beginner-friendly instruction, reason, priority, confidence, due timing, suggested value, and unit.

## MVP boundaries

Weather comes from Open-Meteo with an Auckland fallback when the provider is unavailable. Explanations remain templates, photo analysis and sensors are not active inputs, and no LLM makes care decisions. Supabase stores the Plant Archive and care state.
