# End-to-End Workflow

Phase-by-phase execution guide for the full campaign pipeline.

**Back to [SKILL.md](./SKILL.md)**

---

## 2. End-to-End Workflow

The agent must follow these steps linearly. At the end of each major phase, the agent should pause and provide the local testing URL to the user so they can review the work visually. Ask the user if they wish to intervene, modify, or approve the transition to the next phase.

### Phase 1: Discovery & Blueprint

1. **CB Inventory Pre-scrape:** Ensure `cb-deals-cache.json` is fresh (<24h old). If stale, **this is a Playwright-dependent operation â€” the agent must not run it autonomously.** Tell the user: *"Please run `npx tsx scripts/scrape-cb-deals.ts` in your terminal and paste back the output, or confirm the file `.github/data/cb-deals-cache.json` was updated."* Wait for confirmation before continuing. See Â§1c Hard Stop List.
2. **Check for existing campaign first (zero-cost):** Before running any discovery pipeline, verify the campaign already exists by calling `GET /api/groups/discovery?load=true`. This returns existing campaigns from the store with **no LLM calls**. Only proceed to Step 3 if the campaign is missing.
   - **NEVER call bare `GET /api/groups/discovery`** to check existence â€” it triggers expensive Gemini Deep Research (~10M tokens). Use `?load=true` exclusively for existence checks.
3. **Choose your discovery flow (only if campaign is missing):**
   - **All-in-one (cold start):** `GET /api/groups/discovery` runs Gemini Deep Research Steps 1+2, then GPT-5 Step 3, then match gate, then save. Use this on the first run of the day or when the research cache is empty.
   - **Two-stage (iterative, cheaper):** Run `POST /api/groups/discovery/research` once, then call `POST /api/groups/discovery/generate` repeatedly to add new blueprints without re-paying for Gemini. Each `generate` call is idempotent on slug â€” duplicates are skipped. Check cache state with `GET /api/groups/discovery/research` first.
   - **Re-Spin** (`GET /api/groups/discovery?respin=true` or the UI "Re-Spin" button): Bypasses the Gemini cache and feeds prior-campaign + red-team feedback into the prompts. Adds new campaigns; does NOT delete or overwrite existing ones.
4. **Psychographic / Niche Identification:** Step 1 (Gemini Deep Research) automatically injects existing campaigns and any `discoveryIteration.retiredAt` / `recommendedNextAction === 'retire'` records into the prompts so they are excluded from new suggestions.
5. **Blueprint Generation with Inventory Constraints:** Step 3 calls GPT-5 with the CB inventory list as hard constraints.
6. **In-Memory Match Gate:** Blueprints that cannot be matched to CB inventory are automatically discarded before saving.
7. **Discovery Red Team:** The system evaluates surviving blueprints against V2 strategy constraints.
   - **Check:** Does it feel like a vacation? Are the events optional and ambient?
8. **Manage the slate:**
   - **Retire** (`POST /api/groups/discovery/retire/[slug]` or per-card "Retire" button): Hides a campaign from the discovery view but keeps it in the database. Use for past-launch-window or "not pursuing this wave" cases. Reversible via DELETE on the same path.
   - **Filter the view** by pricing status (CB Matched / AI Estimate / Unmatched), launch window (Healthy 210+ / Tight 180â€“210 / Past minimum <180), and retired toggle. Retired campaigns are hidden by default.
   - **Clear All** (DESTRUCTIVE) wipes every campaign from DynamoDB. Use Retire for soft hide instead.
9. **User Intervention Checkpoint:**
   - Direct the user to view the blueprints at `http://localhost:3000/tests/groups/discovery`.
   - Present the `pass/warn/block` status to the user. Ask for approval to proceed to Phase 2.
   - **Agent must explicitly tell user to open their browser and navigate to this URL to review campaigns visually before proceeding.**

### Phase 2: Inventory Confirmation & Retail Link

1. **Live CB Confirmation + Link Validation:** **This is a Playwright-dependent operation â€” the agent must not run Phase B autonomously.** Tell the user: *"Please run `npx tsx scripts/run-phase-b.ts` (or `npx tsx scripts/run-phase-b.ts --slug <slug>` for one campaign) in your terminal and paste back the output."* Wait for confirmation before continuing. See Â§1c Hard Stop List. What Phase B does: re-scrapes live CB inventory, ranks up to 3 candidates per campaign, scrapes the personal booking link for each, and validates it with Playwright before accepting it as primary.
2. **Automatic Tier 1 Backup Promotion:** If the primary (rank 0) candidate fails validation, Phase B automatically promotes the rank 1 candidate if it has `promiseDelta: NONE` or `PRICE_ONLY` (same ship, same date, same port). Tier 2+ candidates (different date or port) are stored but not auto-promoted â€” they require operator review.
3. **Retail Link Generation:** Phase B generates the Odysseus retail booking link and validates it as an `ODYSSEUS_RETAIL` candidate alongside the CB group candidates.
4. **Failure handling:** If all candidates fail validation, the campaign is marked `INVENTORY_FAILED_PAUSED` and the write is skipped. The operator must resolve this manually before the campaign can go live.
5. **User Intervention Checkpoint:** Review the Phase B output. Confirm:
   - The result status (`CONFIRMED`, `BACKUP_PROMOTED`, `MATCH_EXPIRED`, or `INVENTORY_FAILED`) for each campaign.
   - If `BACKUP_PROMOTED`: check which candidate was used and whether the promise delta is acceptable.
   - Confirm matched ship, sail date, and starting price before proceeding to brief generation.

### Phase 3: Aesthetic Brief Generation

1. **Visual Strategy:** Trigger generation of the aesthetic brief via the agent job orchestrator.
   - Run: `npx tsx scripts/enqueue-and-run-brief.ts <slug>` (uses `campaign_brief_generate` workflow, `stopBeforeMedia: true`)
   - This auto-generates the aesthetic bundle, action anchors, landing still bible, and production bible.
2. **Brief Engine Auto-Lint:** The orchestrator validates the brief internally.
   - **Check:** Does the visual plan include actual ship representation? Is it distinct from generic cruise marketing? Are the colors/vibes aligned with the niche without becoming costume parody?
   - If `blockerCount > 0` or structural anchor violations exist, generation aborts. If `warningCount > 0` (Ã¢â€°Â¤4 tolerated content violations), it continues but flags downstream.
3. **Verify the production bible before proceeding Ã¢â‚¬â€ this is mandatory.**
   Check `brief.productionBible.sceneLibrary` in the readiness response. Every scene object must have a non-empty `imagePrompt` field. If all `imagePrompt` fields are empty strings, the production bible generation failed silently and scene images will be generic. Re-run the brief bundle before proceeding to media generation.
   - If the scene library exists but still carries `scene_niche_cue_missing` or `scene_human_presence_weak` after one repair pass, stop and escalate to the user before any image spend. Do not treat that as a soft warning during an agentic campaign flow.
   - The same rule applies to any persistent warning in later phases: one auto-repair pass, then stop and ask for a decision. The agent is the glue between phases, not a substitute for the final call.
4. **Persistence check for revisions:**
   - If a user-requested change should survive future regenerations, put it in the upstream brief or directive source rather than only in one regenerated asset.
   - Use asset-level regeneration for narrow cleanup only when the fix is intentionally local.
   - If the same correction would probably need to be repeated the next time the brief, still bible, or production bible is regenerated, it belongs in the durable source of truth now.
5. **User Intervention Checkpoint:**
   - Direct the user to view the aesthetic brief and production bible at `http://localhost:3000/tests/brief-studio`.
   - Ask the user to approve the aesthetic brief before generating heavy media assets.
   - **Agent must explicitly tell user to open their browser and navigate to this URL to review the brief visually before proceeding to media generation.**

### Phase 4: Media & Landing Asset Production

Phase 4 has **three mandatory sequential sub-steps** that cannot be skipped or reordered. Each failed sub-step blocks everything that follows it.

---

#### 4.0 Ã¢â‚¬â€ Verify the Production Bible before spending on generation

Before generating any images, confirm that the production bible was generated with proper `imagePrompt` fields. A production bible with empty `imagePrompt` fields produces generic cruise scenes with no niche content Ã¢â‚¬â€ this is a generation failure, not a quality issue.

```bash
curl -s http://localhost:3000/api/groups/campaign/[slug]/brief/readiness \
  | python -m json.tool 2>/dev/null
```

Check the response for `brief.productionBible.sceneLibrary`. Every scene must have a non-empty `imagePrompt`. If `imagePrompt` fields are empty strings, **do not proceed to generation** Ã¢â‚¬â€ re-run the brief bundle first:

```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/brief
```

Wait for the async brief job to complete (poll `GET /api/groups/campaign/[slug]/brief?jobId=<id>`), then re-check readiness before continuing.

Also verify `brief.landingStillBible.stillLibrary` exists and has at least 4Ã¢â‚¬â€œ6 stills with non-empty `imagePrompt` fields. If the still library is missing or empty, the brief bundle did not complete correctly.

---

#### 4.1 Ã¢â‚¬â€ Approve the brief for media generation

The brief must be in `approved` status before any image generation can run. A brief in `revised` or `pending` status will cause the generate endpoint to return 422.

**Use ONLY this endpoint:**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/brief/approve
```

**NEVER use** `POST /api/groups/campaign/[slug]/media/aesthetic/approve` Ã¢â‚¬â€ that is a deprecated route that requires a legacy `redTeamReview` field which the current brief engine does not populate, so it will always fail.

**Success response:** `{ "readiness": "ready_for_media", ... }`
**Failure response 409:** The brief has structural blockers Ã¢â‚¬â€ re-run the brief and fix blockers before approving.

If the brief was recently regenerated (`humanReviewStatus: 'revised'`), you must approve it again. Regeneration always resets status to `revised`.

---

#### 4.2 Ã¢â‚¬â€ Generate media assets

Once the brief is approved, trigger generation. Always generate **one asset type group at a time** to avoid dev server memory exhaustion.

**Recommended generation order Ã¢â‚¬â€ with approval gates:**

Each step below has an implicit **approval gate**: after the step completes, check the manifest for errors and review assets at `http://localhost:3000/tests/media-generation` before proceeding. Do not batch all asset types into one call.

**Step A Ã¢â‚¬â€ Ship references (required before heroes and scenes):
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["ship_reference_image"]}'
```
Ship references are SerpAPI photos of the actual vessel. They are used as grounding references for hero and scene generation. Without them, heroes generate without ship context and scenes may fail entirely.

**Step B Ã¢â‚¬â€ Hero images + aesthetic concepts:**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["hero_image","aesthetic_concept"]}'
```
These use the ship references as grounding. Run after Step A.

**Step C Ã¢â‚¬â€ Scene images (uses production bible imagePrompts):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["scene_image"],"sceneImageMode":"missing_only"}'
```
`sceneImageMode: "missing_only"` skips scenes that already have an image in the manifest. Use `"all"` to regenerate everything (e.g. after a full brief re-run).

**Surgical scene changes:** If only one or a few scenes need revision, use a **Campaign Directive** (see Â§1b) instead of `"all"`. Create a directive targeting the specific `sceneId`, apply it, and only the affected scenes regenerate. This is cheaper, faster, and preserves existing assets that are already correct.

**Durability rule:** If the user is asking for a recurring style or content correction that should remain true across future regenerations, make the change in the directive or source brief first, then regenerate. Do not solve a persistent campaign rule only by fixing the visible asset once.

**Important scope note:** A request to run "through scene images" stops here. It includes Step A (ship references), Step B (heroes + concepts), and Step C (scene images), but it does **not** include documentary detail modules or designed ads. Those belong to Step D and must be requested or executed explicitly if the goal is a full image pack.

**Scene warning gate:** If the scene layer still produces `scene_niche_cue_missing` or `scene_human_presence_weak` after the first repair pass, stop the flow and present the user with a decision checkpoint. The agent may repair once automatically, but it may not silently continue through video generation while those warnings persist.

**Probe policy:** Do not run `/media/probe` or the test-page probe buttons as a default campaign step. Probes spend preview-image and Claude-vision budget to validate direction, so only use them when the user explicitly asks for validation or when you are actively debugging a stubborn prompt-quality issue.

**Agentic recovery pattern:** For any campaign layer that looks "almost right" but not quite:
1. Inspect the actual source-of-truth artifact that feeds the next step.
2. Repair that artifact once, in the narrowest possible scope.
3. Re-run the downstream check.
4. If the same mismatch survives, stop and escalate to the user with a concrete choice.

**Step D Ã¢â‚¬â€ Documentary details + designed ads (together):**
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

**Step E Ã¢â‚¬â€ Audio, video, merch (optional, heavy):**

**Prerequisites before running video generation:**
1. **Scene images must exist** Ã¢â‚¬â€ Video generation requires `scene_image` assets from Step C. Storyboard videos pull source frames from `manifest.images.sceneImages`. If scene images are missing, video generation will fail silently or produce empty results.
2. **Production Bible must have non-empty `imagePrompt` fields** Ã¢â‚¬â€ Verify with `GET /api/groups/campaign/[slug]/brief/readiness`. Empty `imagePrompt`s = generic video frames.
3. **Brief must be approved** Ã¢â‚¬â€ Same gate as Step 4.1.

**TikTok promo video rule:**
1. Use the storyboard-driven `tiktok_seed_video` path for the actual promotional video. A saved Production Bible is required because the video must use the generated scene images and storyboard copy.
2. Keep `tiktok` organic delivery and `tiktok_paid` lead-gen delivery separate. They are different distribution contracts, not one shared publish flow.
3. Build the video as a package-first TikTok render: still scenes, overlay cards, hard cuts, and generated copy from the manifest. Motion inside the source image is optional, not the core creative dependency.
4. If the video feels generic, inspect the Production Bible scene library and the storyboard prompts before touching the composer.
5. If the TikTok render still looks like stitched clips instead of a packaged ad, repair the package layer first before asking for more motion or more source-image generation.
6. The final TikTok export should be the ad itself: a full-frame 9:16 package with the still image preserved, text overlays integrated into the video, and only light motion if it helps the composition.
7. If the request is "generate all media" or omits `assetTypes`, treat that as the curated production bundle with one TikTok deliverable: `tiktok_seed_video`. Do not assume the legacy video family is part of the default run.

**Audio generation (light, safe to run first):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["ambient_narration","hype_clip","theme_music"],"themeMusicSource":"default"}'
```

**Video generation (expensive, slow Ã¢â‚¬â€ run individually):**

**CRITICAL: Generation overlap burns credits. Follow these rules exactly.**

1. **One deliverable per HTTP call** Ã¢â‚¬â€ never batch multiple video assetTypes in one request.
2. **Never re-submit the same deliverable** while the prior submission is still processing. The API returns 409 if `isGenerating()` is true for that slug.
3. **HTTP 120s timeout is NOT a failure** Ã¢â‚¬â€ the server continues generating after the connection drops. Re-submitting queues a **second** set of clips and doubles costs.
4. **After timeout: poll the manifest, never re-submit.** Use `GET /api/groups/campaign/[slug]/media/manifest` and inspect `videos.tiktokSeed`, `videos.heroExplainer`, etc. If null/empty, wait 60s and poll again. Only if the manifest has been stable (no new assets) for >5 minutes should you consider re-submitting once.
5. **Never run two video scripts or API calls in parallel** for the same campaign slug. Sequential only.
6. **Use the API route for video generation, not standalone scripts.** The `POST /api/groups/campaign/[slug]/media/generate` endpoint checks `isGenerating()` and returns HTTP 409 if a run is already active. Standalone scripts (`npx tsx tmp/...`) call `runMediaGeneration()` directly, bypassing the 409 gate Ã¢â‚¬â€ they are the primary cause of overlapping submissions. Always use the API endpoint for video.

```bash
# TikTok seed video only (6 storyboard shots, ~35s final)
# Submit ONCE. Do not re-run until manifest shows videos.tiktokSeed populated.
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["tiktok_seed_video"]}'
# Expect: HTTP 200 with jobId, or HTTP 409 if already running.
# If the call hangs/times out after 120s, DO NOT re-run this curl.
# Poll manifest instead (see below).

# Legacy video deliverables below are opt-in only.
# Do not run them as part of the normal all-media flow unless the user explicitly asks for them.

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

**Cost warning Ã¢â‚¬â€ video provider mismatch:**
The codebase documentation states RunwayML Gen-3 Turbo as the primary video provider (5 credits/second, ~$8.50 total for all storyboard deliverables). However, `getDefaultVideoModelPresetId()` in `lib/campaigns/media/video-models.ts` **defaults to Fal** when `FAL_KEY` is set in the environment, regardless of `MEDIA_VIDEO_PROVIDER` configuration. This can double or triple costs. To force RunwayML, explicitly set `MEDIA_VIDEO_PROVIDER=runway` in `.env.local`, or temporarily unset `FAL_KEY`.

**Generation time expectation:** Each video deliverable submits multiple shots to the active provider sequentially. Allow **5Ã¢â‚¬â€œ15 minutes per deliverable** depending on queue depth. The API call may HTTP-timeout after 120s while the server continues processing in the background Ã¢â‚¬â€ check the manifest afterward instead of re-submitting.

**Important pipeline note:** Designed ad artifacts (`designed_ad_artifact`, `documentary_detail_image`) are **additive** Ã¢â‚¬â€ they run alongside the production all-media bundle, not instead of it. A generation request with no explicit `assetTypes` uses the curated production bundle: references, hero/concept/scene/crop images, designed ads, the single `tiktok_seed_video` package, audio, copy, and merch. It does **not** implicitly include `hero_explainer_video`, `threshold_video`, `countdown_video`, or `broll_clip`. The `DESIGNED_MEDIA_MODE` env var only gates whether designed ads are included; it does not suppress the rest of the production bundle.

**TikTok planning note:** The TikTok refactor plan in `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_2_MEDIA_GENERATION/TIKTOK_VIDEO_PRODUCTION/TIKTOK_VIDEO_REFACTOR_PLAN.md` is the implementation guide for maintaining the production TikTok package system. Agents should treat it as the current roadmap for scene intent, storyboard assembly, linting, and the paid vs organic split.
**Text overlay note:** The TikTok path now renders explicit overlay cards into the final MP4. Prompt text is still important, but it is no longer the only text layer. If the rendered video reads as clip-only or the overlay cards are missing, repair the render before treating the asset as complete.

---

#### 4.3 Ã¢â‚¬â€ Verify generation results

After each generation step, check the job summary in the response:
- `completionStatus: "complete"` Ã¢â‚¬â€ all assets generated
- `completionStatus: "partial"` Ã¢â‚¬â€ some failed; check `jobSummary.errors`
- Any `errors[]` entries Ã¢â‚¬â€ investigate before proceeding

**Review generated assets in the UI:**
```
http://localhost:3000/tests/media-generation
```

Check each tab systematically:
- **References** Ã¢â‚¬â€ ship reference photos present? Correct ship?
- **Heroes & Concepts** Ã¢â‚¬â€ images reflect the niche (not generic cruise)? Are the hero/concept assets visually distinct from the realistic scene layer?
- **Scenes** Ã¢â‚¬â€ scene images reflect specific locations (pool deck, atrium, dining, etc.)? Do they carry any niche cues?
- **Designed Ads** Ã¢â‚¬â€ ad templates rendered? Multiple placements (1:1, 4:5, 9:16)?
  - Remember this tab includes both final designed ads and their source modules. The actual template coverage lives in `manifest.images.designedAdArtifacts`.
- **Crops, Video, Audio, Merch** Ã¢â‚¬â€ as applicable

When an output feels technically correct but emotionally flat, compare it against [CAMPAIGN_EXAMPLES.md](../../DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/CAMPAIGN_EXAMPLES.md) before you change the whole pipeline. The examples page shows the difference between generic cruise imagery and campaign-specific imagery that carries the niche in-frame.

If scene images look generic (no niche props, just standard cruise locations), the production bible `imagePrompt` fields were empty when generation ran. Fix: re-run the brief, re-approve, then regenerate with `sceneImageMode: "all"`.

**Scene review stop:** After scenes are generated, stop and ask the user to inspect the scene tab before any TikTok/video generation. Scene quality is the main gate for whether video spend is worth it, so do not move on automatically.

---

#### 4.4 Ã¢â‚¬â€ Common failure modes and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `422 AESTHETIC_BRIEF_NOT_READY` on generate | Brief is `revised` or `pending`, not `approved` | `POST /brief/approve` |
| `409` from `/brief/approve` with "blockers" | Brief has structural validation failures | Re-run brief, fix blockers, re-approve |
| `/media/aesthetic/approve` returns red-team error | Wrong endpoint Ã¢â‚¬â€ deprecated | Use `POST /brief/approve` instead |
| Scene images are generic cruise (no niche) | `imagePrompt` was empty in production bible | Re-run brief Ã¢â€ â€™ re-approve Ã¢â€ â€™ regenerate scenes with `"all"` |
| `GET /media/probe` returns 404 | No probe run saved yet Ã¢â‚¬â€ not an error | Run `POST /media/probe` to validate directions, or skip if brief was just regenerated |
| `completionStatus: "partial"` after generation | Some images failed (often API timeout or rate limit) | Re-run same generation with `sceneImageMode: "missing_only"` or `assetTypes` filter |
| Heroes look wrong but stills look correct | Brief was approved before the `imagePrompt` fix; production bible stills are driving the wrong content | Create a directive scoped to `heroes` to patch specific stills |
| Brief reverts to `revised` after a directive apply | `patchBriefForDirective` saves the patched brief back, which resets `humanReviewStatus` | Re-approve with `POST /brief/approve` before the next generation run |

---

#### 4.5 Ã¢â‚¬â€ Landing page

Once heroes, scenes, and designed ads are in the manifest:
```
http://localhost:3000/tests/campaign-landing/[slug]
```
The landing page view model reads directly from the manifest. No separate construction step is needed Ã¢â‚¬â€ if the manifest is populated, the page renders.

### Phase 5: Publish, Distribute, and Go Live

#### 5.1 Ã¢â‚¬â€ Landing Page Publishing

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

#### 5.2 Ã¢â‚¬â€ Ad Distribution (Cold Placement)

Campaign assets are distributed via the distribution planner and dispatch system. Full reference: `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_4_DISTRIBUTION/PHASE_4_DISTRIBUTION.md`

**Step A Ã¢â‚¬â€ Generate a distribution plan (dry run / simulate):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/distribute \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "plan",
    "providerMode": "simulate"
  }'
```

Response includes:
- `plan.posts[]` Ã¢â‚¬â€ scheduled posts with platform, copy, image references, timing
- `plan.audience` Ã¢â‚¬â€ targeting parameters derived from campaign brief
- `plan.budget` Ã¢â‚¬â€ estimated spend (placeholder in simulate mode)

**Step B Ã¢â‚¬â€ Review the plan:**
Check that:
- Posts reference actual `assetId`s from the manifest (not stale or missing assets)
- Copy tone matches campaign `voicePersona` and `toneKeywords`
- Hashtag sets differ per platform (Instagram vs TikTok vs Facebook)
- Image tags match platform requirements (1:1 for Instagram feed, 9:16 for stories, etc.)

**Step C Ã¢â‚¬â€ Dispatch to platforms (live):**
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

**Step D Ã¢â‚¬â€ Mark campaign live:**
```bash
curl -X PATCH http://localhost:3000/api/groups/campaign/[slug] \
  -H "Content-Type: application/json" \
  -d '{"status": "GATHERING_INTEREST"}'
```

#### 5.3 Ã¢â‚¬â€ Final QA Checklist

1. **Landing page renders** at `/groups/[slug]` with hero, gallery, pricing, and waitlist
2. **Book Now routing** works for both Group and Retail paths
3. **Distribution plan** references valid assets and matches campaign tone
4. **Campaign status** updated to `GATHERING_INTEREST`

## 3. Tooling & API Guidance

Always use the shared `lib/agent-api` orchestrator for durable state.

- Brief generation: `npx tsx scripts/enqueue-and-run-brief.ts <slug>` (recommended)
- Alternative: `npm run agent:brief-prototype -- <slug>` (if configured in package.json)
- Never try to skip the Agent API workflow system if a durable job record is required.
- **Do not manually prompt Gemini or Perplexity for ideation**; use the built-in `core-logic.ts` pipeline/API route, which already fetches live web data, normalizes it, and passes exclusion context correctly.
- Standalone scripts (e.g., `tmp/run-media-generation.ts`) that call internal Next.js modules must import `loadEnvConfig` from `@next/env` at the top to access `.env.local` variables: `loadEnvConfig(process.cwd())`.
