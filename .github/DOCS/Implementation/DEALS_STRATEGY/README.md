# Deals Strategy: Search Intent to Bookings

## Purpose

Turn verified, high-intent cruise searches into a reviewable deal package backed by Cruisebound (CB) inventory and promotions, then use the same intent evidence to guide Meta creative and targeting. The objective is qualified booking starts and completed bookings, not page clicks.

## Why this changes the current loop

Meta page-click volume with zero bookings is a diagnostic signal, not proof that interest is absent. It commonly means one or more of the following is broken:

- the ad promise does not match the landing-page or checkout expectation;
- the offer is not competitive, available, or sufficiently explained;
- the audience is optimized for low-cost clicks rather than purchase intent;
- the booking path or conversion event is failing;
- the page does not make a credible next action obvious.

Do not increase spend until the selected deal has a verified CTA and the booking funnel is instrumented end-to-end.

## Working model

```text
Search-intent evidence
  -> intent cluster and acceptance rules
  -> CB inventory and promotion matching
  -> priced, available deal package
  -> landing page with exact promise and verified CTA
  -> Meta ad set and creative hypotheses
  -> booking-funnel measurement
  -> decision: scale, revise, or stop
```

Search keywords are inputs to audience and creative hypotheses. They are not assumed to be directly targetable on Meta; every actual targeting field must be checked against the current Meta delivery options before launch.

## Required evidence per candidate

Each candidate should have a durable record with:

| Field | Requirement |
| --- | --- |
| Intent cluster | Exact query or query theme, market, device, date range, volume, trend, and source |
| Commercial signal | CPC/competition or equivalent paid-search signal; clearly label estimates |
| Audience need | A plain-language job to be done inferred from the query |
| CB package | Sail date, ship, itinerary, cabin, occupancy assumption, price basis, inventory status, and retrieval time |
| Promotions | Every connected CB promotion, eligibility, expiry, stackability, and disclosure copy |
| Competitiveness | Like-for-like comparison against alternatives; base fare and taxes/fees must never be mixed |
| Booking path | Exact destination URL, CTA label, link-health result, and a manual test result |
| Meta translation | Approved targeting fields, exclusions, geo, placements, optimization event, creative promise, and UTM convention |
| Outcome | Landing view, CTA click, booking-start, booking-complete, revenue, and data-quality status |

## Intent scoring

Score candidates before package construction. A transparent starting score is:

`IntentScore = 0.30 * specificity + 0.25 * transaction_signal + 0.20 * demand + 0.15 * CB_match + 0.10 * promotion_strength`

Score each component from 0-5. A candidate is eligible for review at 3.5 or higher only when the CB package is available and its CTA is healthy. The score ranks opportunities; it does not replace operator judgment.

### Intent clusters to investigate

- destination + month + price: "Alaska cruise May under 1000"
- ship or line + itinerary: "Royal Caribbean 7 night Caribbean cruise"
- occasion or traveler type: "anniversary cruise packages" or "cruise for first time couples"
- value or promotion: "cruise drink package included" or "kids sail free cruise"
- itinerary constraint: "Mediterranean cruise from Rome 2027"

Prioritize specific, transaction-adjacent wording over broad inspiration terms such as "cruise vacation." Keep raw queries, match type, source, and dates so the evidence can be rechecked.

## Deal package contract

A package becomes review-ready only after it contains:

1. One primary intent cluster and its supporting evidence.
2. One exact CB-backed package, including price basis and availability check.
3. Connected promotions with eligibility and expiry conditions rendered visibly.
4. A landing page whose headline, options, and CTA match the ad's promise.
5. A verified CTA path to booking, with test timestamp and owner.
6. Meta-ready creative and targeting hypotheses derived from the intent cluster.
7. UTMs and event definitions for every transition in the funnel.

If the campaign is a wrapper deal, the wrapper is the promoted object. It must present real, visible date/package options in-page rather than sending users to an unexplained generic results page.

## Meta activation rules

Build multiple small hypotheses rather than a single broad audience:

| Ad-set hypothesis | Derived from | Must test |
| --- | --- | --- |
| Destination planners | destination + timing query cluster | destination-specific proof and dates |
| Value seekers | promo/value query cluster | total-price clarity and promo eligibility |
| Occasion travelers | anniversary/family/couple query cluster | occasion framing and package fit |
| Retargeting | verified landing or CTA activity | progression toward booking, not repeat clicks |

- Preserve keyword/intent metadata in the campaign brief, ad naming, creative brief, and UTMs.
- Use Meta's currently supported audience controls only; never claim keyword targeting when the platform does not support it.
- Optimize toward the deepest trustworthy event available. Do not use `landing_page_view` or `link_click` as the primary success event once booking-start or booking-complete is available.
- Exclude completed bookers and cap retargeting frequency.
- Keep promotion copy conditional where dates, cabins, or eligibility vary.

## Measurement and diagnosis

Use this funnel for every package:

`impression -> outbound click -> landing view -> package selection -> CTA click -> booking start -> booking complete -> revenue`

For each step, record count, rate from prior step, source campaign/ad set/creative, and a data-quality flag. Diagnose in this order:

1. Verify booking-complete and booking-start events with a controlled test.
2. Check CTA link health and actual availability for the promoted package.
3. Compare ad promise, landing headline, displayed price, and checkout result.
4. Segment falloff by intent cluster, campaign, creative, device, geo, and retargeting status.
5. Pause any package with a broken path or material price/promotion mismatch.

Suggested initial decision thresholds (replace after baseline collection):

- Any verified checkout or event defect: pause immediately.
- Strong click-through but weak landing-to-CTA rate: revise package clarity, value proof, and CTA.
- Strong CTA rate but no booking starts: investigate handoff, inventory, price, and checkout.
- Booking starts but no completions: investigate checkout friction, fees, promotion eligibility, and follow-up.
- Completed bookings with positive contribution margin: expand only the associated intent cluster and creative hypothesis.

## Operating cadence and approval gates

| Gate | Owner decision | Evidence required |
| --- | --- | --- |
| Intent review | Accept/reject query cluster | source data and score |
| Package review | Accept/reject CB option | availability, price basis, promotions, competitiveness |
| Landing review | Approve/reject promotion surface | visible options and verified CTA |
| Media review | Approve draft/pause | targeting translation, creative, UTMs, event map |
| Scale review | Scale/revise/stop | funnel performance and margin |

Publishing is always operator-approved. No candidate may auto-publish merely because it scores highly.

## Discovery plan

1. Audit the current zero-booking campaigns: IDs, date range, spend, creative, landing page, targeting, optimization event, UTM coverage, and all funnel events.
2. Establish the event truth set with a controlled booking-path test and reconcile platform reporting with first-party events.
3. Collect search-intent evidence from approved sources (for example Search Console, Google Ads Keyword Planner, paid-search query reports, and onsite search). Keep source permissions and collection date.
4. Cluster and score the searches, then choose 3-5 candidate clusters for CB matching.
5. Retrieve exact CB packages and connected promotions; validate availability, total price, eligibility, and CTA before any creative work.
6. Build review-ready landing/deal packages and launch only approved drafts.
7. Read results by intent cluster after sufficient conversion opportunity, then revise or scale according to the gates above.

## Open implementation questions

- Which search-intent data sources and accounts are authorized for use?
- What CB fields and promotion endpoints are currently available to the Deals system?
- Which booking events can be received first-party, and can booking-complete include value/currency?
- Is the booking path first-party, partner-hosted, or a handoff that requires tracked redirect parameters?
- What contribution-margin threshold should govern scale decisions?

## Proposed repository follow-up

Before implementation, trace the existing Deals schema and Meta distribution flow to map this strategy onto the actual contracts. The implementation should add durable fields for intent provenance, CB promotion verification, CTA health, and funnel attribution, plus an operator review surface. It should not substitute synthetic keyword data for an authorized source or activate ads without an approval gate.
