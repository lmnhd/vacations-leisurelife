# Deal Campaign Workflow

Choose the entry path that matches the user's intent, then converge on the same promo-aware pipeline and approval gate.

The Deals workflow is manifest-centered. Discovery, Trip Manifestation, package-number intake, promo-led intake, and agent-generated campaign briefs are all entry adapters. Once the system has a real sailing plus a usable campaign hook, create or update the `DealTripManifest` and hand the operator to the next appropriate shared stage, usually Copywriter.

Each Odysseus package has one active Deal campaign manifest. Selecting, editing, or replacing the angle updates that package's manifest; it must not create a second campaign row. Ad-copy variants are the supported place for A/B creative alternatives.

## Path A: Promotion-Led Fast Campaign

Use this when the user names a promotion, cruise line, date window, region, departure constraint, or candidate sailing.

### Phase A1: Confirm Promotion Intelligence

1. Load the current promo intelligence cache.
2. If the promotion is missing or stale, refresh the CB promo cache and run structured extraction.
3. Summarize:
   - booking window
   - sailing window
   - applicable cruise line and products
   - market coverage
   - exclusions and combinability
   - public-safe claims and required qualifiers
4. Separate agent-only notes from public copy inputs.

Reference: `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/CB_AGENT_TOOLS_PROMO_INTELLIGENCE_PLAN.md`.

### Phase A2: Find Real Candidate Sailings

1. Translate the user's constraints into Odysseus lookup dates and filters.
2. Run multiple lookup windows when one query cannot cover the requested range.
3. Exclude candidates that violate explicit constraints before ranking.
4. Check each remaining candidate against the promo sailing window and product exclusions.
5. Present a concise shortlist containing:
   - package id
   - cruise title
   - ship
   - sail date
   - nights
   - departure port
   - why it fits the promotion and campaign goal
6. Recommend one candidate.

Do not claim the promotion is guaranteed for the package unless live rate-level confirmation supports that claim. Use qualified language such as "eligible candidate" or "may qualify" where appropriate.

### Phase A3: Import and Attach the Correct Promo

1. Import the selected sailing facts into the Campaign Workbench.
2. Verify the top assembly form reflects the selected cruise line, ship, package id, date, and itinerary.
3. Select promos in the assembly section for the new Deal only.
4. After assembly, select promos again in the selected Deal's Pipeline Handoff panel if needed. The selected Deal promo state is independent from the top assembly form.
5. Run the promo handoff preflight:
   - no promo selected
   - promo attached
   - market needs review
   - market mismatch
6. Resolve market mismatch before angle or copy generation.

### Phase A4: Generate Campaign Angles

1. Generate multiple ad and targeting angle options from:
   - real sailing facts
   - attached promo briefs
   - destination and ship appeal
   - inferred audience market
2. Review the options with the operator.
3. Select or edit:
   - campaign angle / ad hook
   - target audience / targeting angle
   - visual angle
   - targeting keywords
4. Continue in the pipeline only after these fields are meaningful.

Do not substitute deterministic scaffold text for this phase.

## Path B: Inventory-First Discovery

Use this when the user asks the system to discover a strong Deal opportunity.

### Phase B1: Search and Score Real Inventory

1. Run the broad deep-cruise search.
2. Rank real packages by objective deal signals.
3. Preserve strong sailings even when no honest niche fits yet.

### Phase B2: Match or Reform a Niche

1. Run the niche reformer against each selected real sailing.
2. Match an honest, specific audience to the cruise.
3. Hold the sailing when the fit is weak. Never force a contrived niche.

Reference: `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/6-10-26/STATUS.md`.

### Phase B3: Manifest the Trip

1. Generate the trip manifest from the selected angle.
2. Resolve a real package and booking link.
3. Correlate applicable promotions.
4. Reconcile factual fields from the resolved package.
5. Block downstream copy if the package is unresolved or promo source records are missing.

Reference: `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/6-10-26/TRIP_MANIFESTATION_DESIGN.md`.

## Converged Pipeline

All paths continue here. Do not make the operator redo earlier stages when an agent or human has already supplied enough trustworthy inputs to create the shared manifest.

### Shared Cabin-Pricing Handoff Gate

Before Copywriter receives the manifest:

1. Preserve numeric cabin-tier pricing already returned with the resolved package.
2. If pricing is missing, read the already-acquired booking URL with the shared booking-page pricing extractor and hydrate the Deal and manifest from that result.
3. If neither source exposes a numeric cabin-tier fare, block the handoff. Do not publish a cabinless page and do not invent, estimate, or borrow a fare from another sailing.
4. This is initial resolution, not the later pricing-drift workflow. Once public pricing exists, subsequent changes still require operator review before applying.

### Phase C1: Write Promo-Aware Ad Copy

1. Assemble the unified manifest from the selected creative angle and inventory manifest.
2. Confirm `promotionBriefs` contains the full public-safe promotion context.
3. Generate copy variants.
4. Reject a no-promo result when an applicable promo is attached.
5. Review headline, body, CTA, disclaimers, targeting hooks, and voice warnings.
6. Select the final ad variant. Keep the other variants for later testing.

Reference: `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/6-10-26/AD_COPYWRITER_DESIGN.md`.

### Phase C2: Synthesize the Funnel

1. Generate the broad-market landing page copy.
2. Generate the hyper-targeted carousel.
3. Review the real cruise facts, pricing, itinerary, and public-safe specials.
4. Search and curate images by category.
5. Select the hero, gallery, and section images.

Reference: `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/6-10-26/FUNNEL_SYNTHESIS_DESIGN.md`.

### Phase C3: Assemble and Review the Curated Deal

> **ID convention (mandatory):** the dealId IS the Odysseus packageId, verbatim (e.g. `1543052`). All derived entity ids (`manifest-…`, `adcopy-…`, `funnel-…`) lead with it and are built ONLY via the helpers in `lib/cb/deals-system/deal-ids.ts` — never hand-composed. See the 2026-07-04 entry in `DEAL_PROCESS_MEMORY.md`.

1. Assemble the Curated Deal from the resolved manifest and selected ad copy.
2. Keep it in `needs_review`.
3. Review generated outputs, not just stage badges.
4. If similar records exist, compare:
   - package id and deal id
   - source and generator provenance
   - attached promos
   - selected angle and copy variant
   - funnel synthesis and media readiness
   - approval and link status
5. Delete only the operator-selected record using `Delete Deal`.

### Phase C4: Approval and Publication Gate

Confirm every blocking gate:

- real Odysseus package
- package match confidence or operator verification
- valid booking link
- promo and market fit reviewed
- public copy passes guardrails
- targeting exists
- media is ready or text-only launch is explicitly waived
- operator approval is recorded

Only then may the Deal become homepage eligible.

## Maintenance: Cabin Pricing Drift

Cabin pricing is captured once when a Deal is resolved (Phase A3/B3) and never auto-refreshes. Real cruise pricing moves (promotions expire, fares reprice), so a published Deal's displayed price can silently drift from what CB Agent Tools' live booking page actually charges.

1. Scrape the Deal's own `bookingUrl` for its live "Pricing From" cabin-tier block, via either:
   - the dashboard's **Pricing Check** panel (Tools tab) — pick the Deal, click "Check live pricing", review the per-tier table.
   - `npm run check-deal-pricing -- --deal <dealId>` for a CLI check (or with no `--deal` to sweep every published Deal).
2. This reads the exact page a guest sees — not a re-derived Odysseus search result. An earlier version matched by `packageId` from a fresh search, but Odysseus can re-index/re-rate the same sailing under a new id between searches, which made matching unreliable; reading the booking page directly avoids that.
3. Both paths are read-only by default — they report stored vs. live price per cabin tier and flag anything outside tolerance. Neither writes anything on its own.
4. To correct a mismatch: in the dashboard panel, click "Apply live price" on the specific tier you've reviewed. This patches only that one tier on that one Deal's `cruiseFacts.cabinPrices` — never a batch, never silent.
5. Do not apply a correction the operator hasn't seen. Show the stored number, the live number, and the delta before writing.
6. If the booking page can't be scraped (link broken, page structure changed, every tier shows "-"), the check reports that and skips comparison rather than guessing.

## Repair Rules

- Repair the narrowest upstream source once.
- Re-run the affected downstream stage.
- If the same warning persists, stop and ask the operator.
- Do not patch public copy to conceal a broken manifest, promo mismatch, or unresolved package.
