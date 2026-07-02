# Occasion Wrapper Campaigns - Implementation Plan

## Purpose

Add a wrapper campaign layer above atomic retail Deals so date-based marketing angles, such as anniversaries, birthdays, honeymoons, retirement trips, and seasonal celebrations, can reach a broad audience without depending on one exact sailing date.

The core flaw this solves:

- A single anniversary sailing is emotionally specific but audience-narrow.
- Most prospects do not share the same anniversary month, departure window, budget, airport, or trip length.
- Date-based campaigns need a curated calendar of options, not one package pretending to fit everyone.

The desired product surface is:

> Hand-selected seasonal anniversary voyages, optimized by month, destination, price, promotion, and travel mood.

## Design Principle

Do not replace the existing Deal system.

Build a wrapper/composition layer that curates multiple existing Deal records into one occasion-led campaign.

Atomic Deals remain responsible for:

- real Odysseus package facts
- booking link health
- cabin pricing
- promotion handoff
- promo-aware copy
- package-level selling points
- verified booking CTA
- approval and homepage eligibility

Wrapper Campaigns become responsible for:

- occasion theme
- monthly or seasonal slotting
- candidate discovery across a planning horizon
- seasonal scoring
- package comparison
- umbrella copy
- one-page collection landing experience
- distribution angle
- operator approval of the collection

## Vocabulary

### Atomic Deal

One real cruise package or sailing, represented by the existing Deals pipeline and records.

In wrapper campaigns, the atomic Deal does not need its own public detail page by default. It can be used as a verified package data source that renders as an in-page option on the wrapper landing page.

Example:

- Celebrity Ascent
- Package `1557108`
- 10 Night Ultimate Southern Caribbean
- November 13, 2026

### Wrapper Campaign

A marketing campaign that groups many atomic Deals under a broader occasion or seasonal promise.

Example:

- `anniversary-voyages-2026-2027`
- "Hand-Selected Anniversary Voyages"
- Monthly slots from September 2026 through August 2027

### Wrapper Slot

One month, season, budget tier, destination tier, or traveler-fit lane inside the wrapper campaign.

Example monthly slots:

- September 2026: best late-summer premium pick
- October 2026: Mediterranean or shoulder-season romance pick
- November 2026: Southern Caribbean premium pick
- January 2027: winter warmth value pick

### Slot Candidate

One candidate package considered for a wrapper slot before operator approval.

Each slot candidate should carry:

- package id
- ship
- cruise line
- sail date
- nights
- departure port
- itinerary summary
- cabin pricing
- available promo intelligence
- source and lookup provenance
- seasonal fit score
- price/deal score
- romance or occasion fit score
- operational warnings

## Example Product

### Campaign

`anniversary-voyages-2026-2027`

### Public Positioning

Hand-selected anniversary cruises matched to the season you celebrate.

### Customer Promise

Instead of forcing couples into one sailing, Leisure Life curates a rolling calendar of celebration-ready voyages, with each month matched to the destinations, ships, promotions, and weather patterns that make the most sense.

### Sales Angles

- "Your anniversary deserves the right voyage, not just any sailing."
- "Celebrate in the month that belongs to you."
- "Seasonally matched cruises for milestone moments."
- "A better way to plan the trip you keep postponing."

## Why This Belongs Above Deals

Wrapper logic should not be pushed into every Deal record.

Reasons:

- A Deal can be useful in several wrapper campaigns.
- Occasion logic changes faster than cruise package truth.
- Seasonal scoring is comparative, not intrinsic to one package.
- Approval needs to happen at both levels: each Deal and the final collection.
- Distribution may promote the wrapper campaign first, then route users to a specific monthly slot.

Recommended mental model:

```text
Wrapper Campaign
  contains Wrapper Slots
    contains candidate atomic Deals
      each candidate maps to existing Deal pipeline artifacts
```

## Proposed Data Model

Use DynamoDB through the existing Deals system store conventions.

Recommended record families in `lll-deals-system`:

```text
WRAPPER#<wrapperId> / METADATA
WRAPPER#<wrapperId> / SLOT#<slotId>
WRAPPER#<wrapperId> / CANDIDATE#<slotId>#<packageId>
WRAPPER#<wrapperId> / COPY#UMBRELLA
WRAPPER#<wrapperId> / MEDIA#PLAN
WRAPPER#<wrapperId> / APPROVAL
```

This keeps wrapper records near Deals without turning every atomic Deal into a campaign calendar.

### Wrapper Metadata

Suggested fields:

- `wrapperId`
- `title`
- `occasionType`
- `status`
- `planningHorizonStart`
- `planningHorizonEnd`
- `audience`
- `market`
- `budgetBands`
- `departureRegions`
- `seasonalStrategy`
- `createdAtIso`
- `updatedAtIso`
- `createdBy`

Example status values:

- `draft`
- `candidate_search_ready`
- `slots_ready`
- `copy_ready`
- `media_ready`
- `needs_review`
- `approved`
- `published`
- `retired`

### Wrapper Slot

Suggested fields:

- `slotId`
- `month`
- `season`
- `label`
- `slotStrategy`
- `targetTravelMood`
- `preferredDestinations`
- `preferredLines`
- `priceBand`
- `minimumNights`
- `maximumNights`
- `selectedCandidateId`
- `approvalStatus`
- `operatorNotes`

Example slot labels:

- `2026-09-late-summer-romance`
- `2026-10-mediterranean-shoulder-season`
- `2026-11-premium-southern-caribbean`
- `2027-01-winter-warmth-value`

### Slot Candidate

Suggested fields:

- `candidateId`
- `slotId`
- `packageId`
- `dealId`
- `cruiseLine`
- `shipName`
- `sailDateIso`
- `nights`
- `departurePortCode`
- `itinerary`
- `cabinPricing`
- `promotionBriefs`
- `scores`
- `warnings`
- `lookupDiagnostics`
- `source`
- `selected`

Recommended score object:

```text
scores:
  seasonalFit
  occasionFit
  priceValue
  promoStrength
  destinationAppeal
  shipFit
  departureConvenience
  overall
```

## Scoring Strategy

The wrapper system should score candidates comparatively inside each slot.

### Anniversary Scoring Inputs

- Month and likely weather fit.
- Destination romance and visual appeal.
- Ship atmosphere: premium, quiet, modern, special occasion friendly.
- Cruise length: 5 to 11 nights preferred for most anniversary travelers.
- Departure convenience: Florida ports usually easier for broad US targeting.
- Cabin pricing, especially balcony and suite deltas.
- Active or likely-applicable promotions.
- Whether the package can support broad ad copy without risky claims.
- Whether ports offer strong couple-friendly imagery and excursions.

### Seasonal Heuristics

Suggested first-pass seasonal rules:

- September: Alaska shoulder-season endings, Bermuda, Canada/New England, Mediterranean shoulder season, or value Caribbean.
- October: Mediterranean, Greek Isles, Italy/Croatia, Bermuda, repositioning only if the trip is still romantic and practical.
- November: Southern Caribbean, ABC islands, premium Caribbean, Panama Canal if value is strong.
- December: holiday pricing caution; prioritize early December or special holiday luxury only.
- January: winter warmth, Southern Caribbean, Eastern Caribbean, Mexico, Panama Canal.
- February: Valentine's-adjacent Caribbean, ABC islands, San Juan, St. Thomas, St. Lucia.
- March: spring warmth, Southern Caribbean, Mexico, early Europe only if compelling.
- April: Mediterranean shoulder season, transatlantic only for longer-trip audiences, Caribbean value if still strong.
- May: Mediterranean, Alaska opening season, Bermuda.
- June: Alaska, Mediterranean, Bermuda, Northern Europe.
- July: Alaska, Europe, Bermuda, avoid overheated Caribbean value traps unless pricing is exceptional.
- August: Alaska, Northern Europe, Mediterranean luxury, late-summer Bermuda.

These rules should be editable operator guidance, not hidden constants.

## Public UX Concept

The public wrapper page should be the primary customer experience. Do not assume each ship/sailing needs a separate public Deal page.

The page should let the user choose their anniversary month, then display a curated set of real cruise options for that month with enough package truth, selling copy, imagery, and CTA clarity to act immediately.

Each option should link directly to the verified booking path or CTA flow for that specific sailing.

The public wrapper page should not look like a generic deals grid.

Recommended structure:

1. Hero
   - Occasion-led headline.
   - Seasonal promise.
   - One strong wrapper-level image or scene.
   - Light prompt to choose a celebration month.
   - Clear promise that the page contains month-matched cruise options.

2. Month Selector
   - 12-month strip or segmented control.
   - Each month shows whether picks are available.
   - Selecting a month updates the package-option section in place.

3. Curated Options for Selected Month
   - A small set of package options, usually 2 to 4.
   - Suggested lanes: premium pick, best value pick, quiet/luxury pick, short getaway pick.
   - Each option includes ship, line, date, nights, departure port, itinerary summary, price-from, and verified CTA.
   - Public-safe promo summary.
   - CTA into the verified booking-link flow, email-link flow, or callback flow.

4. Featured Option Detail Panel
   - Expands the selected package option without leaving the page.
   - Shows day-by-day itinerary highlights where available.
   - Shows selling points: why this ship, why this destination, why this month.
   - Shows cabin pricing and any public-safe promotion language.
   - Uses the general hero ship image search/category imagery unless package-specific media has already been approved.

5. Why These Were Selected
   - Short customer-safe explanation.
   - No agent-only promo details.
   - No unsupported eligibility guarantees.

6. Browse by Mood
   - Warm escape.
   - Elegant ship.
   - Best balcony value.
   - Big milestone.
   - Short celebration.

7. CTA Bar
   - Persistent or repeated near package sections.
   - Primary CTA: `Check Live Price & Availability`.
   - Secondary CTAs: `Email Me This Cruise` and `Ask an Agent`.
   - CTA state must be package-specific, not wrapper-wide.

### Public Page Rule

The wrapper landing page should be complete enough to sell and route the customer without requiring separate Deal pages for every package.

Separate public Deal pages may still exist for packages that deserve a standalone campaign, but they are optional escalation surfaces, not a prerequisite for wrapper launch.

### Image Strategy

Use the general hero ship image search/category imagery for package cards and selected-option detail panels.

Recommended image hierarchy:

- one wrapper hero image
- one seasonal or mood image set
- per-option ship/destination images from general search or curated sources
- package-specific generated media only when a package is promoted outside the wrapper or needs special treatment

Do not require full media generation for every month/ship/sailing before launch.

## Claude Design Prompt

Use this prompt with Claude Design to propose layout guidelines for the wrapper landing page:

```text
You are designing a high-conversion, elegant cruise wrapper campaign landing page for Leisure Life Interactive.

Product concept:
Hand-selected anniversary voyages. The page helps couples choose their anniversary month and immediately see curated cruise options matched to that month. The user should not need to leave the page to understand the options. Each option links to its own verified booking/CTA path.

Core page behavior:
- One landing page, not separate Deal pages for every sailing.
- Hero introduces the anniversary promise.
- A 12-month selector lets users choose their anniversary month.
- The selected month displays 2 to 4 curated cruise options.
- Each option includes ship, cruise line, sail date, nights, departure port, itinerary summary, price-from, public-safe promo note, and CTA.
- A selected option expands into a detail panel with stronger selling points and itinerary highlights.
- Images should use a wrapper hero plus general ship/destination imagery for each option.
- The page should feel polished, romantic, useful, and trustworthy, not like a generic coupon grid.

Design constraints:
- Avoid a marketing-only hero that hides the usable experience.
- Keep the month selector visible and easy to scan on mobile and desktop.
- Make package comparison easy without overwhelming the user.
- Use clear CTAs: Check Live Price & Availability, Email Me This Cruise, Ask an Agent.
- Do not rely on separate public Deal pages.
- Do not imply a promotion applies to every option unless each option has verified promo support.
- Do not use visible instructional copy about how the UI works.
- Avoid decorative clutter, nested cards, and oversized text inside compact panels.
- Prioritize dense but elegant information design.

Deliver:
- Recommended page sections in order.
- Desktop and mobile layout guidance.
- Card/detail-panel structure.
- Month selector behavior.
- CTA placement rules.
- Image usage guidance.
- Empty or unavailable month behavior.
- Accessibility and responsive considerations.
```

## Operator Workbench Concept

Add an Occasion Campaign Builder to `/tests/deals-system`.

Required controls:

- Create wrapper campaign.
- Select occasion type.
- Set planning horizon.
- Generate monthly slot strategies.
- Run targeted package lookups per slot.
- Compare candidates.
- Approve one or more candidates per slot.
- Attach or review promotions.
- Generate umbrella copy.
- Generate per-slot copy.
- Generate or curate wrapper media.
- Assemble preview.
- Approve wrapper campaign.

The workbench must show provenance clearly:

- cached CB price advantage
- live Odysseus lookup
- package page pricing
- promo intelligence cache
- operator override
- AI-generated copy
- deterministic scaffold

Do not label scaffolded wrapper output as finished campaign intelligence.

## Approval Rules

Wrapper campaigns need two approval layers.

### Atomic Deal Approval

Each package selected for a wrapper slot must satisfy existing Deal gates:

- real Odysseus package
- valid booking link or known link path
- package facts reconciled
- cabin pricing captured
- promo reviewed
- public copy reviewed
- package option copy reviewed
- verified CTA path exists
- operator approval

### Wrapper Approval

The wrapper itself must satisfy collection-level gates:

- each public month has at least one approved atomic Deal
- no slot implies availability beyond selected package facts
- umbrella claims are true across all displayed picks
- month-specific copy does not imply an exact anniversary-date match
- public-safe promo summaries only
- inactive months are hidden or clearly treated as "ask us to find one"
- package options render enough detail in-page to support the CTA
- operator approval recorded before homepage eligibility

## Distribution Implications

Wrapper campaigns change ad strategy.

Instead of advertising one package date, ads should advertise the occasion-led service:

- "Anniversary in the next year?"
- "Choose the month. We will show the strongest cruise picks."
- "Seasonally matched anniversary cruises."

Click flow:

```text
Ad -> Wrapper Campaign Page -> Month/Mood Selection -> In-page Package Option -> Booking Link / Email Link / Callback
```

This makes targeting broader while preserving package truth downstream.

Recommended distribution assets:

- umbrella Meta ad set
- umbrella Google search/display campaign
- per-season display images
- per-month carousel cards
- retargeting ads for users who viewed a month but did not click a package

## Implementation Phases

### Phase 0 - Design Lock

Goal:

Document the wrapper model and confirm it should compose atomic Deals instead of mutating them.

Build:

- This plan.
- A follow-up data contract doc if needed.
- A short operator decision note for wrapper vs atomic approvals.

Exit criteria:

- No unresolved disagreement about whether wrapper campaigns are collection-level objects.

### Phase 1 - Types and Store

Goal:

Create typed wrapper campaign records and local/cache store helpers.

Build:

- Wrapper campaign types.
- Wrapper slot types.
- Candidate scoring types.
- Store helpers for create, update, list, and approve.
- Local JSON cache support if needed for tests.

Exit criteria:

- Unit tests can create a wrapper campaign with empty monthly slots.

### Phase 2 - Slot Strategy Generator

Goal:

Generate a month-by-month search strategy from an occasion and planning horizon.

Build:

- Occasion profile definitions.
- Seasonal heuristics.
- Monthly slot generation.
- Operator-editable slot strategies.

Exit criteria:

- Anniversary wrapper can generate 12 monthly slot strategies without package lookups.

### Phase 3 - Candidate Discovery Adapter

Goal:

Run targeted Odysseus/package lookups for each slot and normalize candidates.

Build:

- Slot-to-lookup adapter.
- Candidate normalization.
- Promo prefilter attachment.
- Price and package provenance capture.
- One-slot rerun support.

Exit criteria:

- Operator can generate candidates for one month and inspect package ids, pricing, itinerary, and diagnostics.

### Phase 4 - Candidate Scoring and Selection

Goal:

Rank candidates by seasonal, occasion, price, promo, and ship fit.

Build:

- Scoring function.
- Explanation strings for operator review.
- Selection state per slot.
- Manual override and rejection notes.

Exit criteria:

- Workbench shows recommended, alternate, rejected, and warning-state candidates for a month.

### Phase 5 - Package Option Assembly

Goal:

Convert selected candidates into approved package options that can render inside the wrapper page.

Build:

- Create or attach atomic Deal/package record from selected slot candidate.
- Preserve wrapper provenance on the package option.
- Attach promo context.
- Generate in-page package selling points.
- Generate public-safe package option copy.
- Attach verified booking, email-link, and callback CTA metadata.

Exit criteria:

- A selected wrapper candidate can become an approved in-page package option without requiring a standalone public Deal page.

### Phase 6 - Umbrella Copy and Wrapper Preview

Goal:

Generate occasion-level public copy that is true across selected packages.

Build:

- Umbrella headline and subhead.
- Seasonal promise.
- Month selector copy.
- Per-slot teaser copy.
- Per-option selling point copy.
- Collection-level disclaimers.
- Preview projection.

Exit criteria:

- Preview page can render a wrapper campaign from approved or review-state slot data, including month selector and in-page package options.

### Phase 7 - Public Wrapper Page

Goal:

Create the public route for approved wrapper campaigns.

Build:

- Route such as `/deals/collections/<wrapperId>` or `/deals/occasions/<slug>`.
- Month selector.
- Selected package cards.
- Expandable package detail panel.
- CTA handoff directly to verified booking, email-link, or callback flow.
- Empty-slot behavior.

Exit criteria:

- Only approved wrapper campaigns can be public.
- Only approved or explicitly displayable slot package options appear.

### Phase 8 - Distribution Synthesis

Goal:

Generate Meta, Google, and display-ad assets for the wrapper campaign.

Build:

- Umbrella ad concepts.
- Per-season creatives.
- Per-month carousel concepts.
- Search keywords and negative claims.
- UTM strategy.

Exit criteria:

- Operator can review wrapper distribution assets before activation.

### Phase 9 - Validation and Maintenance

Goal:

Keep wrapper campaigns fresh as package pricing, promos, and availability drift.

Build:

- Staleness flags per candidate.
- Recheck package pricing.
- Recheck promo windows.
- Month-slot replacement workflow.
- Retire expired slots.

Exit criteria:

- Workbench warns when a displayed month depends on stale pricing, expired promo windows, or old lookup diagnostics.

## Initial Anniversary Wrapper Build

Recommended first wrapper:

```text
wrapperId: anniversary-voyages-2026-2027
title: Hand-Selected Anniversary Voyages
occasionType: anniversary
planningHorizonStart: 2026-09-01
planningHorizonEnd: 2027-08-31
market: US
audience: couples celebrating an anniversary in the next 12 months
```

Initial slot priorities:

- September 2026: Celebrity or Holland America, Bermuda/Caribbean/Alaska shoulder value.
- October 2026: Celebrity Mediterranean or Bermuda if pricing is strong.
- November 2026: Celebrity Ascent Southern Caribbean, package `1557108`, as a premium test candidate.
- December 2026: cautious holiday slot; avoid weak value unless a truly strong package appears.
- January 2027: Royal Caribbean or Holland America winter warmth value.
- February 2027: Holland America Eastern Caribbean or Royal Caribbean Southern Caribbean.
- March 2027: Southern Caribbean or Panama Canal value.
- April 2027: Mediterranean shoulder season or repositioning only if framed carefully.
- May 2027: Alaska opening season, Bermuda, or Mediterranean.
- June 2027: Alaska or Europe.
- July 2027: Alaska, Northern Europe, or premium Europe.
- August 2027: Alaska, Northern Europe, or late-summer Mediterranean.

## Open Questions

- Should wrapper campaigns get their own public URL namespace, or live under `/deals/<slug>` with a collection type?
- Should one wrapper slot display 2, 3, or 4 public package options by default?
- Should expired month slots remain visible as past examples, or disappear automatically?
- Should users be able to request a custom month if a slot has no approved package?
- Should wrapper campaign approval require every month to be filled, or only a minimum viable set such as 6 approved months?
- Should wrapper campaign ads route to month selection first, or preselect a month based on ad copy and UTM?
- Should standalone Deal pages be generated only for top packages, or remain fully optional?

## Non-Goals

- Do not create holds, reservations, payment steps, or booking submissions.
- Do not auto-publish wrapper campaigns.
- Do not require standalone Deal pages for every wrapper package option.
- Do not replace the existing Deal pipeline.
- Do not let umbrella copy claim every package has the same promotion.
- Do not create public copy from agent-only promotion notes.
- Do not hide stale package or promo provenance from the operator.

## Recommended Next Step

Build Phase 1 and Phase 2 together:

1. Add wrapper campaign types and cache/store helpers.
2. Add a deterministic anniversary slot strategy generator.
3. Add a basic Workbench panel that creates `anniversary-voyages-2026-2027` with editable monthly slots.

Do not run broad package discovery until the slot strategy model is visible and operator-editable.
