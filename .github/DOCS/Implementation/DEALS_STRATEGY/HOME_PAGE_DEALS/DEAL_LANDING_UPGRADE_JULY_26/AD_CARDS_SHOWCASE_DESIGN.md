# Deal Page Ad-Cards Showcase (July 2026)

> Status: **Implemented.** Authored 2026-07-02. Closes the gap between the Step 8
> Meta ad-carousel images and the public Deal Page: those 4 generated images
> previously existed only in a local JSON cache and a lab UI, never reaching a
> real visitor. This doc is the design brief AND the as-built reference.

## Why this exists

The operator's complaint: paid ad campaigns run a 4-card Meta carousel per deal
(real generated flyer art, punchy hyper-niche headlines), but click-through to
the public `/deals/[id]` page converts at effectively 0%. Investigation found
the ad system and the landing page were **two disconnected systems**:

- `DealFunnelSynthesis.carousel` (Step 7) holds the 4 cards' copy.
- `DealMetaAdSynthesis` (Step 8) generates one square image per card via
  `gpt_image_2`, keyed correctly to the real `dealId`.
- Nothing on the public page ever read Step 8's output. The hero image comes
  only from Step 7's SERP-sourced gallery. A visitor who clicked "The Milestone
  Sailing, Sorted" landed on a page that had never heard of a milestone.

## Design constraint (operator direction)

The ship hero stays **exactly as it is** — real vessel photo, full-bleed,
untouched. It's the only asset guaranteed to exist for every deal (ad campaign
or not) and must keep carrying the page alone when no Step 8 synthesis exists.
The 4 ad-card images get their **own** section/placement, sized so all four
survive intact — never cropped down to a single "featured" image with the rest
demoted to thumbnails.

## Six layout concepts explored

Brainstormed as a design pitch (see the design brief in the AI conversation
this doc was authored from) before any code was written:

1. **Quilt panel** — even 2×2 grid (4-across on desktop), all cards native
   square, headline captioned per card. ✅ Selected.
2. **Filmstrip** — dark scroll-snap strip below the hero, frame counters.
3. **Corner fan** — fanned stack tucked into the hero's empty bottom-right
   corner, tap-to-expand into the quilt. ✅ Selected.
4. **Disclosure strip** — quilt behind a collapsed "4 ways this sailing gets
   sold" toggle.
5. **Four-tab spotlight** — short tab labels switch one large image. ✅ Selected.
6. **Editorial mosaic** — one lead card large, three stacked smaller beside it.

Operator picked **1 (quilt), 5 (tab-spotlight), and 6 (editorial mosaic)** and
asked for all three to be built, selected **at random per deal** so campaigns
running concurrently read as intentionally varied rather than templated —
"nuance per campaign is a plus for the brand."

> **Correction (2026-07-02, later same day):** the first implementation pass
> mistakenly built concept 3 (corner fan) instead of concept 6 (editorial
> mosaic) — a numbering mixup between the two design-pitch artifacts (the
> second pitch renumbered the six concepts). Caught and fixed same day; the
> corner-fan component was removed entirely and replaced with the editorial
> mosaic before anything shipped further downstream of the layout picker.

### Randomness is deterministic per deal, not per page load

A deal's assigned layout is a hash of its `dealId` (`pickAdCardsLayout` in
`public-deal-projection.ts`), not `Math.random()`. This means:

- The same deal always renders the same layout across visits and deploys — no
  flicker/inconsistency for a visitor who returns or for the operator reviewing
  a live page.
- Different deals in the same campaign wave land on different layouts, purely
  because their ids hash differently — the "nuance per campaign" the operator
  wants, without a random layout jumping around on refresh.

## Desktop verification (done before implementation, per operator instruction)

Checked all three layouts' CSS math at 1440px before writing component code:

- **Quilt**: `grid-template-columns: repeat(auto-fit, minmax(min(100%,240px),1fr))`
  — the same reflow technique already used by the five-segment section — yields
  a clean 4-across row at desktop widths and 2×2 on mobile, no changes needed.
- **Tab spotlight**: the spotlight image is capped at `max-width: 640` inside
  the `1160`-wide section, so it doesn't stretch into an oversized single image
  on very wide screens.
- **Editorial mosaic**: lead card grid column is `minmax(min(100%,420px),1fr)`
  (≈55% width at desktop, full width on mobile) beside a smaller `minmax(min(
  100%,150px),1fr)` grid for the remaining cards — mirrors the five-segment
  section's existing `auto-fit` reflow convention, so it collapses to a single
  stacked column on narrow screens without a dedicated breakpoint.

## What was built

### Types (`lib/cb/deals-system/public-deal-projection.ts`)

- `DealAdCardView` — `{ headline, imageUrl }`, the only two fields projected
  from a `DealMetaAdCard` (never `primaryText`, `promptUsed`, or generator
  internals — same public-safety discipline as the rest of this file).
- `DealAdCardsLayout` — `"quilt" | "tab-spotlight" | "editorial-mosaic"`.
- `DealLandingPageView.adCards?: { layout, cards }` — new optional field,
  following the same "absent means don't render" pattern already used for
  `designPage` itself.
- `pickAdCardsLayout(dealId)` — deterministic hash → one of the 3 layouts.
- `buildAdCardsShowcase(dealId, metaAdSynthesis)` — filters to `status ===
  "ready"` cards only (a pending/errored card is silently omitted, never shown
  as a placeholder), sorts by `cardIndex`, and requires **at least 2** ready
  cards before the section mounts at all (a single stray image doesn't read as
  "the campaign").

`buildDealLandingPageView` and `projectPublicDealPage` both gained an optional
trailing `metaAdSynthesis?: DealMetaAdSynthesis` parameter, threaded straight
through — no behavior changes for existing callers that omit it.

### Production wiring (`lib/cb/deals-system/public-deals.ts`)

Previously, **Step 8 (`DealMetaAdSynthesis`) had no Dynamo presence at all** —
only the funnel synthesis (Step 7), curated deals, trip manifests, and promo
records were mirrored from the lab's local JSON caches into
`lll-deals-system` Dynamo, which is the only store the public site reads
(see [[deals-live-store-is-dynamo]]). Closing the loop required:

- `deals-dynamo-store.ts` — added `getDealMetaAdSynthesis` /
  `listDealMetaAdSyntheses` / `upsertDealMetaAdSynthesisRecord` under a new
  `METAADSYNTH#<id>` key prefix, mirroring the `SYNTHESIS#` pattern exactly.
- `app/api/tests/deals-system/meta-ad-synthesis/route.ts` — every mutation
  (`init`, `update_prompt`, `generate_image`, `revert_image`) now also calls
  `upsertDealMetaAdSynthesisRecord` after the local-cache write, best-effort
  (a Dynamo failure logs but never blocks the operator's local workflow) —
  matching the funnel-synthesis route's existing mirror-to-Dynamo behavior.
- `public-deals.ts` — new `findDealMetaAdSynthesisForDeal` (same lookup-key
  matching as `findDealFunnelSynthesisForDeal`, since both are keyed off the
  same manifest/ad-copy trace) and `loadMetaAdSynthesisForDeal`, called from
  `getPublicDealPageById` alongside the existing funnel-synthesis and
  promo-record loads.

### Component (`components/cb/deal-ad-cards-showcase.tsx`)

- `DealAdCardsShowcase({ layout, cards })` — single entry point, renders
  whichever of the 3 layouts (`QuiltLayout`, `TabSpotlightLayout`,
  `EditorialMosaicLayout`) as a full-width section immediately below the hero.
- `EditorialMosaicLayout` — the deal's first ready card (cardIndex order)
  enlarged to a ~55%-width lead image, with the remaining cards stacked at
  full visibility beside it in a smaller grid. Mirrors the premium page's
  existing five-segment "one image, one block of copy" rhythm so it reads as
  native to the page rather than imported ad-tooling chrome.
- All three reuse the existing design tokens (`C` navy/gold/cream palette,
  Cormorant Garamond serif) inline, matching the rest of `deal-landing-page.tsx`
  — no Tailwind, consistent with that file's established convention.

### Wiring into the page (`components/cb/deal-landing-page.tsx`)

- `<DealAdCardsShowcase layout={...} cards={...} />` renders immediately after
  the hero section closes, gated on `page.adCards` being present.
- No existing hero JSX (image, headline, subhead, CTA, chips) was modified.

## Guardrails carried over

- **Never fabricate**: a card with no `imageUrl` (`pending`/`error` status) is
  filtered out, never rendered as a placeholder or broken image.
- **Public-safe only**: `primaryText` (the hyper-niche ad body copy) is never
  projected — only `headline` and `imageUrl` cross into the public view, same
  discipline as the rest of `public-deal-projection.ts`.
- **Additive, not required**: a deal with no Step 8 synthesis (or fewer than 2
  ready cards) renders exactly as it did before this change — ship hero only.

## Tests

Added to `tests/public-deal-projection.ts` (`npm run test:public-deal-projection`):

- `designPage carries adCards when 4 cards are ready`
- `adCards includes all 4 ready cards in cardIndex order`
- `adCards layout is one of the three known layouts`
- `adCards omits pending/error cards, keeping only ready ones`
- `adCards is omitted entirely when fewer than 2 cards are ready`
- `adCards is omitted when no meta ad synthesis exists for the deal`
- `adCards layout is deterministic for the same deal id`
- `adCards never leaks card primaryText (only headline + imageUrl are public)`

All 88 tests in the suite pass (80 pre-existing + 8 new). Full-project
`tsc --noEmit` is clean.

## Files touched

- `lib/cb/deals-system/deals-dynamo-store.ts` — Dynamo store functions for
  `DealMetaAdSynthesis`.
- `app/api/tests/deals-system/meta-ad-synthesis/route.ts` — mirror every
  mutation to Dynamo.
- `lib/cb/deals-system/public-deals.ts` — load + match the deal's meta ad
  synthesis, thread into the projection.
- `lib/cb/deals-system/public-deal-projection.ts` — `DealAdCardView`,
  `DealAdCardsLayout`, `pickAdCardsLayout`, `buildAdCardsShowcase`, `adCards`
  field on `DealLandingPageView`.
- `components/cb/deal-ad-cards-showcase.tsx` — new component, all 3 layouts.
- `components/cb/deal-landing-page.tsx` — wiring, hero left untouched.
- `tests/public-deal-projection.ts` — 8 new assertions.

## Open follow-ups (not built)

- The other three brainstormed layouts (filmstrip, disclosure strip, corner
  fan) were designed but not selected for this pass — left as documented
  concepts if the operator wants to expand the layout pool later.
- No UTM/ad-click matching was built — every layout shows the deal's full
  ad-card set unconditionally (to every visitor, ad-referred or not), per the
  simplified brief. A future pass could special-case "matched card first" if
  ad-click attribution data becomes available on the request.
- `meta-ad-synthesis` remains an operator-only lab tool
  (`blockInProduction()`-gated); this change only makes its **output** reach
  production once generated, not the generation UI itself.
