# Image Reference System Update - 2026-06-05

## Why This Exists

This note documents the June 5, 2026 update to the campaign ship-reference pipeline after `grand-costumed-promenade-explorer` showed reference images from the wrong Royal Caribbean ships.

Observed symptom:

- Campaign slug: `grand-costumed-promenade-explorer`
- Intended ship: `Explorer of the Seas`
- Stored metadata before repair:
  - `shipTarget: Explorer of the Seas`
  - `matchedShipName: Symphony of the Seas`
- Generated/imported references included Symphony of the Seas and generic Royal Caribbean results, including Wonder of the Seas, because the media pipeline treated `matchedShipName` as authoritative.

This was not a browser cache issue. It was stale campaign metadata plus permissive reference reuse.

## Root Causes

### 1. Stale Matched Ship Beat the Blueprint Ship

The shared ship helpers prefer `matchedShipName` over `shipTarget`. That is usually correct after Phase B, because the matched inventory ship is the real purchasable ship. But if an operator later corrects `shipTarget` and leaves `matchedShipName` behind, downstream systems keep using the stale matched ship.

For this campaign, the reference search was correctly following the old rules:

```text
shipTarget: Explorer of the Seas
matchedShipName: Symphony of the Seas
resolved ship for references: Symphony of the Seas
```

So SerpAPI queries were built for Symphony.

### 2. Existing References Were Reused Without Ship Provenance

Reference records did not carry a durable `ship:<name>` tag. The orchestrator merged existing `manifest.images.shipReferences` into new runs without checking whether those references still matched the campaign's current ship.

That made old references behave like a hidden cache.

### 3. Generic Destination Queries Could Admit Other Ships

`offboard_excursion` queries are destination-oriented, such as:

```text
Caribbean cruise excursion beautiful travel photo
```

Those can surface generic cruise pages or pages for unrelated ships, such as Wonder of the Seas. The updated filter now rejects records that mention a known different specific ship.

### 4. Full Media Runs Scheduled References and Heroes Together

Before this update, ship-reference discovery and hero generation were both queued in the same parallel group. In a full media run, heroes could start before newly imported references were available, causing weaker fallback behavior.

## Code Changes

### Ship Identity Guard

File:

```text
lib/campaigns/media/ship-reference-service.ts
```

New behavior:

- `assertShipReferenceIdentityIsConsistent(campaign)` blocks reference discovery when `shipTarget` and `matchedShipName` are both recognized specific ships and they differ.
- `resolveShipReferenceShipName(campaign)` calls that guard before returning a ship.

Example blocked state:

```text
Ship reference discovery blocked: campaign shipTarget is "Explorer of the Seas" but matchedShipName is "Symphony of the Seas".
```

This is intentional. It forces metadata repair before spending on references.

### Reference Provenance Tags

New reference records now include:

```text
ship:<normalized ship name>
match:exact_ship | match:same_class | match:generic_cruise
```

Example:

```text
ship:explorer of the seas
match:exact_ship
```

This lets later runs distinguish fresh ship-specific references from stale references.

### Existing Reference Filtering

File:

```text
lib/campaigns/media/ship-reference-service.ts
```

New function:

```ts
filterShipReferenceRecordsForCampaign(campaign, records)
```

Used by:

```text
lib/campaigns/media/media-orchestrator.ts
```

The orchestrator filters existing ship references before they can seed:

- new reference discovery exclusions
- hero generation
- scene binding
- designed ad source manifests
- final manifest merges

### Reference Discovery Runs Before Heroes

File:

```text
lib/campaigns/media/media-orchestrator.ts
```

If `ship_reference_image` is requested, the orchestrator now awaits ship-reference discovery/import before scheduling hero generation. This prevents full media runs from using text-only hero fallback when the reference pool is still being built.

### Manual Ship Correction Clears Conflicting Match

File:

```text
app/api/groups/campaign/[slug]/route.ts
```

When PATCHing `shipTarget`, if the old `matchedShipName` conflicts and no new `matchedShipName` is supplied, the route clears stale inventory-match fields:

- `matchedShipName`
- `matchedSailDate`
- `matchedDeparturePort`
- `matchedNights`
- `cbagenttoolsGroupId`
- `cbagenttoolsBookingLink`
- `cbPriceAdvantage`
- `odysseusRetailBookingLink`

It also sets:

```text
pricingStatus: UNMATCHED
```

## How To Diagnose This Later

### Check The Campaign's Resolved Ship State

Run:

```powershell
npx tsx --env-file=.env.local -e "import { getCampaignBlueprint } from './lib/campaigns/campaign-store'; import { resolveShipReferenceShipName } from './lib/campaigns/media/ship-reference-service'; (async()=>{ const slug='CAMPAIGN_SLUG'; const c=await getCampaignBlueprint(slug); if(!c) throw new Error('missing campaign'); console.log(JSON.stringify({shipTarget:c.shipTarget, matchedShipName:c.matchedShipName ?? null, resolvedShip:resolveShipReferenceShipName(c)}, null, 2)); })().catch(e=>{ console.error(e.message); process.exit(1); });"
```

If this throws a ship conflict, repair campaign metadata before regenerating references.

### Inspect Current Ship References

Run:

```powershell
npx tsx --env-file=.env.local -e "import { getCampaignBlueprint } from './lib/campaigns/campaign-store'; import { getMediaManifest } from './lib/campaigns/media/media-store'; import { filterShipReferenceRecordsForCampaign, resolveShipReferenceShipName } from './lib/campaigns/media/ship-reference-service'; (async()=>{ const slug='CAMPAIGN_SLUG'; const campaign=await getCampaignBlueprint(slug); const manifest=await getMediaManifest(slug); if(!campaign) throw new Error('missing campaign'); const refs=manifest?.images.shipReferences ?? []; const filtered=filterShipReferenceRecordsForCampaign(campaign, refs); console.log(JSON.stringify({resolvedShip:resolveShipReferenceShipName(campaign), totalReferences:refs.length, compatibleReferences:filtered.length, sample:filtered.slice(0,10).map(r=>({assetId:r.assetId, tags:r.tags, sourceQuery:r.sourceQuery, promptUsed:r.promptUsed, sourcePageUrl:r.sourcePageUrl}))}, null, 2)); })().catch(e=>{ console.error(e.message); process.exit(1); });"
```

If `compatibleReferences` is much lower than `totalReferences`, the manifest contains stale references from an older ship state. New media runs should filter them out, but it is usually best to regenerate ship references.

## How To Repair A Campaign

### Case A: `shipTarget` Is Correct, `matchedShipName` Is Stale

If the campaign should use `shipTarget`, clear the stale match by PATCHing `shipTarget` again. The updated route will clear conflicting inventory metadata.

With dev server running:

```powershell
Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:3000/api/groups/campaign/CAMPAIGN_SLUG" `
  -ContentType "application/json" `
  -Body '{"shipTarget":"Explorer of the Seas"}'
```

If not using the dev server, patch Dynamo through the local store:

```powershell
npx tsx --env-file=.env.local -e "import { getCampaignBlueprint, saveCampaignBlueprint } from './lib/campaigns/campaign-store'; (async()=>{ const slug='CAMPAIGN_SLUG'; const c=await getCampaignBlueprint(slug); if(!c) throw new Error('missing campaign'); const updated={...c, shipTarget:'Explorer of the Seas', pricingStatus:'UNMATCHED', updatedAt:new Date().toISOString()}; delete updated.matchedShipName; delete updated.matchedSailDate; delete updated.matchedDeparturePort; delete updated.matchedNights; delete updated.cbagenttoolsGroupId; delete updated.cbagenttoolsBookingLink; delete updated.cbPriceAdvantage; delete updated.odysseusRetailBookingLink; delete updated.odysseusItinerarySummary; delete updated.odysseusPortsOfCall; await saveCampaignBlueprint(updated); console.log('cleared stale ship match for '+slug); })().catch(e=>{ console.error(e); process.exit(1); });"
```

After clearing, rerun Phase B/rematch before launch if the campaign needs a real booking link.

### Case B: `matchedShipName` Is Correct, `shipTarget` Is Stale

Patch `shipTarget` to match the real inventory ship, then regenerate the brief/production bible if ship-specific copy or scene planning already exists.

```powershell
Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:3000/api/groups/campaign/CAMPAIGN_SLUG" `
  -ContentType "application/json" `
  -Body '{"shipTarget":"REAL SHIP NAME","matchedShipName":"REAL SHIP NAME"}'
```

## Regenerating References

After metadata is clean, regenerate references before heroes/scenes.

Use the media-generation UI or API with:

```json
{"assetTypes":["ship_reference_image"]}
```

Then generate reference-dependent media:

```json
{"assetTypes":["hero_image","scene_image"]}
```

For a full media run, the orchestrator now performs ship-reference discovery before scheduling heroes.

## Verification Commands

Run focused reference tests:

```powershell
npx tsx lib/campaigns/media/__tests__/reference-pipeline.phase8.test.ts
```

Run typecheck:

```powershell
npx tsc --noEmit
```

Expected focused-test coverage:

- R2/storage URL is preferred over third-party source URL.
- Placeholder R2 URLs fall back to third-party source URL.
- Specific ship conflicts block reference discovery.
- Existing stale references for Symphony/Wonder are filtered out when the campaign resolves to Explorer.

## Known Limits

- The specific-ship conflict guard only recognizes ships listed in `KNOWN_SPECIFIC_SHIP_NAMES` in `ship-reference-service.ts`. Add new ships there if the system starts working with other specific vessels.
- Existing old records may lack `ship:<name>` tags. The filter falls back to metadata inspection, but it is safer to regenerate references after any ship correction.
- `offboard_excursion` references are destination-oriented, so they can be less ship-specific. They are now rejected when they mention a known different ship.
- This update does not delete old R2 objects. It prevents stale records from being reused or carried forward in merged manifests.

## Related Files

```text
lib/campaigns/media/ship-reference-service.ts
lib/campaigns/media/media-orchestrator.ts
app/api/groups/campaign/[slug]/route.ts
lib/campaigns/media/__tests__/reference-pipeline.phase8.test.ts
.github/skills/campaign-generation/CAMPAIGN_PROCESS_MEMORY.md
```
