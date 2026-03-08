# Phase 2: Media Generation Pipeline
### Asset Production — Every Format, Every Platform

**Input:** `CampaignAestheticBrief` (from Phase 1, status `'approved'`)  
**Output:** `CampaignMediaManifest` — fully populated index of all generated assets with CDN URLs  
**Endpoint:** `POST /api/groups/campaign/[slug]/media/generate`

---

## Single Manifest Source of Truth

All media creation paths now target the same persisted `CampaignMediaManifest` object for a campaign slug.

- `/tests/media-generation` actions are not sandbox-only previews; they persist real manifest artifacts.
- Manual operator runs and targeted regeneration are expected to merge into the existing manifest instead of creating disconnected side outputs.
- Agentic orchestration uses the same manifest object and the same asset records.
- Partial reruns must preserve untouched manifest sections.
- The test surfaces double as controlled customization points for operators or downstream agents.

In practice, this means copy, audio, image, video, merch, and review actions should all resolve to one campaign-level media state object rather than separate per-surface records.

---

## What Gets Generated

| Asset Type | Count | Tool | Destination |
|------------|-------|------|-------------|
| Ship reference images | 6–12 | SerpAPI Google Images discovery | Source-of-truth for real ship visuals |
| Hero images (landing page) | 3–5 | Nano-Banana (Gemini Flash) image edit over SerpAPI references | Landing page hero section |
| Scene images (Production Bible) | 10 | Nano-Banana (Gemini Flash) + matched ship references | Source images for storyboard video shots |
| Aesthetic concept art | 4–5 | Nano-Banana (Gemini Flash) | Moodboard, email headers |
| Platform-sized image crops | Varies | Sharp (server-side resize) | Each social format |
| TikTok / Reels seed video | 1 | RunwayML Gen-3 Turbo (4 shots × 10s) + ElevenLabs + ffmpeg | TikTok organic, Instagram Reels |
| Hero explainer video | 1 | RunwayML Gen-3 Turbo (6 shots × 10s) + ElevenLabs + ffmpeg | Landing page, YouTube |
| Threshold announcement video | 1 | RunwayML Gen-3 Turbo (4 shots × 10s) + ElevenLabs + ffmpeg | Email, social |
| Countdown video | 1 | RunwayML Gen-3 Turbo (3 shots × 10s) + ElevenLabs + ffmpeg | Social, email nurture |
| Cinematic B-roll clips | 3–4 | RunwayML Gen-3 Turbo | Video compositing |
| Landing page ambient narration | 1 | ElevenLabs | Landing page hero audio |
| Threshold hype clip | 1 | ElevenLabs | SMS hook (Twilio), email |
| Campaign theme music | 1 | Shared Default Library or Replicate MusicGen | Video background, landing page |
| Merch design files | 3–5 | Nano-Banana (Gemini Flash) | Printful / Printify upload |
| Email header graphics | 3 | Derived from hero images | Klaviyo template stages 1–3 |
| Facebook / Meta ad creatives | 3 | Derived from hero images + copy | Meta Ads Manager |
| Social carousel (Instagram) | 1 (7 slides) | Generated per slide spec | Instagram feed |

---

## Generation Job Architecture

All generation paths ultimately converge on the same persisted manifest. Full pipeline generation uses async job execution, while targeted test/manual operations update the same underlying record section-by-section. The `CampaignMediaManifest` is therefore the canonical asset ledger regardless of entry point.

```typescript
interface MediaGenerationJob {
  jobId: string;
  campaignSlug: string;
  assetType: AssetType;
  status: 'queued' | 'in_progress' | 'complete' | 'failed' | 'needs_review';
  generator: GeneratorService;
  promptUsed: string;
  outputUrl?: string;
  outputMetadata?: AssetMetadata;
  retryCount: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

type AssetType =
  | 'ship_reference_image' | 'hero_image' | 'aesthetic_concept' | 'scene_image' | 'platform_crop'
  | 'tiktok_seed_video' | 'hero_explainer_video' | 'threshold_video'
  | 'countdown_video' | 'broll_clip'
  | 'ambient_narration' | 'hype_clip' | 'theme_music'
  | 'merch_design' | 'email_header' | 'ad_creative' | 'carousel_slide';

type GeneratorService = 
  | 'gemini3_flash' | 'gemini3_pro'   // Nano-Banana image generation (primary)
  | 'dalle3' | 'serpapi'              // Merch / ship reference discovery
  | 'runwayml'                        // All video generation (Production Bible path)
  | 'heygen'                          // Legacy avatar video (legacy path only)
  | 'elevenlabs' | 'openai_tts'       // Voice narration
  | 'replicate'                       // MusicGen theme music
  | 'sharp'                           // Server-side image resizing
  | 'claude4_opus' | 'claude4_sonnet' // LLM copy generation
  | 'gpt4o' | 'llama4';              // LLM copy generation
```

### Planned Future Capability: Instruction-Aware Regeneration

The platform needs a true regeneration path that changes the **instruction source**, not just reruns the same asset with the same prompt.

Current state:

- `POST /api/groups/campaign/[slug]/media/generate` can now force a rerun for specific asset types.
- `POST /api/groups/campaign/[slug]/media/regenerate` already exists, but it is only a **binary version-swap endpoint**.
- The current `regenerate` route accepts a replacement file payload plus metadata and writes a new `AssetRecord` version.
- It does **not** revise Production Bible scene specs, storyboard shot instructions, motion prompts, or image prompts.
- It does **not** give an external agent a structured way to say what was wrong and what must change in the next generation.

Required future capability:

- A human operator must be able to select an artifact, describe what is wrong, and trigger a revision-aware regeneration.
- An external agent must be able to call the same capability with structured instructions.
- The system must revise the upstream prompt inputs before generation rather than appending random freeform text at the last second.
- The original asset, revised asset, revision reason, and effective prompt/instruction snapshot must remain auditable.

Recommended scope model:

- **Asset-level regeneration** — regenerate one scene image or one video deliverable.
- **Scene-level regeneration** — revise one `SceneSpec`, then regenerate that scene image and optionally dependent videos.
- **Storyboard-level regeneration** — revise one `Storyboard` or selected `ShotSpec` items, then regenerate only that deliverable.
- **Production-Bible-level regeneration** — revise global direction and re-run scene/storyboard generation from the Bible layer downward.

Recommended rule: operators and agents should target the **highest correct source-of-truth layer**.

- If the problem is visual composition in a scene image, revise `SceneSpec` fields and `scene.imagePrompt`.
- If the problem is motion, pacing, or camera behavior, revise `ShotSpec` and storyboard instructions.
- If the problem is overall campaign tone, revise Production Bible global direction or approved brief inputs.
- Do **not** treat prompt revision as a blind suffix appended to `promptUsed`.

Recommended future endpoint shape:

- `POST /api/groups/campaign/[slug]/media/regenerate-with-revision`
- Route handler should remain thin.
- Core business logic should live in `app/api/groups/campaign/[slug]/media/regenerate-with-revision/core-logic.ts`.

Recommended request contract:

```json
{
  "targetType": "scene_image",
  "targetId": "img_scene_pooldeck_001",
  "revisionScope": "scene_spec",
  "revisionInstruction": "Reduce crowd density, make the deck feel more premium and sunset-forward, keep the ship architecture exactly as referenced.",
  "applyMode": "replace_source_instruction",
  "regenerateDependencies": true,
  "requestedBy": "human",
  "requestSource": "tests/production-bible"
}
```

Required request semantics:

- `targetType` identifies the current artifact category.
- `targetId` identifies the asset record or deliverable being revised.
- `revisionScope` determines which upstream model input must change.
- `revisionInstruction` captures what must change in plain language.
- `applyMode` should default to replacing or rewriting source instructions, not merely appending text.
- `regenerateDependencies` controls whether downstream assets are also refreshed.
- `requestedBy` should support both human and agent callers.

Recommended supported `revisionScope` values:

- `scene_spec`
- `shot_spec`
- `storyboard`
- `production_bible`
- `asset_prompt_only`

Use `asset_prompt_only` only as a narrow escape hatch. Preferred operation is to revise the structured source objects that produce the prompt.

Recommended processing flow:

1. Resolve the active asset and its manifest slot.
2. Resolve the correct upstream source object for that asset.
3. Build a structured revision job record with the original instruction snapshot.
4. Use an LLM to rewrite the relevant source object deterministically.
5. Persist the revised source object or revision overlay.
6. Regenerate the minimum required assets.
7. Deactivate or replace the superseded asset records.
8. Update the manifest in place while preserving audit history.
9. Persist the final effective prompt/instruction snapshot on the new asset record.

Recommended implementation detail:

- Prompt assembly must stay separate from orchestration logic.
- Revision application must be programmatic and deterministic.
- Do not put conditional logic inside the prompt itself.
- Build prompt fragments in code, then render the final prompt from structured fields.
- Prefer JSON-shaped revision payloads for agent calls.

Recommended storage model:

- Keep the existing `AssetRecord.promptUsed` field as the final rendered prompt snapshot.
- Keep asset versioning and `active` state as the current audit mechanism for binaries.
- Add a dedicated revision record store for instruction changes rather than overloading `AssetRecord` alone.
- Each revision record should preserve:
  - target asset or deliverable
  - upstream source layer revised
  - original structured input snapshot
  - revised structured input snapshot
  - human or agent revision instruction
  - dependency regeneration policy
  - resulting asset IDs

Dependency rules that future implementation must enforce:

- Revising a `SceneSpec` invalidates that scene image.
- Revising a `SceneSpec` may also invalidate every storyboard shot referencing that scene.
- Revising `ShotSpec` invalidates only the parent deliverable unless shared elsewhere.
- Revising a `Storyboard` invalidates the deliverable tied to that `deliverableId`.
- Revising Production Bible global direction invalidates all scene images and all storyboard-driven videos.

Manual operator workflow requirement:

- From `/tests/production-bible`, the operator should be able to click a future `Revise & Regenerate` action on an artifact.
- The UI should capture:
  - what is wrong
  - what must stay unchanged
  - whether dependencies should also re-run
- The operator should be shown the revised effective prompt or source instruction before final execution.

External agent workflow requirement:

- The same regeneration capability must be callable via API without UI dependencies.
- The agent must be able to target a scene, shot, storyboard, or asset directly.
- The agent should receive back:
  - revision record ID
  - affected source layer
  - final effective prompt snapshot
  - regenerated asset IDs
  - manifest impact summary

Important constraint:

- Future implementation should reuse the existing provider abstraction, manifest, and asset-versioning model.
- It should not create a parallel media state system.
- The current `/media/regenerate` binary-swap endpoint should remain available for direct replacement uploads, but it is **not** the long-term answer for instruction-driven regeneration.

---

## CRITICAL ISSUES DISCOVERED (March 2026)

The following architectural flaws were identified during debugging of the media generation pipeline. These issues undermine the fundamental design intent of Phase 1 → Phase 2 handoff and must be corrected before campaign production scaling.

---

### Issue 1: Live Search Bypasses Pre-Approved Ship References

**Status:** CRITICAL — BREAKS PHASE 1 → PHASE 2 CONTRACT

**The Problem:**
The `discoverShipReferenceCandidates()` function in `lib/campaigns/media/ship-reference-service.ts` performs **live Google/SerpAPI searches every time media generation runs**, completely ignoring the ship reference research and approval workflow that occurs during Phase 1 Discovery.

```typescript
// ship-reference-service.ts:86-91 — LIVE SEARCH EVERY RUN
export async function discoverShipReferenceCandidates(campaign, maxPerCategory) {
    const queryConfigs = buildReferenceQueries(campaign);
    for (const queryConfig of queryConfigs) {
        const response = await searchGoogleImages(queryConfig.query, 10);  // ← WRONG
```

**Why This Breaks The Design:**
- Phase 1 Discovery has a dedicated research phase where ship images are found, ranked, and **human-approved**
- The approved references should be stored on the campaign record and used as the canonical source
- Current implementation re-runs discovery every time, potentially returning DIFFERENT images than what was approved
- This makes the "approval" step in Phase 1 meaningless

**Required Fix:**

1. **Schema Change:** Add `approvedShipReferences: ShipReferenceCandidate[]` to the campaign record during Phase 1 approval
2. **Service Refactor:** Modify `ship-reference-service.ts` to accept an optional `approvedReferences` parameter
   - If provided: use only those references (skip live search)
   - If not provided: fall back to live search (for legacy/backward compatibility)
3. **Orchestrator Update:** Pass `campaign.approvedShipReferences` to the service when available

**Files To Modify:**
- `lib/campaigns/schema.ts` — add `approvedShipReferences` to campaign type
- `lib/campaigns/media/ship-reference-service.ts` — refactor to use stored references
- `lib/campaigns/media/media-orchestrator.ts` — pass stored references instead of triggering discovery

---

### Issue 2: Heroes 1–5 Are Identical (Not Scene-Diverse)

**Status:** CRITICAL — HERO IMAGES LACK VISUAL VARIETY

**The Problem:**
The current hero generation in `importHeroAssetsFromReferences()` takes 5 different reference photos and runs **the same generic Nano-Banana transform** on each. This produces 5 heroes that are visually similar (same "embellished photo" treatment) rather than the intended 5 distinct scene types.

```typescript
// ship-reference-service.ts:238-240 — SAME PROMPT FOR ALL 5
for (let index = 0; index < selectedCandidates.length; index += 1) {
    const candidate = selectedCandidates[index];
    const generatedHeroImages = await generateReferenceGroundedHeroImages(brief, shipName, candidate, 1);
```

**Original Design Intent (from `buildHeroPrompts()` in `stability-generator.ts`):**
- **Hero 1:** Wide exterior deck shot, panoramic ocean view
- **Hero 2:** Themed event happening on deck, participants engaged
- **Hero 3:** Intimate luxury stateroom interior, aspirational lifestyle
- **Hero 4:** Social gathering of enthusiasts, community connection (Discord, "join us" messaging)
- **Hero 5:** Destination port arrival, exotic port in background, golden hour

**Why This Matters:**
- Hero 4 specifically is designed for community/social messaging (Discord invites, "join fellow enthusiasts")
- The 5-scene diversity provides visual range for different campaign touchpoints
- Current implementation wastes generation credits on near-duplicates

**Required Fix:**

Two implementation options:

**Option A (Recommended):** One reference, 5 distinct scene generations
- Select ONE high-quality reference (exterior or destination_view category)
- Generate 5 heroes from that single reference using the 5 distinct scene prompts from `buildHeroPrompts()`
- Map: Hero 1 → deck, Hero 2 → event, Hero 3 → stateroom, Hero 4 → social, Hero 5 → port

**Option B:** Category-matched references
- Select 5 references, one per category (exterior, pool_deck, stateroom, atrium, destination_view)
- Map each reference category to the appropriate scene prompt
- Requires matching categories to scene types

**Files To Modify:**
- `lib/campaigns/media/generators/stability-generator.ts` — ensure `buildHeroPrompts()` is exported and used
- `lib/campaigns/media/ship-reference-service.ts` — rewrite `importHeroAssetsFromReferences()` to use distinct prompts per hero slot
- Consider: `generateReferenceGroundedHeroImages()` signature may need to accept specific scene type

---

### Issue 3: Aesthetic Concepts Are Generated But Never Used Downstream

**Status:** CRITICAL — CONCEPT ART IS ORPHANED

**The Problem:**
The 4 aesthetic concept images are generated and stored in the manifest under `images.aestheticConcepts`, but **no downstream generator references them**. This means:

- **Merch designs** (`generateMerchDesigns`) use only `merch.*.dallePrompt` — no concept reference
- **Platform copy** (`generatePlatformCopy`) receives only the brief text — no concept URLs to describe visually
- **Scene images** (`generateSceneImages`) use ship references only — no concept palette grounding
- **Video generation** uses scene images and hero images — never concepts

**Concept Purpose (from original design):**
- Concept 1: Abstract aesthetic mood representation (primary palette)
- Concept 2: Lifestyle essence, aspirational feeling (secondary + accent tones)
- Concept 3: Atmosphere, ethereal quality (imagery mood)
- Concept 4: Design elements, patterns and textures (primary + background)

**These should drive:**
- Merch pattern/texture overlays
- Carousel slide backgrounds
- Copy description of visual mood
- Scene image color palette guidance

**Required Fix:**

This requires updating the orchestrator-to-generator contract to pass concept records through the pipeline:

1. **Orchestrator:** After concept generation completes, pass `conceptRecords` to all downstream generators
2. **Generator Updates:**
   - `generateMerchDesigns(brief, conceptRecords)` — inject concept URLs into prompts for pattern/texture reference
   - `generatePlatformCopy(brief, conceptRecords)` — include concept descriptions in copy generation context
   - `generateSceneImages(sceneLibrary, shipReferences, conceptRecords)` — use concept palette for color guidance
   - Video generators — consider concept mood for motion/atmosphere prompts

3. **Prompt Engineering:** Update all generator prompts to reference concept images where applicable:
   - Merch: "Design should incorporate visual elements from reference concept images: [urls]"
   - Copy: "Describe the visual aesthetic shown in these moodboard concepts: [urls]"
   - Scenes: "Use color palette guidance from these aesthetic concepts: [urls]"

**Scope Assessment:**
This is the largest fix — it touches ~6 generators and requires updating function signatures throughout the pipeline. However, without this fix, the concept generation step is **wasted compute and storage**.

**Files To Modify:**
- `lib/campaigns/media/media-orchestrator.ts` — pass concept records to downstream generators
- `lib/campaigns/media/generators/dalle-generator.ts` — accept and use concept records
- `lib/campaigns/media/generators/copy-generator.ts` — accept and describe concept visuals
- `lib/campaigns/media/generators/stability-generator.ts` — use concept palette in scene generation
- `lib/campaigns/media/generators/tiktok-seed-generator.ts` — consider concept mood in motion prompts
- `lib/campaigns/media/generators/heygen-generator.ts` — consider concept mood in avatar/script

---

### Implementation Priority

| Issue | Priority | Complexity | Files Touched |
|-------|----------|------------|---------------|
| #1: Live Search vs Pre-Approved | **P0** — Blocks Phase 1→2 contract | Medium | 3 files (schema, service, orchestrator) |
| #2: Identical Heroes | **P0** — Wastes generation, misses use cases | Medium | 2 files (service, stability-generator) |
| #3: Orphaned Concepts | **P1** — Wasted compute, incoherent visuals | Large | 6+ generators + orchestrator |

**Recommended Approach:**
1. Fix Issue #1 first — restores the Phase 1 → Phase 2 handoff integrity
2. Fix Issue #2 in parallel — ensures hero diversity for campaign needs
3. Fix Issue #3 as a focused refactor sprint — connects the aesthetic layer to all outputs

---

## Image Generation

### Ship Reference Discovery
**Tool:** SerpAPI Google Images  
**Purpose:** Gather real photos of the actual matched ship as the source-of-truth visual layer

The pipeline resolves the campaign's matched ship identity, then runs structured image searches for multiple venue categories:

- exterior
- pool deck
- dining
- stateroom
- atrium
- destination-facing deck view

Candidate images are ranked automatically using ship-name match, cruise-line tokens, category match, and image size, while penalizing floor plans, logos, brochures, and illustrations.

### Hero Images (3–5 images)
**Tool:** SerpAPI reference discovery + Nano-Banana guided transform  
**Purpose:** Primary landing page hero, email headers, social backgrounds

Hero assets are selected from the ranked real ship reference set, then transformed through a reference-grounded Nano-Banana pass that preserves ship identity while adding campaign-specific cinematic embellishment. This keeps the landing page visually anchored to the actual vessel without reducing the hero to a plain import.

### Aesthetic Concept Art (4–5 images)
**Tool:** Nano-Banana  
**Purpose:** Brand moodboard, email headers, social carousel backgrounds

These are less literal than hero images — they establish the aesthetic *feeling* rather than the literal ship identity. Generated from the `imageryMood` + `colorPalette` + `aestheticLabel` fields with artistic latitude:

```
{aestheticLabel} aesthetic, {imageryMood}, {colorPalette.primary} dominant palette,
{lightingStyle}, conceptual editorial, high contrast, --ar 1:1 --style raw
```

### Server-Side Resizing (Sharp)
All generated images are automatically processed into the required platform crops using the Sharp library. No additional generation calls — one source image produces all formats:

| Format | Dimensions | Use |
|--------|-----------|-----|
| `hero_16x9` | 1920×1080 | Landing page, YouTube thumbnail, HeyGen background |
| `hero_4x5` | 1080×1350 | Instagram feed, Facebook feed |
| `story_9x16` | 1080×1920 | Instagram Story, TikTok background overlay |
| `square_1x1` | 1080×1080 | Instagram feed, Discord embed |
| `banner_3x1` | 1500×500 | Twitter/X header, Discord server banner |
| `email_header` | 600×300 | Klaviyo email templates |
| `og_image` | 1200×630 | Open Graph / social share card for landing page |
| `thumbnail` | 400×225 | Internal dashboard previews |

---

## Video Generation

### Video Provider Abstraction Layer

Video generation is now routed through a provider abstraction instead of hardcoding RunwayML calls directly into every generator and route.

- `lib/campaigns/media/video-providers/base-provider.ts` defines the canonical image-to-video contract
- `lib/campaigns/media/video-providers/runway-provider.ts` is the active implementation today
- `lib/campaigns/media/video-providers/fal-provider.ts` is the reserved integration seam for future multi-model routing
- `lib/campaigns/media/video-providers/provider-registry.ts` resolves the active provider from config
- `lib/campaigns/media/media-pipeline-config.ts` is the single source of truth for active provider selection

Current state:

- Active provider: `runway`
- Active generator service: `runwayml`
- Planned secondary provider: `fal`

This means the main pipeline, `/tests/runway-test`, and the video test route all execute through the same provider boundary. Swapping providers later should not require rewriting storyboard assembly, prompt construction, manifest storage, or orchestration logic.

### Production Bible Path (Primary)

When the `CampaignAestheticBrief` includes a `productionBible`, all video deliverables use **storyboard-driven assembly**:

1. Each storyboard's `shotSequence` maps shots → scenes from the scene library
2. Each shot gets its **OWN source image** (from the scene image generated for that scene), not one shared hero
3. Per-shot RunwayML motion prompts are built from `ShotSpec.cameraMovement`, `subjectMotion`, `environmentMotion`
4. ElevenLabs renders narration from the storyboard's `narrationScript`
5. `ffmpeg-static` composes clips with narration + optional background music via `composeProductionVideo()`

**Key improvements over legacy:**
- Multiple distinct source images per video (not one hero repeated)
- Camera movements vary per shot (dolly, crane, orbit, tracking, etc.)
- Emotional arc enforced (hook → build → peak → resolve)
- Film-standard transitions between shots
- Background music layering with narration ducking

**Video Deliverables (Production Bible path):**

| Deliverable | Shot Count | Duration | RunwayML Credits | Cost |
|-------------|-----------|----------|-----------------|------|
| tiktok_seed | 4 shots | 40s total | 200 | $2.00 |
| hero_explainer | 6 shots | 60s total | 300 | $3.00 |
| threshold_announcement | 4 shots | 40s total | 200 | $2.00 |
| countdown_1 | 3 shots | 30s total | 150 | $1.50 |
| **TOTAL** | **17 clips** | **170s** | **850 credits** | **$8.50** |

> Credits calculated at gen3a_turbo rate: 5 credits/second × 10s/clip.

**Files:**
- `lib/campaigns/media/video-deliverable-specs.ts` → `VIDEO_DELIVERABLE_SPECS` (single source of truth for shot counts)
- `lib/campaigns/media/generators/tiktok-seed-generator.ts` → `generateStoryboardVideo()`
- `lib/campaigns/media/generators/runway-generator.ts` → `generatePromptedClipFromScenes()`
- `lib/campaigns/media/video-providers/provider-registry.ts` → active video provider resolution
- `lib/campaigns/media/video-composer.ts` → `composeProductionVideo()`

### Legacy Path (Fallback)

When no Production Bible exists (briefs generated before this architecture), the legacy flow runs:

### TikTok Seed Video (30–45s)
**Tool:** RunwayML image-to-video + ElevenLabs narration + local ffmpeg composition  
**Purpose:** §5.5A organic seeding — the zero-budget proof-of-concept post

**Assembly:**
1. ElevenLabs renders a combined narration script assembled from `tiktokOrganic.hook`, `videoConcepts.tiktokSeed.scriptOrNarration`, and `tiktokOrganic.callToAction`
2. RunwayML generates a deterministic multi-shot sequence from the approved real-ship hero image using four explicit shot prompts rather than a single pan/zoom pass
3. Local `ffmpeg-static` concatenates the generated clips into one vertical sequence and muxes the narration track over the final output MP4
4. The generated TikTok asset is stored with a unique asset ID and filename per run to avoid stale CDN/browser cache collisions on immutable asset URLs

**Legacy shot-plan strategy:**
```
Shot 1: premium social ad opener with immediate forward camera momentum and visible scene energy
Shot 2: experiential reveal with layered foreground action, crowd movement, luxury details, and ship fidelity
Shot 3: emotional peak with dramatic reveal, celebration energy, and destination-scale atmosphere
Shot 4: polished CTA finish with aspirational momentum and a strong end-frame for overlay/call-to-action treatment
```

**Legacy implementation notes:**
- Voiceover-first flow — no HeyGen dependency for the TikTok seed asset
- Single approved hero image still acts as the visual source
- Prompting is biased away from slideshow pan/parallax behavior and toward environmental motion

### Hero Explainer Video (60s)
**Tool:** HeyGen  
**Purpose:** Landing page hero embed, YouTube, Facebook ad creative

Full HeyGen avatar presentation. Script derived from `messaging.elevatorPitch` expanded to 60s:
- First 10s: identity-hook ("If you're the kind of person who...")
- Middle 30s: the trip specifics (ship, dates, events, price signal)
- Last 20s: the Shadow Group mechanic explained in plain language + CTA

### Threshold Announcement Video (30s)
**Tool:** HeyGen  
**Purpose:** "The Trip is GO!" email embed, social announcement

Pre-generated *before* threshold is reached with placeholder handling:
```
Script: "We just hit [THRESHOLD_COUNT] cabins — [CAMPAIGN_NAME] is officially happening. 
You have 72 hours to complete your details and lock in your spot."
```
`[THRESHOLD_COUNT]` and `[CAMPAIGN_NAME]` are dynamic tokens rendered server-side at email send time rather than baked into the video — keeps generation synchronous with campaign setup, not threshold event.

### Countdown Video Series (3× 15s clips)
**Tool:** RunwayML Gen-3 Alpha  
**Purpose:** Social posts during Seed Phase — "X cabins to go" urgency content

Three variants generated: 3 cabins remaining, 2 remaining, 1 remaining. RunwayML receives:
- Source image: real-ship hero image
- Motion prompt: subtle camera push, atmosphere movement (waves, neon flicker, leaves)
- Duration: 15 seconds
- On-screen text rendered in post via Sharp

### Cinematic B-Roll Clips (3–4× 6–10s clips)
**Tool:** RunwayML Gen-3 Alpha  
**Purpose:** Video compositing inserts for explainer and ad videos

Short atmospheric motion clips derived from real ship hero/reference images. RunwayML `image-to-video` endpoint with motion prompts tuned to the `lightingStyle`:
- Pool deck, late afternoon — ambient movement
- Dining venue — candlelight, light crowd motion
- Port arrival — ship deck, destination in background
- Niche event scene — motion-hinted still (gentle zoom, atmosphere)

---

## Voice & Audio Generation

### Ambient Narration (30s)
**Tool:** ElevenLabs  
**Script Source:** `CampaignAestheticBrief.audio.ambientNarrationScript`  
**Voice Profile:** Defined in brief — matched to `voicePersona` identity

Rendered at landing page activation. Used as optional audio autoplay (muted by default, user-toggled) in landing page hero.

**ElevenLabs API call:**
```typescript
await elevenlabs.textToSpeech({
  text: brief.audio.ambientNarrationScript,
  voice_id: brief.audio.voiceProfile,
  model_id: 'eleven_multilingual_v2',
  voice_settings: {
    stability: 0.65,
    similarity_boost: 0.80,
    style: 0.45,
    use_speaker_boost: true
  }
});
```

### Threshold Hype Clip (15s)
**Tool:** ElevenLabs  
**Purpose:** SMS attachment hook (Twilio), email top-of-fold audio embed

High-energy delivery. Voice settings adjusted: stability 0.45 (more expressive), style 0.70.  
Script: `CampaignAestheticBrief.audio.hypeClipScript`

### Merch Design Images
**Tool:** Nano-Banana  
**Purpose:** Print-ready campaign merch art derived from the approved merch prompts in the brief

All merch design image generation now flows through the same media-pipeline image provider as hero and concept images. This keeps the visual language more coherent across hero art, moodboards, and merchandise.

### Campaign Theme Music (30s loop)
**Tool:** Shared Default Library or Replicate MusicGen  
**Purpose:** Video background audio, landing page ambient music option

Two supported paths now exist:

1. **Default Library** — selects the best premade track from a shared global library using AI-agent-friendly tags plus prompt notes stored with each track record.
2. **Replicate MusicGen** — generates a fresh instrumental track from the approved brief when a custom track is preferred.

Output: one instrumental loop, 30 seconds, exported as `.mp3`.

```
Default Library selection inputs: stored tags + prompt notes matched against {aestheticLabel}, {imageryMood}, {musicMood}, tone keywords, and niche hashtags

Replicate Prompt: ambient instrumental music, {aestheticLabel} vibe, {imageryMood} atmosphere, background loop, no vocals, high quality
```

### Shared Theme Music Library
Premade tracks are stored under a reserved shared slug and exposed through library endpoints so both the UI and external agents can use the same selection pool.

**Capabilities:**
- Bulk upload multiple `.mp3` tracks into the shared library
- Edit tags per track for AI-agent selection
- Store freeform prompt notes / usage notes per track
- Return the best current match for a specific campaign slug

**Endpoints:**
```
GET   /api/groups/theme-music-library
GET   /api/groups/theme-music-library?campaignSlug={slug}
POST  /api/groups/theme-music-library
PATCH /api/groups/theme-music-library/{assetId}
```

**UI Test Page:**
```
/tests/theme-music-library
```

---

## Merch Design Generation

### Process Flow

```
CampaignAestheticBrief.merch.coreItem.dallePrompt
          │
          ▼
DALL-E 3 API → raw design concept image (1024×1024, PNG)
          │
          ▼
Sharp → clean white/transparent background isolation
          │
          ▼
Manual review flag (UI) OR auto-approve (agent mode)
          │
          ▼
Printful API → product mockup generation
  (product_id × colorway → mockup image with print placement)
          │
          ▼
Stored in R2 + DynamoDB MEDIA# record
          │
          ▼
Merch page populated at /campaigns/[slug]/merch
```

### Design Prompt Strategy

Each `MerchItemBrief.dallePrompt` is structured to produce print-ready quality:

```
[design description], isolated on white background, flat lay graphic design,
[print style], suitable for screen printing, vector-clean edges,
[campaign color palette], no realistic textures, no shadows
```

**Core t-shirt example:**
```
Retro pixel art cruise ship with [campaign tagline] text beneath in 80s 
arcade font, isolated on white, flat graphic design, 2-color screen print, 
electric blue and chrome silver palette, vector-clean edges, no shadows
```

### Printful Integration
All approved merch designs are submitted to the Printful API:
- `POST /v2/mockup-generator/tasks` — generate product mockup image
- `POST /stores/{storeId}/products` — create product in connected store (activated at `THRESHOLD_MET`)

Products are created in `DRAFT` state and published via `PATCH /stores/{storeId}/products/{productId}` when the campaign triggers `THRESHOLD_MET` — matching the `merchandiseStoreUrl` population logic in §2.7.

---

## Copy & Caption Generation

All text-based assets are generated by GPT-4o, taking the `CampaignAestheticBrief.messaging` and the platform-specific `socialConcepts` as input. Generated in a single structured batch call returning all variants simultaneously:

- 7× Instagram carousel slide texts
- 3× Facebook ad copy variants (A/B/C)
- TikTok caption + hashtag set (3 variants for testing)
- 3× email subject line variants per Klaviyo nurture stage
- Pinterest pin descriptions (5×)
- Discord channel announcement message

---

## The CampaignMediaManifest Output

```typescript
interface CampaignMediaManifest {
  slug: string;
  generatedAt: string;
  totalAssets: number;
  completionStatus: 'partial' | 'complete';
  
  images: {
    shipReferences: AssetRecord[];
    hero: AssetRecord[];
    sceneImages: AssetRecord[];          // Production Bible path — one per scene
    aestheticConcepts: AssetRecord[];
    platformCrops: Record<ImageFormat, AssetRecord[]>;
  };
  
  videos: {
    tiktokSeed: AssetRecord | null;
    heroExplainer: AssetRecord | null;
    thresholdAnnouncement: AssetRecord | null;
    countdown: AssetRecord[];
    broll: AssetRecord[];
  };
  
  audio: {
    ambientNarration: AssetRecord | null;
    hypeClip: AssetRecord | null;
    themeMusic: AssetRecord | null;
  };
  
  merch: {
    designs: AssetRecord[];
    mockups: AssetRecord[];
    printfulProductIds: string[];
  };
  
  copy: {
    carouselSlides: string[];
    adVariants: AdCopySet[];
    captions: PlatformCaptions;
    emailSubjectLines: EmailSubjectSet;
  } | null;
}

interface AssetRecord {
  assetId: string;
  assetType: AssetType;
  url: string;                  // CDN URL (R2) or /api/.../asset-data/:id (DynamoDB fallback)
  generator: GeneratorService;
  promptUsed: string;
  dimensions?: { width: number; height: number };
  durationSeconds?: number;
  fileSizeBytes: number;
  mimeType: string;
  tags: string[];               // Scene images include sceneId as a tag
  createdAt: string;            // ISO timestamp — used as cache-buster on image URLs
  reviewStatus: 'auto_approved' | 'human_approved' | 'needs_review';
}
```

---

## Credit Pre-Check System

Before any video generation starts, the orchestrator performs a **credit pre-flight check** that blocks generation if provider balances are insufficient. This prevents partial burns where some deliverables succeed and others fail mid-run.

### How It Works

```
GET /api/groups/campaign/[slug]/media/credit-check
  ?sceneCount=10          // number of scenes in Production Bible (default 10)
  &estimateOnly=true      // skip live balance queries, return estimate only
```

**Response:**
```typescript
interface CreditCheckResult {
  canProceed: boolean | null;   // null = estimateOnly mode
  estimate: {
    runwayCreditsRequired: number;    // 850 for full Production Bible
    runwayClipCount: number;          // 17
    runwayTotalSeconds: number;       // 170
    runwayUsd: number;                // $8.50
    geminiUsd: number;                // ~$0.60
    elevenlabsUsd: number;            // ~$0.07
    totalUsd: number;                 // ~$9.75
    deliverables: DeliverableEstimate[];
  };
  balances: ServiceBalance[];   // Live RunwayML creditBalance
  blockers: string[];           // Human-readable block reasons
  summary: string;              // Full text report for agents
}
```

**Orchestrator behavior:** If `canProceed === false`, all video generation jobs are skipped and the blockers are surfaced in the manifest `errors` array. No credits are consumed.

### Skip-If-Exists Guard

The orchestrator also checks `existingManifest` before generating each storyboard deliverable. If a video record already exists for that `assetType + deliverableId`, the job is skipped entirely. This means:
- A partial run (e.g. only `tiktok_seed` succeeded before credits ran out) is safely resumable
- Re-running video generation only generates the missing deliverables
- No duplicate credits burned on already-completed assets

**Files:**
- `lib/campaigns/media/credit-check-service.ts` — `checkMediaCredits()`, `estimateCampaignCost()`
- `lib/campaigns/media/video-deliverable-specs.ts` — `VIDEO_DELIVERABLE_SPECS` shared constant
- `app/api/groups/campaign/[slug]/media/credit-check/route.ts` — agent-callable GET endpoint
