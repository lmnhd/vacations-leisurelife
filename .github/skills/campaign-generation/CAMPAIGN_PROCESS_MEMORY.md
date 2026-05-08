# Campaign Process Memory

**Purpose:** Shared process memory for the campaign-generation workflow.  
**Audience:** Any agent or human working through campaign discovery, repair, briefing, media generation, distribution, landing-page adjustments, or booking/inventory handling.  
**Use:** Read before substantial work. Append after meaningful ad hoc process changes or newly discovered operating rules.

---

## What To Record

Record items that change how the campaign system is actually being operated, especially when those changes were discovered through real user collaboration rather than original design.

Good examples:

- ad hoc workflow changes requested by the user
- temporary operating rules that future agents should follow
- recurring blockers or failure modes
- booking/inventory exceptions
- landing-page messaging or CTA policy shifts
- media-review heuristics that became part of the practical process
- manual operator steps that the automated system still depends on
- new stop conditions, escalation rules, or readiness gates

Do not use this file for ordinary implementation notes that only matter inside one small code change.

---

## Entry Format

Use this format for each new note:

```md
## YYYY-MM-DD - Short Title

- Trigger: What request, blocker, or observed issue caused the change.
- Change: What the agent/user decided to do differently.
- Scope: Which phase, route, system, or workflow this affects.
- Refactor implication: What this suggests we should eventually redesign, automate, or remove.
```

Keep entries short and concrete. The goal is to preserve operational learning, not to write long narratives.

---

## Entries

## 2026-05-08 - Shared Process Memory Introduced

- Trigger: The campaign-generation skill needed a common place for agents to record ad hoc workflow changes that emerge during live collaboration with the user.
- Change: Added a shared process-memory requirement near the top of `SKILL.md` and established this file as the global memory layer for the campaign-development process.
- Scope: All agents using `.github/skills/campaign-generation/SKILL.md`.
- Refactor implication: Repeated entries in this file should later be mined to simplify the campaign pipeline, formalize temporary policies, and eliminate recurring manual workarounds.

## 2026-05-08 - Tropical Destination Background Alignment

- Trigger: Campaign image outputs for tropical cruises drifted toward mountainous or otherwise non-tropical background scenery that did not match the actual destination promise.
- Change: Agents should actively watch for background-environment mismatch as a recurring review pattern, especially when a campaign is positioned as Caribbean, tropical, warm-water, island, beach, or palm-driven. If the imagery reads alpine, rocky-coastal, fjord-like, or generically mountainous, the issue should be called out and repaired rather than treated as a one-off aesthetic miss.
- Scope: Aesthetic brief review, landing still generation, hero/concept image review, scene-image review, documentary detail review, and any downstream ad/landing asset selection.
- Refactor implication: If this pattern repeats, the visual pipeline should gain stronger upstream destination-environment constraints so tropical campaigns default toward believable tropical water, vegetation, light, and port/deck context instead of generic scenic backdrops.
