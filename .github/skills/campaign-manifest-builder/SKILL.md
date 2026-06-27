---
name: campaign-manifest-builder
description: Turn an operator-supplied holiday angle, niche idea, exact cruise sailing, CB Agent Tools package or promotion, discovered deal, or partially built campaign into a review-ready Leisure Life Group or retail Deal campaign. Use when an agent should bypass unnecessary manual pipeline steps, assemble or persist the correct campaign records, invoke existing pipeline APIs where useful, preserve factual inventory and promotion truth, and hand the operator directly to the next real UI checkpoint for copy approval, image selection, final approval, or publication.
---

# Campaign Manifest Builder

Build the campaign state the existing UI and pipelines expect. Do not create a third campaign system.

The target is the **maximum safe completion state** supported by the user's input:

- factual and deterministic work completed
- generated artifacts persisted in their normal stores
- provenance preserved
- unresolved truth clearly marked
- campaign left unapproved and unpublished unless the operator explicitly performs those actions
- operator sent to the smallest remaining review surface

## 1. Read First

Always read:

1. [AI_POLICY.md](../../../AI_POLICY.md)
2. [INPUT_ROUTING.md](./references/INPUT_ROUTING.md)
3. The lane reference selected by the router:
   - [GROUP_BUILD.md](./references/GROUP_BUILD.md)
   - [DEAL_BUILD.md](./references/DEAL_BUILD.md)
4. [UI_CHECKPOINTS.md](./references/UI_CHECKPOINTS.md)

Also read the established lane skill before mutating campaign state:

- Group: [campaign-generation/SKILL.md](../campaign-generation/SKILL.md)
- Deal: [deal-campaign-generation/SKILL.md](../deal-campaign-generation/SKILL.md)

Use the companion workflow and process-memory files named by those skills. This skill controls intake, bypass decisions, state assembly, and handoff; the lane skills remain authoritative for generation and publication rules.

## 2. Operating Contract

### Observe before acting

Inspect the real API route, store function, type, and UI page for every state you plan to write. Treat comments and old plans as secondary to current implementation.

Before changing an existing campaign:

1. Load its current state.
2. Identify completed, stale, missing, and operator-edited fields.
3. Preserve valid downstream work.
4. Repair the narrowest upstream source.
5. Regenerate only affected descendants.

Never overwrite a complete record with a smaller convenience payload.

### Prefer supported state transitions

Use this order:

1. Existing pipeline API or route.
2. Existing store/upsert function called from a short repo-local script.
3. Direct JSON cache editing only when that cache is the implementation's canonical write surface.

Never write directly to DynamoDB with an improvised raw client when a repository store function exists.

### Separate facts, strategy, and taste

- **Facts:** package id, ship, date, itinerary, price, booking link, promotion terms. Verify and persist.
- **Strategy:** angle, audience, visual direction, targeting. Generate when missing; preserve operator choices.
- **Taste:** final copy choice, image selection, visual approval. Present for operator review unless explicitly delegated.

Do not ask the operator to repeat facts that can be loaded from a package id, slug, cache record, or existing campaign.

## 3. Intake Loop

For every request:

1. Classify the lane and entry shape with [INPUT_ROUTING.md](./references/INPUT_ROUTING.md).
2. Summarize the interpreted campaign in 3 to 6 bullets.
3. State any consequential assumption.
4. Continue without interruption when the assumption is reversible.
5. Ask only when the answer changes Group vs Deal economics, package truth, promotion eligibility, or a publication decision.
6. Build a field provenance map:
   - operator supplied
   - supplier verified
   - pipeline generated
   - derived deterministically
   - unresolved
7. Choose the nearest valid insertion point instead of replaying earlier phases.

Examples:

- Niche only -> run the appropriate discovery/seed path.
- Holiday angle plus Group intent -> seed a Group blueprint, then inventory-match it.
- Exact package id plus Deal intent -> load package facts, assemble the Workbench Deal, generate angles, and hand off to the Deal pipeline.
- Exact Group sailing plus mature concept -> persist or patch the Group blueprint with verified sailing facts, then generate the dossier/brief without rerunning broad discovery.
- Existing slug plus revised angle -> patch the durable brief/directive source and regenerate affected artifacts only.

## 4. Completion Ladder

Advance until the next step requires a real decision.

### Group

1. Blueprint persisted.
2. Inventory mode and sailing facts honest.
3. Research dossier persisted.
4. Aesthetic brief and production bible generated.
5. Brief validation blockers resolved once.
6. Stop for brief approval when creative direction is consequential.
7. After approval, generate requested image layers.
8. Stop for scene/image selection before expensive video or publication.
9. Never publish or dispatch ads without explicit operator approval.

### Deal

1. Exact package facts and pricing loaded.
2. Workbench Deal assembled as `needs_review`.
3. Relevant promotion attached and assessed.
4. Campaign, audience, visual, and targeting angles generated or preserved.
5. Resolved trip manifest and downstream copy generated.
6. Final ad variant selected by operator unless delegated.
7. Funnel synthesis generated and image candidates loaded.
8. Stop for hero/gallery/section image selection.
9. Assemble the Curated Deal and expose every approval gate.
10. Never approve, make homepage-eligible, or publish without explicit operator approval.

## 5. Approval and Clarification Rules

Stop and point to a specific checkpoint when:

- Group vs Deal intent is genuinely ambiguous.
- A supplied sailing cannot be verified.
- A promotion is selected but applicability or market fit is unresolved.
- A Group inventory match conflicts with the requested ship/date.
- A brief or scene warning survives one repair pass.
- The operator must choose among materially different angles or images.
- The next action would approve, publish, dispatch ads, create a hold, reservation, payment step, or booking.

At a checkpoint, provide:

- what is complete
- what remains uncertain
- the exact UI URL
- the exact control, card, tab, or field to inspect
- a recommendation
- the minimum decision needed

Avoid vague handoffs such as "review it in the UI."

## 6. Direct-Write Guardrails

Direct state assembly is allowed when it eliminates redundant manual entry, but it must recreate the same contracts as the UI.

Before a direct write:

1. Read the current type and route parser.
2. Build the complete required object.
3. Reuse repository builders and store functions.
4. Preserve ids and source links across stages.
5. Mark generated scaffold output honestly.
6. Leave approval state at `needs_review`, `draft`, or the lane-equivalent review state.
7. Read the record back after writing.
8. Open or identify the correlated UI and confirm it recognizes the record.

Never:

- fabricate inventory, prices, links, promo claims, or eligibility
- label deterministic scaffold output as researched or AI-complete
- hand-edit a stale downstream manifest to conceal wrong upstream sailing facts
- set a link to valid without actual validation
- silently choose text-only media waiver
- silently approve or publish

## 7. Working Across UI and Agent Turns

Treat mixed UI/agent work as one continuous campaign session.

At the start of each turn:

1. Reload current state rather than relying on prior chat.
2. Detect operator edits and selections.
3. Continue from the latest persisted checkpoint.

At the end of each turn, report a compact resume token:

```text
Lane:
Primary id:
Current state:
Verified facts:
Generated artifacts:
Operator selections:
Unresolved gates:
Next UI checkpoint:
Recommended next action:
```

Record durable workflow corrections in the lane's process-memory file when required by that skill.

## 8. Validation

Validate in proportion to what changed:

- read back every written record
- verify cross-artifact ids and provenance
- run narrow tests for direct-write helpers or contract changes
- run `npm run test:deals-system:all` after Deal workflow contract changes
- use the lane skill's readiness checks before media or publish
- verify UI recognition when the dev server is confirmed running

Do not start or restart the dev server. Do not call localhost until the operator confirms it is running.
