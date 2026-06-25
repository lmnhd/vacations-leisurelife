---
name: deal-campaign-generation
description: Orchestrate fast, approval-gated Leisure Life retail cruise Deal campaigns. Use when an agent must find real Odysseus sailings, evaluate or attach CB promotions, import a sailing into the Deal Campaign Workbench, generate advertising and targeting angles, continue through the Deals pipeline, review copy and funnel assets, resolve duplicates, or prepare a Curated Deal for operator approval and publication.
---

# Deal Campaign Generation

Build retail Deal campaigns from real cruise inventory and promotion intelligence. Keep the workflow fast, but never trade away package truth, promo eligibility, market fit, link health, or operator approval.

## 1. Read First

Before substantial Deal campaign work, read:

1. [AGENT_ENV.md](./AGENT_ENV.md) before running scripts or calling local APIs.
2. [DEAL_PROCESS_MEMORY.md](./DEAL_PROCESS_MEMORY.md) for operator corrections and recurring friction.
3. [WORKFLOW.md](./WORKFLOW.md) for the relevant entry path and phase steps.

Use `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/6-10-26/STATUS.md` when current implementation status matters. Use the specific design document named in `WORKFLOW.md` when diagnosing a stage.

## 2. Core Operating Model

A Deal campaign has two valid starts:

- **Promotion-led fast path:** Start with a current CB promotion, find eligible real sailings, select one, import it into the Workbench, attach the promotion, generate angles, and continue in the pipeline.
- **Inventory-first discovery path:** Sweep real inventory, score strong deals, reform an honest niche around a selected sailing, manifest the trip, write promo-aware copy, synthesize the funnel, and publish through the approval gate.

Prefer the promotion-led fast path when the user already has a sale, vendor, date range, destination constraint, or candidate sailing. Prefer inventory-first Discovery when the user wants the system to discover the opportunity.

## 3. Hard Rules

1. Read [AI_POLICY.md](../../../AI_POLICY.md). It is canonical.
2. Use Cruise Brothers and Odysseus agent tools for cruise research. Do not replace agency inventory lookup with generic web search.
3. Never fabricate a package id, ship, sail date, itinerary, fare, booking URL, promotion, or eligibility claim.
4. Treat promo applicability as a preflight gate. Check cruise line, sailing window, booking window, product exclusions, market coverage, deposit/rate restrictions, and cabin/voyage tiers.
5. Keep public-safe promotion claims separate from agent-only instructions.
6. If matching cruise-line promos exist but none is attached, stop the handoff and surface that choice. Do not silently create no-promo copy.
7. Workbench `deterministic_scaffold` stages are placeholders, not researched or AI-complete campaign work. Never describe scaffold-only output as intelligent completion.
8. Generate or select an advertising angle and a targeting angle before pipeline handoff. Do not expect the operator to arrive with those angles.
9. Copy must consume the selected angle, resolved package facts, and full promotion briefs. A promo id alone is insufficient.
10. A real package and a valid link are necessary but not sufficient for publication. Public Deals also require clean public copy, targeting, media readiness or an explicit waiver, and operator approval.
11. Never create a hold, reservation, payment step, or real booking without explicit user approval.
12. Never start, stop, or restart the dev server unless the user explicitly asks.
13. Never modify Deals pipeline code merely to force one campaign through a failed validation. Report the failure and ask before changing system behavior.
14. Use plain ASCII punctuation in skill files, prompts, comments, and operator copy unless Unicode has been verified after writing.

## 4. Quality Bar

A campaign is ready to advance only when:

- the sailing is a real Odysseus package
- the package facts match the intended campaign
- the selected promotion is applicable or the operator intentionally chose no promo
- audience market and promo market are compatible
- the campaign angle is specific to the sailing
- targeting is specific enough to guide paid media
- the copywriter uses the attached promo when one exists
- unsupported guarantees and agent-only notes are absent from public copy
- the operator can inspect the generated outputs before deleting, approving, or publishing

## 5. Agent Behavior

- Lead the user through the process. Do not require them to know the next stage name.
- Show a short candidate shortlist with package ids and the reason each candidate fits.
- Recommend one candidate, but preserve the operator's choice.
- When similar Deal records exist, compare stage provenance and outputs before deleting either record.
- Use the clear action label `Delete Deal`. Never imply the system knows which record is a duplicate.
- Keep one repair pass per failed layer. If the same problem remains, stop and present the concrete decision.
- Record meaningful workflow corrections in [DEAL_PROCESS_MEMORY.md](./DEAL_PROCESS_MEMORY.md).

## 6. Primary Surfaces

- Deal system dashboard and labs: `http://localhost:3000/tests/deals-system`
- Campaign Workbench: the `Deal Campaign Workbench` section on the Deals dashboard
- Public preview: `http://localhost:3000/deals/<deal-id>`

Do not call localhost until the operator confirms the dev server is running.

