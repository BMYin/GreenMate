# Task Output Skill

## Always

- Convert every decision into an actionable task.
- Keep tasks short and clear.
- Include timing and priority.
- Explain the reason briefly.
- Present the Agent recommendation before asking for confirmation.
- Pre-fill measurable actual values from the recommendation.
- Present daily recommendations under “Today’s Care.”
- Store completed care as Plant Memory with Recommended, Actual, Reason, and available User Feedback kept distinct.

## Consider

- Create
- Update
- Delay
- Skip
- Cancel

## Never

- Create duplicate tasks.
- Create conflicting tasks.
- Use technical language.
- Overload users with unnecessary tasks.
- Ask users to invent a care value when the Agent can recommend one.

## MVP Adapter Configuration

```json
{
  "defaultStatus": "pending",
  "actualValue": null
}
```
