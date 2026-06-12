# Deal Page — Implementation Plan (master template `/deals/[id]`)

**Source of truth:** Claude Design handoff `Deal Page.dc.html` (project `LLI-Deal-Page`),
exported 2026-06-12. The design is the production master template for the public
post-ad landing page. This plan translates that prototype into the real Next.js
`/deals/[id]` route, fully wired to live data.

Status: **DONE** (2026-06-12). Full wiring shipped: projection extended, synthesis
loaded by id, premium component built pixel-faithful to the design, route wired,
tests added. `tsc` clean, `next build` clean (117/117), `test:deals-system:all` 14
suites green (public-deal-projection 39 incl. resolved + draft designPage assertions).
Scope chosen by operator: **Full wiring** (component + projection extension + route).

### As-built files
- `lib/cb/deals-system/public-deal-projection.ts` — `DealLandingPageView` type +
  `buildDealLandingPageView(deal, synthesis)`; `projectPublicDealPage(deal, synthesis?)`
  now attaches `designPage`. Resolves hero/segment images from the synthesis candidate
  pool by id; resolved/draft derived from presence of ship+sailDate+cabinPrices; no
  fabricated facts (draft → "confirmed at booking" strings).
- `lib/cb/deals-system/public-deals.ts` — `getPublicDealPageById` loads the funnel
  synthesis (by `dealId`/`id`) resiliently and passes it to the projection.
- `components/cb/deal-landing-page.tsx` — server component, pixel-faithful: hero,
  fact band, five alternating segments, itinerary (days/ports), pricing (table/draft),
  specials, CTA band, footer. Tokens verbatim (Cormorant Garamond + Source Sans 3,
  cream/navy/gold). `next/image` for hero (priority) + segments (lazy, 4/3).
- `components/cb/deal-landing-page-enhancements.tsx` — `"use client"`: Google-fonts
  injection, fade-up reveal (IO, visible fallback), sticky mobile CTA bar (< 820px).
- `app/(landing)/deals/[id]/page.tsx` — renders `<DealLandingPage>` when `designPage`
  is present; legacy `CuratedDealPage` fallback otherwise.
- `tests/public-deal-projection.ts` — designPage resolved + draft assertions.

### Notes / follow-ups
- The promo "specials" block currently sources from `deal.promoApplicability`
  (matchedOn → chips, assumptions → claims, warnings → qualified note). When the
  richer `DealPageFacts.promos[]` (summary/publicClaims/perks/bookingWindow) is wired
  onto the curated deal, swap the specials builder to use it for fuller perk chips +
  "book by {endsOn}". Hook point: `buildDealLandingPageView` specials map.
- Route map (`itinerary.mapPath`) is not yet rendered; add an `<Image>` of the map in
  the itinerary section when the curated deal carries it.
- A published curated deal needs a matching funnel synthesis in
  `deal-funnel-syntheses-cache.json` (keyed by dealId) to get the premium page;
  otherwise it renders the legacy layout.

---

## What the design is

A premium, mobile-first cruise deal landing page with TWO render states driven by a
single `dataState` flag in the prototype:

- **`resolved`** — real confirmed facts present (ship, exact sail date, day-by-day
  itinerary, cabin price table, from-price).
- **`draft`** — manifest not yet resolved; ship/date/pricing unknown → graceful
  "confirmed at booking" fallbacks, named-ports-only itinerary, no invented numbers.

This maps 1:1 to `DealPageFacts.readiness` (`"resolved" | "draft"`) which already exists
in `lib/cb/deals-system/deal-page-facts.ts`.

### Section order (top → bottom), all from the design
1. **Hero** — full-bleed hero image + dark gradient; eyebrow (cruiseLine · itineraryName),
   `heroHeadline`, `heroSubhead`, primary CTA ("Check Availability"), from-price
   (resolved) or "Fares & dates confirmed at booking" (draft), pill chips
   (ship/nights/sail-date/route resolved; itinerary-type/all-inclusive/draft-note draft).
   min-height 88vh, image `object-fit:cover`.
2. **Trust / fact band** — white strip. Resolved: Cruise Line · Ship · Departs From ·
   Sail Date · Length. Draft: Itinerary · Ports of Call · Ship (confirmed at booking) ·
   Sail Date (confirmed at booking). `grid auto-fit minmax(160px,1fr)`.
3. **Five segment blocks** — Cabins → Lounges → Atrium → Dining → Excursions, in THIS
   order. Each = image + `heading` + `body` paragraph. Alternate image side L/R/L/R/L on
   desktop (`direction:rtl` trick), stack on mobile. Number eyebrow 01–05 + gold rule.
   Images are the per-segment operator picks (`segment.imageId` → candidate `imageUrl`).
4. **Itinerary** — "The Route" / "Every stop, in order". Resolved: full day list
   (Day N → port or "At sea", with at-sea days styled italic Cormorant). Draft: named
   ports only + "Full day-by-day itinerary confirmed at booking".
5. **Pricing** — "Choose your cabin". Resolved: table Inside (lead fare, highlighted) /
   Ocean View / Balcony / Suite + "from $X", footnote "USD · per person, double
   occupancy · taxes & fees confirmed at booking". Draft: clean "fares confirmed live"
   block, NO invented number. CTA below.
6. **Specials / what's included** — "The Offer". Per promo: kicker, title, summary, perk
   chips (% off, $ savings, onboard credit, free-guest), bullet list of public claims,
   "Offer valid for bookings by {bookingWindow.endsOn}" + qualified-claims line.
7. **CTA block** — dark band, big serif line, primary CTA, secondary CTAs (email page,
   request callback).
8. **Footer** — minimal, "confirmed at booking" line + repeat CTA.
9. **Sticky mobile CTA bar** — fixed bottom, from-price (resolved) / "Confirmed at
   booking" (draft) + Check Availability button. Only < 820px.

### Design tokens (extract verbatim from the prototype)
- Fonts: **Cormorant Garamond** (display, 500/600/700) + **Source Sans 3** (body, 400/600),
  via Google Fonts.
- Colors: bg `#FAF7F2`, text `#1A2530`, deep navy `#0F3042` (primary), darker navy
  `#0B2433`/`#0B2533`, hero overlay navy `#081721`, surface white `#FFFFFF`, border
  `#E8E1D5`, gold accents `#8C6A3C`/`#C9B286`/`#D9BC8C`, muted `#5B6873`/`#9AA4AC`,
  cream button `#F5EFE6`, price-row highlight `#F4ECDD`, chip text `#6B5128`.
- Radius: 3–4px. Container max-width: **1160px** (segments/bands), 760px (pricing/specials).
- Type scale: h1 `clamp(36px,5.5vw,64px)`, h2 `clamp(28px,3.4vw,42px)`, body 17px/1.6.
- Motion: section reveal **fade-up 600ms cubic-bezier(0.22,1,0.36,1)** on
  `[data-reveal]` blocks below the fold (IntersectionObserver; visible fallback).

---

## Data wiring (the "full wiring" part)

### Inputs available in the codebase
- **`DealPageFacts`** (`deal-page-facts.ts`, `assembleDealPageFacts`) — readiness,
  cruiseLine, shipName/shipClassHint, itineraryName, destination, nights,
  sailDateIso/sailWindow, departurePort, portsOfCall[], `itinerary` (durationNights,
  dep/arr codes, portsOfCall, mapPath), `cabinPricing` (inside/outside/balcony/suite/
  currencyCode/leadFare), `promos[]` (title/vendor/summary/publicClaims/qualifiedClaims/
  perks/bookingWindow), promoStrategy, bookingUrl. **This is the dealFacts contract.**
- **`DealFunnelSynthesis`** (`deal-page-design-types.ts`, cache
  `deal-funnel-syntheses-cache.json`, keyed by `dealId`) — `landingPage.heroHeadline`,
  `heroSubhead`, `segments[]` (segment/heading/body/imageId), `candidates[]`
  (id→imageUrl/category/title), `galleryIds[]`, `heroImageId`. **This is the
  hero + five-segment copy + curated imagery.**
- **`CuratedOdysseusDeal`** (`curated-deal-types.ts`) — the published deal; carries
  `cruiseFacts` (cabinPrices, portsOfCall, sailDateIso, shipName), `promoApplicability`,
  `bookingUrl`, `operatorApproval`. Does **NOT** embed the synthesis — load it
  separately by `dealId`.

### Projection changes — `lib/cb/deals-system/public-deal-projection.ts`
Add to `PublicDealPage` (new optional fields, back-compat — the legacy curated page can
ignore them):
```
designPage?: {
  readiness: "resolved" | "draft";
  hero: { headline: string; subhead: string; imageUrl?: string; imageAlt?: string };
  eyebrow: string;                       // `${cruiseLine} · ${itineraryName}`
  factBand: Array<{ label: string; value: string; muted?: boolean }>;
  chips: string[];                        // hero pill chips
  fromPriceLabel?: string;                // resolved leadFare → "$1,299"
  segments: Array<{ index: string; heading: string; body: string; imageUrl?: string; imageAlt?: string }>;
  itinerary:
    | { kind: "days"; rows: Array<{ label: string; text: string; atSea?: boolean }> }
    | { kind: "ports"; ports: string[] };
  pricing:
    | { kind: "table"; rows: Array<{ label: string; price: string; lead?: boolean }>; footnote: string }
    | { kind: "draft" };
  specials: Array<{ kicker: string; title: string; summary: string; chips: string[]; claims: string[]; qualifiedNote?: string; bookByLabel?: string }>;
  ctaLabel: string;                       // copyPackage CTA or "Check Availability"
  bookingUrl: string;
}
```
- Build `designPage` by combining: (a) `assembleDealPageFacts(manifest)`-equivalent data
  already on the curated deal's `cruiseFacts` + `promoApplicability`, and (b) the loaded
  `DealFunnelSynthesis` for hero/segments/images. **Resolve images**: `heroImageId` (or
  `galleryIds[0]`) → candidate `imageUrl`; each `segment.imageId` → candidate `imageUrl`;
  use candidate `title` as alt text.
- **Resolved vs draft:** derive readiness from whether real ship/sailDate/cabinPrices are
  present on `cruiseFacts` (a published `CuratedOdysseusDeal` is normally resolved). Keep
  the draft branch for safety / future draft-publish.
- **No invented facts** (primer rule 5): when a field is absent, emit the draft fallback
  string, never a fabricated number. `textOnlyLaunchWaived` still suppresses hero image.
- `public-deals.ts` `getPublicDealPageById` must also load the synthesis cache by id and
  pass it to `projectPublicDealPage(deal, synthesis?)`.

### Component — `components/cb/deal-landing-page.tsx` (NEW)
- Server component (no client JS needed except the reveal/sticky behaviors → a tiny
  `"use client"` child or progressive-enhancement script; reveal has a visible fallback
  so SSR is fine without it).
- Renders the nine sections above purely from `PublicDealPage.designPage`. Pixel-faithful
  to the tokens. Use `next/image` for hero + segment images (explicit aspect ratios:
  hero full-bleed, segments `4/3`) to avoid layout shift; `loading="lazy"` below fold.
- AA contrast, real `alt` text from candidate titles/categories, keyboard-reachable CTAs,
  body ≥16px on mobile.
- Inject the two Google fonts via the route (next/font/google: Cormorant_Garamond +
  Source_Sans_3) rather than a `<link>`.

### Route — `app/(landing)/deals/[id]/page.tsx`
- When `getPublicDealPageById(id)` returns a page that HAS `designPage`, render the new
  `<DealLandingPage page={page} />`. Otherwise fall back to the existing `CuratedDealPage`
  / legacy detail rendering (keep both so nothing in flight breaks).

---

## Verification
1. `npx tsc --noEmit` → 0 errors.
2. `npm run test:deals-system:all` → all suites green (extend
   `tests/public-deal-projection.ts` to assert `designPage` resolved + draft shapes:
   hero/segments/images resolved from synthesis, pricing table from cabinPrices, draft
   fallbacks when fields absent, no fabricated price).
3. `next build` clean.
4. Manual: a published deal that has a funnel synthesis renders the full premium page
   (hero image, 5 segments with per-segment images, itinerary, price table, specials,
   sticky mobile CTA); a deal without resolved pricing shows draft fallbacks and never an
   invented number.

## Guardrails carried from the primer
- Broad/sophisticated, niche-agnostic; never reveal the ad's subculture.
- One primary CTA repeated; secondary CTAs low-emphasis.
- Five-segment order fixed; alternate sides desktop, stack mobile.
- No invented facts/prices/claims; qualified claims only with a qualifier.
- Mobile-first; sticky CTA; lazy images; explicit aspect ratios; AA contrast.

## Files
| File | Change |
|---|---|
| `lib/cb/deals-system/public-deal-projection.ts` | add `designPage` to `PublicDealPage` + builder (facts + synthesis + image resolution + resolved/draft) |
| `lib/cb/deals-system/public-deals.ts` | load funnel synthesis by id; pass to projection |
| `components/cb/deal-landing-page.tsx` | **NEW** pixel-faithful master-template component |
| `app/(landing)/deals/[id]/page.tsx` | render new component when `designPage` present; legacy fallback otherwise |
| `tests/public-deal-projection.ts` | assertions for `designPage` resolved + draft |

## Source bundle (for reference)
Extracted handoff at `c:\tmp\design_extract\lli-deal-page\` — `project/Deal Page.dc.html`
(the design), `chats/chat1.md` (intent), `README.md`. The prototype's placeholder
"Celebrity Apex / $1,299 / Oct 29 2026" values are SAMPLE ONLY (design author flagged
them) — never ship them; all facts come from live data.
