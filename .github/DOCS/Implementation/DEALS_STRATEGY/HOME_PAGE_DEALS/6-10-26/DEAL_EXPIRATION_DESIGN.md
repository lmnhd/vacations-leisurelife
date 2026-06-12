# Deal Expiration — Design & As-Built

**Status: DONE** (2026-06-12). Implemented, tested (public-deal-projection +
curated-deal-assembly suites green), tsc clean. No cache data was edited — add a
live deal's `expiresOnIso` manually when ready.

## Why

Promos and sailings have real end dates ("book by 06/27/2026"). A published deal must
stop appearing publicly once its offer lapses, WITHOUT a manual unpublish step and
WITHOUT breaking the thousands of deals that have no end date.

## The contract

A single optional field, `expiresOnIso?: string`, carried end-to-end. **Omitted = the
deal behaves exactly as before** (never auto-expires). Two accepted formats:

- **Date-only** (`2026-06-27`) — interpreted as **end of that day, UTC**
  (`23:59:59.999Z`). The deal stays public *through the whole day* and drops the moment
  the next UTC day begins. This is the common operator case.
- **Full ISO timestamp** (`2026-06-27T17:00:00Z`) — exact instant cutoff.

Invalid / unparseable values are treated as **no expiry** (fail-open to "never expires"),
so a malformed date can never silently hide a deal.

## Where it lives (propagation chain)

The field rides the existing assembly pipeline so it reaches the gate by the time a deal
is published:

| Layer | File | Field |
|---|---|---|
| Trip manifest (Step 2 output) | `deal-trip-manifest-types.ts` | `DealTripManifest.expiresOnIso?` |
| Unified manifest (Step 3 input) | `deal-unified-manifest-types.ts` | `DealUnifiedManifest.expiresOnIso?` |
| ↳ carried at assembly | `deal-unified-manifest-cache.ts` | `assembleDealUnifiedManifest` copies `tripManifest.expiresOnIso` |
| Curated deal (published) | `curated-deal-types.ts` | `CuratedOdysseusDeal.expiresOnIso?` |
| ↳ via manifest assembly | `deal-manifest-assembly.ts` | copies `manifest.expiresOnIso` onto the curated deal |
| ↳ via direct assembly | `curated-deal-assembly.ts` | `AssembleCuratedDealInput.expiresOnIso` → curated deal |

So whether a deal is built through the manifest→unified→curated path or assembled
directly, `expiresOnIso` lands on the `CuratedOdysseusDeal` the homepage reads.

## The gate (single source of truth)

`curated-deal-assembly.ts`:

- **`dealExpiryDate(expiresOnIso)`** — parses the field to a `Date` (date-only → end of
  day UTC; ISO → exact; invalid → `undefined`).
- **`isDealExpired(deal, now = new Date())`** — `true` only when a valid expiry exists and
  `now` is past it. No expiry → never expired.
- **`isDealHomepageEligible(deal)`** — the ONE gate every public surface uses. Now reads:
  `status === "bookable"` AND `operatorApproval === "approved"` AND `linkHealth === "valid"`
  AND **`!isDealExpired(deal)`** AND `!operatorVisibility?.hidden`.

Because the homepage tiles loader and `getPublicDealPageById` both filter through
`isDealHomepageEligible` (in `public-deals.ts`), an expired deal disappears from BOTH the
homepage grid and its own `/deals/[id]` page (→ `notFound`) automatically — no separate
unpublish action.

## Test coverage

`tests/public-deal-projection.ts`:
- `expired approved deal excluded` — `expiresOnIso: "2000-01-01"` → not eligible.
- `future-expiring approved deal included` — `expiresOnIso: "2999-01-01"` → eligible.

(Plus the existing eligibility matrix unchanged, proving omitted-field deals are
unaffected.) `tests/curated-deal-assembly.ts` covers the field threading through assembly.

## Operator usage

To expire the current Sea-Days deal at the end of its promo window, set on the curated
deal (or its source trip manifest, which propagates forward):

```json
"expiresOnIso": "2026-06-27"
```

It stays live through June 27 UTC, then the gate drops it on June 28. No cache data was
pre-edited — apply this when you want the cutoff active.

## Guarantees

- **Back-compat:** no field → identical behavior to before (no expiry).
- **Fail-open:** invalid value → treated as no expiry (never hides a deal by accident).
- **Single gate:** expiry is enforced only in `isDealHomepageEligible`; never re-derive
  the rule inline elsewhere.
- **UTC-stable:** date-only end-of-day is computed in UTC so the cutoff is deterministic
  regardless of server timezone.
