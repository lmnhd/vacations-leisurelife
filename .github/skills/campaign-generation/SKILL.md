**Name: Campaign Generation Orchestrator**

**Description:** Orchestrates the end-to-end creation of a Leisure Life Interactive shadow group campaign. Use this skill to guide agents through discovery, inventory matching, aesthetic briefing, and final media generation while enforcing hard quality constraints and allowing user intervention.

## 1. Core Philosophy & Pitfalls to Avoid

Based on V2 Campaign Strategy and previous iterations, agents using this skill MUST adhere to the following:

- **Vacation First:** The group is an icebreaker, not a curriculum. Avoid mandatory classes, tight schedules, or high-pressure social mechanics.
- **Ship/Inventory Grounding:** Campaigns must match real inventory limits. Do not invent impossible ship amenities or assume retail block structures.
- **Finite Iteration:** Do not loop endlessly in discovery. If a concept requires more than 3 revisions to pass the Red Team, retire it.
- **Honest Readiness:** Do not mark a campaign as "Ready" if it still carries required fixes.
- **Deduplication:** Gemini Deep Research MUST exclude already generated campaigns (the backend pipeline handles this by natively injecting the DynamoDB state into the prompt).

## 1a. Recurring Pipeline Issues & Mitigations

The following issues have been encountered repeatedly across campaigns. Agents must handle them proactively:

### Dev Server Stability During Heavy Generation
- **Symptom:** Next.js dev server becomes unresponsive or crashes during long-running media generation calls (image/video/audio).
- **Root Cause:** The `POST /api/groups/campaign/[slug]/media/generate` endpoint is synchronous and can take 10–20+ minutes. The dev server may exhaust resources or hit memory limits during concurrent heavy calls.
- **Mitigation:**
  - Monitor server health before triggering media generation (`GET /api/groups/discovery` as a heartbeat).
  - If the server is unresponsive, restart it manually (the agent cannot manage the dev server).
  - Consider generating one asset type at a time (e.g., `assetTypes: ['hero_image','scene_image']` first) to reduce load.
  - Use the agent job orchestrator (`campaign_media_generate` workflow) for async durability instead of direct HTTP calls when available.

### Revision API Timeout
- **Symptom:** `POST /api/groups/discovery/revise` and `/revise/bulk` hang beyond 120s.
- **Root Cause:** Structured generation with large prompt + JSON schema validation can exceed default API timeouts.
- **Mitigation:**
  - Always call revision via direct script (`npx tsx scripts/test-revise.ts <slug>`) rather than HTTP when possible — scripts have no HTTP timeout.
  - If HTTP is required, set `-TimeoutSec 600` minimum on PowerShell `Invoke-RestMethod`.
  - Never attempt bulk revision of more than 1 campaign per HTTP call; batching causes cumulative timeout.

### Niche-Heavy Drift (The "Seasoning, Not the Meal" Rule)
- **Symptom:** Red Team flags campaigns for `solitude_drift`, `cruise_implausibility`, or `stereotype_risk` because the concept reads like a convention, workshop, or clinic on a ship.
- **Root Cause:** Approaching discovery "niche-first" causes the AI to over-index on the niche's activities, forgetting that the primary product is a relaxing cruise vacation.
- **Mitigation:** Discovery prompts must enforce that the **vacation experience comes first**. The niche community is just the social "seasoning" that makes the group self-select. A non-enthusiast must still rate the trip as a great vacation even if they ignore the niche entirely. If a concept relies on mandatory workshops, gear-heavy activities, or isolating solo-rituals, it will be blocked. This framing is now hardcoded into the `core-logic.ts` Step 1, 2, and 3 prompts.

### Inventory Match Gate (replaces Discovery-First vs Inventory-First problem)
- **Resolution:** The pipeline now enforces CB inventory constraints at two levels:
  1. **Step 3 Prompt (GPT hard constraints):** The AVAILABLE CB GROUP INVENTORY list is injected as hard constraints. GPT is instructed to only name ships and destinations from the inventory.
  2. **In-Memory Match Gate:** After GPT generates blueprints but before DynamoDB save, `matchGroupInventoryToCampaign()` is run on each blueprint. Any blueprint scoring below 25 is discarded with a log message. Only matched blueprints proceed to Red Team and DynamoDB.
- **Pipeline order:**
  1. Scrape CB inventory → cache (`scripts/scrape-cb-deals.ts`)
  2. Gemini 3.1 Pro Deep Research — psychographic (Step 1)
  3. Gemini 3.1 Pro Deep Research — aesthetic analysis with inventory context (Step 2)
  4. GPT blueprint generation with inventory HARD CONSTRAINTS (Step 3)
  5. In-memory inventory match gate — discard unmatched (between Step 3 and Step 4)
  6. Red Team review — only on matched blueprints (Step 4)
  7. Save to DynamoDB — only matched blueprints
  8. Phase B — confirm match against live inventory + generate Odysseus retail link
- **Result:** Pipeline outputs 0–5 campaigns. If 0 pass the gate, a descriptive error is thrown suggesting cache refresh or re-spin with relaxed constraints.
- **Phase B is now confirmation-only:** See `scripts/run-phase-b.ts`. It no longer performs primary matching.

### Red Team Verdict Handling
- **PASS:** Proceed to Phase 2.
- **WARN (≤4 fixes):** Safe to auto-revise. Use `POST /api/groups/discovery/revise` or direct script.
- **BLOCK (>4 fixes or structural issues):** STOP. Do not auto-revise. Present the campaign to the user and ask whether to retire it or manually redesign.
- **Stagnation:** If a campaign has been revised 3+ times and still carries warnings, consider retiring it regardless of fix count.

### Campaign Identity Blueprint & Alignment (Phase 3 upstream)
- **Purpose:** Prevent emotional drift between campaign copy and campaign imagery. The `CampaignIdentityBlueprint` layer (`lib/campaigns/design-system/identity-blueprint.ts`) sits between discovery and aesthetic execution to enforce campaign-specific energy modes, prop families, light behavior, and forbidden defaults.
- **Energy mode inference:** Deterministically inferred from campaign text corpus via regex patterns. Modes include `calm_contemplative`, `warm_social`, `nostalgic_kinetic`, `after_hours_electric`, `refined_premium`, `subcultural_intimate`, `playful_collective`.
- **Prop families & forbidden defaults:** Each mode carries specific allowed props (e.g., guitar pick, leather jacket for nostalgic_kinetic) and anti-defaults (e.g., "spa retreat", "breakfast balcony serenity" for after_hours_electric).
- **Alignment validator (`alignment-validator.ts`):** Detects mismatches between campaign energy mode and actual brief output (e.g., energetic slogan + serene image language). Flags `warning` or `blocker` severity.
- **Integration:** The blueprint is auto-generated during brief engine orchestration and stored on the campaign aesthetic brief under `identityBlueprint`. It feeds downstream into documentary prompt building (`documentary-prompts.ts`), niche token extraction (`niche-tokens.ts`), and ad format routing.
- **Agent guidance:** When reviewing a campaign, always check that the `identityBlueprint.energyMode` matches the actual media outputs. If the brief says `playful_collective` but the images drift toward "quiet premium lounge," this is an alignment drift that should be flagged.

### Anchor Compliance Tolerance (Phase 3)
- **Symptom:** Brief generation fails with "Anchor compliance unresolved".
- **Rules:**
  - `missing_anchor_binding` (structural): **Hard fail** — brief generation aborts.
  - `niche_signal_dropped` / `niche_carry_mismatch` / `duplicate_location_family` (content): **Tolerated up to 4 violations** — brief generation continues, but downstream production lint will flag them.
  - If structural violations exist OR content violations exceed 4, the brief is rejected.
- **Mitigation:** Ensure the campaign's `targetingKeywords` are specific and embedded in both `imagePrompt` and `subjectAction` for every landing still. If a campaign already exists in DynamoDB with weak signals, patch the anchor fields (`allowedThemeSignals`, `cruiseNativeMoments`, `optionalGatheringMoments`, `targetingKeywords`) directly via `campaign-store.ts` rather than re-running the expensive discovery pipeline.

### Media Style Dualism ("Sketch = Feeling, Photo = Fact")
- **Symptom:** AI-generated realistic images of people produce uncanny results (plastic skin, inconsistent hands, weird facial features) that undermine trust. Fully illustrated images of ships and cabins feel fake and reduce confidence in the actual product.
- **Rule:** Campaign media must use **two distinct styles** depending on content, never a single uniform style:
  - **SKETCHED / Illustrated** — Used for people-forward emotional assets when the renderer would otherwise risk uncanny guests. Common examples: aesthetic concept frames, merch designs, and hero/concept directions whose active style resolver selects `sketched`. Purpose: emotional hook, aspiration, first impression. The style is a lush watercolor-and-ink travel illustration with expressive linework, idealized figures, and saturated color washes.
  - **REALISTIC / Photographic** — Used for trust assets and ship-forward/source-frame assets. Common examples: ship references, documentary detail modules, scene images for storyboard/video, and reference-grounded ship transforms. Purpose: trust, accuracy, "finish the sell." The style is documentary-grade cruise photography with sharp detail, natural marine lighting, and believable materials.
- **Designed ad exception (Phase 2.3):** Designed social/static ads are no longer treated as full AI-rendered scenes. They are code-rendered ad artifacts with model-generated documentary detail modules as image ingredients. Do not expect designed ad artifacts to match hero/concept watercolor composition; compare them against their active visual system and final ad layout.
- **Designed Ads tab semantics:** The review UI's `Designed Ads` tab intentionally includes both `manifest.images.designedAdArtifacts` (final template-rendered ads) and `manifest.images.documentaryDetails` (ingredient/source modules). If the tab looks "mostly full images," first compare the counts of final ad artifacts vs documentary modules before assuming the template renderer failed.
- **Pipeline enforcement:** `stability-generator.ts` and `style-prompts.ts` apply the centralized style prompt strings. Older paths branch on `sceneHasVisiblePeople()` / still people detection; newer paths may also use `identityBlueprint.visualFlavor` for hero/reference/concept decisions. When diagnosing style mismatch, inspect the actual `promptUsed` and style resolver inputs instead of assuming all people assets are watercolor.
- **Narrative arc:** Ads and hero banners show the FEELING (illustrated people living the vibe) → landing page details show the REALITY (actual ship, actual cabin, actual deck). The sketch invites imagination; the photo closes the deal.
- **Model assignment:** Nano-Banana (Gemini) handles both styles via prompt control. Do not split providers unless Nano-Banana produces soft ship renders — in that case, fall back to `gpt-image-2` or `dall-e-3` for the realistic branch only.
- **Vintage filter rotation (REALISTIC only):** Each realistic image should carry a distinct stylized film grade — Kodachrome 70s warmth, late-80s Ektachrome saturation, expired Polaroid shift, or cross-processed slide. This adds character and variety without breaking realism. The filter must look like a physical film stock or lens artifact, not a digital overlay.
- **Theme object anchoring (REALISTIC only):** Since people are absent, the niche/theme must remain faintly legible through subtle environmental props — e.g. a guitar on a deck lounger (music cruise), a well-worn notebook on a teak table (writing cruise), dice and a leather case on a bar rail (gaming cruise), vintage binoculars on a rail (birding cruise). The object should feel naturally placed, not staged or central — just enough to whisper the theme. Ship/sea/deck architecture remains dominant.
- **Scene image theme preservation:** Even within REALISTIC scene images, the campaign's niche identity stays present through lighting/color temperature aligned with the campaign palette, and composition choices that hint at the community (a circle of chairs, a journal left open, a vinyl record on a bar rail).
- **Video mixing strategy:** Promotional videos must deliberately mix both styles:
  - **Scene source frames** (from `generateSceneImages`) are **REALISTIC** — ship-forward, architecture-forward, environment-led motion. These are the trust anchor.
  - **Backdrop / hero inserts** (from `generateHeroImages` or `generateAestheticConcepts`) are **SKETCHED** — people-forward, emotional, aspirational.
  - **TikTok / social shorts:** ~70% sketched (people-first sells on scroll), ~30% realistic (trust reinforcement).
  - **Hero explainer / threshold video:** Opening sketched → Middle realistic → Closing sketched. The audio narration bridges the two styles.
  - The `buildStoryboardShotPrompt` function should tag each shot with its intended style so the video assembler pulls from the correct source pool.

### Probe Loop Scope (Do Not Confuse With Scene Images)
- **What probes currently simulate:** Probes are cheap image renders from `brief.landingStillBible.stillLibrary` only. They validate planned still directions for hero/concept/social still expansion: niche signal, slot role, composition, and generic-cruise fallback risk.
- **What probes do NOT currently simulate:** They are not generated from `brief.productionBible.sceneLibrary`, do not validate storyboard/video scene frames, do not validate documentary detail modules, and do not validate designed ad artifacts.
- **Why all probes may be watercolor:** The current probe path passes each landing still through the same style heuristics used for still prompts. If every landing still includes visible guests, the probes can all resolve to the sketched/watercolor branch even when scene images are expected to be realistic.
- **404 behavior:** `GET /api/groups/campaign/[slug]/media/probe` returns 404 when no probe run has been saved yet. This is expected before the first `POST /api/groups/campaign/[slug]/media/probe`; it is not itself a generation failure.
- **Generation gate reality:** The media orchestrator has an optional `probeGate` (`ignore`, `warn_only`, `require_approved`), but the public `/media/generate` route currently does not expose or force it. If a caller opts into `require_approved`, the gate applies to all spend-gated image types (`hero_image`, `aesthetic_concept`, `scene_image`) even though the probes only validate landing still directions. Treat that as a broad pre-spend quality gate, not proof that scene prompts are correct.
- **When scene images look wrong:** Inspect the Production Bible scene library and `scene_image` `promptUsed` records directly. If the scene library is missing/empty, regenerate the aesthetic brief/production bible before spending on scene images. If the scene library exists but scene images drift, use a directive scoped to scenes or update the production-bible scene prompts; rerunning landing still probes alone will not fix scene-frame prompts.
- **Recommended next implementation fix:** Add a dedicated scene-probe loop that renders one cheap probe per `productionBible.sceneLibrary` scene and gates `scene_image` generation against that result. Keep landing-still probes for hero/concept stills.

## 2. End-to-End Workflow

The agent must follow these steps linearly. At the end of each major phase, the agent should pause and provide the local testing URL to the user so they can review the work visually. Ask the user if they wish to intervene, modify, or approve the transition to the next phase.

### Phase 1: Discovery & Blueprint

1. **CB Inventory Pre-scrape:** Ensure `cb-deals-cache.json` is fresh (<24h old). If stale, prompt the user to run `npx tsx scripts/scrape-cb-deals.ts` before proceeding — the discovery pipeline will warn if the cache is stale.
2. **Psychographic / Niche Identification:** Execute the backend Discovery pipeline (`GET /api/groups/discovery` or equivalent local script). This uses Gemini 3.1 Pro Deep Research to fetch real-time psychographic data and automatically injects existing campaigns to prevent redundancy.
3. **Blueprint Generation with Inventory Constraints:** The pipeline calls GPT-5 to generate blueprints constrained to available CB inventory.
4. **In-Memory Match Gate:** Blueprints that cannot be matched to CB inventory are automatically discarded before saving.
5. **Discovery Red Team:** The system evaluates surviving blueprints against V2 strategy constraints.
   - **Check:** Does it feel like a vacation? Are the events optional and ambient?
6. **User Intervention Checkpoint:**
   - Direct the user to view the blueprints at `http://localhost:3000/tests/groups/discovery`.
   - Present the `pass/warn/block` status to the user. Ask for approval to proceed to Phase 2.
   - **Agent must explicitly tell user to open their browser and navigate to this URL to review campaigns visually before proceeding.**

### Phase 2: Inventory Confirmation & Retail Link

1. **Live CB Confirmation:** Run `npx tsx scripts/run-phase-b.ts` to re-scrape live CB inventory and confirm the pre-matched group block still exists.
2. **Retail Link Generation:** Phase B generates the Odysseus retail booking link for each confirmed match.
3. **User Intervention Checkpoint:** Confirm the matched ship, date, and starting price with the user.

### Phase 3: Aesthetic Brief Generation

1. **Visual Strategy:** Trigger generation of the aesthetic brief via the agent job orchestrator.
   - Run: `npx tsx scripts/enqueue-and-run-brief.ts <slug>` (uses `campaign_brief_generate` workflow, `stopBeforeMedia: true`)
   - This auto-generates the aesthetic bundle, action anchors, landing still bible, and production bible.
2. **Brief Engine Auto-Lint:** The orchestrator validates the brief internally.
   - **Check:** Does the visual plan include actual ship representation? Is it distinct from generic cruise marketing? Are the colors/vibes aligned with the niche without becoming costume parody?
   - If `blockerCount > 0` or structural anchor violations exist, generation aborts. If `warningCount > 0` (≤4 tolerated content violations), it continues but flags downstream.
3. **Verify the production bible before proceeding — this is mandatory.**
   Check `brief.productionBible.sceneLibrary` in the readiness response. Every scene object must have a non-empty `imagePrompt` field. If all `imagePrompt` fields are empty strings, the production bible generation failed silently and scene images will be generic. Re-run the brief bundle before proceeding to media generation.
4. **User Intervention Checkpoint:**
   - Direct the user to view the aesthetic brief and production bible at `http://localhost:3000/tests/brief-studio`.
   - Ask the user to approve the aesthetic brief before generating heavy media assets.
   - **Agent must explicitly tell user to open their browser and navigate to this URL to review the brief visually before proceeding to media generation.**

### Phase 4: Media & Landing Asset Production

Phase 4 has **three mandatory sequential sub-steps** that cannot be skipped or reordered. Each failed sub-step blocks everything that follows it.

---

#### 4.0 — Verify the Production Bible before spending on generation

Before generating any images, confirm that the production bible was generated with proper `imagePrompt` fields. A production bible with empty `imagePrompt` fields produces generic cruise scenes with no niche content — this is a generation failure, not a quality issue.

```bash
curl -s http://localhost:3000/api/groups/campaign/[slug]/brief/readiness \
  | python -m json.tool 2>/dev/null
```

Check the response for `brief.productionBible.sceneLibrary`. Every scene must have a non-empty `imagePrompt`. If `imagePrompt` fields are empty strings, **do not proceed to generation** — re-run the brief bundle first:

```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/brief
```

Wait for the async brief job to complete (poll `GET /api/groups/campaign/[slug]/brief?jobId=<id>`), then re-check readiness before continuing.

Also verify `brief.landingStillBible.stillLibrary` exists and has at least 4–6 stills with non-empty `imagePrompt` fields. If the still library is missing or empty, the brief bundle did not complete correctly.

---

#### 4.1 — Approve the brief for media generation

The brief must be in `approved` status before any image generation can run. A brief in `revised` or `pending` status will cause the generate endpoint to return 422.

**Use ONLY this endpoint:**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/brief/approve
```

**NEVER use** `POST /api/groups/campaign/[slug]/media/aesthetic/approve` — that is a deprecated route that requires a legacy `redTeamReview` field which the current brief engine does not populate, so it will always fail.

**Success response:** `{ "readiness": "ready_for_media", ... }`
**Failure response 409:** The brief has structural blockers — re-run the brief and fix blockers before approving.

If the brief was recently regenerated (`humanReviewStatus: 'revised'`), you must approve it again. Regeneration always resets status to `revised`.

---

#### 4.2 — Generate media assets

Once the brief is approved, trigger generation. Always generate **one asset type group at a time** to avoid dev server memory exhaustion.

**Recommended generation order — with approval gates:**

Each step below has an implicit **approval gate**: after the step completes, check the manifest for errors and review assets at `http://localhost:3000/tests/media-generation` before proceeding. Do not batch all asset types into one call.

**Step A — Ship references (required before heroes and scenes):
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["ship_reference_image"]}'
```
Ship references are SerpAPI photos of the actual vessel. They are used as grounding references for hero and scene generation. Without them, heroes generate without ship context and scenes may fail entirely.

**Step B — Hero images + aesthetic concepts:**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["hero_image","aesthetic_concept"]}'
```
These use the ship references as grounding. Run after Step A.

**Step C — Scene images (uses production bible imagePrompts):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["scene_image"],"sceneImageMode":"missing_only"}'
```
`sceneImageMode: "missing_only"` skips scenes that already have an image in the manifest. Use `"all"` to regenerate everything (e.g. after a brief re-run or directive change).

**Important scope note:** A request to run "through scene images" stops here. It includes Step A (ship references), Step B (heroes + concepts), and Step C (scene images), but it does **not** include documentary detail modules or designed ads. Those belong to Step D and must be requested or executed explicitly if the goal is a full image pack.

**Step D — Documentary details + designed ads (together):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["documentary_detail_image","designed_ad_artifact"]}'
```
Or use the test endpoint for designed ads specifically:
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/test/images \
  -H "Content-Type: application/json" \
  -d '{"generator":"designed_ad_artifacts"}'
```

**Agent default:** If the user asks for the campaign to be rerun from the brief through the complete image pipeline, or asks for "landing page images and others," include Step D by default unless they explicitly say to stop at scene images only.

**Step E — Audio, video, merch (optional, heavy):**

**Prerequisites before running video generation:**
1. **Scene images must exist** — Video generation requires `scene_image` assets from Step C. Storyboard videos pull source frames from `manifest.images.sceneImages`. If scene images are missing, video generation will fail silently or produce empty results.
2. **Production Bible must have non-empty `imagePrompt` fields** — Verify with `GET /api/groups/campaign/[slug]/brief/readiness`. Empty `imagePrompt`s = generic video frames.
3. **Brief must be approved** — Same gate as Step 4.1.

**TikTok promo video rule:**
1. Use the storyboard-driven `tiktok_seed_video` path for the actual promotional video unless there is no Production Bible yet.
2. Keep `tiktok` organic delivery and `tiktok_paid` lead-gen delivery separate. They are different distribution contracts, not one shared publish flow.
3. If the video feels generic, inspect the Production Bible scene library and the storyboard prompts before touching the composer.
4. Landing-still probes do not prove TikTok scene quality. They are a separate confidence loop.

**Audio generation (light, safe to run first):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["ambient_narration","hype_clip","theme_music"],"themeMusicSource":"default"}'
```

**Video generation (expensive, slow — run individually):**

**CRITICAL: Generation overlap burns credits. Follow these rules exactly.**

1. **One deliverable per HTTP call** — never batch multiple video assetTypes in one request.
2. **Never re-submit the same deliverable** while the prior submission is still processing. The API returns 409 if `isGenerating()` is true for that slug.
3. **HTTP 120s timeout is NOT a failure** — the server continues generating after the connection drops. Re-submitting queues a **second** set of clips and doubles costs.
4. **After timeout: poll the manifest, never re-submit.** Use `GET /api/groups/campaign/[slug]/media/manifest` and inspect `videos.tiktokSeed`, `videos.heroExplainer`, etc. If null/empty, wait 60s and poll again. Only if the manifest has been stable (no new assets) for >5 minutes should you consider re-submitting once.
5. **Never run two video scripts or API calls in parallel** for the same campaign slug. Sequential only.
6. **Use the API route for video generation, not standalone scripts.** The `POST /api/groups/campaign/[slug]/media/generate` endpoint checks `isGenerating()` and returns HTTP 409 if a run is already active. Standalone scripts (`npx tsx tmp/...`) call `runMediaGeneration()` directly, bypassing the 409 gate — they are the primary cause of overlapping submissions. Always use the API endpoint for video.

```bash
# TikTok seed video only (4 storyboard shots, ~40s final)
# Submit ONCE. Do not re-run until manifest shows videos.tiktokSeed populated.
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["tiktok_seed_video"]}'
# Expect: HTTP 200 with jobId, or HTTP 409 if already running.
# If the call hangs/times out after 120s, DO NOT re-run this curl.
# Poll manifest instead (see below).

# Hero explainer video only (6 storyboard shots, ~60s final)
# Only run AFTER manifest shows tiktokSeed is populated.
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["hero_explainer_video"]}'

# Threshold announcement video only
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["threshold_video"]}'

# Countdown video series only
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["countdown_video"]}'
```

**Manifest polling after timeout (PowerShell):**
```powershell
while ($true) {
  $m = Invoke-RestMethod "http://localhost:3000/api/groups/campaign/[slug]/media/manifest"
  Write-Host "tiktokSeed=$($m.videos.tiktokSeed -ne $null) heroExplainer=$($m.videos.heroExplainer -ne $null)"
  if ($m.videos.tiktokSeed -and $m.videos.heroExplainer) { break }
  Start-Sleep -Seconds 60
}
```

**Cost warning — video provider mismatch:**
The codebase documentation states RunwayML Gen-3 Turbo as the primary video provider (5 credits/second, ~$8.50 total for all storyboard deliverables). However, `getDefaultVideoModelPresetId()` in `lib/campaigns/media/video-models.ts` **defaults to Fal** when `FAL_KEY` is set in the environment, regardless of `MEDIA_VIDEO_PROVIDER` configuration. This can double or triple costs. To force RunwayML, explicitly set `MEDIA_VIDEO_PROVIDER=runway` in `.env.local`, or temporarily unset `FAL_KEY`.

**Generation time expectation:** Each video deliverable submits multiple shots to the active provider sequentially. Allow **5–15 minutes per deliverable** depending on queue depth. The API call may HTTP-timeout after 120s while the server continues processing in the background — check the manifest afterward instead of re-submitting.

**Important pipeline note:** Designed ad artifacts (`designed_ad_artifact`, `documentary_detail_image`) are **additive** — they run alongside the full media pipeline, not instead of it. A generation request with no explicit `assetTypes` generates images, audio, video, and designed ads together. The `DESIGNED_MEDIA_MODE` env var only gates whether designed ads are included; it does not suppress heroes, scenes, videos, or audio.

**TikTok planning note:** The TikTok refactor plan in `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_2_MEDIA_GENERATION/TIKTOK_VIDEO_PRODUCTION/TIKTOK_VIDEO_REFACTOR_PLAN.md` is the implementation guide for improving promotional TikTok quality. Agents should treat it as the current roadmap for scene intent, storyboard assembly, linting, and the paid vs organic split.

---

#### 4.3 — Verify generation results

After each generation step, check the job summary in the response:
- `completionStatus: "complete"` — all assets generated
- `completionStatus: "partial"` — some failed; check `jobSummary.errors`
- Any `errors[]` entries — investigate before proceeding

**Review generated assets in the UI:**
```
http://localhost:3000/tests/media-generation
```

Check each tab systematically:
- **References** — ship reference photos present? Correct ship?
- **Heroes & Concepts** — images reflect the niche (not generic cruise)? Mixed styles (watercolor for heroes with people, photorealistic for environment scenes)?
- **Scenes** — scene images reflect specific locations (pool deck, atrium, dining, etc.)? Do they carry any niche cues?
- **Designed Ads** — ad templates rendered? Multiple placements (1:1, 4:5, 9:16)?
  - Remember this tab includes both final designed ads and their source modules. The actual template coverage lives in `manifest.images.designedAdArtifacts`.
- **Crops, Video, Audio, Merch** — as applicable

If scene images look generic (no niche props, just standard cruise locations), the production bible `imagePrompt` fields were empty when generation ran. Fix: re-run the brief, re-approve, then regenerate with `sceneImageMode: "all"`.

---

#### 4.4 — Common failure modes and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `422 AESTHETIC_BRIEF_NOT_READY` on generate | Brief is `revised` or `pending`, not `approved` | `POST /brief/approve` |
| `409` from `/brief/approve` with "blockers" | Brief has structural validation failures | Re-run brief, fix blockers, re-approve |
| `/media/aesthetic/approve` returns red-team error | Wrong endpoint — deprecated | Use `POST /brief/approve` instead |
| Scene images are generic cruise (no niche) | `imagePrompt` was empty in production bible | Re-run brief → re-approve → regenerate scenes with `"all"` |
| `GET /media/probe` returns 404 | No probe run saved yet — not an error | Run `POST /media/probe` to validate directions, or skip if brief was just regenerated |
| `completionStatus: "partial"` after generation | Some images failed (often API timeout or rate limit) | Re-run same generation with `sceneImageMode: "missing_only"` or `assetTypes` filter |
| Heroes look wrong but stills look correct | Brief was approved before the `imagePrompt` fix; production bible stills are driving the wrong content | Create a directive scoped to `heroes` to patch specific stills |
| Brief reverts to `revised` after a directive apply | `patchBriefForDirective` saves the patched brief back, which resets `humanReviewStatus` | Re-approve with `POST /brief/approve` before the next generation run |

---

#### 4.5 — Landing page

Once heroes, scenes, and designed ads are in the manifest:
```
http://localhost:3000/tests/campaign-landing/[slug]
```
The landing page view model reads directly from the manifest. No separate construction step is needed — if the manifest is populated, the page renders.

### Phase 5: Publish, Distribute, and Go Live

#### 5.1 — Landing Page Publishing

The campaign landing page is a Next.js dynamic route that renders directly from the campaign manifest and brief. No build or deploy step is required beyond the standard Next.js dev/prod server.

**Public-facing URL:**
```
http://localhost:3000/groups/[slug]
```

**Test preview URL:**
```
http://localhost:3000/tests/campaign-landing/[slug]
```

The landing page view model (`lib/campaigns/landing/view-model.ts`) resolves:
- Hero image from `manifest.images.heroes` or `manifest.images.shipReferences`
- Gallery strip interleaving artistic + trust images
- Pricing card from campaign blueprint + CB deals cache
- Waitlist form and "Book Now" routing (Group path vs Retail path)

**Verify the page renders before proceeding:** If the campaign manifest is empty or the brief has no `heroSlogan`, the page may 404 or render a fallback. Ensure media generation is complete first.

#### 5.2 — Ad Distribution (Cold Placement)

Campaign assets are distributed via the distribution planner and dispatch system. Full reference: `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_4_DISTRIBUTION/PHASE_4_DISTRIBUTION.md`

**Step A — Generate a distribution plan (dry run / simulate):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/distribute \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "plan",
    "providerMode": "simulate"
  }'
```

Response includes:
- `plan.posts[]` — scheduled posts with platform, copy, image references, timing
- `plan.audience` — targeting parameters derived from campaign brief
- `plan.budget` — estimated spend (placeholder in simulate mode)

**Step B — Review the plan:**
Check that:
- Posts reference actual `assetId`s from the manifest (not stale or missing assets)
- Copy tone matches campaign `voicePersona` and `toneKeywords`
- Hashtag sets differ per platform (Instagram vs TikTok vs Facebook)
- Image tags match platform requirements (1:1 for Instagram feed, 9:16 for stories, etc.)

**Step C — Dispatch to platforms (live):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/distribute \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "dispatch",
    "providerMode": "live",
    "platforms": ["meta", "tiktok", "google"]
  }'
```

**Prerequisites for live dispatch:**
- Platform OAuth tokens must be configured (`.env.local`: `META_ACCESS_TOKEN`, `TIKTOK_ACCESS_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`)
- Ad accounts must be active and funded
- Campaign must have `status: GATHERING_INTEREST` or `status: ACTIVE`

**Step D — Mark campaign live:**
```bash
curl -X PATCH http://localhost:3000/api/groups/campaign/[slug] \
  -H "Content-Type: application/json" \
  -d '{"status": "GATHERING_INTEREST"}'
```

#### 5.3 — Final QA Checklist

1. **Landing page renders** at `/groups/[slug]` with hero, gallery, pricing, and waitlist
2. **Book Now routing** works for both Group and Retail paths
3. **Distribution plan** references valid assets and matches campaign tone
4. **Campaign status** updated to `GATHERING_INTEREST`

## 3. Campaign Directives — Targeted Artifact Fixes

Use the Campaign Directive system to fix arbitrary issues in a campaign's generated media **without re-running the full brief pipeline (~100s)**. A directive expresses editorial intent in natural language, resolves it to concrete field overrides in one LLM call, marks only the affected assets stale, and regenerates only those assets.

**Full reference:** `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/SURGICAL_MODIFICATIONS/CAMPAIGN_DIRECTIVES.md`

### When to use a directive (not a full re-brief)

Use a directive when the campaign brief is structurally sound but the generated images have a specific, correctable problem:

- "The board game props are too generic — use Azul, Catan, and Ticket to Ride specifically"
- "The hero images all feel like a spa retreat — enforce the after-hours electric energy"
- "Remove the jazz bar interior from all hero stills, it reads as a music cruise not a board game cruise"
- "The lighting in concept images is too dark — shift to morning light and warmer palette"
- "The people in heroes look too corporate — wardrobe should feel indie and casual"

Do NOT use a directive if the campaign brief itself is wrong (wrong niche temperature, wrong energy mode, wrong ship). For structural issues, re-run the brief via `enqueue-and-run-brief.ts`.

### Step-by-step: applying a directive as an agent

**Step 1 — Create the directive** (resolves intent → patch, marks assets stale):

```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/directives \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Make the board game props specific and renderable. Use Azul tile boards, Catan hex pieces, and Ticket to Ride train tokens as incidental background objects on café tables, bar rails, and lounge armrests. No generic dice or playing cards."
  }'
```

Response includes:
- `directive.id` — needed for the apply call
- `directive.scope` — which pools will be regenerated (`heroes`, `concepts`, `prop_families`, etc.)
- `directive.patch` — the resolved field overrides (review this to confirm the agent understood correctly)
- `affectedCount` — number of assets that will be regenerated

**If `affectedCount` is 0:** the directive resolved to an empty patch. The instruction was too vague. Try again with more specific language naming concrete objects, placements, or lighting conditions.

**Step 2 — Review the resolved patch** before applying. Check `directive.patch.allowedProps` and `directive.patch.stillPatches` to confirm the model understood the intent. If the patch looks wrong, do NOT apply — create a new directive with more precise language.

**Step 3 — Apply the directive** (triggers regeneration of stale pools only):

```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/directives/[directive.id]/apply
```

Response includes:
- `regenerated` — the new `AssetRecord[]` that were created
- `directive.status` — `"applied"` on success, `"failed"` on error

**Step 4 — Verify results:**

Direct the user to review regenerated assets at:
```
http://localhost:3000/tests/media-generation
```
Navigate to the **Heroes & Concepts** tab. New assets will have `tags: ["hero", "directive:[id]"]` and `reviewStatus: "needs_review"`. The user approves or requests a follow-up directive.

### Writing effective directive text

Effective directives describe **what a camera would see or what an illustrator would draw**, not categories or concepts:

| ❌ Too vague | ✅ Specific and renderable |
|---|---|
| "More board game energy" | "A half-finished Azul tile game on a teak café table with coffee cups, morning sea light" |
| "Less spa-like" | "Remove robes, candles, and towel arrangements. Replace with casual indie wardrobe — denim, vintage tees, canvas bags" |
| "Better lighting" | "Shift all hero stills to morning golden light through port-side lounge windows, not sunset or twilight" |
| "Show the niche more" | "Add a Catan box spine visible on a café shelf in the background of the lounge still" |

### Listing existing directives for a campaign

```bash
curl http://localhost:3000/api/groups/campaign/[slug]/directives
```

Returns all directives with their status (`pending`, `applied`, `failed`). Useful to audit what has already been changed and avoid conflicting patches.

### What re-runs vs. what doesn't

| Stage | Re-runs on directive apply? |
|---|---|
| Aesthetic engine (Pass 1/2/refinement) | ❌ Never |
| Editors room (still bible, production bible) | ❌ Never |
| Hero image generation | ✅ If scope includes `heroes` or `still_bible` |
| Concept image generation | ✅ If scope includes `concepts` |
| Scene image generation | ✅ If scope includes `scenes` |
| Documentary details | ✅ If scope includes `documentary_details` |
| Designed ad artifacts | ✅ If scope includes `designed_ads` |

---

## 4. Tooling & API Guidance

Always use the shared `lib/agent-api` orchestrator for durable state.

- Brief generation: `npx tsx scripts/enqueue-and-run-brief.ts <slug>` (recommended)
- Alternative: `npm run agent:brief-prototype -- <slug>` (if configured in package.json)
- Never try to skip the Agent API workflow system if a durable job record is required.
- **Do not manually prompt Gemini or Perplexity for ideation**; use the built-in `core-logic.ts` pipeline/API route, which already fetches live web data, normalizes it, and passes exclusion context correctly.
- Standalone scripts (e.g., `tmp/run-media-generation.ts`) that call internal Next.js modules must import `loadEnvConfig` from `@next/env` at the top to access `.env.local` variables: `loadEnvConfig(process.cwd())`.
