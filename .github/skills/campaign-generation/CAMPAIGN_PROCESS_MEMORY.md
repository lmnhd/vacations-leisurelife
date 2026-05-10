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

```markdown
### YYYY-MM-DD: Short Title

**Trigger / Context:** Why the change happened (e.g., "The user requested...", "Model X consistently fails at...")  
**The Change / Rule:** The actual instruction or process update to follow.  
**Broader Lesson:** Why this matters for future pipeline refactors or operations.
```

Keep entries short and concrete. The goal is to preserve operational learning, not to write long narratives.

---

### 2026-05-08: Shared Process Memory Introduced

**Trigger / Context:** The campaign-generation skill needed a common place for agents to record ad hoc workflow changes that emerge during live collaboration with the user.  
**The Change / Rule:** Added a shared process-memory requirement near the top of `SKILL.md` and established this file as the global memory layer for the campaign-development process.  
**Broader Lesson:** Repeated entries in this file should later be mined to simplify the campaign pipeline, formalize temporary policies, and eliminate recurring manual workarounds.

### 2026-05-08: Tropical Destination Background Alignment

**Trigger / Context:** Campaign image outputs for tropical cruises drifted toward mountainous or otherwise non-tropical background scenery that did not match the actual destination promise.  
**The Change / Rule:** Agents should actively watch for background-environment mismatch as a recurring review pattern, especially when a campaign is positioned as Caribbean, tropical, warm-water, island, beach, or palm-driven. If the imagery reads alpine, rocky-coastal, fjord-like, or generically mountainous, the issue should be called out and repaired rather than treated as a one-off aesthetic miss.  
**Broader Lesson:** If this pattern repeats, the visual pipeline should gain stronger upstream destination-environment constraints so tropical campaigns default toward believable tropical water, vegetation, light, and port/deck context instead of generic scenic backdrops.

### 2026-05-09: Anchor Compliance and Starter Conversation Reliability

**Trigger / Context:** The campaign pipeline failed randomly due to `gpt-4o` either omitting the `role` field on `starterConversation` (schema violation) or dropping exact verbatim strings of `nicheSignal` and `nicheCarryThrough` in the generated `imagePrompt` and `subjectAction` fields (Anchor Compliance error limit exceeded).  
**The Change / Rule:** Implemented a new deterministic fixer (`normalizeAnchorContent` in `editors-room.ts`) to inject the missing anchor strings into `imagePrompt` and `subjectAction` automatically before the compliance check. Also modified the `starterConversation` schema to coerce and supply the missing `role` field where applicable.  
**Broader Lesson:** Do not rely purely on LLM strict substring compliance for complex artifacts when it's easily injectable. If it maps to a stable text pattern and can be injected safely without ruining creative context, write a deterministic fixer to normalize the output rather than failing the whole brief job.
