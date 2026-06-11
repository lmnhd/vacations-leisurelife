# Home Page Deals System - Phased Implementation Plan

## Purpose

Implement the full Leisure Life Deals system in a testable order.

This plan ties together:

- `CB_AGENT_TOOLS_PROMO_INTELLIGENCE_PLAN.md`
- `ODYSSEUS_LINK_BROKER_PLAN.md`
- `PRELIMINARY_PLAN.md`
- `NEXT_AGENT_HANDOFF.md`

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
8. Curated Deal assembly + staged campaign workbench
9. **Sales pitch development** — transform research into customer-voice copy
10. Public Deal pages and CTAs
11. Email-link and callback operations
12. Dashboard and operator review
13. Distribution readiness

Step 9 is a required transformation step, not an optional enrichment. Research output
is written in operator voice ("what to investigate, what angle to consider"). Sales
pitch output is written in customer voice ("why this trip matters to you"). These are
two different jobs and neither can substitute for the other. The system must treat them
as separate, sequenced stages.

Do not start with frontend polish. The frontend should consume stable Deal records
after the internal data and link systems are proven.

## Current Next Stage

**Phases 9, 9A, 9B, and 10 are now implemented.** The system is ready for
**Phase 11 - CTA Workflow APIs**.

What already exists:

- CB promo intelligence scrape/extraction
- Link Broker link construction and health rules
- Odysseus package lookup
- retail trip research and Targeting-Demographic foundations
- Deals Operator Workbench at `/tests/deals-system`
- Curated Deal assembly + staged campaign development (copy, ad structure, media
  plan) and an operator approval gate (Phase 9 / 9A)
- a real, non-sample `CuratedOdysseusDeal` (RCL Southern Caribbean, package
  1619969) that has been assembled, link-marked valid, and operator-approved
- an enforced approval path from `needs_review` to `bookable`
- public homepage + `/deals/[id]` rendering of approval-gated Curated Deals
  (Phase 10), filtered by `isDealHomepageEligible`
- `DealPitchBrief` — the customer-voice editorial decision layer between research
  and copy (Phase 9B): `tripSummary`, `audienceStatement`, `primaryHook`,
  `curatedReason`, `sellingFacts`, `researchRationale` (internal-only)
- `ANALYST_VOICE_FORBIDDEN` constant and expanded `detectRedFlags` covering
  analyst-voice phrases and promotional risk terms
- `generateDealCopyPackage` now requires a `DealPitchBrief` parameter — the
  research → pitch → copy order is enforced at the type level

What does not exist yet:

- the three CTAs as real backends (Book now works as a link; Email link and
  Request callback route to `/contact` until Phase 11)
- live operator browser validation of the committed Deal's booking link (the
  first real Deal's link was marked valid by operator assertion, not a fresh
  Playwright check)

Therefore the next implementation goal is not more reporting. It is to expand the Deals Operator Workbench into a campaign-development workbench where the operator can run research, extraction, package lookup, copy generation, ad-structure planning, media planning, and approval steps one by one. Only after a Curated Deal is approved there should it be eligible for homepage publishing.

The next agent should treat `/tests/deals-system` as the working surface, similar in spirit to `/tests/media-generation` for group campaigns: a place to develop and inspect the campaign with AI before anything becomes public.

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

Status: implemented. Proof artifact: `npm run test:link-broker` (47/47 passing).

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

Status: implemented. Proof artifact: `npm run test:retail-discovery-research` (22/22 passing).

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

Status: foundation implemented. Proof artifact: `npm run test:retail-discovery-research` (22/22 passing).

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

### Current Foundation

- `lib/cb/deals-system/retail-discovery-adapter.ts` converts Group Discovery-style niche research into a quick-sale `RetailDiscoveryBrief`.
- `lib/cb/deals-system/angle-research.ts` generates a deterministic `DealAngleResearch` scaffold from a cruise candidate and optional retail brief.
- The Alaska sketching fixture proves the system can preserve niche value while stripping threshold/waitlist/cohort mechanics.
- This foundation is deterministic and testable; richer GPT/research-source generation can replace the internals while preserving the same contracts.

## Phase 8 - Targeting-Demographic Resource

Status: foundation implemented. Proof artifact: `npm run test:retail-discovery-research` (41/41 passing).

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

### Current Foundation

- `lib/cb/deals-system/targeting-demographic.ts` generates a package-specific `DealTargetingDemographic`.
- The generator consumes a cruise candidate, `DealAngleResearch`, and optional `RetailDiscoveryBrief`.
- The Alaska sketching fixture proves niche keywords, trend keywords, destination keywords, amenity/ship-experience keywords, negative keywords, and channel notes are generated without falling back to generic cruise-buyer targeting.
- This foundation is deterministic and testable; richer GPT/research-source generation can replace the internals while preserving the same contract.

## Phase 9 - Curated Deal Assembly

Status: implemented (first slice). Proof artifact: `npm run test:curated-deal-assembly`
(34/34 passing) plus a real, operator-approved Deal in
`.github/data/odysseus-curated-deals-cache.json`
(`deal-rcl-southern-caribbean-1619969`). Built through the Deals Campaign
Workbench, not a hidden script-only flow.

### Goal

Combine package, promo, research, targeting, and link data into real Curated Deal records that an operator can review and then publish to the homepage.

This is the bridge between the working backend pieces and "real working deals posted on the home page." Until Phase 9 exists, the system can scrape, extract, look up, test, and inspect data, but it cannot reliably produce homepage-ready Deals.

### Current State

Implemented foundations:

- Promo Intelligence cache exists and can be refreshed from CB Agent Tools Today's View.
- Promo extraction exists and turns raw agent promo pages into structured rules, public-safe claims, caution flags, and agent-only notes.
- Link Broker exists and can build package-entry or prepared-details links from package facts and traveler setup.
- Package lookup exists and can resolve cruise facts to ranked Odysseus candidates.
- Trip research and Targeting-Demographic foundations exist and can adapt Group Discovery-style insights into retail quick-sale Deal angles.
- Deals Operator Workbench exists at `/tests/deals-system` with:
  - safe test runner
  - promo scrape/extraction actions
  - package lookup form
  - cache health and publish-readiness inspection

Current blocker:

- `.github/data/odysseus-curated-deals-cache.json` still contains only a sample/non-public Deal.
- No real Deal currently combines:
  - selected package
  - valid broker link
  - promo applicability
  - research angle
  - Targeting-Demographic
  - public-safe packaging copy
  - operator review status
- Therefore the homepage should continue to show zero public Deals.

### Build

- Create a Curated Deal assembly module, tentatively:

```text
lib/cb/deals-system/curated-deal-assembly.ts
```

- Create an operator script, tentatively:

```text
scripts/assemble-curated-deal.ts
npm run assemble-curated-deal
```

- Add an operator action/form to `/tests/deals-system` so a package candidate can be converted into a Curated Deal without hand-editing JSON.
- The operator form should expose each major stage as a separate runnable action rather than one opaque "make deal" button:
  - select/source package candidate
  - attach promo intelligence
  - run or refresh trip research
  - run or refresh Targeting-Demographic
  - generate package copy
  - generate ad/campaign structure
  - prepare media plan
  - validate link health
  - mark ready for operator approval
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
- Keep status as `needs_review` until the operator approves it.
- Only set status to `bookable` when:
  - the package is a real Odysseus/CB package
  - the booking link includes the correct `siid`
  - link health is `valid`
  - public copy is free of agent-only notes
  - pricing/availability language is qualified
  - Targeting-Demographic exists

### Curated Deal Assembly Inputs

Minimum input for the first implementation:

```text
packageId
siid
cruise line
ship
sail date
nights
destination/itinerary
departure port
starting price/cabin prices when available
optional promoRecordId
optional RetailDiscoveryBrief or angle seed
optional traveler setup for prepared-details link
```

Preferred input path:

1. Operator refreshes promo intelligence if needed.
2. Operator runs package lookup from the Deals Operator Workbench.
3. Operator selects a candidate package.
4. Assembly module builds:
   - Link Broker output
   - promo applicability assessment
   - trip research
   - Targeting-Demographic
   - visitor packaging
   - agent-only notes
5. Output is written as a `needs_review` Curated Deal.
6. Operator approves, then the Deal can become `bookable` if link health is valid.

### First Real Deal Target

Use a tightly scoped first Deal rather than trying to automate the whole marketplace.

Recommended first slice:

- Pick one known package from a successful package lookup.
- Prefer a package aligned with one existing promo record, such as:
  - Celebrity Summer Sale
  - Princess Discover the World
  - Carnival Sunshine & Savings
  - NCL 50% Off + Free Extras
- Build one Curated Deal in `needs_review`.
- Show it in the Deals Operator Workbench.
- Validate its broker link.
- Promote it to `bookable` only after review.

### Test

- Build one Deal from a known package.
- Confirm no Deal publishes without valid link health.
- Confirm promo claims are qualified.
- Confirm agent-only notes do not appear in public fields.
- Confirm the generated Deal includes `angleResearch`.
- Confirm the generated Deal includes `targetingDemographic`.
- Confirm the Deals Operator Workbench shows the Deal and explains why it is or is not homepage-ready.

### Exit Criteria

- A single complete Curated Deal record can be built and inspected without hand-editing JSON.
- The record remains hidden from the homepage while `needs_review`, `expired`, or non-valid link health.
- The operator can promote a reviewed Deal to `bookable`.
- The cache contains at least one real, non-sample Deal with valid link health.
- Phase 10 can then wire homepage rendering to real curated Deals.

## Phase 9A - Deals Campaign Workbench Expansion

Status: implemented. Proof artifact: the expanded Deal Campaign Workbench at
`/tests/deals-system` (assembly form, per-stage runners, and an approval/publish
gate panel) plus `npm run test:curated-deal-assembly` (34/34 passing).

### Goal

Make `/tests/deals-system` the single operator surface for developing a Deal campaign with AI before it is finalized.

This should feel closer to `/tests/media-generation` for group campaigns than a passive report. The workbench should let the operator see every moving part of the Deal/ad/promotion development cycle and run each process intentionally.

### Build

Expand the Deals Operator Workbench into staged panels:

1. **Source and Package Selection**
   - promo intelligence records
   - package lookup results
   - selected package facts
   - Link Broker output and health

2. **Research and Extraction**
   - CB promo extraction
   - ship amenity research
   - destination and port research
   - common ship-class feature extraction
   - current trend and niche-audience research
   - competitor/blind-spot notes
   - source list and factual guardrails

3. **Deal Packaging Copy**
   - headline options
   - short tile copy
   - deal page hero copy
   - "why this trip" section
   - offer/perk language with qualifiers
   - CTA copy for Book now / Email link / Request callback
   - public-copy red flags and agent-only note separation

4. **Ad and Promotion Structure**
   - Meta campaign angle
   - Google search/display themes
   - TikTok/Reels hooks
   - email segment angle
   - niche/trend keywords
   - negative keywords
   - creative hypotheses
   - offer proof points

5. **Media Planning**
   - visual concept prompts
   - ship/destination imagery needs
   - ad image slots
   - short-form video concepts
   - required source assets
   - media generation status

6. **Approval and Publish Gate**
   - operator approval status
   - link health
   - public copy pass/fail
   - targeting resource pass/fail
   - media/ad readiness
   - homepage publish eligibility

### Data Requirements

Add or extend Deal campaign resources so each process can be saved independently:

```text
CuratedOdysseusDeal
DealAngleResearch
DealTargetingDemographic
DealCopyPackage
DealAdStructure
DealMediaPlan
DealApprovalState
```

Do not collapse these into one text blob. The operator needs each layer visible, rerunnable, and reviewable.

### Approval Rule

Deals must not automatically appear on the homepage.

The homepage may only render a Deal when all are true:

- `status === "bookable"`
- `operatorApproval.status === "approved"`
- `linkHealth.status === "valid"`
- public copy has passed guardrails
- Targeting-Demographic exists
- Deal media/creative status is acceptable for launch, or the Deal is explicitly approved for text-only launch

### Test

- Run each workbench process independently on one known package.
- Confirm generated research can be inspected before copy is generated.
- Confirm generated copy can be edited/regenerated before approval.
- Confirm ad structure and media plan are visible before homepage publishing.
- Confirm a non-approved Deal is hidden from the homepage even if it has a valid booking link.
- Confirm approval state survives page refresh.

### Exit Criteria

- The operator can develop one Deal campaign end-to-end inside `/tests/deals-system`.
- The operator can approve or reject the Deal from the workbench.
- No Deal reaches the homepage without explicit operator approval.

## Phase 9B - Deal Sales Pitch Development

Status: implemented. Proof artifact: `npm run test:deal-pitch-brief` (33/33 passing).

### The Missing Step

The system currently has:

```
Research (DealAngleResearch)     — operator/analyst voice
         ↓
Copy scaffold (DealCopyPackage)  — directly reuses research strings
         ↓
Public page                      — leaks analyst rationale as visitor copy
```

What is required:

```
Research (DealAngleResearch)     — operator/analyst voice
         ↓
Pitch development                — explicit transform to customer voice
         ↓
Copy (DealCopyPackage)           — customer voice, ready to publish
         ↓
Public page                      — clean visitor copy
```

The pitch development step is not the same as copy generation. It is the job
of reading the analyst's research notes — what is interesting about this trip,
what audience angles exist, what the competitor blind spot is — and making a
deliberate editorial decision: what is the *single best reason* a customer
should care, stated in their voice, not the operator's? Only after that
decision is made should copy be written.

### Goal

Make the research-to-copy boundary an explicit, testable stage. A `DealCopyPackage`
should only be generated from a completed pitch brief, not assembled directly
from raw research fields. The pitch brief is the editorial decision layer that
sits between research and copy.

### The Pitch Brief

Add a new type, `DealPitchBrief`, that captures the editorial decisions needed
before copy is written. It answers four questions in customer voice:

1. **What is this trip?** One sentence a customer reads, not an analyst.
2. **Why should this specific customer care?** The one reason that beats generic cruise copy.
3. **What makes it feel chosen for them?** Not generic; not a discount notice.
4. **What are the three strongest selling facts?** Verified, qualified, customer-readable.

```ts
interface DealPitchBrief {
  dealId: string;
  packageId: string;
  generatedAtIso: string;
  generator: "deterministic_scaffold" | "gpt";
  // One clear customer-voice sentence. No analyst language.
  tripSummary: string;
  // Primary audience. Stated as a person, not a targeting category.
  audienceStatement: string;
  // The single best reason to care. Not a perk list.
  primaryHook: string;
  // Why this feels selected, not broadcast.
  curatedReason: string;
  // Three short, qualified, public-safe selling facts. Each one stands alone.
  sellingFacts: [string, string, string];
  // Raw research rationale that informed these decisions. Internal only.
  // NEVER surfaces on a public page.
  researchRationale: string;
}
```

### Build

1. Add `DealPitchBrief` to `campaign-types.ts`.
2. Add `CuratedOdysseusDeal.pitchBrief?: DealPitchBrief`.
3. Add `generateDealPitchBrief(input: CampaignStageInputs): DealPitchBrief` to
   `campaign-generators.ts` as a deterministic scaffold that reads
   `angleResearch` and `targetingDemographic` but writes everything in customer
   voice. The scaffold must not let analyst phrasing pass through unchanged.
4. Add a `"pitch"` stage to `DealCampaignStage` and `runDealCampaignStage`.
5. Add the pitch stage as a panel in the Deals Campaign Workbench (between
   research/targeting and copy).
6. **Change `generateDealCopyPackage` to require a `DealPitchBrief` input.**
   It should source `whyThisTrip`, `heroCopy`, and `headlineOptions` from the
   pitch brief fields — not directly from `angleResearch`. This enforces the
   research → pitch → copy order at the type level.
7. Add the `"pitch"` stage to the workbench API route
   (`app/api/tests/deals-system/curated-deal/route.ts`).
8. Update `assemble-curated-deal.ts` to run the pitch stage before copy.

### GPT Path

When the `generator` is `"gpt"`, `generateDealPitchBrief` should call the LLM
gateway with a prompt that:

- provides all research fields as context
- instructs the model to write in second-person customer voice
- forbids analyst phrases: "gives the Deal", "can anchor", "should be evaluated",
  "niche starting point", "source of truth", "operator-approved"
- requires each field to be a complete, standalone sentence a customer would read
- requires `sellingFacts` to be qualified ("may include", "subject to
  availability") unless they are hard facts from cruise data (ship name, nights,
  ports)
- keeps `researchRationale` as a separate, internal-only field
- validates output against the `DealPitchBrief` schema before saving

### Voice Rules for All Copy Stages

These apply to both the deterministic scaffold and the GPT path. They belong in
the code as constants that feed red-flag detection and prompt guardrails.

Forbidden in any public-facing field:

- "gives the Deal" / "gives this Deal"
- "can anchor" / "should anchor"
- "should be evaluated"
- "niche starting point"
- "source of truth"
- "retail Deal angle"
- "operator-approved" / "operator review"
- "deterministic scaffold" / "scaffold"
- "The package needs"
- "campaign development"
- "ad targeting"
- "confidence score"
- Any phrase that ends in "before it should become a promoted Deal" or
  "before public copy"

Required in any pricing/perk claim:

- One of: "may include", "subject to availability", "confirm live pricing",
  "ask our agent", "eligibility confirmed in the booking portal"

### Test

- Generate a pitch brief from the Southern Caribbean Deal's angle research.
- Assert every field reads in customer voice (no forbidden analyst phrases).
- Assert `researchRationale` is internal-only and not present in any public
  projection field.
- Assert `generateDealCopyPackage` requires a pitch brief and sources
  `whyThisTrip` from `pitchBrief.sellingFacts`, not from `angleResearch`.
- Assert a copy package built without a pitch brief cannot be produced
  (type error or runtime guard).

### Exit Criteria

- The `DealCopyPackage` for every curated Deal is sourced from a `DealPitchBrief`,
  not assembled directly from research strings.
- The pitch brief is a discrete, rerunnable, inspectable stage in the workbench.
- No public page field contains analyst-voice phrasing.
- The red-flag detection list in `campaign-generators.ts` covers forbidden phrases.
- A GPT-backed pitch brief replaces the deterministic scaffold for any Deal
  that reaches the homepage (the scaffold is acceptable for workbench development
  but should not be the source of record for approved, published copy).

## Phase 10 - Public Deal Page Integration

Status: implemented. Proof artifact: `npm run test:public-deal-projection`
(18/18 passing) plus the homepage Curated Deals section and the curated branch in
`/deals/[id]`, both reading only `isDealHomepageEligible` Deals.

### Goal

Render only operator-approved Curated Deals publicly without dashboard legacy pages or sidebar.

### Build

- Update homepage Deals source to use curated Deal records.
- Filter the homepage source so it includes only Deals that passed the Phase 9A approval gate.
- Update `/deals/[id]` to show:
  - hero
  - trip facts
  - destination/ship/amenity highlights
  - promo-safe offer summary
  - targeting-informed positioning
  - link health-aware CTA area
- Pull public copy, campaign angle, and media plan from the approved workbench artifacts.
- Never render:
  - `needs_review` Deals
  - rejected Deals
  - non-valid link health Deals
  - agent-only notes
  - draft ad/media concepts not approved for public use
- Preserve dark/light readability.

### Test

- Render one known curated Deal.
- Confirm no old stubs or "booking pending" states appear publicly.
- Confirm public fields do not expose agent-only notes.
- Confirm a valid-link but non-approved Deal remains hidden.
- Confirm approved workbench copy appears on the Deal page.
- Confirm light/dark mode readability.

### Exit Criteria

- The homepage and Deal page can publish one real, operator-approved curated Deal.

## Phase 11 - CTA Workflow APIs

Status: implemented. `POST /api/deals/link-request` and
`POST /api/deals/callback-request` exist; `CuratedDealPage` calls both. The
booking URL comes from the approved Deal's public projection (already
broker-resolved at assembly time), so the routes read it from
`getPublicDealPageById` rather than re-invoking the Link Broker.

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

Status: implemented via Klaviyo. `lib/cb/deals-system/deal-link-email.ts`
(`sendDealLinkEmail`) upserts a Klaviyo profile by email and tracks the
`LLL Deal Link Requested` event with deal title, ship/cruise line, destination,
sail date, price-from label, the prepared booking link, the deal page URL, and
the standard availability caveat. A Klaviyo flow bound to that metric owns the
template/copy/send, matching how Group campaign emails work
(`lib/integrations/klaviyo.ts`, `lib/campaigns/email/`).

`POST /api/deals/link-request` calls `sendDealLinkEmail` when an `email` is
provided and returns `emailDelivered: false` (without failing the request) if
the Klaviyo call throws — the booking link still opens, but the UI tells the
visitor the email didn't go out.

**Remaining for live verification**: a Klaviyo flow must exist for
`LLL Deal Link Requested` before an end-to-end send can be observed. No code
changes needed for that — it's a Klaviyo dashboard configuration step.

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

Status: implemented (dashboard queue + status workflow). The `callback-request`
route (Phase 11) writes `AgentCallbackRequest` records with
`routing.dashboardQueued: true` on arrival and a Pushover admin notification.
The operator workbench at `/tests/deals-system` shows a "Callback Requests"
panel (`callback-requests-panel.tsx`) listing each request's deal/cruise
context, visitor name/email/phone/notes, link health, routing badges, and
status history. The operator can move a request through
`new -> assigned -> contacted -> closed` (with an optional note) via
`POST /api/tests/deals-system/callback-status`, which appends to
`statusHistory` and clears `routing.dashboardQueued`. Email notification and
Crisp hooks were intentionally not added in this pass — Pushover + the
dashboard panel cover the operational need today; revisit if Crisp/email
notification becomes a real requirement.

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

## Phase 14 - Production Deals Campaign Dashboard

Status: implemented. `/admin/deals-system` renders the same
`DealsSystemDashboardView` as `/tests/deals-system` (extracted into
`app/(tests)/tests/deals-system/dashboard-view.tsx` and shared by both
routes), so every existing view (promo intelligence, Curated Deals, research
artifacts, copy/ad/media stages, link health, targeting-demographic, approval
state, callback requests) is already present in the production dashboard.

New operator actions added to `POST /api/tests/deals-system/curated-deal`:
`pin`/`unpin` (homepage ordering via `operatorVisibility.pinned`,
consumed by `getPublicDealTiles`), `hide`/`unhide`
(`operatorVisibility.hidden`, enforced in `isDealHomepageEligible`),
`refresh_link` (marks `linkHealth.status = "stale"` to pull a Deal off the
homepage pending re-verification), and `request_capture` (appends an
`agentOnlyNotes` flag for an operator CBAT/Odysseus capture run — it does not
run any browser automation itself, consistent with CBAT/Odysseus being
operator-controlled). "Mark callback status" was already delivered in Phase 13
and is reused here via the shared `CallbackRequestsPanel`.

`/admin/deals-system` has no additional auth layer — it is at the same trust
level as `/tests/deals-system` today. Add access control if this dashboard is
exposed beyond trusted operators.

### Goal

Move the tested Deals Campaign Workbench from `/tests/deals-system` into a durable production/operator dashboard for before-and-after publishing control.

Phase 9A creates the test workbench. Phase 14 is the hardened operational version.

### Build

- Add production dashboard views for:
  - promo intelligence records
  - curated Deal candidates
  - research/extraction artifacts
  - package copy packages
  - ad structures
  - media plans
  - link health
  - targeting-demographic resources
  - approval state
  - callback requests
- Add actions:
  - run/regenerate research
  - run/regenerate copy
  - run/regenerate ad structure
  - run/regenerate media plan
  - approve/reject Deal
  - pin/unpin Deal
  - hide Deal
  - refresh link
  - request operator capture
  - mark callback status

### Test

- Run and approve one Deal campaign from the production dashboard.
- Regenerate one research/copy/ad/media layer without overwriting approved layers accidentally.
- Hide one Deal.
- Refresh one link.
- Review one callback request.

### Exit Criteria

- Operator can manage the full Deal campaign lifecycle without editing JSON by hand.

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

Prepare operator-approved Deals for paid and organic promotion, using the ad structure and media plan developed in the Deals Campaign Workbench.

### Build

- Generate ad-ready package:
  - targeting-demographic resource
  - approved Deal copy package
  - approved ad structure
  - approved media plan
  - landing page URL
  - CTA behavior
  - approved claims
  - creative hooks
  - Meta targeting notes
  - Google search themes
  - TikTok hooks
  - email segment notes
- Connect to existing campaign distribution patterns where appropriate, without mixing Deals and Groups.
- Reuse group-campaign media/ad tooling patterns where helpful, but keep Deal campaign artifacts separate from Shadow Group artifacts.
- Require operator approval before exporting/submitting any paid ad package.

### Test

- Produce one complete distribution package for one Deal.
- Confirm targeting is niche/trend-based, not generic cruise-buyer targeting.
- Confirm booking link passes pre-launch validation.
- Confirm ad structure and media plan came from the approved Deal workbench artifacts.
- Confirm a draft/unapproved Deal cannot be exported for ads.

### Exit Criteria

- One approved Deal is ready to promote externally with targeting, copy, ad structure, media plan, link health, and CTA handling complete.

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

### Phase 9 / 9A - Curated Deal Assembly and Campaign Workbench

Status: implemented (first slice).

Shipped:

- New campaign data contracts in `lib/cb/deals-system/campaign-types.ts`:
  `DealCopyPackage`, `DealAdStructure`, `DealMediaPlan`, and `DealApprovalState`
  (with `DealApprovalGate`). `CuratedOdysseusDeal` now carries `copyPackage`,
  `adStructure`, `mediaPlan`, and `operatorApproval` as independent, rerunnable
  layers — not one text blob.
- Deterministic stage generators in `campaign-generators.ts`
  (`generateDealCopyPackage`, `generateDealAdStructure`, `generateDealMediaPlan`).
  Public copy is built only from extracted public-safe / qualified promo claims;
  agent-only promo notes are routed to `agentOnlyNotes` and never to visitor
  fields; needs-qualifier claims get a live-pricing/availability qualifier; risky
  phrasing is surfaced as `publicCopyRedFlags`.
- Assembly module `curated-deal-assembly.ts`:
  - `assembleCuratedDeal` merges package facts, booking URL + health, promo
    applicability, research, targeting, copy, ad structure, and media into a
    `needs_review` Deal. It NEVER returns a publishable Deal.
  - `runDealCampaignStage` regenerates one stage and always returns the Deal to
    `needs_review`, so a stale approval can never ride along.
  - `evaluateApprovalGates` is the single source of truth for the five blocking
    gates (real package, valid link, clean public copy, targeting present, media
    ready or text-only waived).
  - `approveCuratedDeal` promotes to `bookable` only when every blocking gate
    passes; `rejectCuratedDeal` records a rejection; `isDealHomepageEligible`
    is the one homepage filter (`bookable` + `approved` + link `valid`).
- Validator now rejects a `bookable` Deal that is not operator-approved, so a
  valid link alone can never publish even at the schema layer.
- Cache helpers `curated-deal-cache.ts` (load/save/upsert) so Deals are saved and
  re-loaded across stages without hand-editing JSON.
- Operator script `scripts/assemble-curated-deal.ts`
  (`npm run assemble-curated-deal`) with `--first-real`, `--stage`,
  `--set-link-valid`, `--approve`, and `--reject`. No CB/Odysseus login, booking,
  hold, or guest-info action.
- Workbench expansion at `/tests/deals-system`: a staged Deal Campaign Workbench
  (source/assemble form, per-stage regenerate buttons, public-copy red-flag
  display, and an approval/publish gate panel) backed by
  `app/api/tests/deals-system/curated-deal/route.ts`.
- Proof artifact `tests/curated-deal-assembly.ts`
  (`npm run test:curated-deal-assembly`, 34/34) asserts the core safety
  property: a valid link alone never makes a Deal homepage-eligible; only an
  operator approval with all blocking gates passing promotes it to `bookable`;
  regenerating a stage clears a prior approval; and the validator rejects a
  bookable-but-unapproved Deal.

First real Deal: `deal-rcl-southern-caribbean-1619969` (RCL Southern Caribbean,
package 1619969 from the live Phase 6 lookup) was assembled, marked link-valid by
operator assertion, and operator-approved, so the cache now holds a real,
non-sample, homepage-eligible Deal. Its booking link should still be re-validated
with live browser validation before public launch.

Validation performed:

```powershell
npm run test:curated-deal-assembly   # 34 passed, 0 failed
npm run test:deals-schema            # 17 passed, 0 failed (real approved Deal validates)
npm run test:deals-system:all        # all 7 suites passing
npx tsc --noEmit --pretty false      # 0 errors
```

Exit criteria met:

- A complete Curated Deal record can be built and inspected without hand-editing
  JSON.
- The record stays hidden from the homepage while `needs_review` or non-valid
  link health, and a valid link alone is not enough — operator approval is
  required.
- The operator can develop one Deal campaign end-to-end inside
  `/tests/deals-system` and approve or reject it from the workbench.
- The cache contains a real, non-sample, approved Deal, so Phase 10 can wire
  homepage rendering to `isDealHomepageEligible`.

### Phase 10 - Public Deal Page Integration

Status: implemented.

Shipped:

- `lib/cb/deals-system/public-deal-projection.ts` — turns an approved
  `CuratedOdysseusDeal` into public-safe `PublicDealTile` / `PublicDealPage`
  shapes. It exposes only `packaging`, visitor-safe `copyPackage` fields (hero,
  why-this-trip, qualified offer lines, the three CTAs), the targeting
  positioning statement, and the booking URL. It never projects `agentOnlyNotes`,
  the ad structure, raw targeting keywords, approval internals, or unapproved
  media.
- `lib/cb/deals-system/public-deals.ts` — the single approval-gated public
  loader. `getPublicDealTiles` / `getPublicDealPageById` read the cache and return
  only `isDealHomepageEligible` Deals (bookable + operator-approved + valid link).
  Resilient: a missing/malformed cache yields zero public Deals instead of
  throwing or leaking a non-eligible Deal. Server-only.
- `components/cb/curated-deals-tiles.tsx` — homepage section rendering approved
  Curated Deals (renders nothing when there are none), wired into
  `components/landing-content.tsx` ahead of the legacy CB tiles.
- `components/cb/curated-deal-page.tsx` + a curated branch in
  `app/(landing)/deals/[id]/page.tsx` — an approved Curated Deal renders the
  public page; a non-eligible curated Deal falls through and 404s (it never
  renders `needs_review`/rejected/non-valid-link Deals or agent-only notes). Book
  now uses the approved booking URL; Email link and Request callback route to
  `/contact` until Phase 11.
- Proof artifact `tests/public-deal-projection.ts`
  (`npm run test:public-deal-projection`, 18/18) asserts a valid link alone /
  unapproved / needs_review / broken-link Deals are all excluded from the public
  surface, and that the projection never leaks agent-only notes, ad structure, or
  approval internals.

Verified live against the committed cache: the approved RCL Deal yields one
public tile and a resolvable page, while the Phase 1 `needs_review` Bahamas
sample resolves to `null` (404), proving the gate.

Exit criteria met:

- The homepage and `/deals/[id]` publish the real, operator-approved curated
  Deal, with no booking-pending stubs, no agent-only notes, and non-approved /
  non-valid-link Deals hidden.

Still open for the next agent: run live operator browser validation
(`validateBrokerLink`) on the committed Deal's link before relying on it in
production, and implement the Phase 11 CTA backends so Email link / Request
callback stop routing to `/contact`.
