# Plant Data Skill

## Always

- Use only information relevant to care decisions.
- Treat missing data as uncertainty.
- Prefer existing plant information before requesting new information.
- Treat completed Care History as Plant Memory.
- Preserve recommended values, actual values, reasons, and available user feedback as distinct evidence.

## Consider

- Species
- Location
- Growing setup
- Indoor or outdoor
- Pot size
- Sunlight
- Soil
- User notes

## Never

- Require expert gardening knowledge from users.
- Infer unknown plant characteristics without evidence.
- Use irrelevant plant information.

## MVP Adapter Configuration

```json
{
  "profileFields": [
    "id",
    "nickname",
    "species",
    "location",
    "growingSetup",
    "indoorOutdoor",
    "potSize",
    "sunlight",
    "soil",
    "growthStage",
    "notes"
  ]
}
```
