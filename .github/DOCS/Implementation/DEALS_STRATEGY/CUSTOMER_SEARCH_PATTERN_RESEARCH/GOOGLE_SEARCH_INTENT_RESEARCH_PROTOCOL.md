# Google Search Intent Research Protocol

## Decision

High-frequency cruise-search research is a Google-side activity. Meta cannot
show the phrases people typed into Google Search. Meta uses the resulting
intent evidence to shape creative, landing-page promise, supported interests,
and retargeting hypotheses.

The first pilot does not need a Google Search campaign. Start with Keyword
Planner, Google Trends, and Search Console when available. Add a small Search
campaign only when we need actual paid-search-term conversion evidence.

## What each source answers

| Source | Question answered | Do not use it for |
| --- | --- | --- |
| Google Keyword Planner | Estimated demand, competition, and bid value for an exact phrase in the selected market | Proof the phrase will convert for Leisure Life |
| Google Trends | Whether interest is rising, seasonal, or stronger in one region | Absolute search volume or commercial intent |
| Google Search Console | Exact queries already showing or sending visitors to Leisure Life pages | Total market demand beyond the site's own visibility |
| Google Ads Search terms report | Actual Google searches that triggered paid Search ads and their outcomes | Meta audience eligibility |
| Meta Ads Manager | Meta audience and creative delivery combinations that produce handoffs | Google search phrases or Google search volume |

## Required access

- A Google Ads account with billing configured for Keyword Planner.
- Search Console access to the Leisure Life property, if it is verified.
- No new Google Search spend is required for the initial research pass.
- A Google Search pilot requires operator approval, a defined budget, and the
  booking-handoff measurement from the CBAT reconciliation amendment.

## Exact research workflow

### 1. Start with real CB inventory

Use CB/Odysseus inventory and promotion intelligence to construct a seed list.
Every seed is tied to a real package or a real inventory family. Examples:

- `alaska cruise may 2027`
- `royal caribbean february cruise`
- `caribbean cruise with drink package`
- `oceania caribbean cruise november`
- `cruise from miami for couples`

Do not begin with a viral phrase or an invented niche if a real package cannot
satisfy it. Preserve cruise line, ship, sail date/range, departure port, and
promotion context with each seed.

### 2. Run Keyword Planner in the target market

For each seed set, use both Keyword Planner modes:

1. `Discover new keywords` to collect related phrases.
2. `Get search volume and forecasts` for the selected exact phrase list.

Set the intended geography, language, network, and date window. Export each
phrase's average monthly searches, three-month trend, year-over-year change
when available, competition, and top-of-page bid range. Record whether a value
is an estimate or a range. Never label it an exact count unless Google supplied
one for the account.

### 3. Use Google Trends only as a seasonal check

Compare the strongest phrase candidates in the intended geography over a
multi-year window. Record the seasonal peak, current direction, and related
queries/topics. A Trends score is relative to the selected comparison and date
range; it is never stored as search volume.

### 4. Add first-party Search Console evidence

Export Queries and Pages performance data for the same market/date period.
Keep impressions, clicks, average position, and landing page. Favor phrases
that already reach a relevant Leisure Life page but have weak click-through or
a poor landing/CTA match; those are concrete page-improvement candidates.

### 5. Select an intent cluster

An approved cluster contains:

```text
cluster label and job to be done
exact query phrases and source rows
target geography and seasonality evidence
package/promotion candidate and factual constraints
landing-page promise required by the phrase
Meta creative and supported-targeting translation
```

Initial selection favors clear transaction intent, meaningful estimated demand,
commercial signal, a real package fit, and an applicable promotion. A
high-volume phrase with no credible package is held. A beautiful package with
no demand evidence is not promoted as search-led.

### 6. Translate, do not copy, into Meta

```text
Google phrase: "oceania caribbean cruise november"
  -> intent: experienced travelers seeking a quieter November Caribbean route
  -> page proof: real ship, sail date, ports, cabin-price basis, promo terms
  -> Meta: approved cruise/travel interests, appropriate geography, creative
     focused on the November itinerary and value proof
```

The phrase remains in internal provenance, copy planning, and UTM metadata. It
is not represented as an exact Meta targeting capability.

## When a Google Search pilot is warranted

After research identifies 3-5 high-confidence clusters, a narrow Search pilot
can answer what Planner cannot: which actual paid queries create a booking
handoff and CBAT-confirmed booking.

Use only real inventory-backed landing pages. Keep keyword match choices,
negative keywords, geography, budget, and conversion definition reviewable.
The authoritative outcome sequence is:

```text
Google query -> ad click -> landing view -> booking handoff -> CBAT confirmed
```

The Search terms report becomes the strongest future evidence source because it
reports actual searches that triggered paid ads. Do not scale a term merely for
clicks; require booking-handoff quality and, when the observation window allows,
CBAT confirmation.

## Import contract for the Deals Workbench

The initial Workbench input can be a reviewed CSV export rather than a live API
integration. Each row requires:

| Field | Required |
| --- | --- |
| exact query phrase | Yes |
| source and export date | Yes |
| market and language | Yes |
| date window | Yes |
| demand/trend metrics with units | Yes when supplied by source |
| source URL, campaign, or report reference | Yes |
| linked deal/package candidate | Added before approval |

Parse structured exports without regex-based code. Use typed CSV handling or an
approved AI extraction workflow consistent with repository policy.

## Pilot deliverable

Produce a reviewed table of 20-50 exact query phrases, grouped into 3-5 intent
clusters. Each selected cluster needs a real CB-backed Deal candidate, promotion
applicability result, landing-page requirement, and Meta translation. Only the
top three proceed to paused Meta drafts or an operator-approved Google Search
test.
