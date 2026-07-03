# Itinerary Calendar Data Gaps (deal 1543052 investigation)

> Status: **RESOLVED.** Authored 2026-07-03, resolved same day. Deal 1543052
> (Celebrity Edge, Dawes Glacier, Seattle RT, sail 2026-07-24) rendered the
> plain day list instead of the month calendar. Root cause found, guardrails
> shipped, and — the structural fix — the pipeline now captures itinerary,
> pricing, and identity from the deal's OWN package page (stable packageId)
> instead of depending on the search index re-finding the sailing. The
> "sailing left inventory" conclusion below was WRONG: the sailing was fully
> bookable the whole time; the search index simply failed to return it. See
> "Package-page-first capture" below for the as-built fix.

## Why the calendar didn't render

The premium page's `ItineraryCalendar` only renders when itinerary rows carry
real `dateIso` values, which requires `cruiseFacts.dayByDayItinerary` (the real
per-day Odysseus capture) plus a sail date. Deal 1543052 has a sail date but
**no `dayByDayItinerary` at all**, so the projection falls back to deriving
"days" from the coarse ports string — no dates, no calendar.

## Why the capture never happened (the systemic gap)

Two resolve paths exist in `deal-package-resolution.ts`:

1. **Auto-select** — Odysseus lookup confidently picks `ranked.selected`, which
   gets day-by-day enrichment automatically.
2. **Ambiguous resolve** — lookup returns multiple candidates; the operator
   picks one in the workbench. That picked candidate comes back UN-enriched. A
   fallback block (`deal-package-resolution.ts` ~line 299) re-captures the
   schedule, but only if the candidate carries an `itineraryId` — otherwise it
   silently skips and writes a note into `lookupDiagnostics`.

The workbench UI only ever displayed `lookupDiagnostics` when the booking link
was missing. A deal with a healthy link but a silently-skipped itinerary capture
looked fully successful — the gap was invisible until a customer reached the
itinerary section of the live page.

## Guardrails shipped (2026-07-03)

1. **Workbench warning** (`manifestation-view.tsx`, `ResolvedPackagePanel`):
   an amber warning now renders whenever a resolved package has no
   `itinerary.dayByDay`, including the exact backfill command to run. Same
   pattern as the existing "no booking link" warning.
2. **Backfill script candidate listing** (`scripts/backfill-deal-itinerary.ts`):
   the search's full candidate list (package id, ship, sail date, nights,
   departure port, confidence, ports) is now printed so the operator can see
   what Odysseus actually returned.
3. **Backfill closest-match refusal** (same script): when the exact package id
   is not in the search results, the script now ABORTS instead of silently
   adopting the highest-ranked different sailing (which would write another
   cruise's itinerary and pricing onto the deal). Override requires an explicit
   `--accept-closest` flag, intended only for "same sailing, new package id"
   cases verified by eye against the printed candidate list. The abort throws
   (not `process.exit`) so the Odysseus session teardown in `finally` still
   runs — exiting directly would leak the automation browser.

## The 1543052 finding (why the backfill is blocked)

Dry-run on 2026-07-03 (session freshly restarted, working):

- Search window 07/17–07/31/2026, vendor 2 (Celebrity), 18 results, 8 within
  sail-date tolerance.
- **No Seattle-departure sailing among them.** The only same-date Alaska match
  is `1543075` — "7 Night Alaska Southbound Glacier", **Seward → Vancouver**
  (SWD|HBRD|JNU|SGY|ICYS|KTN|CIPU|YVR) — a different sailing entirely. The old
  script would have written that itinerary + its pricing (inside $349.50!)
  onto the Seattle RT deal.
- Conclusion: package 1543052 appears to have left Odysseus **search**
  inventory (plausible ~3 weeks before an Alaska departure). The direct
  booking link still resolves (HTTP 200, correct page title), but that's an
  app shell — actual cabin availability unverified.

## Package-page-first capture (the structural fix, built 2026-07-03)

The operator's screenshot proved the sailing was fully bookable (Outside
$2,230.67 / Balcony $2,420.67 with taxes+fees) even though search couldn't
find it — the search index re-ranks/re-windows and is unreliable at
re-finding close-in sailings, while the package page keyed by the STABLE
packageId in the booking URL keeps working for as long as the sailing sells.
Direction: pull data from the booking-page route wherever possible.

As built:

- `PackagePageSummary.itineraryId` (`lib/services/odysseus/types.ts`) — the
  package page's own API payload carries the itinerary id; the engine's
  `fetchPackagePageSummary` now extracts it.
- `capturePackagePageTruth(packageId, siid)`
  (`lib/cb/link-broker/odysseus-lookup.ts`) — one authenticated session:
  package page → identity + live cabin pricing + itineraryId →
  `fetchItineraryDetail` → normalized day-by-day. Guards: aborts on a
  sail-date mismatch between page and deal (package-id reuse protection).
- `resolveCandidateOntoManifest` (`deal-package-resolution.ts`) — when a
  picked candidate has no itinerary id (the old silent-skip), it now recovers
  it from the package page before giving up.
- `scripts/backfill-deal-itinerary.ts` — package page FIRST, search only as
  fallback (with the candidate listing + `--accept-closest` guard from
  earlier the same day).

Proof: the backfill for 1543052 captured the correct Seattle RT schedule
(itinerary 479899, 10 day nodes, Seattle → Ketchikan → Endicott Arm & Dawes
Glacier → Skagway → Victoria → Seattle) + live pricing (outside $1,884.50 /
balcony $2,074.50 base fares) and the calendar now renders on /deals/1543052.
Verified in-browser at mobile width.

## Related gaps fixed the same day

1. **Expiry past the sail date** — `capExpiryAtSailDate` now caps every
   assembly's expiry at the sail date; `hasDealSailed` added to
   `isDealHomepageEligible` so legacy deals with too-long stored expiries
   still drop off the homepage once their ship departs. One-time sweep run
   against live Dynamo: 2 records capped (both for package 1543052:
   2026-09-22 → 2026-07-24), 3 already fine.
2. **Coarse fallback mislabeled days** — with no day-by-day data, the
   fallback derived "Day N" labels from the ports string (which mixes in
   region names), so a 7-night sailing showed "Day 10". Now labeled
   "Stop N" (`public-deal-projection.ts`) — never a fabricated day count.

## Test coverage

`tests/curated-deal-assembly.ts` (+6): expiry-cap both directions,
`hasDealSailed` boundary at end-of-sail-date, missing-sail-date never counts
as sailed, sailed deal ineligible despite far-future expiry. All suites green
(assembly 52, projection 95, manifestation 25); `tsc --noEmit` clean.
