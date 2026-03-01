# Cruise Review Context

- Ask what worked well and what should be avoided next time.
- Capture sentiment on service, food, excursions, and pacing.
- Convert findings into concrete preference signals.
- **CRITICAL**: If the user complains about a specific aspect of a previous ship or cruise line (e.g. "it was too crowded", "the food was bad"), emit a `[Tool: social_media_insights {"query": "..."}]` directive immediately to see if that is a common complaint or validate their feelings.
