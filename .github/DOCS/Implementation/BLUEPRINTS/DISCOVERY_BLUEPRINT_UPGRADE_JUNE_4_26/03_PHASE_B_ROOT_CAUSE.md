# Phase B Inventory Failure — Root Cause Analysis

**Logged:** 2026-06-04
**Revised:** 2026-06-04 (corrected after re-reading the original design docs — see CORRECTION below)
**Status:** ✅✅ RESOLVED & CONFIRMED 2026-06-04 — both House-group test campaigns
(`grand-costumed-promenade-explorer`, `urban-sketchers-sea-voyage-radiance`) now resolve to
RETAIL_MULTI_BOOKING with a live retail booking link. Full end-to-end flow verified. See
"RESOLUTION CONFIRMED" at the bottom.

---

## CORRECTION TO EARLIER FRAMING

An earlier version of this doc framed the problem as "the inventory is mostly unbookable."
**That was wrong.** Re-reading the original design docs confirms House groups are an
**expected, by-design** part of CB inventory and the documented booking path for them is the
Odysseus retail fallback.

From `.github/DOCS/Implementation/GROUP_STRATEGY/DISCOVERY_INVENTORY_MATCH/README.md`:
> "House groups do not expose an agent-issued personal booking link on the detail page **by
> design** — the only bookable surface is the Odysseus retail flow with
> `hasAgGroupRate=true`. When `scrapeGroupPersonalLink()` returns null on a House group,
> **retail fallback is the correct outcome, not a scrape bug.** The campaign is written as
> `activeBookingMode: "RETAIL_MULTI_BOOKING"` and `inventoryHealth: "HEALTHY"`."

From `GROUP_CAMPAIGN_STRATEGY.md`:
> "Cruise Brothers pre-negotiates and holds hundreds of group blocks across all major cruise
> lines on behalf of its agent network. No agent-side deposit is required."

So the model is correct as the operator described it: agents book INTO CB's pre-blocked
inventory; they do NOT register their own groups. House groups are CB-owned overflow that
routes to retail. **None of this is broken.**

---

## TL;DR (corrected)

There is **one** real defect. The matcher correctly picks House groups, and Phase B
correctly detects the missing personal link and routes to the documented retail fallback.
The retail fallback is the part that's broken:

- **The Odysseus retail search ignores its filters.** It returns the same 8 Australian
  sailings (Moreton Island, Vanuatu, New Caledonia) on every call, regardless of ship,
  date, or cruise line. Because of this, the retail fallback can never find the requested
  sailing, so House-group campaigns that should resolve to `RETAIL_MULTI_BOOKING / HEALTHY`
  instead fall through to `INVENTORY_FAILED_PAUSED`.

Fix the retail search and the documented design works as intended: House groups resolve via
retail, personal-link groups resolve via their link. Rematching is NOT needed and does not
help — it was a workaround built on the wrong diagnosis.

---

## Evidence

### Personal-link path
```
[cb-inventory-scraper] Group 50178 is a House group — no personal link available.
[cb-inventory-scraper] Group 43352 is a House group — no personal link available.
[cb-inventory-scraper] Could not find Personal Link on page .../view_group/55213/   (non-House, still no link)
```
Scraped detail pages (`scripts/agent/output/cb-group-link-debug/`):
| Group | House? | Has link? | Ship |
|---|---|---|---|
| 50178 | yes | no | Explorer of the Seas |
| 50339 | yes | no | Grandeur of the Seas |
| 51020 | yes | no | Vision of the Seas |
| 52295 | yes | no | Grandeur of the Seas |
| 55173 | no | **no** | Hero of the Seas |
| 55213 | no | **no** | Hero of the Seas |

The one success in the whole run — `baseball-card-collectors-vault-at-sea` — only confirmed
because it **reused a personal link cached from a prior Phase B run** (group 43352,
package 1556883). The very same group 43352 failed as a House group for
`urban-sketchers-sea-voyage-radiance`, which had no cached link. Same group, opposite
outcomes, purely based on whether a link was already cached.

### Odysseus retail search
Every retail search — Radiance/Jan 9, Hero/Dec 11, Explorer/Jan 8 — returns the identical
8 results:
```
[0] 4-Day Moreton Island (20260715AQ04) 2026-07-15 4n
[1] 3-Day Getaway (20260807AQ03) 2026-08-07 3n
[2] 10-Day Vanuatu & New Caledonia (20260819AQ10) 2026-08-19 10n
...
```
These are Australian sailings (Brisbane/Moreton Island, Vanuatu, New Caledonia). They have
nothing to do with the requested ship or date. The search filters are not being applied.

---

## Why the Odysseus search is broken

In `lib/services/odysseus/OdysseusEngine.ts`, `searchCruises()`:

1. **Line 202 — never finished.** A literal `// TODO: Phase 2 - Implement destination,
   cruise line, and date selection` comment. The filter application was a prototype.

2. **`interceptedData` is never cleared between searches.** `searchCruises` filters the
   *entire accumulated* `interceptedData` array (line ~238) and takes "the last one." Across
   multiple campaigns in one Phase B run, and even within the page's own initial load, this
   array holds stale responses. The "8 Australian results" are almost certainly a stale
   default-page response replayed on every search.

3. **Date input set incorrectly.** The code sets a single string
   `"01/08/2027 - 02/07/2027"` into `input[data-ody-id="sailingDates"]` and dispatches
   `input`/`change`. The Odysseus calendar widget very likely ignores a raw value write and
   keeps its own internal (empty/default) date state — so the search runs unfiltered.

4. **`networkidle` race.** The result is read after `waitForLoadState('networkidle')`, which
   does not guarantee the *filtered* search XHR (vs the initial page-load XHR) is the one
   captured.

5. **Region/POS default.** With no filters applied, Odysseus returns its default inventory,
   which for this agency session defaults to Australian point-of-sale sailings.

---

## On rematching (it was a workaround built on the wrong diagnosis)

The Rematch operation (`POST /api/groups/discovery/rematch/[slug]`) was built earlier in this
session when the working theory was "this campaign is stuck on a bad group." Given the
corrected understanding, **rematch does not address the real defect** and is largely
unnecessary:
- Matching to a different House group is fine — House groups are bookable via retail by
  design. The problem is the retail search, not the group choice.
- Rematch still leaves you dependent on the same broken retail search.

There is also a **rematch ↔ Phase B disconnect** worth noting if rematch is kept: the rematch
wrote group 50187 to `grand-costumed-promenade-explorer`, but Phase B re-ranked candidates
from the cache and fetched group **50178** again (both score 100; ranking re-derives from the
cache rather than honoring the rematched group ID). If rematch is retained for any reason,
Phase B should honor the explicitly-chosen group rather than re-ranking.

Recommendation: treat rematch as deprecated once the retail search is fixed. It can stay as a
manual override but is not part of the normal flow.

---

## The one fix that matters: make the Odysseus retail search respect its filters

This is the entire unlock. Per the design docs, House groups resolve via retail — so once the
retail search actually filters by ship + date, House-group campaigns resolve to
`RETAIL_MULTI_BOOKING / HEALTHY` as intended and `INVENTORY_FAILED_PAUSED` becomes rare.

Required engine fixes in `lib/services/odysseus/OdysseusEngine.ts` `searchCruises()`:
- Clear `interceptedData` (or snapshot a baseline length) at the **start** of each
  `searchCruises` call so only the new response is read — not a stale default-page response.
- Apply the cruise-line filter via the real select2 widget and confirm it registers (read
  back the selected value).
- Apply the date filter through the calendar widget's actual interaction, not a raw value
  write; verify the chosen range is reflected in the UI before clicking Search.
- After clicking Search, wait for the **specific** results XHR that corresponds to the
  filtered request, not generic `networkidle`.
- Strongly consider calling the `nitroapi/v2/cruise` endpoint directly with the right query
  params instead of driving the UI — the intercepted URL shows the API shape, and the design
  docs note retail availability is keyed on `hasAgGroupRate=true`. A direct authenticated
  fetch is likely far more reliable than Playwright form-driving and avoids the stale-state
  and race issues entirely.

⚠️ Repo rule: Odysseus/Playwright changes must be operator-in-the-loop. Do not run the
engine autonomously. Give the operator the command and confirm before any run that touches
CB.

---

## FIX IMPLEMENTED (2026-06-04)

Operator captured the real authenticated `nitroapi/v2/cruise` request from browser devtools.
It is a **POST** with a JSON filter body, not the GET the form was producing. Contract:

```
POST https://bookings.cbagenttools.com/nitroapi/v2/cruise?...&pageSize=N&groupByItineraryId=true&...
headers: odyuserid, siteitemid, languageid, devicetype, content-type: application/json (+ session cookies)
body: { "filters": [
  { "key": "destinationType", "value": "All" },
  { "values": ["8"], "key": "cruiselineId" },         // 8 = Royal Caribbean
  { "values": ["83"], "key": "shipId" },               // optional; we omit and match in code
  { "ranges": [{ "from": "01-Jul-2026", "to": "01-Aug-2026" }], "key": "departureDateTime" }
]}
```
Date format is **DD-MMM-YYYY**.

### Changes
- **`lib/services/odysseus/OdysseusEngine.ts` → `searchCruises()` fully rewritten.** It no
  longer drives the search form. It calls the nitroapi endpoint directly via `fetch` inside
  the authenticated page context (`credentials: 'include'`, same-origin cookies). Filters:
  `destinationType=All` + `cruiselineId` (from `vendorId`) + `departureDateTime` range. Auth
  headers (`odyuserid`, `siteitemid`) are read **dynamically** from the `ODY_UserInfo` and
  `odysseus-siid` cookies — not hardcoded. Added `toApiDate()` (MM/DD/YYYY → DD-MMM-YYYY).
  - We deliberately do NOT send `shipId` — filtering by cruise line + date and then matching
    the exact ship/date in `findMatchingOdysseusResult` avoids maintaining a ship-ID map.
  - This eliminates all four original bugs at once: stale `interceptedData`, the date widget
    that ignored raw writes, the `networkidle` race, and the never-finished filter TODO.
- **`scripts/run-phase-b.ts`** retail window changed from `start → +30d` to a ±7-day window
  centered on the actual sail date, so the API returns the target sailing tightly.
- **esbuild `__name` guard.** tsx/esbuild injects a `__name()` helper that leaked into the
  serialized `page.evaluate` body → `ReferenceError: __name is not defined` on first run.
  Fixed two ways: (1) `context.addInitScript` stubs `window.__name` for future navigations;
  (2) a string-form `page.evaluate("window.__name = window.__name || ...")` runs immediately
  before the main evaluate to cover the already-navigated current document. (Same class of
  issue the cb-inventory-scraper already worked around.)

### Iteration log
1. **Run 1 — `__name` ReferenceError.** The in-page `fetch` evaluate body carried an esbuild
   `__name` reference that broke in the browser. Confirmed the personal-link path works:
   a fresh CB re-scrape pulled **105** items (up from 60) and
   `speedcubers-maritime-meetup-hero` → **CONFIRMED** via a real personal link (Navigator of
   the Seas, group 53432). Fixed the `__name` issue.
2. **Run 2 — HTTP 401.** The `__name` error was gone and the search fired cleanly, but the
   reconstructed `fetch` returned **401 Unauthorized**. Root cause: the saved
   `.playwright-state.json` holds only `www.cbagenttools.com` cookies — **none** of the
   `bookings.cbagenttools.com` Odysseus tokens (`Ody_Session_Token`, `ASP.NET_SessionId`,
   `ODY_UserInfo`, `odysseus-siid`, etc.). The page acquires those at runtime on navigation,
   but the manually-built `fetch` headers (`odyuserid`/`siteitemid` read from cookies that
   weren't readable) plus the missing `uniquetid` weren't enough to authenticate.

3. **Run 3 — still 401 with reconstructed headers; switched to header replay.** The
   manually-built header set wasn't enough. Fix: a `page.on('request')` listener captures the
   exact headers from a real `/nitroapi/v2/cruise` XHR the SPA fires
   (`lastCruiseRequestHeaders`); `ensureCruiseRequestHeaders()` reloads the page to trigger one
   if needed. The captured set includes `uniquetid`, `siteitemid`, `languageid`, `devicetype`,
   etc. The search runs as an **in-page `fetch`** (so live `bookings.cbagenttools.com` session
   cookies attach natively — those are NOT in `.playwright-state.json`, only acquired at
   runtime) with the captured headers merged in. → **401 resolved; search returned 50 real,
   correctly-dated RCL sailings.**
4. **Run 4 — match succeeded but itinerary selection timed out.** The matcher hit exact
   `0d gap` matches, but `selectItinerary(index)` tried to click the Nth on-screen "Book"
   button — and the direct-API search renders no result buttons, so the click timed out. Two
   fixes:
   - **Proximity matching.** `findMatchingOdysseusResult` rewritten from exact-bullseye
     (date===date AND nights===nights, hard-reject otherwise) to **closest sailing within
     ±3 days**, preferring matching nights when known. CB House-group dates are approximate
     and often carry no night count, so the bullseye rejected real same-voyage sailings.
   - **`selectItineraryByResult(result)`.** New engine method that navigates DIRECTLY to the
     matched package URL (`/swift/cruise/package/{packages[0].id}?siid=...`) instead of
     clicking a rendered button. `bypassGuestInfoAndContinue()` then reads the PID from
     `page.url()` unchanged.
   - **Vendor propagation.** Added `vendor` to `CampaignInventoryCandidate` and populated it
     in `rankGroupInventoryCandidates`, so the retail fallback's `CbInventoryMatch.vendor` is
     set and the search scopes to `cruiselineId: 8` (RCL) instead of returning all cruise
     lines (which risked matching a Carnival sailing to an RCL campaign).

---

## ✅ RESOLUTION CONFIRMED (2026-06-04)

Both House-group test campaigns resolved end-to-end:

```
Retail match: Explorer of the Seas expected 2027-01-08 -> 2027-01-08 (3n) [0d gap]
  Navigating directly to package 1654849 ... → ✅ Odysseus retail link: .../details.aspx?...pid=1654849...
Retail match: Radiance of the Seas expected 2027-01-09 (7n) -> 2027-01-09 (7n) [0d gap, nights match]
  Navigating directly to package 1575801 ... → ✅ Odysseus retail link: .../details.aspx?...pid=1575801...

Done. 0 confirmed, 0 backup-promoted, 2 retail-fallback, 0 expired, 0 failed validation.
[RETAIL_MULTI_BOOKING] grand-costumed-promenade-explorer: Explorer of the Seas — retail fallback + retail link
[RETAIL_MULTI_BOOKING] urban-sketchers-sea-voyage-radiance:  Radiance of the Seas — retail fallback + retail link
```

### Final shipped state of the Odysseus retail path
1. `searchCruises()` → direct nitroapi POST, in-page fetch, captured SPA headers, vendor +
   date-range filters. Returns ~50 real sailings.
2. `findMatchingOdysseusResult()` → proximity match (±3 days, prefer nights) → exact matches.
3. `selectItineraryByResult()` → navigates to the package URL by package id.
4. `bypassGuestInfoAndContinue()` → reads PID from URL, constructs details.aspx, extracts the
   share/booking link. Unchanged.
5. `run-phase-b` validates the link and persists `RETAIL_MULTI_BOOKING / HEALTHY`.

### Files changed (this whole effort)
- `lib/services/odysseus/OdysseusEngine.ts` — direct-API `searchCruises`, header capture
  (`lastCruiseRequestHeaders`/`ensureCruiseRequestHeaders`), `toApiDate`,
  `selectItineraryByResult`, `__name` init-script guard.
- `lib/campaigns/cb-inventory-matcher.ts` — `vendor` on `CbInventoryMatch` + candidate; UTC
  date fixes.
- `lib/campaigns/types.ts` — `vendor` on `CampaignInventoryCandidate`.
- `scripts/run-phase-b.ts` — UTC `normalizeDateKey`, proximity `findMatchingOdysseusResult`,
  ±7-day centered search window, `selectItineraryByResult` call, House-group early-exit,
  vendor-scoped search, diagnostics.
- `scripts/run-phase-b-from-cache.ts` — UTC `normalizeDateKey`.
- `scripts/cb-inventory-scraper.ts` — `PersonalLinkResult` / House-group detection.
- `app/api/groups/campaign/[slug]/route.ts` — return inventory-health + seed/archive fields
  (fixes badges resetting to "Needs Phase B" on reload).

### Known cosmetic note (not a bug to fix here)
CB's own `shareToClipboard` field returns a link with a double slash (`/web//cruises/...`).
This is CB-generated and still resolves; left as-is.

---

## Secondary (optional) cleanups, not blockers
- The discovery matcher picking House groups is **correct** — do NOT exclude them. They are
  valid inventory that books via retail.
- The "needs Phase B / link confirmed / retail confirmed / link failed" badge work from
  earlier this session is still useful and accurate; keep it.

---

## Confirmed facts from the design docs (so future-me doesn't re-litigate)
- CB pre-blocks hundreds of groups for the agent network at no agent cost. Agents book INTO
  this inventory; they do NOT register their own groups. (Formstack is fallback-only for
  custom external blocks.)
- `view_groups/?price_advantage=on` intentionally mixes agent-claimed groups (with personal
  links) and House groups (retail-only). Both are valid.
- House group + null personal link → retail fallback is the **correct** outcome.
- The minimum cabin threshold gates the tour-conductor credit, NOT bookability. Guests can
  always book.

---

## Related docs
- `02_INVENTORY_MATCH_ARCHITECTURE_REVIEW.md` — the two-step match redundancy question.
  These are related: if retail is the real booking path for a large share of inventory, the
  Phase A "match" is even less meaningful and the case for collapsing to one step gets
  stronger.
- `.github/DOCS/Implementation/GROUP_STRATEGY/DISCOVERY_INVENTORY_MATCH/README.md` — the
  authoritative description of House groups + retail fallback being by-design.
- `.github/DOCS/Implementation/GROUP_STRATEGY/GROUP_CAMPAIGN_STRATEGY.md` — the pre-blocked
  inventory model.
