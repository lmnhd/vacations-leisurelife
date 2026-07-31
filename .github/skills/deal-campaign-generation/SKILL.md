---
name: deal-campaign-generation
description: Orchestrate fast, approval-gated Leisure Life retail cruise Deal campaigns. Use when an agent must find or load real Odysseus sailings, evaluate or attach CB promotions, import a sailing into the Deal Campaign Workbench, generate advertising and targeting angles, continue through copy, funnel, Meta, Google, or publication-review assembly, resolve duplicates, check or correct cabin pricing, or prepare a Curated Deal for operator approval. Campaign-only requests may start from an exact package ID, existing sailing, operator-chosen angle, or manually selected promotion.
---

# Deal Campaign Generation

Build retail Deal campaigns from real cruise inventory and promotion intelligence. Move quickly without trading away package truth, promotion eligibility, market fit, link health, public-copy safety, ship identity, or operator approval.

## 1. Read First

Before substantial Deal campaign work, read:

1. [AGENT_ENV.md](./AGENT_ENV.md) before running scripts or calling local APIs.
2. [DEAL_PROCESS_MEMORY.md](./DEAL_PROCESS_MEMORY.md) for operator corrections and recurring friction.
3. [WORKFLOW.md](./WORKFLOW.md) for the relevant entry path and phase steps.

Treat a later dated process-memory correction as superseding an earlier conflicting entry. Promote recurring current rules into this file or `WORKFLOW.md`; do not force agents to reconcile stale contradictions during a live campaign.

Use `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/6-10-26/STATUS.md` when current implementation status matters. Use the specific design document named in `WORKFLOW.md` when diagnosing a stage.

## 2. Core Operating Model

A Deal campaign has one pipeline and multiple entry points. Every entry point converges on the nearest valid shared artifact, usually a `DealTripManifest`, so the operator and agents can continue through the same copywriter, funnel, publication-review, Meta, and Google surfaces.

Valid starts:

- **Promotion-led fast path:** Start with a current CB promotion, find eligible real sailings, select one, import it, attach the promotion, generate angles, and continue.
- **Inventory-first discovery path:** Sweep real inventory, score strong deals, reform an honest niche, manifest the trip, write promo-aware copy, synthesize the funnel, and assemble a review-state Deal.
- **Exact-package fast path:** When a package ID is known, load that package directly. Do not broaden back into a candidate search merely to rebuild its link.
- **Campaign-only curated path:** Lock an existing sailing, angle, or promotion in the Workbench and continue directly through pitch, copy, ad structure, media, and review.
- **Agent-completed partial path:** Normalize trustworthy agent-produced facts and creative work into the next real pipeline artifact. Do not make the operator repeat completed stages because the UI labels are sequential.

Discovery and manifestation are adapters, not mandatory rituals. If package facts and a campaign hook already exist, create or update the manifest and continue from the nearest valid stage.

## 3. Current Hard Rules

1. Read [AI_POLICY.md](../../../AI_POLICY.md). It is canonical.
2. Use Cruise Brothers and Odysseus tools for package truth. Generic web research may enrich creative but cannot replace agency inventory.
3. Never fabricate a package ID, ship, date, itinerary, fare, booking URL, promotion, rate benefit, or eligibility claim.
4. Treat promotion applicability as a preflight gate. Check line, booking window, sailing window, market, product, cabin/rate restrictions, exclusions, and combinability.
5. Keep public-safe promotion claims separate from agent-only instructions.
6. If matching cruise-line promotions exist but none is attached, stop and surface the choice. Do not silently create no-promo copy.
7. If structured promotion extraction fails after one repair pass but the raw CB capture is current, use the bounded manual-review path in `AGENT_ENV.md`; never infer missing terms.
8. Workbench `deterministic_scaffold` output is placeholder content, not researched or AI-complete campaign work.
9. Generate or select a meaningful advertising angle and targeting angle before pipeline handoff.
10. Copy must consume the selected angle, resolved package facts, numeric pricing, and full promotion briefs.
11. The public Deal page exposes one action: `Start booking`. Resume, contextual help, and human contact stay inside the Booking Assistant.
12. Never create a hold, named reservation, traveler submission, payment step, or real booking without explicit approval.
13. Never start, stop, or restart the dev server unless the user explicitly asks.
14. Never modify Deals pipeline code merely to force one campaign through failed validation.
15. Use plain ASCII punctuation in skill files, prompts, comments, and operator copy unless Unicode is verified after writing.
16. Store every new Deal's research, package evidence, promotion evidence, angles, copy, targeting, media notes, validation, and approval trail in a dedicated subdirectory under `.github/DOCS/Implementation/DEALS_STRATEGY/LIVE_DEAL_DATA_WORK_DIRECTORY/`.
17. Treat the route action named `publish` as publication-review assembly. It creates or updates a review-state Deal; it does not authorize public publication.
18. Never auto-select sourced imagery. Verify exact ship and destination identity before selection.
19. Use the AI-recommended controlled Meta style preset as an editable default. A style change must not automatically generate or spend on images.

## 4. Quality Bar

A campaign is ready for operator approval only when:

- the sailing is a real exact Odysseus package;
- the package facts and day-by-day itinerary match;
- at least one numeric cabin-tier fare is present;
- the booking link was validated against the exact package page;
- the attached promotion is applicable or explicitly review-qualified;
- audience market and promotion market are compatible;
- the campaign angle is specific to the sailing;
- targeting is specific enough to guide paid media;
- selected copy uses only source-supported facts and promotion claims;
- funnel copy has passed a factual and ASCII review;
- selected images show the exact ship or exact named destination;
- media is ready or a text-only launch is explicitly waived;
- the operator can inspect outputs before approval or distribution.

## 5. Agent Behavior

- Lead the process; do not require the operator to know stage names.
- Show a short candidate shortlist with package IDs, numeric fare snapshots, and reasons.
- Recommend one candidate, while preserving the operator's decision unless they explicitly delegate it.
- For urgent "sell now" requests, rank occasion specificity, fare proof, promotion deadline, departure access, hook clarity, and booking friction.
- When similar records exist, compare package identity, provenance, promotion state, selected angle, copy, funnel, media, and approval before deleting.
- Use the action label `Delete Deal`. Never imply the system knows which record is a duplicate.
- Keep one repair pass per failed layer. If the same problem persists, stop and present the concrete decision.
- Record meaningful workflow corrections in [DEAL_PROCESS_MEMORY.md](./DEAL_PROCESS_MEMORY.md).

## 6. Primary Surfaces

- Deal system dashboard and labs: `http://localhost:3000/tests/deals-system`
- Campaign Workbench: `Deal Campaign Workbench` on the Deals dashboard
- Pricing Check: Tools tab or `npm run check-deal-pricing`
- Public preview: `http://localhost:3000/deals/<deal-id>`

Curated Deals appear in the dashboard's Curated Deals inventory and Campaign Workbench. Trip Manifestation is for discovery-first input; do not force it into exact-package or campaign-only requests.

Do not call localhost until the operator confirms the dev server is running.
