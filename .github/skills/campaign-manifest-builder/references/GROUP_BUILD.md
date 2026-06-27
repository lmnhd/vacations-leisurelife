# Group Campaign Build

## 1. Source contracts

Read before writing:

- `lib/campaigns/types.ts` - `Campaign`
- `lib/campaigns/campaign-store.ts` - blueprint, dossier, and brief persistence
- `app/api/groups/discovery/seed/route.ts` - operator-seeded concept path
- `app/api/groups/campaign/[slug]/route.ts` - supported campaign patch fields
- `app/api/groups/campaign/[slug]/research-dossier/route.ts`
- `app/api/groups/campaign/[slug]/brief/route.ts`
- `app/api/groups/campaign/[slug]/brief/approve/route.ts`
- `app/api/groups/campaign/[slug]/media/generate/route.ts`
- `lib/campaigns/media/media-store.ts`

Campaign metadata is stored in `lll-shadow-campaigns` at:

```text
PK = CAMPAIGN#<slug>
SK = METADATA
```

Media manifests are stored under:

```text
PK = CAMPAIGN#<slug>
SK = MEDIA#MANIFEST
```

Use `saveCampaignBlueprint`, `upsertCampaignResearchDossier`, `saveAestheticBrief`, and `saveMediaManifest`; do not improvise raw writes.

## 2. Choose the insertion path

### Seed path

Use for a niche, holiday angle, or concept without a fixed sailing:

```http
POST /api/groups/discovery/seed
Content-Type: application/json

{
  "seed": "<operator concept>",
  "deepResearch": true
}
```

This creates the same discovery blueprint path as the UI and preserves deduplication/inventory gates.

### Existing blueprint patch

Use for a known slug and supported corrections:

```http
PATCH /api/groups/campaign/<slug>
```

Supported fields include status, ship correction, visual flavor, optional gathering moments, final itinerary, and Tour Conductor fields. Ship correction does not regenerate downstream copy.

### Direct blueprint assembly

Use only when a mature concept and verified sailing make discovery redundant.

Create a complete `Campaign` object and persist it through `saveCampaignBlueprint`. At minimum preserve:

- `PK`, `SK`, `id`
- `name`, `description`
- `targetDates`, `targetDatesSource`
- `minCabinsRequired`
- `status`
- `createdAt`, `updatedAt`

Populate all available niche, vacation-fit, community, targeting, inventory, and booking fields. Do not fabricate omitted fields merely to make the record look complete.

For verified inventory, keep these synchronized:

- `shipTarget`
- `matchedShipName`
- `matchedSailDate`
- `targetDates`
- `targetDatesSource: "inventory"`
- `matchedDeparturePort`
- `matchedNights`
- itinerary fields
- pricing/link fields
- `pricingStatus`
- `activeBookingMode`
- inventory health/candidates

If the sailing is retail fallback rather than a confirmed group block, represent that honestly. Do not stamp `CB_MATCHED` or group-link fields without evidence.

## 3. Build to brief review

After blueprint persistence:

1. Read the campaign back with `getCampaignBlueprint` or `scripts/agent/campaign-status.ts`.
2. Generate the research dossier before the brief whenever possible.
3. Generate the brief through the durable Agent API path:

```powershell
npx tsx scripts/enqueue-and-run-brief.ts <slug>
```

4. Check readiness and production-bible image prompts.
5. Apply one narrow repair pass if required.
6. Stop at `/tests/brief-studio` for consequential creative approval.

Do not approve the brief merely to keep automation moving unless the operator explicitly delegated brief approval.

## 4. Build to image review

After brief approval:

1. Generate one image layer per call.
2. Prefer the order:
   - ship references
   - hero/concept/flyer images
   - scene images
   - documentary details and designed ads
3. Respect the dossier and production-bible gates.
4. Read the manifest after every generation step.
5. Stop after scene generation for operator review.
6. Point to `/tests/media-generation?slug=<slug>`.
7. Use `/tests/landing-studio` or the current landing image curation surface for final hero/gallery selection.

Do not generate expensive video automatically after scenes. Do not publish automatically.

## 5. Existing-state repair

When an existing manifest has the wrong ship/date:

1. Repair campaign metadata first.
2. Re-run inventory matching if required.
3. Regenerate dossier/brief if the factual change affects creative direction.
4. Regenerate affected manifest copy and assets.
5. Preserve unaffected operator selections where ids remain valid.

Never repair a factual conflict only by editing exported media-manifest JSON.

## 6. Group checkpoints

Stop at:

- inventory conflict
- brief approval
- persistent brief lint warning
- scene review
- landing hero/gallery selection
- publication or ad dispatch
