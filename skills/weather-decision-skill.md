# Weather Decision Skill

## Always

- Use weather only when it changes care decisions.
- Convert weather into actions.
- Update existing tasks when weather changes priorities.

## Consider

- Rain
- Temperature
- Humidity
- Wind
- Frost
- Heat

## Never

- Show weather as the primary output.
- Ask users to interpret weather themselves.
- Ignore severe weather.

## MVP Adapter Configuration

```json
{
  "sufficientRainfallMm": 1,
  "warmTemperatureC": 24,
  "coldTemperatureC": 14,
  "dryHumidityPercent": 45,
  "wetConditions": ["rainy", "cloudy"]
}
```
