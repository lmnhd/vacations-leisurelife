# Home Page Deals System - Phased Implementation Plan

## Purpose

Implement the full Leisure Life Deals system in a testable order.

This plan ties together:

- `CB_AGENT_TOOLS_PROMO_INTELLIGENCE_PLAN.md`
- `ODYSSEUS_LINK_BROKER_PLAN.md`
- `PRELIMINARY_PLAN.md`

The build should proceed in slices that can be tested independently. Each phase should end with a working artifact, operator command, API route, UI surface, or data file that proves the phase is real before moving forward.

## End-State Summary

The completed system should:

- ingest Cruise Brothers Today's View promotions and agent instructions
- extract structured promo rules, perk logic, restrictions, and warnings
- research amenities, ships, destinations, trends, niches, and competitor blind spots
- reuse Group Discovery research to generate retail Deal angles without the group/waitlist mechanics
- create a package-specific `Targeting-Demographic` resource for every promoted Deal
- find actual Odysseus cruise packages that fit the selected promotion, trend, or angle
- use the internal Link Broker to produce the best CB/Odysseus booking link
- publish only Deals with valid booking paths
- provide three public CTA options:
  - Book now
  - Email me the booking link
  - Request an agent callback
- route callback requests to email, dashboard, and Crisp notification where practical
- keep Groups separate from Deals
- support future Meta, Google, TikTok, email, and landing-page promotion workflows

## System Order

Build order matters.

1. Data contracts and caches
2. Internal Link Broker
3. Promo intelligence ingestion
4. Structured promo extraction
5. Retail adaptation of Group Discovery research
6. Trip research and targeting resources
7. Odysseus deal candidate discovery
8. Curated Deal assembly
9. Public Deal pages and CTAs
10. Email-link and callback operations
11. Dashboard and operator review
12. Distribution readiness

Do not start with frontend polish. The frontend should consume stable Deal records after the internal data and link systems are proven.

## Phase 0 - Baseline and Guardrails

Status: implemented. Proof artifact: `PHASE_0_BASELINE_GUARDRAILS.md`.

### Goal

Lock the rules before building.

### Build

- Confirm Deals are separate from Groups.
- Confirm no public Deal publishes without a valid CB/Odysseus booking path.
- Confirm Link Broker is internal backend infrastructure, not a frontend UX component.
- Confirm CBAT/Odysseus browser automation stays operator-run when authenticated portal interaction is required.
- Confirm no workflow creates holds, reservations, payments, stateroom selections, or passenger submissions.

### Test

- Review the three plan documents for consistency.
- Confirm package-link safety assumptions:
  - package entry links are broad entry links
  - prepared `details.aspx` links are preferred when user setup exists
  - `clonebkg` and `brn` are portal-generated only

### Exit Criteria

- All follow-on phases share the same vocabulary:
  - Promo Intelligence
  - Link Broker
  - Curated Deal
  - Targeting-Demographic
  - CTA workflow
  - Callback request

## Phase 1 - Data Contracts and Local Caches

Status: implemented. Proof artifact: `npm run test:deals-schema` (17/17 passing).

### Goal

Create the schemas and local cache files that later phases will fill.

### Build

- Add core types for:
  - promo intelligence records
  - deal angle research
  - targeting-demographic resources
  - curated Odysseus deal records
  - link broker requests/outputs/records
  - callback requests
- Add local development caches:
  - `.github/data/cb-promo-intelligence-cache.json`
  - `.github/data/odysseus-curated-deals-cache.json`
  - `.github/data/cb-link-broker-cache.json`
  - `.github/data/deal-callback-requests-cache.json`

### Test

- Add schema/unit tests for parsing and validating sample records.
- Add one hand-authored sample Deal record that does not publish publicly.
- Add one hand-authored sample Link Broker record.

### Exit Criteria

- The repo can load and validate empty/sample cache payloads.
- No UI depends on these caches yet.

## Phase 2 - Internal Link Broker Foundation

Status: implemented. Proof artifact: `npm run test:link-broker` (34/34 passing).

### Goal

Build the backend module that can produce the best booking link from cruise facts and traveler setup.

### Build

- Create `lib/cb/link-broker/`.
- Implement:
  - `resolveBestBookingLink(request)`
  - package entry link builder
  - prepared `details.aspx` link builder
  - captured-link parser
  - link-class chooser
  - static validation
  - cache lookup/upsert
- Inputs should accept:
  - cruise line
  - ship name
  - sail date
  - nights
  - itinerary/destination
  - departure port
  - package ID when known
  - passenger count
  - ages
  - state
  - airport
  - phone when available
  - agent `siid`

### Test

- Unit test package entry URL generation.
- Unit test prepared `details.aspx` URL generation.
- Unit test parsing of captured package, details, clone, and cabin URLs.
- Unit test redaction of phone numbers in logs/diagnostics.
- Unit test that `clonebkg` and `brn` cannot be guessed.

### Exit Criteria

- Given package ID + `siid`, broker returns package entry link.
- Given package ID + `siid` + traveler setup, broker returns prepared details link.
- Given only ship/line/date, broker returns `needs_package_lookup` until Phase 3/6 package lookup is connected.

## Phase 3 - Link Validation and Health

Status: implemented. Proof artifact: `npm run test:link-broker-health` (18/18 passing).

### Goal

Make links safe enough to publish or send.

### Build

- Extract reusable browser-aware validation from existing retail-link validation logic.
- Add health fields:
  - `capturedAtIso`
  - `lastVerifiedAtIso`
  - `nextVerificationDueIso`
  - `status`
  - `failureReason`
- Add static validation for required parameters.
- Add stale-link rules.

### Test

- Validate known sample package links.
- Validate malformed links fail.
- Validate missing `siid` fails.
- Validate prepared details link parameter consistency.
- Operator-run browser validation for a real CB/Odysseus link when ready.

### Exit Criteria

- Link Broker can label links as `valid`, `stale`, `broken`, or `unknown`.
- Public Deals can later depend on link health instead of blindly rendering links.

## Phase 4 - CBAT Promo Intelligence Scraper

Status: implemented. Proof artifact: `npm run scrape-cb-promo-intelligence`
(ran live: 6 promotions captured, 0 errors, cache validates).

### Goal

Capture Today's View promotions as auditable raw intelligence.

### Build

- Create `scripts/scrape-cb-promo-intelligence.ts`.
- Navigate to:

```text
https://www.cbagenttools.com/marketing/todaysview/
```

- Collect promotion links.
- Visit promotion detail pages.
- Extract raw sections:
  - title
  - vendor
  - booking window
  - sailing window
  - promotion details
  - key features
  - agent instructions
  - applicable sailings
  - products
  - markets
  - supporting files
- Write `.github/data/cb-promo-intelligence-cache.json`.

### Test

- Operator runs:

```powershell
npm run scrape-cb-promo-intelligence
```

- Confirm cache contains promotion count, detail-page count, raw text, and supporting file links.
- Confirm no booking, hold, reservation, or guest-info action occurs.

### Exit Criteria

- Current CB Today's View promotions are stored in an auditable cache.
- Raw agent instructions are preserved.

## Phase 5 - Structured Promo Extraction

Status: implemented. Proof artifact: `npm run test:promo-extraction` (22/22 passing,
asserted against a live GPT-5.4 extraction of the Celebrity Summer Sale).

### Goal

Turn raw promo text into structured promotion rules.

### Build

- Add deterministic section parser.
- Add GPT-5.4 extraction through `lib/ai/llm-gateway`.
- Extract:
  - offer types
  - booking/sailing windows
  - onboard credits
  - savings tiers
  - guest discounts
  - combinability rules
  - exclusions
  - applicable products/markets
  - public-safe claims
  - agent-only notes
  - caution flags

### Test

- Use the Celebrity Summer Sale example as a fixture.
- Assert extraction captures:
  - booking window
  - sailing window
  - 75 percent second guest language
  - bonus savings/OBC tiers
  - GroupX/single supplement exclusions
  - Galapagos exclusion
  - public-safe summary
- Assert no unsupported guaranteed-public claims are generated.

### Exit Criteria

- Each promo record has structured rules and warnings.
- Public copy can be generated only from approved/qualified claims.

## Phase 5A - Retail Discovery Adapter From Group Discovery

### Goal

Reuse the Group Discovery research process to generate niche and trend-led retail Deal ideas, without turning them into group campaigns.

This phase adapts the same kind of research that powers themed group concepts and converts it into quick-sale retail Deal opportunities.

Example:

```text
Group-style insight: artists and urban sketchers want immersive landscape inspiration and community-native travel hooks.
Retail Deal framing: "The perfect Alaska cruise for travelers who love to sketch glaciers, fjords, and coastal towns."
```

### Build

- Create a Deals-specific adapter for Group Discovery research output.
- Reuse research signals such as:
  - niche community evidence
  - audience signals
  - rituals, tools, gear, and jargon
  - spend signals
  - creator/forum/subreddit/community signals
  - cruise-native moments
  - aesthetic hooks
  - targetable keywords
- Strip out group-specific mechanics:
  - cabin thresholds
  - group identity commitments
  - waitlist formation
  - onboard meetup assumptions
  - tour-conductor economics
- Convert the research into retail Deal briefs:
  - target audience
  - why this audience would care
  - ideal cruise/destination characteristics
  - search criteria for Odysseus
  - visual/creative angle
  - quick-sale CTA framing
  - targeting keywords
  - risks and claims to avoid

Recommended output:

```ts
interface RetailDiscoveryBrief {
  id: string;
  source: "group_discovery_retail_adapter";
  sourceResearchId?: string;
  retailAngleTitle: string;
  audience: {
    label: string;
    communitySignals: string[];
    emotionalDrivers: string[];
    spendSignals: string[];
  };
  cruiseFit: {
    idealDestinations: string[];
    idealShipFeatures: string[];
    idealTripLength?: string;
    idealSeasonality?: string;
    preferredDeparturePorts?: string[];
  };
  odysseusSearchHints: {
    cruiseLines?: string[];
    destinations?: string[];
    dateWindows?: string[];
    minNights?: number;
    maxNights?: number;
  };
  retailPositioning: {
    primaryHook: string;
    whyThisIsNotAGroup: string;
    quickSaleCTA: string;
    visualDirection: string[];
  };
  targetingSeeds: {
    nicheKeywords: string[];
    trendKeywords: string[];
    negativeKeywords: string[];
    metaInterestSeeds: string[];
    googleSearchThemes: string[];
  };
  risks: string[];
}
```

### Test

- Use one existing Group Discovery-style niche as a fixture.
- Generate one retail Deal brief from it.
- Confirm the brief:
  - does not mention thresholds or group formation
  - does not require onboard group events
  - includes Odysseus search hints
  - includes quick-sale CTA framing
  - includes targetable niche/trend keywords

Test example:

```text
Input niche: sketching / plein-air artists / Alaska landscape inspiration
Expected retail brief: Alaska cruise positioned for travelers who want to sketch glaciers, mountain light, coastal towns, and dramatic sea-to-shore landscapes.
```

### Exit Criteria

- Group Discovery research can produce retail Deal briefs.
- The retail brief can feed Odysseus package lookup and Targeting-Demographic generation.
- The output is quick-sale oriented, not waitlist/group oriented.

## Phase 6 - Odysseus Package Lookup

Status: implemented. Proof artifact: `npm run test:package-lookup` (12/12) plus a
live operator lookup that auto-selected a real package and, when under-specified,
returned ranked candidates instead of guessing.

### Goal

Let the Link Broker resolve ship/line/date facts into actual Odysseus packages.

### Build

- Add package lookup to Link Broker:
  - search by cruise line
  - ship
  - sail date
  - nights
  - itinerary/destination
  - departure port
- Return ranked package candidates.
- Select package automatically only when confidence is high.
- Return diagnostics when multiple plausible matches exist.

### Test

- Operator-run lookup for known package examples.
- Test package ID resolution from:
  - exact ship + sail date
  - ship + date + nights
  - cruise line + destination + date window
- Confirm ambiguous matches return candidates instead of silently picking.

### Exit Criteria

- Link Broker can resolve at least one real cruise from ship/line/sail date to package ID.
- Link Broker can then return a package entry or prepared details link.

## Phase 7 - Trip Research and Angle Discovery

### Goal

Research the trip itself before treating it as a Deal.

### Build

- Add research workflow for serious candidates:
  - ship amenities
  - common ship-class features
  - dining/entertainment/wellness/family/luxury/solo features
  - destination hooks
  - port-specific experiences
  - itinerary pacing
  - seasonality
  - trends and niche audiences
  - competitor blind spots
- Generate `DealAngleResearch`.
- Accept `RetailDiscoveryBrief` as an input when a Deal starts from reused Group Discovery research.
- Preserve the niche insight while adapting it to the actual ship, itinerary, date, and package.

### Test

- Run research on one known candidate.
- Run research on one `RetailDiscoveryBrief`-generated candidate, such as an Alaska sketching/landscape cruise.
- Confirm output includes:
  - primary angle
  - rejected angles
  - source list
  - factual guardrails
  - why this feels curated/exclusive

### Exit Criteria

- A cruise cannot become a promoted Deal using promo/perk data alone.
- Each candidate has a trip-quality and sellability assessment.

## Phase 8 - Targeting-Demographic Resource

### Goal

Create targeting intelligence for each promoted Deal.

### Build

- Generate `TARGETING_DEMOGRAPHIC.md` or `targeting-demographic.json` per Deal.
- If the Deal originated from a `RetailDiscoveryBrief`, carry forward the community-native research signals and convert them into retail targeting.
- Include:
  - primary audience
  - secondary audiences
  - niche keywords
  - trend keywords
  - destination keywords
  - amenity keywords
  - negative keywords
  - Meta notes
  - Google notes
  - TikTok notes
  - email segment notes
  - emotional drivers
  - objections
  - competitor blind spots
  - confidence score

### Test

- Generate one targeting-demographic resource for a real package.
- Generate one targeting-demographic resource from a reused Group Discovery retail brief.
- Confirm it does not rely on generic cruise targeting.
- Confirm it is specific enough to guide an ad campaign.

### Exit Criteria

- Every promoted Deal has a targeting-demographic resource before ad packaging.

## Phase 9 - Curated Deal Assembly

### Goal

Combine package, promo, research, targeting, and link data into publishable Deal records.

### Build

- Create curated Deal builder.
- Merge:
  - Odysseus package facts
  - Link Broker output
  - promo applicability
  - trip research
  - targeting-demographic resource
  - visitor-safe copy
  - internal agent notes
  - link health
- Write `.github/data/odysseus-curated-deals-cache.json`.

### Test

- Build one Deal from a known package.
- Confirm no Deal publishes without valid link health.
- Confirm promo claims are qualified.
- Confirm agent-only notes do not appear in public fields.

### Exit Criteria

- A single complete Curated Deal record can be built and inspected.

## Phase 10 - Public Deal Page Integration

### Goal

Render Curated Deals publicly without dashboard legacy pages or sidebar.

### Build

- Update homepage Deals source to use curated Deal records.
- Update `/deals/[id]` to show:
  - hero
  - trip facts
  - destination/ship/amenity highlights
  - promo-safe offer summary
  - targeting-informed positioning
  - link health-aware CTA area
- Preserve dark/light readability.

### Test

- Render one known curated Deal.
- Confirm no old stubs or "booking pending" states appear publicly.
- Confirm public fields do not expose agent-only notes.
- Confirm light/dark mode readability.

### Exit Criteria

- The homepage and Deal page can publish one real curated Deal.

## Phase 11 - CTA Workflow APIs

### Goal

Implement the three CTA options as consumers of the Link Broker.

### Build

- Add frontend CTA model:
  - Book now
  - Email me the booking link
  - Request an agent callback
- Add backend routes:
  - `POST /api/deals/link-request`
  - `POST /api/deals/callback-request`
- These routes call Link Broker but do not duplicate its URL logic.

### Test

- Book now returns/redirects using a valid broker link.
- Email link request stores/sends a link.
- Callback request stores full deal/package context.
- Missing/stale link falls back gracefully.

### Exit Criteria

- All three CTA options work on a test Deal.

## Phase 12 - Email-Link Delivery

### Goal

Send prepared booking links by email.

### Build

- Integrate with existing email/Klaviyo or transactional email path.
- Email includes:
  - deal title
  - ship/date summary
  - prepared booking link
  - pricing/availability caveat
  - Leisure Life help CTA
- Store delivery event and broker link used.

### Test

- Submit email-link form.
- Confirm email is sent.
- Confirm link is broker-generated and includes correct `siid`.
- Confirm stale/broken link does not send silently.

### Exit Criteria

- Visitors can request and receive a prepared booking link by email.

## Phase 13 - Callback Operations

### Goal

Turn callback requests into an operator workflow.

### Build

- Store `AgentCallbackRequest` records.
- Notify operator by email.
- Add Crisp notification/conversation hook where practical.
- Add callback dashboard queue.
- Include:
  - visitor phone/email
  - deal title
  - cruise line/ship/sail date
  - package ID
  - link health
  - promo notes
  - primary angle
  - CTA source
  - visitor notes
- Add statuses:
  - `new`
  - `assigned`
  - `contacted`
  - `closed`

### Test

- Submit callback request.
- Confirm dashboard row appears.
- Confirm email notification is received.
- Confirm Crisp notification/conversation behavior if enabled.
- Confirm status transitions persist.

### Exit Criteria

- Callback requests are operationally visible and actionable.

## Phase 14 - Admin Review Dashboard

### Goal

Give operators control before and after publishing.

### Build

- Add dashboard views for:
  - promo intelligence records
  - curated Deal candidates
  - link health
  - targeting-demographic resources
  - callback requests
- Add actions:
  - approve/reject Deal
  - pin/unpin Deal
  - hide Deal
  - refresh link
  - request operator capture
  - mark callback status

### Test

- Approve one Deal.
- Hide one Deal.
- Refresh one link.
- Review one callback request.

### Exit Criteria

- Operator can manage Deals without editing JSON by hand.

## Phase 15 - Scheduled Health and Refresh

### Goal

Keep public Deals safe over time.

### Build

- Daily active Deal link validation.
- Pre-ad-launch validation.
- Stale Deal hiding.
- Promo expiration checks.
- Deal replacement candidate workflow.

### Test

- Force a link stale and confirm hidden/review state.
- Force promo expiration and confirm Deal warning.
- Run dry-run health report.

### Exit Criteria

- Public Deals do not keep sending visitors to stale or broken booking paths.

## Phase 16 - Distribution Readiness

### Goal

Prepare Deals for paid and organic promotion.

### Build

- Generate ad-ready package:
  - targeting-demographic resource
  - landing page URL
  - CTA behavior
  - approved claims
  - creative hooks
  - Meta targeting notes
  - Google search themes
  - TikTok hooks
  - email segment notes
- Connect to existing campaign distribution patterns where appropriate, without mixing Deals and Groups.

### Test

- Produce one complete distribution package for one Deal.
- Confirm targeting is niche/trend-based, not generic cruise-buyer targeting.
- Confirm booking link passes pre-launch validation.

### Exit Criteria

- One Deal is ready to promote externally with targeting, copy, link health, and CTA handling complete.

## Recommended First Build Slice

Start with:

1. Phase 1 - Data Contracts and Local Caches
2. Phase 2 - Internal Link Broker Foundation
3. Phase 3 - Link Validation and Health

Reason:

- Link generation is the backbone of the entire system.
- The public Deals system should not grow until we can reliably produce and validate the booking path.
- Promo intelligence and targeting become much more useful once we can attach them to a real package link.

## Testing Discipline

Each phase should leave one clear proof artifact:

- schema tests
- cache output
- operator-run scraper result
- broker output JSON
- validated link health record
- curated Deal record
- rendered page
- sent test email
- dashboard callback row
- distribution package

Do not advance to the next phase because the plan sounds right. Advance when the current phase has a visible artifact that can be inspected.

## Implementation Progress

### Phase 0 - Baseline and Guardrails

Status: implemented.

Shipped:

- `PHASE_0_BASELINE_GUARDRAILS.md` reconciles the three plan documents and locks:
  - the five safety rules (Deals vs Groups separation, no-publish-without-valid-link,
    Link Broker is internal infrastructure, operator-run portal automation,
    no holds/reservations/payments/stateroom/passenger submissions)
  - the package-link safety assumptions (broad package entry links; prepared
    `details.aspx` preferred when setup exists; `clonebkg`/`brn` portal-generated only)
  - the shared vocabulary (Promo Intelligence, Link Broker, Curated Deal,
    Targeting-Demographic, CTA workflow, Callback request)
  - the four link classes and which are synthesizable

Exit criteria met: all follow-on phases now share one written vocabulary and
rule set; the document is the canonical reference if a later phase conflicts.

### Phase 1 - Data Contracts and Local Caches

Status: implemented.

Shipped:

- New schema module `lib/cb/deals-system/` (kept separate from the existing
  `lib/cb/cb-deal-types.ts` homepage pipeline so neither disturbs the other):
  - `link-broker-types.ts` — request/output/health/record/cache + default preference
  - `promo-intelligence-types.ts` — promo record, extracted terms, marketing use,
    applicability result, cache
  - `research-types.ts` — `DealAngleResearch` and `DealTargetingDemographic`
  - `curated-deal-types.ts` — `CuratedOdysseusDeal`, `OdysseusDealBrief`, cache
  - `callback-request-types.ts` — `AgentCallbackRequest`, cache
  - `caches.ts` — cache file paths + empty-payload factories
  - `validate.ts` — dependency-free runtime validators (no zod) that also enforce
    the publishing gate (a `bookable` Deal must have `valid` link health) and the
    portal-token rule (clone/cabin tokens only on captured classes)
  - `index.ts` — barrel export
- Local development caches under `.github/data/`:
  - `cb-promo-intelligence-cache.json` (empty)
  - `odysseus-curated-deals-cache.json` (one Deal Brief + one hand-authored
    sample Deal that does NOT publish — `needs_review` status, `unknown` link health)
  - `cb-link-broker-cache.json` (one hand-authored sample `package_entry` record)
  - `deal-callback-requests-cache.json` (empty)
- Proof artifact: `tests/deals-system-schema.ts`, runnable via
  `npm run test:deals-schema`. It validates empty factories, all four on-disk
  caches, confirms the sample Deal stays unpublished, confirms the sample Link
  Broker record, and exercises negative cases (wrong version, bookable Deal with
  non-valid link health, broker record falsely claiming a clone token).

Validation performed:

```powershell
npm run test:deals-schema   # 17 passed, 0 failed
npx tsc --noEmit --pretty false   # 0 errors
```

Exit criteria met:

- The repo loads and validates empty and sample cache payloads.
- No UI depends on these caches yet (schemas + JSON + a standalone test only).

### Phase 2 - Internal Link Broker Foundation

Status: implemented.

Shipped:

- New backend-only module `lib/cb/link-broker/` (no UI, no email, no URL opening,
  no reservations):
  - `normalize.ts` — host detection, package-ID extraction, age/residency
    encoding, phone redaction, slugify, and env-backed `DEFAULT_OFFICE_ID` /
    `DEFAULT_AGENT_SIID` / occupancy payload constants
  - `build-package-link.ts` — Class 1 package entry builder
  - `build-prepared-details-link.ts` — Class 2 prepared details builder
  - `parse-captured-link.ts` — classifies package/details/clone/cabin URLs and
    extracts params (phone redacted in `rawParams`)
  - `choose-link-class.ts` — decision ladder from request inputs/preferences
  - `validate.ts` — static validation (required params, siid, package ID, age/
    passenger match, and a guard that a constructed link never carries a
    portal-generated token)
  - `cache.ts` — local `cb-link-broker-cache.json` lookup/upsert keyed by
    package + siid + class + traveler-setup hash; persistence is opt-in so tests
    and batch callers can mutate an in-memory cache without writing to disk
  - `broker.ts` — `resolveBestBookingLink` / `refreshBookingLink` orchestration
  - `index.ts` — public API barrel
- Proof artifact: `tests/link-broker.ts`, runnable via `npm run test:link-broker`.

Source-of-truth note (corrected against a real captured Share link): the
canonical prepared-details shape MATCHES the portal Share-button output, not the
`OdysseusEngine.ts` construction. Confirmed from a live share link for
`pid=1621764`:

```text
https://bookings.cbagenttools.com/web//cruises/details.aspx?source=swift&pid=1621764&siid=1049337&lang=1&CurrId=USD&officeId=286&skipdetails=true&op=0%2c0%2c0%2c0%2c0%2c0%2c0%2c0%2c%2c%2c0%2c0&res=US%2cFL%2cFLL&tt=29&p1=2&p2=45%2c32&PhoneNum=9042573090&clonebkg=07A__BESTPRICE__07A__
```

Differences captured in the builder:

- path is `/web//cruises/details.aspx` (double slash)
- `CurrId=USD` is present
- `skipdetails=true` is lowercase
- no `packageTourId`
- `officeId` varies per package/vendor (286 here, 193 in the engine, 192/193/286
  in the plan). `DEFAULT_OFFICE_ID` is a configurable fallback only;
  `detectOfficeIdMismatch` emits a review warning when a supplied officeId differs.

The `OdysseusEngine.ts` shape (single slash, camelCase `skipDetails`,
`packageTourId=-1`, no `CurrId`) is preserved as a labeled fallback,
`buildPreparedDetailsLinkEngineVariant`, for diagnostics/A-B use.

clonebkg note: real Share links are details.aspx URLs that ALSO carry a
structured-looking `clonebkg` (e.g. `07A__BESTPRICE__07A__`). The broker still
NEVER synthesizes `clonebkg` — it is trusted only when captured from the Share
button. Such links classify as `captured_clone` because the token encodes
captured deep booking state. This upholds baseline rule that `clonebkg`/`brn` are
portal-generated only.

Validation performed:

```powershell
npm run test:link-broker     # 47 passed, 0 failed
npm run test:deals-schema    # 17 passed, 0 failed (confirms seed file intact)
npx tsc --noEmit --pretty false   # 0 errors
```

Exit criteria met:

- Given package ID + `siid`, the broker returns a package entry link.
- Given package ID + `siid` + sufficient traveler setup, it returns a prepared
  details link.
- Given only ship/line/date, it returns `needs_package_lookup` until the Phase 6
  Odysseus package lookup is connected.
- `clonebkg` and `brn` are never synthesized; static validation rejects a
  constructed link that carries either, and captured clone/cabin requests return
  `needs_operator_capture` (capture support is Phase 6).

### Phase 3 - Link Validation and Health

Status: implemented.

Shipped:

- `lib/cb/link-broker/health.ts` — pure, dependency-free health rules:
  `computeHealth` (maps a pass/fail/inconclusive outcome to
  `valid`/`stale`/`broken`/`unknown`), `isStale` + `refreshHealthStaleness`
  (freshness-window staleness, default 24h), `addHoursIso`, and `staticHealth`
  (labels `broken` on static-validation failure, otherwise `unknown` since a
  clean static check cannot prove the package is live). Runs in scripts, the Next
  runtime, and tests alike.
- `lib/cb/link-broker/browser-validate.ts` — the SPA-aware browser validation
  extracted from `scripts/validate-cb-retail-links.ts` so the broker and the
  script share one implementation. `checkCbSwiftLink` / `checkCbFetchLink` /
  `checkCbLink` return `{ passed, failureReason }`; `validateBrokerLink` wraps
  them and returns a full `LinkBrokerHealth`. Playwright is imported dynamically,
  so importing the broker does not pull Playwright into the Next bundle; the
  module stays operator-run and never books/holds/submits.
- `scripts/validate-cb-retail-links.ts` refactored to call the shared
  `checkCbLink` (its ~70 lines of duplicated SPA-check logic removed), proving
  the extraction.
- Proof artifact: `tests/link-broker-health.ts`
  (`npm run test:link-broker-health`).

Health fields populated: `capturedAtIso`, `lastVerifiedAtIso`,
`nextVerificationDueIso`, `status`, `failureReason`.

Validation performed:

```powershell
npm run test:link-broker-health   # 18 passed, 0 failed
npm run test:link-broker          # 47 passed, 0 failed
npm run test:deals-schema         # 17 passed, 0 failed
npx tsc --noEmit --pretty false   # 0 errors
```

Operator-run browser validation of a real link (when a CB session exists in
`.playwright-state.json`):

```powershell
npx tsx -e "import('./lib/cb/link-broker').then(m => m.validateBrokerLink('<paste a real CB url>', { storageStatePath: '.playwright-state.json' }).then(h => console.log(JSON.stringify(h, null, 2))))"
```

Exit criteria met:

- The Link Broker can label links `valid`, `stale`, `broken`, or `unknown`.
- Public Deals can later depend on link health instead of blindly rendering
  links (the curated-deal publishing gate already keys on `linkHealth.status`).

### Phase 4 - CBAT Promo Intelligence Scraper

Status: implemented.

Shipped:

- `scripts/scrape-cb-promo-intelligence.ts` — operator-run scraper that reuses
  the established storageState auth pattern (load `.playwright-state.json`; on
  expiry, headless login with `CB_EMAIL` / `CB_PASSWORD`). It navigates Today's
  View, collects `/marketing/promotion/*` detail URLs, visits each, and extracts
  raw sections by walking the known heading labels through the
  `.view-promotion-wrapper` text: Promotion Details, Key features, Agent
  Instructions, Applicable Sailings, Offer Applicable Products, Applicable
  Markets, plus title/vendor and both date windows (with `MM/DD/YYYY -> ISO`
  parsing) and any `/media/` supporting-file links and dynamic booking links.
- Writes `CbPromoIntelligenceRecord[]` to
  `.github/data/cb-promo-intelligence-cache.json` with `extracted`/`marketingUse`
  left as empty scaffolds and `diagnostics.status = "needs_review"` (Phase 5
  fills them via GPT). Cache validates against the Phase 1 schema.
- `npm run scrape-cb-promo-intelligence`.

Read-only safety: the scraper only calls `page.goto` + `page.evaluate` (DOM
reads). It never clicks Book/Hold, never fills forms beyond login, and performs
no booking/hold/reservation/guest-info action.

Live run (2026-06-08, captured against the real CB session):

```text
records=6 detailPages=6 supportingFiles=0 errors=0
  cbpromo-2837  Celebrity Cruises - SUMMER SALE - Dollars Off, Onboard Credit
  cbpromo-2808  Princess Cruises - Discover the World - Dollars Off
  cbpromo-2872  Carnival Cruises - Sunshine & Savings Sale
  cbpromo-2458  Norwegian Cruise Line 50% Off + Free Extras - Onboard Credit
  cbpromo-2873  Explora Journeys Savings - Luxury All Inclusive
  cbpromo-2041  Royal Caribbean WEST COAST - Plan Today
```

The Celebrity Summer Sale record (the plan's canonical example) captured the
full raw Promotion Details (75% off 2nd guest, tiered per-stateroom savings and
OBC tiers), Agent Instructions combinability rules (BOGO not combinable with
GroupX/single supplements), the Galapagos product exclusion, and both windows —
verbatim, ready for Phase 5 extraction.

Known limitation: supporting `.docx` files are referenced as plain text
("Supporting File: /media/...") rather than `<a href>` on these pages, so 0 were
captured as file links. Parsing those text references / downloading the docs is
deferred (plan open question: parse in Phase 4 or later — later).

Exit criteria met:

- Current CB Today's View promotions are stored in an auditable cache with
  promotion count, detail-page count, raw section text, and (when present)
  supporting-file links.
- Raw agent instructions are preserved verbatim.

### Phase 5 - Structured Promo Extraction

Status: implemented.

Shipped:

- `lib/cb/deals-system/promo-extraction.ts` — `extractPromoIntelligence(record)`
  runs GPT-5.4 through the LLM gateway (`generateStructuredObject`, default
  `ModelName.GPT_5_HIGH` = gpt-5.4) against a Zod schema that mirrors
  `CbPromoExtractedTerms` + `CbPromoMarketingUse`. The system prompt enforces the
  hard rule: no invented values, every monetary perk must copy its supporting
  phrase into `rawText`, combinability booleans must quote the agent-instruction
  line, and public claims are separated into allowed / needs-qualifier /
  agent-only with a "may qualify"-style visitor summary that points to the
  booking portal.
- `scripts/extract-cb-promo-intelligence.ts` — reads the Phase 4 cache, extracts
  each `needs_review` record (or `--id` / `--force`), writes back `extracted` /
  `marketingUse` and sets `diagnostics.status` to `succeeded` / `failed`. Pure
  LLM over already-captured text; no CB login.
- `npm run extract-cb-promo-intelligence`, `npm run test:promo-extraction`.

Two implementation notes:

- OpenAI strict JSON-Schema mode requires every property to be required, which
  conflicts with the schema's optional inner fields (`depositType`,
  `voyageLength`, ...). The extraction call passes `strictJsonSchema: false`; the
  gateway still re-validates with Zod.
- The Zod schema is deliberately tolerant (`looseNumber` coerces "$700"/"75%" to
  numbers, unknown offer types fall back to `"other"`, arrays default to `[]`) so
  a near-miss from the model still yields a usable record. Without this, 2 of the
  6 records initially failed validation; with it, all 6 extracted cleanly.

Live run (2026-06-08, GPT-5.4): all 6 records extracted, `needsReview=0`. The
Celebrity Summer Sale record captured exactly what the plan's example calls for:

- booking window Jun 2 – Jul 27 2026; sailing window Jun 3 2026 – May 10 2028
- 75% off 2nd guest (non-refundable) and 50% (refundable), each with source text
- per-stateroom savings/OBC tiers with voyage-length, cabin-category, and
  booking-day context; the $700 top tier captured
- GroupX and single-supplement combinability set false from the agent line
- Galapagos exclusion captured
- qualified public summary; 5 caution flags (incl. flagging the odd "those who
  want to participate" market as not consumer-usable)

Exit criteria met:

- Each promo record has structured rules and warnings.
- Public copy can be generated only from approved/qualified claims
  (`marketingUse.publicClaimsAllowed` + a guarded visitor summary), and the test
  asserts no guaranteed-perk language leaks into the summary.

### Phase 6 - Odysseus Package Lookup

Status: implemented.

Shipped:

- `lib/cb/link-broker/package-lookup.ts` — pure, dependency-free ranker.
  `rankPackageCandidates(facts, results)` scores Odysseus `CruiseResult`s by sail
  date (dominant), nights, cruise line, ship name, departure port, and
  destination keyword, and returns `confident_match` (auto-select, gated on a
  confidence threshold AND a margin over the runner-up), `ambiguous` (ranked
  candidates for operator review — never a silent pick), or `no_match`. Date
  normalization and proximity scoring adapted from the proven
  `scripts/run-phase-b.ts` matcher.
- `lib/cb/link-broker/odysseus-lookup.ts` — operator-run adapter.
  `lookupOdysseusPackages(facts)` dynamically imports the Odysseus session
  manager (keeps Playwright/engine out of the Next bundle), centers the search
  window on the sail date, scopes by vendor when the line is recognized
  (`resolveVendorId`), runs `engine.searchCruises`, and ranks the results.
  Read-only; releases a broken session on error.
- Broker wiring: `resolveBestBookingLink` now accepts an optional
  `packageLookup` fn (`ResolveOptions.packageLookup`). When a request has no
  package ID, it runs the lookup; a confident match injects the resolved package
  ID and the resolve flow continues to a link; an ambiguous result returns
  `needs_operator_capture` with ranked candidates in `warnings`. The broker file
  itself imports nothing from Playwright/Odysseus (dependency injection).
- `scripts/lookup-odysseus-package.ts` + `npm run lookup-odysseus-package`
  (operator CLI; `--build-link` to chain straight into the broker).
- `tests/package-lookup.ts` + `npm run test:package-lookup`.

Validation performed:

```powershell
npm run test:package-lookup   # 12 passed, 0 failed
npx tsc --noEmit --pretty false   # 0 errors
```

Live operator runs (2026-06-08, real Odysseus session, Royal Caribbean
2026-11-08, 50 results parsed):

- Under-specified (`line + date` only): 6 same-day RCL sailings tied at 0.65 ->
  `ambiguous`, returned 25 candidates for review (did not pick one).
- Specified (`line + date + nights=6 + destination="Southern Caribbean"`):
  auto-selected real package `1619969` ("6 Night Southern Caribbean Cruise",
  2026-11-08, confidence 0.85, +0.30 over runner-up).

Exit criteria met:

- The Link Broker can resolve a real cruise from ship/line/sail date to a package
  ID (package `1619969` resolved live).
- It can then return a package entry or prepared details link (the resolved ID
  flows into `resolveBestBookingLink`; `--build-link` exercises this).
- Ambiguous matches return candidates instead of silently picking.
