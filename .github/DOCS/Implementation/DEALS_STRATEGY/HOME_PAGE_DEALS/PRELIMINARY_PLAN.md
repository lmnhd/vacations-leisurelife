# Home Page Deals Strategy - Preliminary Plan

## Purpose

Replace the old homepage "destination picks" and legacy `destinationdeal` experience with a bookable, refreshed, Cruise Brothers-backed Deals and Specials system.

The target is simple: homepage deals should lead to polished deal pages with real CB booking calls to action, not informational dead ends. The system should keep the existing weekly CB deals cache flow, enrich thin Cruise Brothers deal data with AI-generated destination packaging, and avoid runtime scraping or page-render AI work.

## Current State

The homepage deal section is rendered by `components/cb/cbdestinationpickstile.tsx` under the headline `EXCLUSIVE DEALS FOR OUR TOP CRUISE DESTINATION PICKS`.

The homepage reads stored deal data through:

- `lib/cb/cb-deals-store.ts`
- `lib/cb/cb-deals-refresh.ts`
- `app/api/serverutils/update-deals/route.ts`

The current stored payload contains:

- raw CB picks
- prepared homepage tile records
- refresh timestamp

The current Deal Info page is `app/(dashboard)/(routes)/destinationdeal/[id]/page.tsx`. It inherits the dashboard sidebar from `app/(dashboard)/layout.tsx`, which still includes Promotions, Cruise News, Search Cruises, and Themed Cruises.

The deal page still relies on legacy article-generation behavior through `lib/deals-utils.ts`, with request-time AI/image fallback risk. The page has no reliable booking CTA even when the underlying sailing can be made bookable through CB Agent Tools/Odysseus links.

## Product Direction

Focus the public experience on:

- Deals
- Specials
- Immediate booking through CB portal

De-prioritize or remove public affordances for:

- Promotions
- Cruise News
- Search Cruises
- Themed Cruises

Those legacy surfaces can remain internally accessible while the public navigation stops steering visitors there.

## Proposed Public Flow

1. Visitor lands on the homepage.
2. Visitor sees a refined Deals/Specials module instead of generic destination picks.
3. Each tile links to a canonical deal detail page.
4. The deal page shows:
   - deal hero
   - sailing summary
   - price and included offer summary
   - ship, line, destination, ports, and date facts
   - AI-enhanced destination packaging
   - clear "Book through Cruise Brothers" CTA
   - secondary "Ask us about this deal" CTA
5. The booking CTA opens a CB Agent Tools dynamic booking link, preserving our agent attribution and commission path.

## Data Model Direction

Extend the current stored CB deals payload rather than creating a second system.

Proposed `StoredCbDealsPayload` v2 shape:

```ts
interface StoredCbDealsPayloadV2 {
  version: 2;
  generatedAtIso: string;
  source: "cruisebrothers_live_refresh";
  picks: CBPickData[];
  homepageDeals: StoredCbHomepageDeal[];
  dealDetails: StoredCbDealDetail[];
  refreshDiagnostics: CbDealsRefreshDiagnostics;
}
```

Proposed deal detail record:

```ts
interface StoredCbDealDetail {
  id: string;
  status: "bookable" | "info_only" | "needs_operator_review";
  sourcePick: CBPickData;
  display: {
    title: string;
    subtitle: string;
    heroImageSrc: string;
    heroImageAlt: string;
    shortSummary: string;
    longSummary: string;
    dealHighlights: string[];
    itineraryHighlights: string[];
    destinationHighlights: string[];
    bestFor: string[];
    urgencyCopy: string;
  };
  cruiseFacts: {
    destination: string;
    cruiseLine?: string;
    shipName?: string;
    nights?: string;
    embarkationPort?: string;
    sailDateLabel?: string;
    priceFromLabel?: string;
    includedPerks: string[];
  };
  booking: {
    packageId?: string;
    siid?: string;
    bookingUrl?: string;
    bookingUrlVerifiedAtIso?: string;
    linkSource: "cb_pick" | "odysseus_package_match" | "operator_override" | "none";
  };
  enrichment: {
    model: "gpt-5.4-mini" | "gpt-5.4";
    generatedAtIso: string;
    sourceInputsHash: string;
  };
}
```

## Booking Link Strategy

Use a tiered resolver during the refresh job:

1. If the scraped CB pick already contains a direct package/deal link that can be transformed into a bookable CB Agent Tools URL, normalize and store it.
2. If the pick only contains an informational Cruise Brothers page, parse ship/date/destination/line facts and match it through the existing Odysseus search/direct package URL pattern.
3. If a package ID is found, generate:

```text
https://bookings.cbagenttools.com/swift/cruise/package/{PACKAGE_ID}?siid={AGENT_ID}&lang=1
```

4. Validate the URL at refresh time. Store validation status and timestamp.
5. If matching fails, keep the deal visible only if it is valuable, but label it as `needs_operator_review` or hide it from homepage CTAs depending on operator preference.

Important operational rule: this flow should only create or validate booking links. It must not run "Hold" or reservation actions without explicit operator approval.

## Enrichment Strategy

Cruise Brothers deal data is thin. The refresh job should add a destination packaging layer using the LLM gateway.

Recommended model routing:

- extraction and normalization: `modelForTask("extraction")`, currently GPT-5.4 mini
- richer destination packaging: `ModelName.GPT_5_MEDIUM` or a dedicated `deal_enrichment` task mapped to GPT-5.4 mini
- optional premium copy/red-team pass later: `ModelName.GPT_5_HIGH`

Enrichment output should be structured JSON, not prose blobs. It should produce:

- destination mood and audience fit
- 3 to 5 selling points not present in CB data
- port/destination highlights
- first-time cruiser notes
- what makes this sailing easy to buy now
- concise disclaimers for pricing, availability, taxes, and fees

Do not invent hard facts such as exact onboard credits, cabin inclusions, or final prices unless CB supplied them. AI should enhance packaging, not fabricate deal terms.

## Homepage UX Ideas

Rename the section from destination picks to something more direct:

- "Cruise Deals You Can Book Now"
- "This Week's Bookable Cruise Specials"
- "Featured Cruise Deals and Specials"

Tile behavior:

- show destination, ship/line if known, price-from, nights, and strongest perk
- use one primary action: "View Deal"
- optionally show a direct "Book Now" CTA only when `status === "bookable"`
- make unavailable/unverified links impossible to click as booking buttons
- remove decorative clutter that fights dark mode

Homepage sorting:

1. bookable and verified
2. strongest price/perk signal
3. near-term relevance
4. unique destinations
5. image quality

## Deal Page UX Ideas

Create a modern public deal detail page that does not inherit the dashboard sidebar.

Preferred route direction:

- keep `/destinationdeal/[id]` temporarily for compatibility
- introduce `/deals/[id]` or `/specials/[id]` as the canonical route
- redirect legacy links once implementation is stable

Page sections:

- full-width hero with deal title, price-from, and booking CTA
- compact deal fact bar
- "Why this deal is worth a look"
- perks and inclusions
- destination highlights
- itinerary/ports
- trust and booking notes
- sticky mobile CTA bar

Calls to action:

- primary: "Book through Cruise Brothers"
- secondary: "Ask Leisure Life about this deal"
- tertiary/internal: operator diagnostics only, not public

## Sidebar Removal Plan

The legacy deal page inherits `Sidebar` from `app/(dashboard)/layout.tsx`.

Recommended implementation:

1. Move the public deal route out of the dashboard route group.
2. Keep any internal dashboard pages inside `(dashboard)`.
3. Update homepage deal links to the new public route.
4. Add compatibility redirect from `/destinationdeal/[id]` to `/deals/[id]`.

Short-term alternative:

- add a nested layout override for the destination deal segment if keeping the route is necessary
- this is less clean because the route still semantically lives in the dashboard group

## Dark Mode Requirements

The new deal tile and detail page should be designed for both light and dark from the start.

Implementation requirements:

- no hard-coded `bg-white` with dark unreadable text unless paired with `dark:` variants
- use semantic surfaces such as `bg-background`, `text-foreground`, `border-border`, `text-muted-foreground`
- verify contrast for pricing badges, CTA buttons, itinerary panels, and feature chips
- avoid legacy gray blocks like `bg-gray-50` without dark variants
- test desktop and mobile in light and dark mode

## Refresh Pipeline Plan

The existing `npm run update-deals` workflow should remain the operator entry point.

Proposed refresh steps:

1. Fetch live CB picks through the existing scraper path.
2. Normalize raw picks into a stable deal candidate shape.
3. Resolve or match package IDs and CB booking links.
4. Validate booking links without taking reservation actions.
5. Generate structured enrichment.
6. Generate homepage tile payload.
7. Generate detail page payload.
8. Store the full v2 payload in Dynamo.
9. Return diagnostics: counts, bookable count, failed matches, hidden deals, enrichment errors.

## Suggested Implementation Phases

### Phase 1 - Public route and sidebar removal

- create canonical public route `/deals/[id]`
- migrate/read existing stored pick detail data
- remove dashboard sidebar from public deal view
- update homepage links
- preserve `/destinationdeal/[id]` compatibility

### Phase 2 - Stored deal detail payload

- extend `StoredCbDealsPayload` to v2
- replace request-time `generateDealContent()` page usage with stored detail records
- keep a temporary fallback for development only
- update refresh route diagnostics

### Phase 3 - Booking link resolver

- add a resolver for package IDs and dynamic CB booking URLs
- reuse Odysseus URL conventions and validation logic
- store link status
- only show booking CTA for verified bookable deals

### Phase 4 - GPT-5.4 enrichment

- add structured enrichment generator through `lib/ai/llm-gateway`
- produce destination/deal packaging fields
- add factuality guardrails and source-input hashes
- cache enrichment per deal until source facts change

### Phase 5 - Visual overhaul and QA

- redesign homepage tiles for Deals/Specials
- redesign deal detail page
- light/dark QA
- mobile sticky CTA QA
- browser screenshot pass after implementation

### Phase 6 - Operator controls

- add internal diagnostics for failed booking link matches
- allow operator override booking links
- allow hide/pin/rank controls for weekly deals
- document weekly refresh and review checklist

## Open Questions

- Should the canonical public route be `/deals/[id]`, `/specials/[id]`, or both?
- Should homepage display only verified bookable deals, or include strong info-only specials with "Ask us" CTA?
- Should booking links open directly in a new tab, or should the deal page show a short handoff confirmation first?
- Do we want operator overrides stored in Dynamo under the same `CB_DEALS` record or in a separate admin table/key?
- Should deal enrichment use only LLM knowledge, or should it optionally use search/research sources for destination facts?

## Recommended First Slice

Start with Phase 1 and Phase 2 together.

That gives the visitor a cleaner public deal page with no sidebar, removes request-time AI from deal rendering, and creates the structure needed for booking links without taking on the full Odysseus matching problem in the first pass.

The first implementation should end with:

- homepage tiles linking to a public route
- no dashboard sidebar on deal pages
- stored detail payload powering the page
- readable light/dark layout
- clear placeholder behavior for unverified booking links
