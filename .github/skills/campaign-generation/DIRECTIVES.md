# Campaign Directive System

Surgical changes to specific campaign assets without re-running the full pipeline.

**Back to [SKILL.md](./SKILL.md)**

---

## 1b. Campaign Directive System (Surgical Changes)

**Purpose:** The directive system lets an agent (or human) express editorial intent in natural language, resolve it to concrete field overrides, mark only the affected assets stale, and regenerate only those assets â€” without re-running the full ~100s brief pipeline.

**Durability rule:** If the user wants a correction to keep applying across future regenerations, make the change in the directive or upstream brief first. Use a directive when the correction should survive later asset refreshes; use a one-off asset repair only when the fix is intentionally local to that single asset.

**When to use it:**
- A specific scene image needs a prop or lighting change (e.g. "Change scene_003 to show a vinyl record on the bar rail instead of dice").
- A hero still needs a composition tweak (e.g. "Hero 2 should show the game box spine on the cafÃ© shelf, not generic dice").
- Prop families or allowed/discouraged props need updating across heroes, concepts, and documentary details.
- Any case where `"sceneImageMode": "all"` would regenerate the entire pool just to fix one or two images.

**When NOT to use it:**
- The production bible itself is missing or has empty `imagePrompt` fields â€” fix upstream via brief re-generation first.
- The campaign needs a full aesthetic pivot (energy mode, color palette, slogan) â€” re-run the brief engine instead.

### Two-Step API Flow

**Step 1 â€” Create the directive (resolves text â†’ concrete patch, marks assets stale):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/directives \
  -H "Content-Type: application/json" \
  -d '{ "text": "Make scene_003 show a vinyl record on the bar rail, keep sunset deck lighting" }'
```
Response includes `directive.id`, `affectedCount`, and inferred `scope`.

**Step 2 â€” Apply the directive (regenerates only stale assets):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/directives/[id]/apply
```

The apply step merges all previously applied directives into a single patch, patches the brief, runs only the generators for the affected scopes, clears stale flags, and saves the patched brief back to DynamoDB.

### Directive Scopes

| Scope | What gets invalidated | What re-runs |
|-------|-----------------------|--------------|
| `heroes` | `manifest.images.hero` | `generateHeroImages()` |
| `concepts` | `manifest.images.aestheticConcepts` | `generateAestheticConcepts()` |
| `scenes` | `manifest.images.sceneImages` | `generateSceneImages()` |
| `documentary_details` | `manifest.images.documentaryDetails` | documentary prompt builder + designed-ad source modules |
| `designed_ads` | `manifest.images.designedAdArtifacts` | ad template renderer (and its documentary detail ingredients) |
| `still_bible` | `manifest.images.hero` | `generateHeroImages()` with patched stills |
| `prop_families` | heroes + concepts + documentary_details | all three generators |

Scope is inferred automatically from which patch fields are non-empty. The resolution agent (`lib/campaigns/directive-agent.ts`) handles the translation from natural language to `DirectivePatch` (`stillPatches`, `scenePatches`, `allowedProps`, `discouragedProps`, `propFamilies`, `nicheEnhancedMoments`).

### Review the patch before applying

After Step 1, check `directive.patch` in the response. Confirm the resolution agent understood the intent correctly:
- `patch.scenePatches` should reference exact `sceneId` values from the production bible
- `patch.allowedProps` should describe concrete, renderable objects (not category names)
- `patch.propFamilies` should list specific physical items, not abstract concepts

If the patch looks wrong, do **not** apply it. Create a new directive with more precise language.

### Writing effective directive text

Effective directives describe **what a camera would see or what an illustrator would draw**, not categories or concepts:

| âŒ Too vague | âœ… Specific and renderable |
|---|---|
| "More board game energy" | "A half-finished Azul tile game on a teak cafÃ© table with coffee cups, morning sea light" |
| "Less spa-like" | "Remove robes, candles, and towel arrangements. Replace with casual indie wardrobe â€” denim, vintage tees, canvas bags" |
| "Better lighting" | "Shift all hero stills to morning golden light through port-side lounge windows, not sunset or twilight" |
| "Show the niche more" | "Add a Catan box spine visible on a cafÃ© shelf in the background of the lounge still" |

### Agent Discipline with Directives

- **Prefer a directive over `"sceneImageMode":"all"`** when the change is targeted. Burning the full scene pool wastes credits and time.
- **Verify the patch scope** in the create response. If you asked for a scene change but `scope` does not include `scenes`, the resolution agent misunderstood â€” inspect the `patch` and either rephrase the directive or apply it manually via `PATCH /api/groups/campaign/[slug]/brief`.
- **Poll the manifest after apply** the same way you poll after video generation. The apply route returns immediately with a jobId; generation runs in the background.
- **One repair pass rule still applies:** If a directive apply does not fix the issue (e.g. scene still lacks niche signal after regeneration), stop and escalate to the user. Do not chain multiple directives silently.
- **Do not use asset-only regeneration as the source of truth** for a recurring campaign rule. If the same fix would need to be repeated later, move it upstream now so later regenerations inherit it.

### When Directives Fail â€” Manual Scene Patch Fallback

The directive resolution agent (`lib/campaigns/directive-agent.ts`) can misinterpret scene-specific intent, translating "Change the atrium scene..." into `stillPatches` for hero stills instead of `scenePatches` for the production bible. This has been observed in production (May 2026). When it happens, the created directive has `scope` missing `scenes` and `patch.scenePatches` is empty.

**Do NOT apply a mis-scoped directive.** It regenerates 18 unrelated assets and leaves the scene untouched.

**Fallback workflow (verified):**

1. **Delete the stale scene asset** from the manifest so it shows as missing:
   ```powershell
   $body = @{ assetId = "img_scene_atrium_003" } | ConvertTo-Json
   Invoke-RestMethod -Uri "http://localhost:3000/api/groups/campaign/[slug]/media/manifest/scene-image-artifact" -Method DELETE -ContentType "application/json" -Body $body
   ```

2. **Fetch the current brief** via `GET /api/groups/campaign/[slug]/brief/readiness`. Extract `productionBible.sceneLibrary[].sceneId` to find the exact target record.

3. **PATCH the brief** directly, updating the scene's `imagePrompt`, `subjectAction`, and `environmentDetails` fields:
   ```powershell
   $pb = $brief.brief.productionBible
   $scene = $pb.sceneLibrary | Where-Object { $_.sceneId -eq "atrium" }
   $scene.imagePrompt = "Ship atrium, sunset, glowing sunset light. Over-the-shoulder view of a multigenerational group gathered around a large wooden table... [full revised prompt]"
   $scene.subjectAction = "feeling joy as a multigenerational group plays a piece-heavy board game together"
   $scene.environmentDetails = "grand staircase with ocean view, large wooden table covered with colorful game pieces"
   $body = @{ fieldEdits = @{ productionBible = $pb } } | ConvertTo-Json -Depth 10
   Invoke-RestMethod -Uri "http://localhost:3000/api/groups/campaign/[slug]/brief" -Method PATCH -ContentType "application/json" -Body $body
   ```

4. **Re-approve** the brief:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/api/groups/campaign/[slug]/brief/approve" -Method POST
   ```

5. **Regenerate with `missing_only`** so only the deleted scene re-runs:
   ```powershell
   $body = @{ assetTypes = @("scene_image"); sceneImageMode = "missing_only" } | ConvertTo-Json
   Invoke-RestMethod -Uri "http://localhost:3000/api/groups/campaign/[slug]/media/generate" -Method POST -ContentType "application/json" -Body $body
   ```

6. **Poll the manifest** to confirm the new asset (`img_scene_atrium_001`) appears with the patched prompt in `promptUsed`.

### Listing existing directives for a campaign

```bash
curl http://localhost:3000/api/groups/campaign/[slug]/directives
```

Returns all directives with their status (`pending`, `applied`, `failed`). Useful to audit what has already been changed and avoid conflicting patches.

**Full reference:** `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/SURGICAL_MODIFICATIONS/CAMPAIGN_DIRECTIVES.md`

