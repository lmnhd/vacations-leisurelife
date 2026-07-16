# Search Intent to Booking - Implementation Plan

## Decision

Add a Search Intent Workbench to the existing Deals Operator Workbench. It will accept authorized query evidence, score exact intent clusters, connect each selected cluster to one verified CB/Odysseus package and its promotions, and preserve the evidence through Deal and Meta review.

The first deliverable is a reviewable pilot for three intent clusters. No live ad activation or booking action is part of this plan.

## First: establish funnel truth

The reported condition - many Meta page clicks and zero bookings - could indicate weak commercial fit, but also a tracking or booking-path defect. Before selecting the next offer:

1. Verify that booking-start and booking-complete can be observed reliably.
2. Verify the exact promoted package, current price, promotion eligibility, and CTA handoff.
3. Then use search intent to select and test packages.

Clicks are not a conversion signal and must not be the selection criterion.

## Durable evidence contract

Add a versioned, DynamoDB-backed `DealSearchIntentEvidence` record linked to the bare Deal/package ID. Add ID builders in `lib/cb/deals-system/deal-ids.ts`; do not hand-compose derived IDs.

```text
DealSearchIntentEvidence
  id, dealId, packageId, status, capturedAtIso
  source: search_console | google_ads | onsite_search | operator_import
  sourceWindow: market, country, start/end dates, device optional
  queries: exact term, impressions, clicks, volume estimate, CPC estimate,
           competition, source row reference, collected timestamp
  clusters: label, job-to-be-done, terms, score breakdown, selected flag
  packageVerification: package facts snapshot, pricing basis, availability,
                       promotion ids/status, booking-link health, checked timestamp
  metaTranslation: interest candidates/resolution result, creative hooks,
                   geo, exclusions, optimization event, UTM campaign key
  review: draft | needs_review | approved | rejected, operator decision/note
```

Raw imports are internal-only. The public page receives only visitor-safe copy and approved package/promotion facts.

## Input acceptance rules

| Source | What it establishes | What it does not establish |
| --- | --- | --- |
| Search Console | Queries reaching owned organic pages | broad market demand or paid-search economics |
| Google Ads query report | Actual paid queries and performance | eligibility for Meta targeting |
| Keyword Planner | Approximate demand and commercial context | real conversion intent or exact future volume |
| Onsite search | Visitors' stated needs after arriving | external market size |

Every query retains source, market, date window, and collection timestamp. Evidence without those fields cannot be scored or approved.

## Intent scoring

Score each cluster from 0-5 in five visible dimensions:

| Dimension | Weight |
| --- | ---: |
| Transaction specificity | 30% |
| Demonstrated demand | 20% |
| Commercial signal | 15% |
| Verified package fit | 20% |
| Applicable promotion strength | 15% |

`clusterScore = weighted total / 5`. Use 3.5 as the initial review threshold. Package fit and promotion strength require a fresh CB/Odysseus preflight; they must never be inferred. A cluster with no real matching package is held, not rewritten into a different promise.

## Package and promotion preflight

1. Look up actual inventory using existing CB/Odysseus tools.
2. Capture exact package ID, ship, itinerary, sail date, cabin/price basis, availability timestamp, and booking URL.
3. Validate promotion line, sailing/booking window, market, rate/product exclusions, cabin/voyage tier, and combinability.
4. Run link health and compare live booking-page cabin pricing with the promoted Deal.
5. Compare like-for-like alternatives; do not mix base fare with taxes-and-fees-inclusive pricing.
6. Attach the full public-safe promotion brief before copy generation.

Existing gates remain: unresolved package, unhealthy link, or promo-market mismatch blocks approval.

## Meta translation

Meta does not receive a claim that it can target the exact search query. The query is evidence for a testable marketing hypothesis:

```text
Exact query cluster
  -> customer problem and required proof
  -> matching landing-page headline, options, and CTA
  -> creative hooks and copy variants
  -> Meta-supported interests, geo, exclusions, and retargeting
  -> paused Meta distribution draft
```

Keep the cluster ID in campaign strategy, distribution notes, and UTM values. The existing Meta generator continues to resolve supported interests and remove cross-campaign terms. Search terms are source evidence, never blindly inserted into Meta `flexible_spec`.

## Event contract

Carry `intentClusterId`, `dealId`, `packageId`, UTM values, and an opaque session ID through the funnel:

| Event | Required properties |
| --- | --- |
| `landing_page_view` | source, campaign/ad/ad set, intent cluster, deal/package |
| `package_option_selected` | selected cabin/date/package |
| `booking_cta_clicked` | CTA type, destination host, link-health snapshot |
| `booking_start` | deal/package, attribution keys, handoff reference when available |
| `booking_complete` | deal/package, booking-reference hash, currency, revenue/margin when available |

Do not send PII, payment data, or raw booking references to browser logs or ad parameters. Deduplicate server-side events with a non-PII event ID. If final CB handoff cannot return completion data, the dashboard must report `booking completion unknown`, not a confirmed zero.

## Operator workbench flow

1. Import authorized evidence and reject untraceable rows.
2. Review exact terms, source/date/market, score factors, and job-to-be-done clusters.
3. Match a concise CB/Odysseus package shortlist and connected promotions.
4. Record availability, price basis, promo terms, link health, and manual CTA test.
5. Populate existing campaign angle, target audience, visual angle, targeting keywords, and provenance.
6. Review the Meta translation and paused draft; operator approves or rejects.
7. Measure the funnel by intent cluster with data-quality warnings.
8. Scale, revise, pause, or investigate based on bookings and margin, not clicks.

## Delivery phases

### Phase 0 - Funnel truth audit

- Audit active Deal ads, destination URLs, UTMs, optimization event, pixel/CAPI status, package availability, and CTA handoff.
- Run a controlled, non-booking CTA-path test.
- Define the authoritative booking-start and booking-complete sources.
- Deliverable: timestamped diagnosis; block new spend if the path/events are broken.

### Phase 1 - Evidence model and import

- Add types, ID builder, Dynamo store/cache adapter, non-regex import validation, and operator-only preview.
- Deliverable: reviewable source-backed clusters with no package mutation.

### Phase 2 - Intent-to-package preflight

- Connect approved clusters to existing package lookup and promo intelligence.
- Persist verification snapshots and gates.
- Deliverable: three `needs_review` candidates with exact package IDs and verified CTAs.

### Phase 3 - Landing/Meta continuity

- Thread cluster provenance into campaign strategy, ad structure, funnel synthesis, Meta draft metadata, and UTMs.
- Surface the distinction between search evidence and supported Meta controls.
- Deliverable: paused Meta drafts and matching landing-page promise/CTA.

### Phase 4 - Measurement and decisions

- Add reconciliation, data-quality states, and per-cluster funnel reporting.
- Deliverable: an operator surface that distinguishes traffic quality, page/CTA failure, booking handoff failure, and booking conversion.

## Acceptance criteria

- Every selected query is traceable to source, market, date range, and score inputs.
- Each chosen cluster ties to a real package, verified promotion context, price basis, and healthy booking path.
- Existing Deal approval gates remain mandatory and Meta drafts remain paused until operator approval.
- Reporting distinguishes measured booking completion, unknown completion, and confirmed zero bookings.
- No hold, reservation, payment, or booking is performed.

## Pilot input needed

Start with an export of the current Meta campaign/ad-set/creative performance, the advertised URLs and UTMs, and Search Console query data. This lets Phase 0 separate tracking/path defects from weak demand before new keyword research drives spend.
