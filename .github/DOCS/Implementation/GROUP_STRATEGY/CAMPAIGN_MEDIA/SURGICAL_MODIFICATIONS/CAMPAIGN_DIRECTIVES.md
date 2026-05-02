# Campaign Directive System

**Status:** Implemented  
**Purpose:** Agent-addressable mechanism to fix arbitrary campaign issues and selectively regenerate only the affected artifacts — without re-running the full brief pipeline.

---

## The Problem It Solves

The full brief generation pipeline takes ~100s and cannot be surgically targeted. Before this system, fixing something like "make the board game props more specific — use Azul, Catan, Ticket to Ride instead of generic dice" required either:
- Manually editing the stored brief JSON and re-running all media generation, or
- Re-running the entire pipeline from scratch

A Campaign Directive gives an agent (or a human) a direct mechanism to express editorial intent in natural language, resolve it to concrete field overrides, mark only the affected assets stale, and regenerate only those assets.

---

## Architecture: Three Layers

```
Natural language directive text
        ↓  resolveDirective() — one LLM call (~1s)
DirectivePatch  (concrete field overrides)
        ↓  collectStaleAssetIds() — reads manifest
Asset stale flags set on the manifest  (invalidatedBy, invalidatedAt)
        ↓  POST /directives/[id]/apply — targeted generation
Regenerated assets replace stale ones in the manifest
```

The expensive pipeline stages (aesthetic engine, editors room, production bible — ~100s total) **never re-run**. Only the terminal generation calls (image API, ~5s per image) re-run for the affected pool.

---

## Data Model

### `CampaignDirective`

```typescript
interface CampaignDirective {
    id: string;                   // "dir_abc123f"
    slug: string;                 // campaign slug
    text: string;                 // "Make game props more specific — Azul, Catan, not generic dice"
    scope: DirectiveScope[];      // which pools are affected
    patch: DirectivePatch;        // resolved concrete overrides
    status: 'pending' | 'applied' | 'failed';
    affectedAssetIds: string[];   // asset IDs marked stale
    createdAt: string;
    appliedAt?: string;
    failureReason?: string;
}
```

### `DirectivePatch`

```typescript
interface DirectivePatch {
    allowedProps?: string[];         // replaces plausibility.allowedProps
    discouragedProps?: string[];     // replaces plausibility.discouragedProps
    nicheEnhancedMoments?: string[]; // replaces plausibility.nicheEnhancedMoments
    propFamilies?: string[];         // replaces identityBlueprint.propFamilies
    stillPatches?: Array<{ stillId: string; imagePrompt: string }>;
    scenePatches?: Array<{ sceneId: string; imagePrompt: string }>;
}
```

### `DirectiveScope` values

| Scope | What gets invalidated | What re-runs |
|-------|-----------------------|--------------|
| `heroes` | `manifest.images.hero` | `generateHeroImages()` |
| `concepts` | `manifest.images.aestheticConcepts` | `generateAestheticConcepts()` |
| `documentary_details` | `manifest.images.documentaryDetails` | documentary prompt builder + designed-ad source modules |
| `designed_ads` | `manifest.images.designedAdArtifacts` | ad template renderer (and its documentary detail ingredients) |
| `scenes` | `manifest.images.sceneImages` | `generateSceneImages()` |
| `still_bible` | `manifest.images.hero` | `generateHeroImages()` with patched stills |
| `prop_families` | heroes + concepts + documentary_details | all three generators |

Scope is inferred automatically from which patch fields are non-empty — you do not set it manually.

### `AssetRecord` stale fields

Two optional fields were added to `AssetRecord`:

```typescript
invalidatedBy?: string;   // directive ID that staled this asset
invalidatedAt?: string;   // ISO timestamp
```

These are cleared when the apply step regenerates a replacement. The review UI can use `invalidatedBy` to show a "⚑ Stale — [directive text]" badge.

---

## DynamoDB Storage

| PK | SK | Content |
|----|-----|---------|
| `CAMPAIGN#{slug}` | `DIRECTIVE#{id}` | `{ directiveJson, status, createdAt }` |

The directive is stored as a JSON string under `directiveJson`. The `status` and `createdAt` are also top-level fields to enable future GSI queries.

---

## API

### `POST /api/groups/campaign/[slug]/directives`

Creates a directive. Resolves the text to a `DirectivePatch` via one LLM call, marks affected assets stale in the manifest, and saves the directive with `status: 'pending'`.

**Does not regenerate** — the caller controls when to apply.

**Body:**
```json
{ "text": "Make the game props more specific — use Azul, Catan, and Ticket to Ride instead of generic dice and tokens" }
```

**Response:**
```json
{
  "directive": { "id": "dir_abc123f", "status": "pending", "scope": ["heroes", "concepts", "prop_families", "designed_ads"], ... },
  "affectedCount": 9
}
```

**Error cases:**
- `400` — missing or empty `text`
- `404` — no brief or campaign found for slug
- `422` — directive resolved to an empty patch (too vague; ask for more specificity)
- `500` — LLM resolution or DynamoDB error

---

### `POST /api/groups/campaign/[slug]/directives/[id]/apply`

Regenerates the stale assets. Merges all previously applied directives + this one into a single patch, applies it to the brief via `patchBriefForDirective()`, calls the appropriate generators for each stale pool, clears `invalidatedBy` flags, saves the patched brief back to DynamoDB, and marks the directive `applied`.

**Body:** none

**Response:**
```json
{
  "regenerated": [ /* AssetRecord[] */ ],
  "directive": { "id": "dir_abc123f", "status": "applied", "appliedAt": "2026-05-01T..." }
}
```

When a directive touches `documentary_details` or `designed_ads`, the apply route now regenerates both documentary source modules and rendered designed ads in one pass so the ad pack stays internally consistent.

**Error cases:**
- `404` — directive or campaign not found
- `409` — directive already applied
- `500` — generator or DynamoDB error (partial application: some pools may have regenerated before the failure; directive status is set to `failed`)

---

### `GET /api/groups/campaign/[slug]/directives`

Lists all directives for a campaign, ordered by `createdAt`.

**Response:**
```json
{ "directives": [ /* CampaignDirective[] */ ] }
```

---

## How the Resolution Agent Works

`resolveDirective(text, brief)` in `lib/campaigns/directive-agent.ts`:

1. Extracts a compact summary of the relevant brief fields: `allowedProps`, `discouragedProps`, `nicheEnhancedMoments`, `propFamilies`, and `stillLibrary` sample.
2. Sends a single LLM call (`modelForTask('agentic')` → `CLAUDE_4_SONNET`) with the directive text and brief summary.
3. The model returns a `DirectivePatch` JSON object.
4. The patch is validated against `DirectivePatchSchema` and returned.

The resolution prompt explicitly instructs the model to:
- Be physically specific (renderable props, not category names)
- Only include fields that the directive actually affects (omit others)
- Copy `stillId` values exactly from the brief summary when patching stills

---

## How the Patch Is Applied

`patchBriefForDirective(brief, patch)` in `lib/campaigns/directive-patch.ts`:

- Returns a **new brief object** — the original is not mutated.
- Only overwrites fields the patch explicitly provides.
- Applies in order: `allowedProps/discouragedProps/nicheEnhancedMoments` → `propFamilies` → `stillPatches` → `scenePatches`.
- When applied, the patched brief is saved back to DynamoDB, so future manual generation runs also use the directive's overrides.

`mergeActiveDirectivePatches(directives)` combines all applied directives into one patch, with later directives winning on conflicting fields.

---

## Example Walkthrough

**Campaign:** `board-games-at-sea`  
**Problem:** Hero images show no board game props at all — generic "people on deck" scenes.

**Step 1 — Create directive:**
```bash
curl -X POST /api/groups/campaign/board-games-at-sea/directives \
  -H "Content-Type: application/json" \
  -d '{ "text": "Make the board game props specific and renderable — use Azul tile boards, Catan hex pieces, and Ticket to Ride train tokens as incidental cues on café tables, bar rails, and lounge armrests. No generic dice or cards." }'
```

Agent resolves to:
```json
{
  "allowedProps": [
    "half-finished Azul tile board on teak café table, morning sea light",
    "Catan hex pieces arranged mid-game on lounge ottoman, ocean visible behind",
    "small wooden Ticket to Ride trains scattered on bar rail, drinks beside them"
  ],
  "propFamilies": ["Azul tiles on teak", "Catan hex pieces", "Ticket to Ride trains", "game box spine on café shelf"],
  "nicheEnhancedMoments": [
    "two guests leaning over a nearly-finished Azul game at a window table, coffee cups beside the board, sea light behind them",
    "lone game box propped on a deck chair armrest, logo visible but not staged"
  ],
  "stillPatches": [
    { "stillId": "still_001", "imagePrompt": "Two guests at a lounge table, a mid-game Azul board between them — blue and orange tiles in a partial pattern — teak surface, sea light through lounge windows" }
  ]
}
```

**Response:** `{ affectedCount: 7, directive: { id: "dir_f3a9b2c1", status: "pending", ... } }`

**Step 2 — Apply:**
```bash
curl -X POST /api/groups/campaign/board-games-at-sea/directives/dir_f3a9b2c1/apply
```

→ `generateHeroImages(patchedBrief, shipName, 5)` runs.  
→ `generateAestheticConcepts(patchedBrief, 4)` runs.  
→ 9 new `AssetRecord`s returned with `tags: ["hero", "directive:dir_f3a9b2c1"]`.  
→ Stale flags cleared.  
→ Patched brief saved to DynamoDB.

**Step 3 — Review in UI**  
The regenerated heroes appear in the review panel under Heroes & Concepts. Old stale assets are replaced. The directive is visible in a future "Directive history" panel.

---

## What Re-runs vs. What Doesn't

| Pipeline Stage | Re-runs? |
|----------------|----------|
| Aesthetic engine (Pass 1/2/refinement) | ❌ Never |
| Editors room (anchors, still bible generation) | ❌ Never |
| Production bible generation | ❌ Never |
| Identity blueprint generation | ❌ Never |
| Hero image generation | ✅ If scope includes `heroes` or `still_bible` |
| Concept image generation | ✅ If scope includes `concepts` |
| Scene image generation | ✅ If scope includes `scenes` |
| Documentary detail generation | ✅ If scope includes `documentary_details` |
| Designed ad template rendering | ✅ If scope includes `designed_ads` |
| Landing page / distribution | ❌ Reads manifest automatically |

---

## File Reference

| File | Role |
|------|------|
| `lib/campaigns/schema.ts` | `CampaignDirective`, `DirectivePatch`, `DirectiveScope`, `StillPatch` types; `invalidatedBy`/`invalidatedAt` on `AssetRecord` |
| `lib/campaigns/directive-store.ts` | DynamoDB: `saveDirective`, `getDirective`, `listDirectives`, `updateDirectiveStatus` |
| `lib/campaigns/directive-agent.ts` | LLM resolution: `resolveDirective()`, `inferScopeFromPatch()` |
| `lib/campaigns/directive-patch.ts` | Pure functions: `patchBriefForDirective()`, `mergeActiveDirectivePatches()`, `collectStaleAssetIds()` |
| `app/api/groups/campaign/[slug]/directives/route.ts` | `GET` (list) + `POST` (create + resolve) |
| `app/api/groups/campaign/[slug]/directives/[id]/apply/route.ts` | `POST` (apply — regenerate stale assets) |

---

## Future Extensions

- **Per-asset directives:** Scope a directive to a single `assetId` ("Revise only Hero 2 to show Catan"). Currently scoped by pool; single-asset targeting requires a `targetAssetIds` filter field in the directive.
- **Review UI integration:** Show `invalidatedBy` badge on stale assets with a one-click apply button.
- **Directive history panel:** `GET /directives` already provides the data; needs a UI surface.
- **Pre-apply preview:** A `POST /directives/[id]/preview` endpoint that returns the patched prompts without running generation — for human review before spending on image API calls.
- **Documentary detail + designed ad regeneration:** The apply route now handles heroes, concepts, documentary details, and designed ads. If you add new module families later, extend `DirectiveScopeEnum`, `collectStaleAssetIds()`, and the apply route together so stale invalidation and regeneration stay in sync.
