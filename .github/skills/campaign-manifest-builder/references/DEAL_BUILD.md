# Deal Campaign Build

## 1. Source contracts

Read before writing:

- `lib/cb/deals-system/curated-deal-types.ts`
- `lib/cb/deals-system/deal-trip-manifest-types.ts`
- `lib/cb/deals-system/deal-unified-manifest-types.ts`
- `lib/cb/deals-system/deals-dynamo-store.ts`
- `app/api/tests/deals-system/curated-deal/route.ts`
- `app/api/tests/deals-system/trip-manifestation/route.ts`
- `app/api/tests/deals-system/copywriter/route.ts`
- `app/api/tests/deals-system/funnel-synthesis/route.ts`
- `app/api/tests/deals-system/publish/route.ts`

Public-path Deal records use the `lll-deals-system` table:

```text
DEAL#<id>
BRIEF#<id>
MANIFEST#<id>
SYNTHESIS#<id>
PROMO#<id>
```

Use exported get/list/upsert functions from `deals-dynamo-store.ts`.

Discovery ideas, unified manifests, and ad-copy artifacts may still use their defined local caches. Use their cache helpers; do not hand-edit files unless the helper is unavailable and the cache is confirmed canonical.

## 2. Exact-package fast path

When the operator supplies a package id or package URL:

1. Load the exact package through the existing Odysseus lookup.
2. Capture real:
   - package id
   - title
   - cruise line
   - ship
   - sail date
   - nights
   - departure port
   - ports/day-by-day itinerary
   - cabin prices
   - booking URL and SIID
3. Identify matching promo records.
4. Assemble the Workbench Deal:

```http
POST /api/tests/deals-system/curated-deal
Content-Type: application/json

{
  "action": "assemble",
  "dealId": "<stable id>",
  "briefId": "<stable brief id>",
  "packageId": "<verified package id>",
  "siid": "<agent siid>",
  "bookingUrl": "<verified or constructed package URL>",
  "promoRecordIds": ["<promo id>"],
  "cruiseFacts": {
    "title": "<real title>",
    "cruiseLine": "<real line>",
    "shipName": "<real ship>",
    "itineraryName": "<real title>",
    "nights": 7,
    "sailDateIso": "YYYY-MM-DD",
    "departurePort": "<real port>",
    "portsOfCall": ["<real port>"],
    "cabinPrices": {
      "inside": 0,
      "outside": 0,
      "balcony": 0,
      "suite": 0,
      "currencyCode": "USD"
    }
  }
}
```

Omit unavailable cabin tiers instead of writing zero into durable state. The route leaves the Deal in `needs_review`.

## 3. Generate strategy and enter the pipeline

For the assembled Deal:

1. Attach the selected Deal's promos, not merely the top assembly form's promos.
2. Call `generate_angles`.
3. Present the 1 to 3 options and recommend one.
4. If the operator supplied an angle, preserve it and generate only missing audience/visual/targeting fields.
5. Check promo handoff warnings and blocking issues.
6. Call `send_to_pipeline` with:
   - campaign angle
   - target audience
   - visual angle
   - targeting keywords

This creates the resolved discovery idea and trip manifest expected by the mature pipeline. Follow the returned `nextUrl`.

## 4. Complete copy and funnel stages

Continue through:

1. Trip Manifestation - confirm `resolvedPackage`.
2. Copywriter - generate variants from the unified manifest.
3. Operator selection - select the final variant unless delegated.
4. Funnel Synthesis - generate broad landing copy, targeted carousel, and image candidates.
5. Image curation - select hero, gallery, and section images.
6. Publish assembly - assemble the Curated Deal in `needs_review`.

Full promotion briefs must reach the unified manifest and copywriter. A promo id alone is not enough.

## 5. Direct Deal writes

Directly upsert a `CuratedOdysseusDeal` only when reconstructing the Workbench/API result is necessary.

Required safety state:

- `status: "needs_review"`
- real `packageId`
- honest `bookingUrlSource`
- actual link health, usually `unknown` until verified
- complete `cruiseFacts`
- provenance for generated/scaffolded stages
- `operatorApproval.status: "needs_review"`
- current approval gates

Do not mark:

- `linkHealth.status: "valid"` without validation
- `operatorApproval.status: "approved"` without operator action
- `status: "bookable"` as part of assembly
- media `ready` when only concepts/scaffolds exist

## 6. Deal checkpoints

Stop at:

- package mismatch or unresolved link
- promo market/applicability warning
- materially different angle choice
- final ad variant selection
- hero/gallery/section image selection
- text-only media waiver
- approval/homepage eligibility

Never treat the existence of a Deal record as permission to publish it.
