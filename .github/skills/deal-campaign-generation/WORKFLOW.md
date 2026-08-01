# Deal Campaign Workflow

Choose the entry path that matches the request, then converge on the same promotion-aware manifest, copy, funnel, review assembly, and approval gate.

Each Odysseus package has one active Deal campaign manifest. Editing an angle updates that package's campaign. Put A/B alternatives in ad-copy variants.

## Path A: Promotion-Led Fast Campaign

Use this when the user names a promotion, cruise line, travel window, region, departure constraint, or candidate sailing.

### A1. Confirm Promotion Intelligence

1. Load the current promotion cache.
2. Refresh the raw CB capture when it is stale or missing.
3. Run structured extraction.
4. If extraction fails after one repair attempt, use the bounded single-record fallback in `AGENT_ENV.md`.
5. Record:
   - booking and sailing windows;
   - applicable line, market, products, and cabin/rate tiers;
   - exclusions and combinability;
   - public-safe claims and qualifiers;
   - agent-only instructions.

Never turn raw promotional enthusiasm into an unconditional public claim.

### A2. Find Real Candidate Sailings

1. Translate constraints into Odysseus filters.
2. Run multiple lookup windows when one query cannot cover the request.
3. Exclude prohibited lines and constraint failures before ranking.
4. Compare remaining candidates against the promotion terms.
5. Present a concise shortlist with:
   - package ID;
   - line and ship;
   - sail date and nights;
   - departure port and itinerary;
   - numeric cabin fare snapshot;
   - promotion fit;
   - reason the campaign can convert.
6. Recommend one.

For an urgent campaign, rank exact occasion, fare proof, promotion deadline, departure access, itinerary clarity, hook strength, and booking friction.

### A3. Use the Exact-Package Fast Path

Once a package ID is selected:

1. Load that exact package page.
2. Capture ship, date, itinerary, day-by-day schedule, and cabin tiers.
3. Preserve the successful exact booking URL.
4. Validate the exact page rather than broadening back into candidate search.
5. Stop if the exact package cannot be loaded or returns no numeric fare.

### A4. Assemble and Attach the Promotion

1. Import the exact sailing into the Campaign Workbench or an approved direct route-handler orchestration script.
2. Confirm canonical package ID, line, ship, date, itinerary, pricing, and URL.
3. Attach the reviewed promotion to the selected Deal.
4. Run the promotion handoff assessment:
   - no promotion selected;
   - promotion attached;
   - market unknown;
   - market mismatch.
5. Resolve blocking market mismatch before copy generation.

### A5. Generate Campaign Angles

Generate multiple options from real sailing facts, the full promotion brief, customer sentiment, destination/ship appeal, and target market.

Select or edit:

- campaign hook;
- target audience;
- visual angle;
- targeting keywords.

Do not substitute deterministic scaffold text for this phase.

## Path B: Inventory-First Discovery

Use this when the user asks the system to discover the opportunity.

1. Run broad Odysseus inventory search.
2. Rank real packages by objective deal signals and conversion velocity.
3. Match or reform an honest audience niche.
4. Hold packages with weak fit instead of forcing a contrived angle.
5. Generate the trip manifest.
6. Resolve the exact package, URL, pricing, promotions, and itinerary before copy.

Reference: `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/6-10-26/TRIP_MANIFESTATION_DESIGN.md`.

## Path C: Rapid Sentiment-to-Sale

Use this when `customer-sentiment-research` supplies a rapid delta dossier.

1. Preserve the prior dossier reference and current evidence gaps.
2. Use current CB/Odysseus package, fare, promotion, and link evidence as the campaign truth.
3. Select the cluster with the strongest combination of occasion, offer, accessibility, and one-sentence hook.
4. Store the delta dossier and all downstream artifacts in the same dedicated Deal directory.
5. Do not describe unquantified language hypotheses as measured demand.

## Converged Pipeline

Do not make the operator repeat completed work when trustworthy artifacts already exist.

### C1. Cabin-Pricing Handoff Gate

1. Preserve numeric supplier cabin tiers already returned by exact package capture.
2. If missing, hydrate pricing from the exact acquired booking URL.
3. Block handoff when neither source exposes a numeric fare.
4. Do not estimate, borrow, or silently replace a fare.

Later fare changes remain operator-reviewed pricing corrections.

### C2. Write Promotion-Aware Ad Copy

1. Assemble the unified manifest from the selected angle and inventory manifest.
2. Include full public-safe promotion briefs.
3. Generate multiple variants.
4. Reject unsupported certainty, availability, inclusions, gratuities, "all-inclusive" language, or invented benefits.
5. Normalize known typography to ASCII while preserving place-name validation.
6. Select one variant; retain the others for testing.

No attached promotion means omit promotion claims. It does not prove that no promotion exists.

Reference: `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/6-10-26/AD_COPYWRITER_DESIGN.md`.

### C3. Synthesize and Review the Funnel

1. Generate broad landing copy and the targeted carousel.
2. Recheck every generated ship amenity, cabin attribute, dining claim, excursion statement, price, port, date, and promotion against the manifest.
3. Remove unsupported filler even when it sounds plausible.
4. Verify ASCII punctuation after persistence.
5. Source image candidates by category.
6. Do not auto-select candidates.
7. Before selecting each image, verify:
   - exact ship for ship/onboard imagery;
   - exact named destination for port imagery;
   - usable source and direct image URL;
   - no competing cruise line, wrong vessel, or generic image presented as exact proof.
8. Select hero, gallery, and section images only after identity review.

Candidate count is not media readiness. A text-only waiver is explicit and does not make unreviewed imagery safe.

Reference: `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/6-10-26/FUNNEL_SYNTHESIS_DESIGN.md`.

### C4. Assemble the Curated Deal for Review

The Deal ID is the exact Odysseus package ID. Build all derived IDs through `lib/cb/deals-system/deal-ids.ts`.

1. Run publication-review assembly from the resolved manifest and selected copy.
2. Treat the route action named `publish` as assembly, not approval.
3. Keep the Deal in `needs_review`.
4. Revalidate exact link health after assembly if the assembly resets it.
5. Review generated output and provenance, not only stage badges.
6. If similar records exist, compare package, promotion, angle, selected copy, funnel, media, link, and approval state.
7. Delete only the operator-selected record using `Delete Deal`.

### C5. Meta and Google Preparation

1. Initialize Meta with an AI-recommended controlled creative-direction preset.
2. Show the recommendation, rationale, and active operator selection before image spend.
3. Allow override or restore without automatically generating images.
4. Keep all image generation operator-triggered and one asset type per call.
5. For a residence-restricted promotion, persist a strict geographic restriction and fail distribution if the plan broadens to nationwide targeting. Meta location does not replace guest eligibility proof.
6. Keep Google copy ASCII-clean, conservative, and policy-plain.
7. Do not dispatch ads without the required operator approval.

### C6. Approval and Publication Gate

Confirm:

- real exact package;
- package confidence or operator verification;
- valid exact booking link;
- numeric cabin pricing;
- promotion and market fit;
- clean selected public copy;
- meaningful targeting;
- factual funnel review;
- exact-identity selected media or explicit text-only waiver;
- operator approval.

The public Deal page exposes one action: `Start booking`. `Continue later`, contextual help, and human contact live inside the Booking Assistant.

Only an approved, otherwise eligible Deal may become publicly visible. A green gate list without operator approval is still a review-state Deal.

## Maintenance: Cabin Pricing Drift

Pricing is captured during resolution and does not auto-refresh.

1. Read the Deal's exact `bookingUrl`:
   - Dashboard Tools -> Pricing Check; or
   - `npm run check-deal-pricing -- --deal <dealId>`.
2. Compare stored and live amounts by tier.
3. Show the operator the stored value, live value, and delta.
4. Apply only the reviewed tier through the dashboard.
5. Never batch-correct or silently write.
6. If the page cannot be read, report the failure and do not guess.

## Repair Rules

- Repair the narrowest upstream source once.
- Re-run only the affected downstream stage.
- If the same warning persists, stop and present the concrete decision.
- Do not patch public copy to conceal a broken package, promotion mismatch, unsupported funnel claim, or wrong-ship image.
