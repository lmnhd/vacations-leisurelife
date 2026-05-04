# Agent Orchestrator / Skill System Advice for Landing Page Chat

## Summary

The landing page Tour Conductor should begin as a documented group chat design, but if behavior complexity grows into multiple capabilities, the existing hero chat agent/skill system is the right architecture to borrow.

## What the current hero chat system already gives us

- A stable shared session model via `sessionId` that can carry across text and voice.
- A clean separation between UI and chat pipeline logic (`app/api/chat`, `lib/chat/pipeline.ts`).
- A prompt governance model that loads context, rules, and skills rather than hardcoding all instructions in code.
- A directive-driven display system (`image`, `form`, etc.) that could be extended for notification prompts or status cards.
- A reusable hero chat hook / container pattern that is agnostic to the underlying domain.

## Why this matters for landing page chat

For the TC portal, we already expect multiple responsibilities:

- answering logistics and campaign questions
- collecting structured opt-ins for email/SMS
- aggregating activity suggestions
- recording group history for future visitors
- surfacing campaign status and related campaigns

That is exactly the type of complexity where the hero chat skill system should be considered.

## Recommended design pattern

1. Start with the existing `lib/chat` pipeline as the baseline.
2. Treat the landing page chat as a campaign-specific flow:
   - a `campaign-landing-chat` context/node
   - a `tour-conductor` skill pack for persona/instructions
   - `notification-signup`, `campaign-status`, and `suggestion-collector` as separate skill modules or tools
3. Keep prompt content in external markdown/JSON files and reference them through the skill loader.
4. Use the skill system for capability boundaries, not just for one-off prompt text.
5. Reserve a dedicated agent orchestrator if the page starts requiring durable multi-step workflows or background campaign orchestration.

## When to use the agent orchestrator

Use the full orchestrator if the TC experience begins to include:

- tool-backed actions with side effects (e.g. add to SMS/email list, update campaign lead records, trigger campaign events)
- persistent workflow state beyond a single chat session (e.g. opt-in confirmation, booking intent pipeline, campaign readiness checklist)
- branching multi-turn flows that must persist if the visitor leaves and returns
- explicit capabilities that must be audited or replayed outside the raw chat transcript

If the chat remains mostly conversational with shared history and a few structured prompts, the existing `runPipeline` / `prompt-assembler` / `loadSkills` stack is sufficient.

## Practical hybrid strategy

- Use the hero chat skill model for persona, context, and conditional behavior.
- Keep the initial build in the standard chat pipeline.
- Add an orchestrator layer later if the TC portal needs:
  - multi-step notification signup workflows
  - campaign discovery tools
  - data extraction and campaign readiness scoring
  - stateful guest onboarding across visits

## Proposed skill boundaries for the TC portal

- `skills/tour-conductor/persona.md` — core TC voice and response rules
- `skills/tour-conductor/logistics.md` — how to answer cruise/campaign questions
- `skills/notifications/opt-in.md` — how to handle email/SMS signup and consent
- `skills/status/campaign-progress.md` — how to answer booking thresholds and launch status
- `skills/suggestions/activity-mining.md` — how to solicit and categorize excursion/project ideas
- `skills/discovery/related-campaigns.md` — when and how to introduce related campaigns

## Advice for documentation-only phase

- Document the landing page chat as a campaign-specific flow with a shared session and persistent history.
- Explicitly call out the hero chat style system as the preferred architecture once the chat grows beyond a simple Q&A.
- Avoid locking into orchestration too early; document the minimal path and the orchestration escalation path.
- Keep all prompt and skill definitions external to code so the system remains editable and maintainable.

## Recommendation

Document the TC portal as:

- a shared campaign chat surface,
- a skill-driven agent persona,
- a stable session/history model,
- a tool-enabled notification signup capability,
- and a future-ready escalation path into the agent orchestrator if needed.

This gives the landing page chat the flexibility to stay lightweight at first, while preserving the option to graduate into the same agent-backed architecture used by the hero chat system.
