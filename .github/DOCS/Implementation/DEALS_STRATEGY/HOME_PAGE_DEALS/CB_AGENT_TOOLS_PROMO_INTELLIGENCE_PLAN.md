# CB Agent Tools Promo Intelligence Plan

## Purpose

Build a Deals intelligence component that reads the Cruise Brothers Agent Tools Today's View page:

```text
https://www.cbagenttools.com/marketing/todaysview/
```

The goal is not only to list promotions. The system should extract the agent-facing rules, dates, combinability notes, perk structures, and marketing opportunities that help Leisure Life package selected cruises in a more compelling and compliant way.

This component should support the new Home Page Deals strategy by answering:

- Which cruise lines are currently running meaningful promotions?
- What exact booking and sailing windows apply?
- What perks can we ethically advertise?
- Which perks depend on cabin class, voyage length, deposit type, or booking day?
- Which offers are combinable with cruise-only, all-included, refundable, non-refundable, group, or agency-special pricing?
- Which warnings should prevent a deal from being marketed too aggressively?

This is a promotion intelligence layer. A public Deal still needs an Odysseus package/share link before it can be published as click-and-buy-now.

## Product Direction

The Deals system should have two complementary lanes:

1. **Promo Intelligence**
   - Source: CB Agent Tools Today's View and promotion detail pages.
   - Output: structured promotion rules and marketing notes.
   - Purpose: know how to position cruises using real vendor/agent perks.

2. **Bookable Cruise Selection**
   - Source: Odysseus search and share-link capture.
   - Output: exact package booking URL with agent `siid`.
   - Purpose: publish visitor-facing Deals that can be bought now.

Add a third creative layer:

3. **Market Research and Angle Discovery**
   - Source: ship details, itinerary/destination research, amenity research, current travel trends, audience niches, and competitive positioning.
   - Output: differentiated Leisure Life deal angles that go beyond vendor-provided promo copy.
   - Purpose: find the clever reason this specific cruise is worth promoting now.

Add a fourth discovery layer:

4. **Trend-Led Deal Campaign Discovery**
   - Source: external trend signals, cultural calendars, seasonal behavior, niche communities, destination timing, events, and social/search demand.
   - Output: campaign ideas that start with an audience or trend, then search Odysseus for a cruise that fits.
   - Purpose: sell cruises to people who were not actively shopping for cruises by wrapping the sailing around something they already care about.

The two lanes meet during packaging:

- Odysseus finds a strong cruise package.
- Promo Intelligence tells us whether that package may qualify for a current offer.
- Market Research and Angle Discovery identifies why this particular ship, destination, itinerary, or timing has a stronger story than a generic cruise sale.
- Trend-Led Deal Campaign Discovery can also start before Odysseus search: identify a niche/trend first, then find the cruise that best expresses it.
- GPT-5.4 turns the package, promotion rules, and research angle into polished, factual marketing copy.
- The public page only publishes if the package has a verified agent booking URL.

## Booking Link Freshness and Expiration Risk

CB/Odysseus package links should be treated as live inventory pointers, not permanent static URLs.

Example shape:

```text
https://bookings.cbagenttools.com/swift/cruise/package/1636340--4-day-moreton-island?siid=1049337&lang=1
```

Likely stable parts:

- `package/1636340...` identifies the package or sailing package while CB/Odysseus still exposes it.
- `siid=1049337` appears to preserve agency/agent attribution.
- `lang=1` is a locale/display parameter.

Likely fragile parts:

- package availability can disappear
- package pricing can change
- cabin category availability can change
- the package ID may become invalid after the sailing is removed, sold out, repriced, or retired by Odysseus
- the page can still return HTTP 200 even if the underlying package is gone, because it is a JavaScript app

Operational rule:

- Do not assume a captured package/share link is evergreen.
- Store `capturedAtIso`, `lastVerifiedAtIso`, `lastVerifiedStatus`, and `nextVerificationDueIso`.
- Verify links before publishing.
- Re-verify active homepage Deals daily, or more often for heavily advertised Deals.
- Re-verify immediately before launching paid ads.
- Automatically remove or hide public Deals whose package link fails validation.
- Keep the deal package data so the operator can search Odysseus for a replacement sailing/package.

Validation should use a browser-based checker, not plain `fetch`, because the Swift package pages are JavaScript SPAs and can mask broken package states.

Recommended deal link fields:

```ts
interface DealBookingLinkHealth {
  bookingUrl: string;
  packageId: string;
  siid: string;
  capturedAtIso: string;
  lastVerifiedAtIso?: string;
  nextVerificationDueIso?: string;
  status: "valid" | "broken" | "stale" | "needs_operator_review";
  failureReason?: string;
}
```

Important strategy note:

Price advantages, onboard credits, BOGO offers, and agent perks are supporting factors. They can make a strong trip easier to sell, but they should not be the main reason a cruise is selected.

The primary question is:

```text
Is this trip itself compelling, sellable, visually appealing, distinctive, and packageable as a Leisure Life opportunity?
```

The best Deals should feel like something Leisure Life found, shaped, and presented with a point of view, not like a generic agency repost of vendor inventory.

## Primary Deal Selection Criteria

Evaluate potential Deals in this order:

1. **Trip quality**
   - Is the itinerary genuinely attractive?
   - Are the ship, cruise line, departure port, ports of call, sailing date, and trip length a strong combination?
   - Does the trip solve a real traveler desire or pain point?

2. **Sellability**
   - Can we explain why someone should care in one clear sentence?
   - Does it match a real audience, niche, trend, or seasonal travel need?
   - Can it support a focused landing page and ad campaign?

3. **Visual and emotional appeal**
   - Can we make it look beautiful, specific, and desirable?
   - Are there strong destination visuals, ship visuals, experiences, or lifestyle cues?
   - Does the trip create an emotional hook beyond price?

4. **Uniqueness and proprietary angle**
   - Can we frame it in a way competitors are not using?
   - Can it feel like a curated Leisure Life find?
   - Is there a niche theme, trend, event, amenity, destination story, or audience-specific reason this trip stands out?

5. **Commercial value**
   - Is the price reasonable for the audience and experience?
   - Is there enough margin/commission value to justify promotion?
   - Are availability, cabin categories, and booking windows workable?

6. **Promos and agent perks**
   - Are there current CB/vendor offers that improve the value story?
   - Can the perk be stated safely and accurately?
   - Does the perk strengthen the existing angle rather than replace it?

Rejected deal pattern:

- "This cruise has a discount, therefore advertise it."

Preferred deal pattern:

- "This trip has a strong experience angle, a clear audience, great visuals, a timely reason to care, and a bookable package link. The current promo makes it even easier to sell."

## Source Page Behavior

The Today's View page appears to contain a list of promotion cards or links. Each promotion can lead to a detail page with content such as:

- title
- vendor
- sailing eligibility window
- booking eligibility window
- promotion details
- key features
- agent instructions
- applicable sailings
- offer applicable products
- applicable markets
- supporting files

Example source:

```text
Celebrity Cruises - SUMMER SALE - Dollars Off, Onboard Credit
Vendor: Celebrity Cruises
For sailings on or between 06/03/2026 and 05/10/2028
Must be booked between 06/02/2026 and 07/27/2026
```

This page may not expose direct booking links. That is acceptable. The value is the structured sales intelligence.

## Extraction Targets

The scraper should collect raw text and then normalize it into a structured promotion record.

### Core Fields

```ts
interface CbPromoIntelligenceRecord {
  id: string;
  source: "cb_agent_tools_todays_view";
  sourceUrl: string;
  detailUrl: string;
  capturedAtIso: string;
  title: string;
  vendor: string;
  bookingWindow: {
    startsOn?: string;
    endsOn?: string;
    rawText: string;
  };
  sailingWindow: {
    startsOn?: string;
    endsOn?: string;
    rawText: string;
  };
  promotionDetailsRaw: string;
  agentInstructionsRaw: string;
  keyFeaturesRaw: string;
  applicableSailingsRaw: string;
  applicableProductsRaw: string;
  applicableMarketsRaw: string;
  supportingFiles: Array<{
    label: string;
    url: string;
    fileName: string;
  }>;
  extracted: CbPromoExtractedTerms;
  marketingUse: CbPromoMarketingUse;
  diagnostics: CbPromoExtractionDiagnostics;
}
```

### Extracted Terms

```ts
interface CbPromoExtractedTerms {
  offerTypes: Array<
    | "second_guest_discount"
    | "dollars_off"
    | "onboard_credit"
    | "free_extra_guests"
    | "instant_savings"
    | "all_included"
    | "agency_special"
    | "suite_perk"
    | "other"
  >;
  percentDiscounts: Array<{
    appliesTo: string;
    percentOff: number;
    depositType?: "refundable" | "non_refundable";
    rawText: string;
  }>;
  dollarSavings: Array<{
    amountUsd: number;
    appliesTo: string;
    voyageLength?: "3_to_5_nights" | "6_plus_nights" | string;
    cabinCategory?: string;
    bookingDayWindow?: string;
    rawText: string;
  }>;
  onboardCredits: Array<{
    amountUsd: number;
    appliesTo: string;
    voyageLength?: string;
    cabinCategory?: string;
    bookingDayWindow?: string;
    rawText: string;
  }>;
  freeGuestOffers: Array<{
    guestNumbers: string;
    excludedCabins?: string[];
    rawText: string;
  }>;
  combinability: {
    cruiseOnly?: boolean;
    allIncluded?: boolean;
    refundableDeposit?: boolean;
    nonRefundableDeposit?: boolean;
    groupRates?: boolean;
    groupXRates?: boolean;
    singleSupplements?: boolean;
    riverCruises?: boolean;
    cruiseTours?: boolean;
    rawRules: string[];
  };
  exclusions: string[];
  applicableProducts: string[];
  applicableMarkets: string[];
}
```

### Marketing Use

```ts
interface CbPromoMarketingUse {
  publicClaimsAllowed: string[];
  publicClaimsNeedsQualifier: string[];
  agentOnlyNotes: string[];
  suggestedAngles: string[];
  cautionFlags: string[];
  bestMatchedDealBriefs: string[];
  visitorFriendlySummary: string;
}
```

The extractor must distinguish between:

- public-friendly claims we can advertise
- claims that need careful qualifiers
- agent-only operating notes
- restrictions that should not appear as a broad promise

## Celebrity Summer Sale Extraction Example

The Celebrity example should normalize into intelligence like this:

- Vendor: Celebrity Cruises
- Booking window: June 2, 2026 through July 27, 2026
- Sailing window: June 3, 2026 through May 10, 2028
- Offer types:
  - second guest discount
  - dollars off
  - onboard credit
  - free extra guests on select sailings
  - instant savings
- High-value marketing hooks:
  - second guest savings up to 75 percent on non-refundable deposit rates
  - bonus savings or onboard credit up to $700 per stateroom, depending on booking day, voyage length, and cabin class
  - free 3rd/4th/5th guest fares on select dates, not applicable to suites
  - Celebrity premium experience, Edge-class ships, The Retreat suite experience, and broad destination coverage
- Agent caution flags:
  - BOGO is not combinable with GroupX rates or single supplements
  - bonus offer value changes by booking day
  - cabin category and voyage length affect savings
  - Galapagos exclusions apply
  - Celebrity River Cruises have special combinability and bonus-offer exclusions

Visitor-facing copy should never say every Celebrity cruise gets all perks. It should say the selected sailing may qualify for current Celebrity Summer Sale perks and that final pricing/perks are confirmed inside the CB booking portal.

## Extraction Pipeline

### Step 1 - Operator-Run Scrape

Because CB Agent Tools is authenticated, scraping should remain an operator-run workflow.

Planned command:

```powershell
npm run scrape-cb-promo-intelligence
```

Expected behavior:

- load the saved CBAT session or require credentials from `.env.local`
- navigate to `/marketing/todaysview/`
- collect all promotion links
- visit each promotion detail page
- save raw HTML/text snapshots and link metadata
- avoid any booking, hold, guest-info, or reservation actions

### Step 2 - Deterministic Section Parsing

Before using AI, parse obvious sections by heading text:

- `Promotion Details`
- `Agent Instructions`
- `Applicable Sailings`
- `Offer Applicable Products`
- `Applicable Markets`
- `Supporting File`
- `Key features`

The parser should preserve raw text for auditability.

### Step 3 - Structured AI Extraction

Run GPT-5.4 through the LLM gateway to transform the raw sections into structured JSON.

Model behavior:

- extract terms
- classify offer types
- identify public-safe claims
- identify agent-only notes
- flag exclusions and combinability risks
- generate a short visitor-safe summary

Hard rule:

- The model must not invent perk values, dates, applicability, or exclusions.
- Every extracted claim should trace back to source text.

### Step 4 - Promotion-to-Cruise Applicability

When an Odysseus cruise candidate is selected, compare it to promo intelligence:

- cruise line/vendor match
- sailing date inside eligible window
- booking date inside eligible window
- itinerary/product exclusions
- cabin category requirements
- deposit type assumptions
- cruise length tiers
- market restrictions

The output should be a confidence result:

```ts
type PromoApplicabilityStatus =
  | "likely_applicable"
  | "possibly_applicable_needs_review"
  | "not_applicable"
  | "insufficient_data";
```

Only `likely_applicable` and operator-approved `possibly_applicable_needs_review` promos should influence public copy.

### Step 5 - Deal Packaging

For each bookable Odysseus deal:

- attach applicable promo intelligence
- attach researched ship, amenity, destination, and trend intelligence
- create a visitor-safe perk summary
- create an internal agent note block
- create a distinct selling angle or niche theme
- create ad copy hooks for later Meta/Google work
- store warnings so the UI/admin review can show what needs confirmation

### Step 6 - Research and Angle Discovery

Cruise Brothers promotion text is the sales-rule foundation, but it is not enough to make Leisure Life Deals stand out.

For every serious candidate, the system should research what makes the specific trip appealing beyond the vendor promo:

- ship amenities and signature venues
- dining, entertainment, wellness, nightlife, kids/family, suite, solo, or adults-focused features
- destination highlights and port-specific experiences
- common ship-class features and known differentiators
- itinerary pacing, sea-day balance, embarkation convenience, and seasonal timing
- current travel trends that match the sailing
- niche audiences that competitors may not be targeting
- clever themes that can wrap the trip in a stronger story

Examples of angle discovery:

- Celebrity Edge-class Western Caribbean as a premium "modern design and culinary escape," not just a discount.
- Alaska cruise as "wildlife, glacier, and soft-adventure summer reset," not just a sailing date.
- Bahamas short cruise as "low-friction first cruise test drive," not just a weekend deal.
- Europe river cruise as "small-ship cultural immersion for travelers who dislike mega-ship crowds."
- Transatlantic crossing as "slow travel, ocean liner nostalgia, and unplugged luxury."

Research should look for information that Cruise Brothers and generic agencies are not exploiting well:

- under-marketed ship amenities
- timely destination trends
- niche community interests
- seasonal events near ports
- food, music, culture, wellness, sports, family, or luxury angles
- traveler pain points this cruise solves unusually well
- ways to make the trip feel curated, visually appealing, and difficult to discover from a generic cruise search

The output should be structured and source-grounded:

```ts
interface DealAngleResearch {
  shipAppeal: string[];
  amenityHighlights: string[];
  destinationHooks: string[];
  itineraryPacingNotes: string[];
  nicheAudienceAngles: string[];
  trendMatches: string[];
  competitorBlindSpots: string[];
  recommendedPrimaryAngle: {
    title: string;
    rationale: string;
    publicCopyHook: string;
    whyThisFeelsExclusive: string;
  };
  rejectedAngles: Array<{
    title: string;
    reason: string;
  }>;
  sources: Array<{
    title: string;
    url: string;
    usedFor: string;
  }>;
}
```

## Targeting-Demographic Resource

Every Deal promotion should have its own `Targeting-Demographic` resource.

This is a package-specific research artifact, not generic audience copy. It should explain who we should target, why they would care, what niche/trend keywords matter, and how the selected cruise package can be positioned in paid and organic channels.

Purpose:

- identify niche audiences for the specific cruise package
- map trend and interest keywords to the trip angle
- support Meta, Google, TikTok, email, and landing-page targeting
- avoid generic "people who like cruises" advertising
- preserve the research logic behind why this Deal is worth promoting

Recommended file/resource naming:

```text
TARGETING_DEMOGRAPHIC.md
```

or structured data:

```text
targeting-demographic.json
```

Recommended schema:

```ts
interface DealTargetingDemographic {
  dealId: string;
  packageId: string;
  generatedAtIso: string;
  primaryAudience: {
    label: string;
    description: string;
    whyThisCruiseFits: string;
    emotionalDrivers: string[];
    likelyObjections: string[];
  };
  secondaryAudiences: Array<{
    label: string;
    description: string;
    whyThisCruiseFits: string;
    targetingNotes: string[];
  }>;
  nicheKeywords: {
    lifestyle: string[];
    destination: string[];
    shipExperience: string[];
    amenities: string[];
    eventsAndSeasonality: string[];
    trendSignals: string[];
    exclusionKeywords: string[];
  };
  channelTargeting: {
    meta: {
      interestClusters: string[];
      behaviorSignals: string[];
      creativeHooks: string[];
      audienceWarnings: string[];
    };
    google: {
      searchThemes: string[];
      keywordIdeas: string[];
      negativeKeywords: string[];
      landingPageIntentNotes: string[];
    };
    tiktok: {
      creatorAngles: string[];
      trendHooks: string[];
      shortVideoConcepts: string[];
    };
    email: {
      segmentIdeas: string[];
      subjectLineAngles: string[];
      personalizationNotes: string[];
    };
  };
  researchSummary: {
    primaryInsight: string;
    whyNow: string;
    competitorBlindSpot: string;
    positioningStatement: string;
  };
  sources: Array<{
    title: string;
    url: string;
    usedFor: string;
  }>;
  confidence: {
    score: number;
    strengths: string[];
    risks: string[];
    needsHumanReview: string[];
  };
}
```

Research depth requirements:

- audience is specific enough to target
- keywords go beyond cruise, vacation, and travel
- trends are tied to the actual ship, destination, date, itinerary, or amenity set
- targetable interests are separated from marketing copy
- exclusions and negative keywords are included
- competitor blind spots are stated clearly
- recommendations explain why this package is uniquely suited to the audience

Examples:

- A Celebrity Edge-class Caribbean sailing should not only target "cruise travelers." It may target modern luxury, food-and-wine travelers, design-conscious couples, premium resort travelers, and adults seeking an upscale Caribbean reset.
- A short Bahamas sailing may target first-time cruisers, busy parents, quick escape seekers, and people who want a low-commitment test trip.
- A European river cruise may target cultural travelers, museum/history interests, food/wine communities, holiday market travelers, and people avoiding mega-ship experiences.

The `Targeting-Demographic` resource should be generated before ad packaging. It becomes the targeting source of truth for later campaign distribution.

Guardrails:

- Do not let trend research override actual cruise facts.
- Do not claim amenities exist on a ship unless verified for that ship or ship class.
- Do not claim a port event or seasonal experience applies unless the sailing date and itinerary support it.
- Keep vendor promo terms separate from creative positioning.

### Step 7 - Trend-Led Deal Campaign Discovery

The system should also support the reverse workflow:

```text
trend / niche / event / audience signal -> cruise search -> promo applicability -> deal package -> ad targeting
```

This is important because Leisure Life should not only advertise cruises to people already searching for cruises. The stronger opportunity is to identify audiences who care about a theme, place, event, lifestyle, or seasonal moment, then show them that a cruise is an unexpectedly good way to experience it.

Example trend-led inputs:

- food and wine travel
- wellness retreats
- pickleball, golf, diving, fishing, music, comedy, or dance communities
- solo travel
- empty nesters
- remote workers who need an unplugged reset
- multigenerational family trips
- Taylor Swift-style fan travel or music scenes
- astronomy, eclipse, meteor shower, or dark-sky interest
- holiday markets
- spring break alternatives
- hurricane-season value windows with careful risk framing
- luxury-but-not-stuffy travel
- anniversary and milestone birthday trips
- "first cruise without committing to a week" short sailings

External signals to research:

- Google Trends and search interest
- Meta/TikTok audience and creative trends
- travel trend reports
- destination event calendars
- cruise line themed sailing calendars
- port city cultural calendars
- weather and seasonality patterns
- school holiday calendars
- major sporting, music, food, or cultural events
- Reddit/forums/community discussions when useful
- competitor ads and generic agency blind spots

Planned output:

```ts
interface TrendLedDealCampaignIdea {
  id: string;
  trendSignal: string;
  audience: string;
  whyNow: string;
  cruiseFitHypothesis: string;
  targetableInterests: string[];
  emotionalHook: string;
  searchCriteria: {
    destinations?: string[];
    cruiseLines?: string[];
    departurePorts?: string[];
    dateWindows?: string[];
    minNights?: number;
    maxNights?: number;
  };
  candidatePromos: string[];
  candidateCruises: string[];
  adAngles: Array<{
    channel: "meta" | "google" | "tiktok" | "email" | "landing_page";
    hook: string;
    audienceTargetingNotes: string[];
  }>;
  risks: string[];
}
```

Example reverse workflows:

- Trend: travelers want premium food experiences without planning every restaurant.
  - Search for Celebrity or Oceania sailings with strong culinary positioning.
  - Package as a "floating culinary week" rather than a cruise sale.

- Trend: parents want a short, lower-risk spring break escape.
  - Search short Bahamas or Caribbean sailings from easy drive/fly ports.
  - Package as "spring break without the logistics spiral."

- Trend: wellness and burnout recovery remain strong.
  - Search ships with spa, thermal suite, adults-focused spaces, quiet itineraries, or scenic sea days.
  - Package as a structured reset instead of a vacation commodity.

- Trend: holiday markets and European winter travel.
  - Search river or ocean itineraries aligned to market dates.
  - Package around cozy seasonal culture, not just "Europe cruise."

Ad targeting principle:

- Do not start with "people looking for cruises."
- Start with the niche, trend, or lifestyle signal.
- Use the cruise as the solution, surprise, or elevated way to experience that interest.
- Make the offer feel curated, scarce, or unusually well-matched, even when the underlying cruise is publicly bookable through CB.
- Reuse the same research depth and targeting discipline as the group campaign strategy, but keep these as individual retail Deals unless explicitly converted into Groups.

## Storage Plan

Use a dedicated cache file during the first implementation:

```text
.github/data/cb-promo-intelligence-cache.json
```

Recommended payload:

```ts
interface CbPromoIntelligenceCache {
  version: 1;
  generatedAtIso: string;
  sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/";
  records: CbPromoIntelligenceRecord[];
  diagnostics: {
    promotionLinksFound: number;
    detailPagesScraped: number;
    extractionSucceeded: number;
    extractionNeedsReview: number;
    supportingFilesFound: number;
    errors: string[];
  };
}
```

Later, migrate curated results into Dynamo if this becomes part of the production refresh pipeline.

## Public Copy Rules

Allowed:

- "This sailing may qualify for current Celebrity Summer Sale perks."
- "Current Celebrity offers include second-guest savings, onboard credit, or stateroom savings on eligible sailings."
- "Final pricing, cabin availability, taxes, fees, and eligible perks are confirmed in the Cruise Brothers booking portal."

Avoid:

- "Guaranteed $700 onboard credit."
- "Every second guest gets 75 percent off."
- "Free 3rd/4th/5th guests on this cruise" unless the exact sailing is verified.
- Any claim that ignores deposit type, cabin class, booking day, product exclusion, or sailing-date limits.

## UI/Admin Review Ideas

Create an internal review panel before public publishing:

- promotion title and vendor
- booking/sailing windows
- extracted offer chips
- combinability rules
- caution flags
- supporting files
- matched Odysseus cruise candidates
- suggested visitor copy
- approve/reject controls

The public Deals page should show only approved, visitor-safe copy. Agent instructions should remain internal.

## Implementation Phases

### Phase 1 - Raw Promotion Intelligence Scraper

- create `scripts/scrape-cb-promo-intelligence.ts`
- scrape `/marketing/todaysview/`
- visit detail pages
- persist raw section text and supporting files
- write `.github/data/cb-promo-intelligence-cache.json`

### Phase 2 - Structured Extractor

- add schema/types under `lib/cb`
- add deterministic section parser
- add GPT-5.4 structured extraction through `lib/ai/llm-gateway`
- preserve raw text and extraction diagnostics

### Phase 3 - Applicability Matcher

- compare promo rules against Odysseus cruise candidates
- return `likely_applicable`, `possibly_applicable_needs_review`, `not_applicable`, or `insufficient_data`
- expose warnings and assumptions

### Phase 4 - Deal Packaging Integration

- merge applicable promo intelligence into curated Odysseus Deals
- merge researched trip-angle intelligence into curated Odysseus Deals
- generate visitor-safe deal copy
- generate a primary niche/theme angle for each serious deal candidate
- keep agent-only notes out of public pages
- publish only deals with verified agent booking links

### Phase 4A - Research and Angle Discovery

- add a research brief generator for each candidate cruise
- collect ship amenity, destination, itinerary, seasonal, and audience-trend research
- identify competitor blind spots and underused marketing angles
- select one primary deal angle and several backup ad angles
- store research sources and factual guardrails with the deal package

### Phase 4B - Trend-Led Campaign Discovery

- add a workflow that starts from external trend/audience signals before selecting a cruise
- create trend-led deal campaign briefs
- translate each trend brief into Odysseus search criteria
- connect matching promo intelligence when relevant
- produce Meta/Google/TikTok targeting notes and hooks
- keep final publishing gated on a verified Odysseus package/share link

### Phase 4C - Targeting-Demographic Resource

- generate a package-specific `Targeting-Demographic` resource for every promoted Deal
- include niche keywords, trend keywords, targetable interests, negative keywords, and channel notes
- include audience objections and emotional drivers
- include source-grounded research summary and confidence scoring
- make this resource the source of truth for Meta/Google/TikTok/email targeting

### Phase 5 - Admin Review

- build internal review UI for promotion records and matched deals
- add approve/reject/pin controls
- support operator notes and manual override
- show booking-link health, last verified time, and expiration/staleness warnings

## Success Criteria

- The system captures every Today's View promotion detail page into an auditable cache.
- Agent instructions are preserved and separated from public copy.
- Offer terms are structured enough to filter and match against Odysseus cruises.
- Candidate cruises include ship, amenity, destination, itinerary, and trend research before public packaging.
- Each promoted cruise has a distinct Leisure Life angle, not just copied vendor promo language.
- Price advantages and agent perks are treated as value enhancers, not the main selection reason.
- Selected Deals feel curated, visually appealing, distinctive, and proprietary to Leisure Life's packaging.
- The system can generate deal campaign ideas from external trends or niche audiences before selecting a cruise.
- Every promoted Deal has its own comprehensive `Targeting-Demographic` resource.
- Ad targeting plans start from audience/trend fit, not generic cruise-buyer targeting.
- Public copy includes only qualified, source-grounded claims.
- The Deals page can use current vendor/agent perks to make cruises more appealing without inventing benefits.
- No public Deal is published without a verified Odysseus/CB package share link.
- Active public Deals are re-verified on a schedule and before paid ads go live.
- Broken or stale package links are hidden automatically instead of sending visitors to a dead booking path.

## Open Questions

- Should supporting `.docx` files be downloaded and parsed in Phase 1, or only linked until Phase 2?
- Should promo intelligence refresh on the same cadence as homepage Deals, or on its own operator command?
- Should we store expired promotions for historical comparison and strategy learning?
- Should promotion matching require operator approval every time, or can some high-confidence rules auto-attach?
- Should the visitor page expose promo details directly, or summarize them behind concise "current offer may apply" language?
