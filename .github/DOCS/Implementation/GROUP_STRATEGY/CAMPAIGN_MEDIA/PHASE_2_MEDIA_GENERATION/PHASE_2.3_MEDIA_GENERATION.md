# Phase 3: Designed Media (Ad Artifact Pack)
### Ad-First, Code-Rendered Static Creative

**Status:** Implemented (Phase 3 baseline)  
**Primary outcome:** Static ad media now ships as a *designed artifact pack* (structured layouts rendered in code), instead of relying on full-scene AI images to look like ads.

---

## What Changed From Phase 2

Phase 2 largely treated static ad creative as "derived from hero images + copy". That produced images that were cleaner than earlier generations, but still felt like isolated scenes and often drifted into awkward staged moments.

Phase 3 introduces an ad-first designed media system:

1. We generate a small set of **documentary detail image modules** (ingredient images).
2. We render final static ads with **code-owned typography + layout** (no model-rendered text).
3. We store both the source modules and the finished ads in the same `CampaignMediaManifest`.

This reduces brittleness (no mangled AI typography) and makes the output look like real ad creative for Meta/TikTok/Google placements.

---

## Core Principle

**Stop generating full "people on a cruise deck doing niche thing" scenes as the default ad unit.**

Instead:

- **AI images become ingredients** (documentary modules with negative space).
- **The app becomes the designer** (layout, copy, CTA, metadata, sizes).

---

## New Asset Types + Manifest Sections

Two new asset types were added:

- `documentary_detail_image`  
  Ingredient images used as modules inside templates.
- `designed_ad_artifact`  
  Final rendered static ads (PNG).

The `CampaignMediaManifest.images` schema was extended:

- `images.documentaryDetails: AssetRecord[]`
- `images.designedAdArtifacts: AssetRecord[]`

See: `lib/campaigns/schema.ts`

---

## Designed Ad Artifact Pack (What It Produces)

Current Phase 3 pack produces:

- `editorial_cover_ad` (4:5, 1080x1350) for IG/FB feed
- `quote_card` (1:1, 1080x1080)
- `itinerary_toc_card` (4:5, 1080x1350) for carousel card
- `contributor_card` (1:1, 1080x1080)
- `type_hook_card` (9:16, 1080x1920) for Stories/Reels/TikTok still
- `image_detail_ad` (1.91:1, 1200x628) for FB/Google display

See: `lib/campaigns/design-system/ad-templates.ts`

---

## Rendering Stack (No Resvg Runtime Dependency)

Templates render via:

- `satori` to produce SVG from React elements
- `sharp` to rasterize SVG -> PNG

This was selected to avoid route-module evaluation issues encountered with direct `@resvg/resvg-js` imports.

See: `lib/campaigns/design-system/renderer/satori-renderer.ts`

---

## Image Prompt System: Documentary Detail Modules

Phase 3 introduces a dedicated "image ingredient" prompt taxonomy. These prompts are designed to:

- Avoid staged niche events (no band-on-deck, no workshops, no conference energy)
- Preserve cruise-native material truth (railings, teak, brass, marine light)
- Leave negative space for typography overlays
- Enforce "no readable text"

Kinds:

- `trust_photo`
- `artifact_still_life`
- `texture_plate`
- `human_glimpse`
- `motion_plate`

See: `lib/campaigns/design-system/documentary-prompts.ts`

### Energy Alignment Directive (Critical Fix For "Vibe Mismatch")

Documentary prompts now receive an *energy directive* derived from the campaign identity (energetic, warm, premium, etc). This is specifically meant to prevent failures like:

- copy says "Rock the Waves, Feel the Beat"
- but the generated module looks like a calm spa balcony

The directive changes lighting/tempo cues (eg, after-hours amber, higher contrast, social residue) without requiring staged performance.

See: `buildEnergyDirective()` in `lib/campaigns/design-system/documentary-prompts.ts`

---

## Tokens: How Copy + Design Inputs Are Derived

Designed ads are rendered from a deterministic token set derived from:

- the approved `CampaignAestheticBrief`
- the campaign blueprint (when present)
- the campaign identity blueprint (energy mode, social scale, avoid list)

Tokens include:

- headline, subhead, CTA
- route/vessel/date metadata
- section labels
- accent color
- "italic word" used as a consistent brand accent

See: `lib/campaigns/design-system/niche-tokens.ts`

---

## How To Run It

### Test endpoint (what the UI uses)

`POST /api/groups/campaign/[slug]/media/test/images`

Body:

```json
{ "generator": "designed_ad_artifacts" }
```

This will:

1. generate `documentary_detail_image` modules
2. render `designed_ad_artifact` PNGs via templates
3. upload binaries to R2
4. persist `AssetRecord`s
5. upsert manifest sections:
   - `images.documentaryDetails`
   - `images.designedAdArtifacts`

See: `app/api/groups/campaign/[slug]/media/test/images/route.ts`

### Full pipeline

The orchestrator also supports running designed ads as part of a full media run when `assetTypes` include `designed_ad_artifact`.

See: `lib/campaigns/media/media-orchestrator.ts`

### Config

Designed-media mode is controlled by:

- `DESIGNED_MEDIA_MODE = off | ad_artifacts_only | full_designed_media`

Default is currently `ad_artifacts_only`.

See: `DESIGNED_MEDIA_CONFIG` in `lib/campaigns/media/media-pipeline-config.ts`

---

## Where To See The Images

The generator returns JSON that includes CDN URLs for:

- source modules (`documentaryDetails[].url`)
- final ads (`designedAds[].url`)

Additionally, the media review UI now includes a **Designed Ads** tab that pulls from:

- `manifest.images.designedAdArtifacts`
- `manifest.images.documentaryDetails` (as the ingredient sources)

See: `app/(tests)/tests/media-generation/media-review-panel.tsx`

---

## Downstream Identification (Instagram/Facebook/etc)

Even when campaign identity text is identical across assets (it is campaign-level guidance), assets are differentiated downstream by:

1. `assetId` (eg, `ad_editorial_cover_4x5`, `ad_type_hook_9x16`)
2. `assetType` (`designed_ad_artifact` vs `documentary_detail_image`)
3. `tags` that encode placement intent (eg, `instagram_feed`, `tiktok`, `google_display`) and ad kind (eg, `quote`, `itinerary`)
4. `dimensions`
5. optional `sourceImageUrl` (traceability from ad -> module)

The distribution schedule planner selects designed ad assets primarily using `tags` per platform preference, falling back to crops/heroes when needed.

See: `lib/campaigns/distribution-planner.ts`

---

## Creative Alignment Fixes (Phase 3 Support Work)

Several Phase 3 fixes were made to reduce "false keyword triggers" and downstream vibe drift:

1. **Identity Blueprint false positives reduced**
   - Overbroad matches like `club`/`drop`/`rock` were tightened to music-specific phrases.
   - Optional AI classifier support added (routes through the LLM gateway).
   - Key env:
     - `CAMPAIGN_IDENTITY_AI_MODE=off | deterministic_only | on`

   See: `lib/campaigns/design-system/identity-blueprint.ts`

2. **Ship brand inference hardened**
   - Removed substring brand inference; brand is now inferred from canonical ship names.

   See: `lib/campaigns/ship-copy-alignment.ts`

3. **Aesthetic issue detection regex tightened**
   - `exact_time_strings` now matches real time formats (not "2026:11").
   - `privacy_line_missing` tightened to avoid prefix false positives.

   See: `lib/campaigns/aesthetic-fixers/registry.ts`

4. **Reviewer optionality check fixed**
   - `welcome` no longer triggers optionality by itself; only "welcome to join/drop-in" forms count.

   See: `lib/campaigns/trinity/agents/reviewer.ts`

5. **Discovery Step 3 prompt: visual anchor signals strengthened** *(upstream root-cause fix)*
   - The brief engine's `nicheSignalEmbedding` and anchor compliance gate were failing because Discovery was producing activity labels (`"Poolside Game Demos"`) rather than renderable visual anchors.
   - Critical requirement descriptions for `cruiseNativeMoments`, `allowedThemeSignals`, and `optionalGatheringMoments` were rewritten to demand specific physical props, textures, or environmental set-dressing — things a photographer could capture or an illustrator could draw.
   - Worked examples were embedded directly in the prompt (e.g., "a half-finished Azul game on a teak table with coffee cups and morning light through a lounge window").
   - The same specificity constraints are now reflected in the JSON field descriptions so the schema layer reinforces the prompt layer.
   - This is a single upstream fix: stronger signals here cascade through the brief engine and eliminate anchor compliance drift downstream without touching the brief engine itself.

   See: `app/api/groups/discovery/core-logic.ts` (lines 456–461, 519–525)

6. **AI energy classifier: gpt-5 fallback empty-response fixed**
   - When the primary `gpt-5-medium` model is unavailable, the gateway retries with `gpt-5-mini`. The `gpt-5-mini` family returns `content: null` (routes to `message.refusal`) when `response_format: { type: 'json_object' }` is included — the Chat Completions compatibility layer for these models does not honour the `json_object` format constraint.
   - Fix: in the fallback retry path, `response_format` is stripped for any model in the `COMPLETION_TOKENS_MODELS` family. The system prompt (`"Respond only as strict JSON"`) is sufficient for the parser.
   - Refusal logging also added so future incidents are visible in logs rather than silently producing empty content.
   - The `[identity-blueprint] AI energy classifier fallback to heuristic` warning should no longer fire when `gpt-5-medium` is unavailable.

   See: `lib/ai/llm-gateway/providers/openai.ts` (fallback retry block)

---

## Phase 3 Acceptance Checks

1. **No AI-generated text**
   - Documentary modules: no readable labels/logos/signage.
   - Final ads: all typography should come from templates.

2. **Ad looks like an ad**
   - Each output should feel like a real placement (feed, story, carousel, display).
   - Structure should carry theme without needing staged scenes.

3. **Copy/imagery alignment**
   - Documentary modules should reflect the campaign energy directive (charged vs serene).

4. **Traceability**
   - Each designed ad that uses a module should record `sourceImageUrl`.

5. **Manifest + review**
   - Both `documentaryDetails` and `designedAdArtifacts` appear in the review UI.

---

## What Is Already Built (Not Future Work)

The following items from the original Phase 3 roadmap are **implemented**:

- `CampaignIdentityBlueprint` — `energyMode`, `socialScale`, `propFamilies`, `forbiddenDefaults`, `lightBehavior`, `adFormatBias`, `emotionalPromise`, `evidenceOfBelonging` are all generated and stored.
  See: `lib/campaigns/design-system/identity-blueprint.ts`
- Energy directive threading into documentary prompt building — `buildEnergyDirective()` already modifies lighting/tempo cues per `energyMode`.
  See: `lib/campaigns/design-system/documentary-prompts.ts`
- Upstream discovery anchor signals strengthened — `cruiseNativeMoments`, `allowedThemeSignals`, `optionalGatheringMoments` now require renderable visual specificity at generation time.
  See: `app/api/groups/discovery/core-logic.ts`

---

## Next (Phase 3.1 / Phase 4)

**Template expansion**
- Expand to System 2 (postcard / destination flavor) and System 3 (zine / liner-notes) template families.
- Route default template family selection from `identityBlueprint.energyMode` — `after_hours_electric` and `nostalgic_kinetic` should default to type-heavy / poster formats; `calm_contemplative` and `refined_premium` to editorial-photo-led formats.

**Documentary prompt mode-splitting**
- Split each documentary module kind (`trust_photo`, `artifact_still_life`, `motion_plate`, `human_glimpse`) into per-`energyMode` variants, not just per-kind.
- Currently the system applies a single energy directive; the drift toward "premium travel calm" persists for campaigns that explicitly conflict with it.

**Mismatch validator**
- Add a pre-generation check that flags energy-mode contradictions: energetic slogan + serene image behavior, subcultural campaign + polished corporate copy, etc.
- This should warn (or optionally hard-fail) before the documentary image modules are generated.

**Per-asset naming and review diagnostics**
- Derive UI display names from `kind + placement + version` instead of raw asset IDs.
- Expose `energyMode` and top `forbiddenDefaults` beside each asset in the review panel so review is "is this faithful to the campaign world?" not "do I like this?"

**Revise-module flow**
- Regenerate a single documentary module and re-render only the dependent designed ads (those whose `sourceImageUrl` points to that module) without re-running the full pipeline.
