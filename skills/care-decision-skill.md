# Care Decision Skill

## Always

- Check existing care history before creating a new task.
- Prefer updating existing tasks over creating duplicates.
- Recommend only necessary care actions.
- Keep recommendations plant-specific.
- Decide whether care is needed today before asking the user to act.
- Provide the care method and measurable value when evidence supports them.
- Use differences between Recommended and Actual as future decision evidence when available.
- Treat rule decisions and their evidence as authoritative inputs to any explanation layer.

## Consider

- Watering
- Fertilising
- Pruning
- Repotting
- Inspection
- Task priority

## Never

- Recommend unnecessary care.
- Repeat recent completed actions.
- Treat all plants the same.
- Shift routine care decisions back to an inexperienced user.
- Allow generated wording to invent, remove, or override a care decision.

## MVP Adapter Configuration

```json
{
  "priorityWeight": {
    "high": 3,
    "normal": 2,
    "low": 1
  },
  "rules": [
    {
      "id": "prune_issue",
      "type": "prune",
      "title": "Prune damaged growth",
      "trigger": "note_signal",
      "noteTerms": ["dead leaf", "dead leaves", "damaged branch", "needs pruning"],
      "historyTerms": ["prune", "trim"],
      "cooldownDays": 14,
      "priority": "high",
      "suggestedValue": null,
      "unit": null,
      "instruction": "Remove only clearly dead or damaged growth with clean tools.",
      "reason": "The plant notes mention damaged or dead growth that should be checked."
    },
    {
      "id": "move_issue",
      "type": "move",
      "title": "Move plant",
      "trigger": "note_signal",
      "noteTerms": ["too much sun", "too much direct sun", "move away", "cold draft"],
      "historyTerms": ["move"],
      "cooldownDays": 7,
      "priority": "high",
      "suggestedValue": null,
      "unit": null,
      "instruction": "Move the plant to a more suitable nearby position and observe it.",
      "reason": "The plant notes indicate its current position may need adjustment."
    },
    {
      "id": "watering_assessment",
      "type": "check",
      "title": "Check soil moisture",
      "trigger": "watering_assessment",
      "historyTerms": ["water"],
      "minimumDays": 7,
      "highPriorityAfterAdditionalDays": 2,
      "strongEvidenceTerms": ["dry soil", "soil is dry", "wilting", "very dry"],
      "strongEvidenceType": "water",
      "strongEvidenceTitle": "Water",
      "priority": "normal",
      "suggestedValue": 250,
      "unit": "ml",
      "instruction": "Check the top 2–3 cm of soil. Water only if it feels dry.",
      "strongEvidenceInstruction": "Water slowly and stop if water begins draining from the pot.",
      "rainTitle": "Skip watering today",
      "rainInstruction": "Let today's rain water this outdoor plant and check the soil again tomorrow.",
      "reason": "The last watering record was {days} days ago. Check soil moisture before watering.",
      "strongEvidenceReason": "The last watering was {days} days ago and the plant record shows signs of dryness.",
      "rainReason": "Enough rain is expected today, so this outdoor plant does not need additional watering.",
      "warmReason": "Warm, sunny conditions can dry the soil faster.",
      "coolReason": "Cool or damp conditions reduce watering urgency."
    },
    {
      "id": "fertilizer_interval",
      "type": "fertilize",
      "title": "Fertilize",
      "trigger": "elapsed_history",
      "historyTerms": ["fertiliz", "fertilis"],
      "minimumDays": 30,
      "priority": "normal",
      "suggestedValue": 5,
      "unit": "ml",
      "instruction": "Apply a small measured feed according to the product directions.",
      "reason": "Last fertilizer record was {days} days ago, so a small feed may be due."
    },
    {
      "id": "baseline_observation",
      "type": "check",
      "title": "Check plant condition",
      "trigger": "empty_history",
      "priority": "normal",
      "suggestedValue": null,
      "unit": null,
      "instruction": "Look at the leaves and feel the soil, then record anything unusual.",
      "reason": "There is no recent care history, so begin with a quick condition check."
    }
  ]
}
```
