# Pipeline Issues & Mitigations

Recurring operational issues in the campaign generation pipeline. Reference this when debugging failures or unexpected behavior.

**Back to [SKILL.md](./SKILL.md)**

---

## 1a. Recurring Pipeline Issues & Mitigations

The following issues have been encountered repeatedly across campaigns. Agents must handle them proactively:

### Dev Server Stability During Heavy Generation
- **Symptom:** Next.js dev server becomes unresponsive or crashes during long-running media generation calls (image/video/audio).
- **Root Cause:** The `POST /api/groups/campaign/[slug]/media/generate` endpoint is synchronous and can take 10Ã¢â‚¬â€œ20+ minutes. The dev server may exhaust resources or hit memory limits during concurrent heavy calls.
- **Mitigation:**
  - Monitor server health before triggering media generation (`GET /api/groups/discovery` as a heartbeat).
  - If the server is unresponsive, restart it manually (the agent cannot manage the dev server).
  - Consider generating one asset type at a time (e.g., `assetTypes: ['hero_image','scene_image']` first) to reduce load.
  - Use the agent job orchestrator (`campaign_media_generate` workflow) for async durability instead of direct HTTP calls when available.

### Revision API Timeout
- **Symptom:** `POST /api/groups/discovery/revise` and `/revise/bulk` hang beyond 120s.
- **Root Cause:** Structured generation with large prompt + JSON schema validation can exceed default API timeouts.
- **Mitigation:**
  - Always call revision via direct script (`npx tsx scripts/test-revise.ts <slug>`) rather than HTTP when possible Ã¢â‚¬â€ scripts have no HTTP timeout.
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
  1. Scrape CB inventory â†’ cache (`scripts/scrape-cb-deals.ts`)
  2. Gemini 3.1 Pro Deep Research â€” psychographic (Step 1)
  3. Gemini 3.1 Pro Deep Research â€” aesthetic analysis with inventory context (Step 2)
  4. GPT blueprint generation with inventory HARD CONSTRAINTS (Step 3)
  5. In-memory inventory match gate â€” discard unmatched (between Step 3 and Step 4)
  6. Red Team review â€” only on matched blueprints (Step 4)
  7. Save to DynamoDB â€” only matched blueprints
  8. Phase B â€” confirm match, validate links, rank backups, generate Odysseus retail link
- **Result:** Pipeline outputs 0â€“5 campaigns. If 0 pass the gate, a descriptive error is thrown suggesting cache refresh or re-spin with relaxed constraints.
- **Phase B is now confirmation + validation:** See `scripts/run-phase-b.ts`. It no longer performs primary matching. It now: (a) ranks top 3 candidates via `rankGroupInventoryCandidates()`, (b) validates each personal link with Playwright before accepting it as primary, (c) auto-promotes Tier 1 backups if primary fails, (d) writes full `inventoryCandidates[]` list with per-candidate health status to the campaign record.

### Inventory Health & Failover
- **Data model:** Campaigns now carry `activeBookingMode`, `inventoryHealth`, `inventoryCandidates[]`, and `inventoryLastCheckedAt` fields written by Phase B.
- **Booking modes:** `GROUP_BLOCK_ACTIVE` (normal) â†’ `GROUP_BACKUP_SWITCHED` (Tier 1 backup promoted) â†’ `RETAIL_MULTI_BOOKING` (group block gone, retail path only) â†’ `INVENTORY_FAILED_PAUSED` (no healthy path, campaign halted).
- **Phase B result statuses:**
  - `CONFIRMED` â€” primary candidate (rank 0) validated HEALTHY, written to DynamoDB.
  - `BACKUP_PROMOTED` â€” rank 0 failed, rank 1 Tier 1 backup was HEALTHY and promoted; `activeBookingMode = GROUP_BACKUP_SWITCHED`.
  - `MATCH_EXPIRED` â€” no candidates scored above threshold; left for operator review.
  - `INVENTORY_FAILED` â€” candidates existed but all failed Playwright validation; campaign marked `INVENTORY_FAILED_PAUSED`.
- **Landing page disclosure:** The `inventoryDisclosure` section on `CampaignLandingViewModel` surfaces the right copy at each mode. Under `GROUP_BLOCK_ACTIVE`, only a calm process note and trust bullet appear. Under `GROUP_BACKUP_SWITCHED` or `RETAIL_MULTI_BOOKING`, a visible amber/red banner is shown above the chat hall. The form always includes an inventory acknowledgement line.
- **Failover transitions (outside Phase B):** Use `updateCampaignInventoryMode(slug, mode, health)` in `lib/campaigns/campaign-store.ts` to manually update booking mode without re-running Phase B. Use `setCampaignInventoryCandidateHealth(slug, rank, result)` to update individual candidate health from a heartbeat check.
- **Validator:** `lib/campaigns/booking-link-validator.ts` â€” `validateBookingLink(url)` opens the URL in a headless Playwright browser and returns HEALTHY / DEGRADED / FAILED. Called by Phase B and available for future heartbeat scripts.
- **Policy constants** (in `lib/campaigns/cb-inventory-matcher.ts`): `MAX_AUTO_PRICE_DELTA_PERCENT = 10`, `MAX_AUTO_DATE_DELTA_DAYS = 0`, `REQUIRE_SAME_SHIP_FOR_AUTO_SWITCH = true`. Only Tier 1 backups (same ship, same date, same port, price within 10%) are eligible for automatic Phase B promotion. Tier 2+ candidates are stored but require operator review before promotion.

### Two-Stage Discovery Pipeline (Research â†’ Generate)
- **Why this exists:** The original `runGroupDiscoveryPipeline()` was monolithic â€” Gemini Deep Research and GPT-5 blueprint generation ran together. To iteratively grow the slate without re-paying for Gemini, the pipeline now splits into two callable stages.
- **Stage 1 â€” Research** (`POST /api/groups/discovery/research`): Calls Gemini Deep Research Steps 1+2 only. Persists to `.github/data/discovery-research-cache.json` keyed by date. Body: `{ force?: boolean, respin?: boolean }`. Force=true bypasses same-day cache.
- **Stage 2 â€” Generate** (`POST /api/groups/discovery/generate`): Calls GPT-5 Step 3 against the cached research, runs the inventory match gate, and saves new blueprints to DynamoDB. Body: `{ respin?: boolean }`. Idempotent on slug â€” duplicate ids are skipped, never overwritten. Returns 412 if no research is cached yet.
- **Cache status** (`GET /api/groups/discovery/research`): Returns whether the cache is populated and which stage has run. Use this to decide whether Stage 2 can run alone.
- **Code entry points:** `runDiscoveryResearch()`, `generateDiscoveryBlueprints()`, `getDiscoveryResearchCacheStatus()` exported from `app/api/groups/discovery/core-logic.ts`. The legacy `runGroupDiscoveryPipeline()` still exists and is now a thin wrapper that calls both stages.
- **Re-Spin clarification:** The legacy `GET /api/groups/discovery?respin=true` and the UI's "Re-Spin" button add NEW campaigns to the slate. They do not replace, overwrite, or delete existing campaigns. Existing campaigns are passed in as deduplication context. Re-Spin always bypasses the Gemini cache; for cheaper iteration, prefer Stage 2 alone.
- **Iterative pattern:** When you want more campaigns but don't want to re-pay for Gemini: (1) check cache status, (2) call Stage 2 directly. The new "Generate from Research" button in the UI does this.

### Manual Retirement & Discovery UI Filters
- **Manual retirement** (`POST /api/groups/discovery/retire/[slug]` with optional `{ reason }` body): Marks a campaign retired without going through the stagnation review loop. Sets `discoveryIteration.retiredAt`, `discoveryIteration.retirementReason`, and `recommendedNextAction = 'retire'`.
- **Reverse retirement** (`DELETE /api/groups/discovery/retire/[slug]`): Clears `retiredAt` and resets `recommendedNextAction = 'hold'`.
- **Why retire instead of delete:** Retired campaigns stay in DynamoDB and continue to feed the deduplication exclusion list during new research runs. Use `DELETE` (Clear All) only when you genuinely want to reset state and re-mine the same niche space. Use Retire for "we're not pursuing this wave" or "past launch window."
- **Default UI filtering:** The discovery test page hides retired campaigns by default. Toggle "Show retired" to see them. Retired count is shown in the filter bar so the operator knows how many are hidden.
- **Available filters:** Newest 5 vs All; Pricing (CB Matched / AI Estimate / Unmatched); Launch window (Healthy 210+ days / Tight 180â€“210 / Past minimum <180 days); Show retired.
- **Helper functions:** `applyManualDiscoveryRetirement(campaign, reason)` and `clearDiscoveryRetirement(campaign)` exported from `lib/campaigns/discovery-iteration.ts`. Use these directly in scripts when batch-retiring campaigns.

### Red Team Verdict Handling
- **PASS:** Proceed to Phase 2.
- **WARN (Ã¢â€°Â¤4 fixes):** Safe to auto-revise. Use `POST /api/groups/discovery/revise` or direct script.
- **BLOCK (>4 fixes or structural issues):** STOP. Do not auto-revise. Present the campaign to the user and ask whether to retire it or manually redesign.
- **Stagnation:** If a campaign has been revised 3+ times and still carries warnings, consider retiring it regardless of fix count.

### Campaign Identity Blueprint & Alignment (Phase 3 upstream)
- **Purpose:** Prevent emotional drift between campaign copy and campaign imagery. The `CampaignIdentityBlueprint` layer (`lib/campaigns/design-system/identity-blueprint.ts`) sits between discovery and aesthetic execution to enforce campaign-specific energy modes, prop families, light behavior, and forbidden defaults.
- **Energy mode inference:** Deterministically inferred from campaign text corpus via regex patterns. Modes include `calm_contemplative`, `warm_social`, `nostalgic_kinetic`, `after_hours_electric`, `refined_premium`, `subcultural_intimate`, `playful_collective`.
- **Prop families & forbidden defaults:** Each mode carries specific allowed props (e.g., guitar pick, leather jacket for nostalgic_kinetic) and anti-defaults (e.g., "spa retreat", "breakfast balcony serenity" for after_hours_electric).
- **Alignment validator (`alignment-validator.ts`):** Detects mismatches between campaign energy mode and actual brief output (e.g., energetic slogan + serene image language). Flags `warning` or `blocker` severity.
- **Integration:** The blueprint is auto-generated during brief engine orchestration and stored on the campaign aesthetic brief under `identityBlueprint`. It feeds downstream into documentary prompt building (`documentary-prompts.ts`), niche token extraction (`niche-tokens.ts`), and ad format routing.
- **Agent guidance:** When reviewing a campaign, always check that the `identityBlueprint.energyMode` matches the actual media outputs. If the brief says `playful_collective` but the images drift toward "quiet premium lounge," this is an alignment drift that should be flagged.

### Campaign Repair Playbook
- For the recovery loop that got `board-games-at-sea` back on track, see [CAMPAIGN_REPAIR_PLAYBOOK.md](../../DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/CAMPAIGN_REPAIR_PLAYBOOK.md).
- Use that doc when an asset family is close but still generic: inspect the source-of-truth artifact, repair one layer, regenerate only the affected family, then stop for review.
- The playbook also covers the scene-review checkpoint, the landing-still / ad distinction, and the cleanup rule for stale manifest passes after reruns.
- For concrete good/bad output examples, see [CAMPAIGN_EXAMPLES.md](../../DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/CAMPAIGN_EXAMPLES.md). Agents should compare current output against those examples before deciding whether to widen scope or repair upstream prompts.

### Anchor Compliance Tolerance (Phase 3)
- **Symptom:** Brief generation fails with "Anchor compliance unresolved".
- **Rules:**
  - `missing_anchor_binding` (structural): **Hard fail** Ã¢â‚¬â€ brief generation aborts.
  - `niche_signal_dropped` / `niche_carry_mismatch` / `duplicate_location_family` (content): **Tolerated up to 4 violations** Ã¢â‚¬â€ brief generation continues, but downstream production lint will flag them.
  - If structural violations exist OR content violations exceed 4, the brief is rejected.
- **Mitigation:** Ensure the campaign's `targetingKeywords` are specific and embedded in both `imagePrompt` and `subjectAction` for every landing still. If a campaign already exists in DynamoDB with weak signals, patch the anchor fields (`allowedThemeSignals`, `cruiseNativeMoments`, `optionalGatheringMoments`, `targetingKeywords`) directly via `campaign-store.ts` rather than re-running the expensive discovery pipeline.

### Media Style Dualism ("Sketch = Feeling, Photo = Fact")
- **Symptom:** AI-generated realistic images of people produce uncanny results (plastic skin, inconsistent hands, weird facial features) that undermine trust. Fully illustrated images of ships and cabins feel fake and reduce confidence in the actual product.
- **Rule:** Campaign media must use **two distinct styles** depending on content, never a single uniform style:
  - **SKETCHED / Illustrated** Ã¢â‚¬â€ Reserved for people-forward emotional assets when the renderer would otherwise risk uncanny guests. Common examples: aesthetic concept frames, merch designs, and hero/concept directions whose active style resolver selects `sketched`. Purpose: emotional hook, aspiration, first impression. The style is a lush watercolor-and-ink travel illustration with expressive linework, idealized figures, and saturated color washes.
  - **REALISTIC / Photographic** Ã¢â‚¬â€ Used for trust assets and ship-forward/source-frame assets. Common examples: ship references, documentary detail modules, scene images for storyboard/video, reference-grounded ship transforms, and probes. Purpose: trust, accuracy, "finish the sell." The style is documentary-grade cruise photography with sharp detail, natural marine lighting, and believable materials.
- **Scene-image rule:** Scene images are realistic-only. The watercolor/sketched branch was an experiment for earlier assets and should not be used for scene generation. If a scene asset looks sketched, the scene pipeline needs repair, not acceptance.
- **Designed ad exception (Phase 2.3):** Designed social/static ads are no longer treated as full AI-rendered scenes. They are code-rendered ad artifacts with model-generated documentary detail modules as image ingredients. Do not expect designed ad artifacts to match hero/concept watercolor composition; compare them against their active visual system and final ad layout.
- **Designed Ads tab semantics:** The review UI's `Designed Ads` tab intentionally includes both `manifest.images.designedAdArtifacts` (final template-rendered ads) and `manifest.images.documentaryDetails` (ingredient/source modules). If the tab looks "mostly full images," first compare the counts of final ad artifacts vs documentary modules before assuming the template renderer failed.
- **Pipeline enforcement:** `stability-generator.ts` and `style-prompts.ts` apply the centralized style prompt strings. Older paths branch on `sceneHasVisiblePeople()` / still people detection; newer paths may also use `identityBlueprint.visualFlavor` for hero/reference/concept decisions. When diagnosing style mismatch, inspect the actual `promptUsed` and style resolver inputs instead of assuming the output should be watercolor.
- **Narrative arc:** Ads and hero banners show the FEELING (illustrated people living the vibe) Ã¢â€ â€™ landing page details show the REALITY (actual ship, actual cabin, actual deck). The sketch invites imagination; the photo closes the deal.
- **Model assignment:** Nano-Banana (Gemini) handles both styles via prompt control. Do not split providers unless Nano-Banana produces soft ship renders Ã¢â‚¬â€ in that case, fall back to `gpt-image-2` or `dall-e-3` for the realistic branch only.
- **Vintage filter rotation (REALISTIC only):** Each realistic image should carry a distinct stylized film grade Ã¢â‚¬â€ Kodachrome 70s warmth, late-80s Ektachrome saturation, expired Polaroid shift, or cross-processed slide. This adds character and variety without breaking realism. The filter must look like a physical film stock or lens artifact, not a digital overlay.
- **Theme object anchoring (REALISTIC only):** Since people are absent, the niche/theme must remain faintly legible through subtle environmental props Ã¢â‚¬â€ e.g. a guitar on a deck lounger (music cruise), a well-worn notebook on a teak table (writing cruise), dice and a leather case on a bar rail (gaming cruise), vintage binoculars on a rail (birding cruise). The object should feel naturally placed, not staged or central Ã¢â‚¬â€ just enough to whisper the theme. Ship/sea/deck architecture remains dominant.
- **Scene image theme preservation:** Even within REALISTIC scene images, the campaign's niche identity stays present through lighting/color temperature aligned with the campaign palette, and composition choices that hint at the community (a circle of chairs, a journal left open, a vinyl record on a bar rail).
- **Video mixing strategy:** Promotional videos may still mix styles, but the scene layer feeding them is always realistic:
  - **Scene source frames** (from `generateSceneImages`) are **REALISTIC** Ã¢â‚¬â€ ship-forward, architecture-forward, environment-led motion. These are the trust anchor.
  - **Backdrop / hero inserts** (from `generateHeroImages` or `generateAestheticConcepts`) may remain **SKETCHED** when the campaign wants illustrated emotional energy.
  - Use text overlays, image-first motion, and subtle object movement to make the scenes carry the promotional load before escalating to full animation.
  - The `buildStoryboardShotPrompt` function should tag each shot with its intended style so the video assembler pulls from the correct source pool.

- **TikTok template system:** Treat TikTok as a reusable full-frame ad package, not a phone-within-a-phone preview or a motion-first clip reel. The source still should stay full size and visible inside the vertical frame, with text bands and CTA scaffolding built around it. The current production path already uses this template architecture. For the shared template architecture, see [TIKTOK_TEMPLATE_SYSTEM.md](../../DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_2_MEDIA_GENERATION/TIKTOK_VIDEO_PRODUCTION/TIKTOK_TEMPLATE_SYSTEM.md).
- **Editorial frame rule:** The frame should feel like a commercial layout, not a dashboard widget. Prefer wide bands, stronger hierarchy, and a styled backdrop behind the centered still so the empty frame space reads as part of the ad.
- **Sequence planner rule:** The three template presets are the visual grammar, not the finished ad. Reuse them across a 6-8 beat sequence so the flow carries hook, social proof, payoff, and CTA instead of repeating one slide.
- **Late-stage TikTok synthesis rule:** Do not assume the final TikTok beat language should come only from early brief-era slogans. The current TikTok production path includes a late-stage promotion synthesis pass that distills the strongest phrases from scenes, storyboards, designed ads, downstream copy, and audio-aware campaign language into a TikTok-specific beat package. Use and maintain that layer instead of treating it as hypothetical future work.
- **No-fallback TikTok copy rule:** Production TikTok generation should render from that synthesized beat package only. Do not let the renderer quietly drop back to `heroSlogan`, `subSlogan`, or other early brief-era phrases. If the package is missing or unusable, the TikTok render should fail so the copy issue gets fixed at the source.
- **Narration rule:** Each beat may carry a short `spokenText` line for ElevenLabs, but the current package workflow can also collapse those lines into one continuous voiceover for the full sequence. Keep the spoken line short, readable, and aligned to the on-screen copy.
- **Audio mix rule:** The final TikTok MP4 should keep narration audible over the package and mix the music bed underneath it. Do not let music drown out speech, but do not overcomplicate the template with beat-level audio choreography unless the render specifically needs it.
- **TikTok paid lead-gen rule:** The paid TikTok path now creates a real lead form, uploads the generated video asset to `POST /open_api/v1.3/file/video/ad/upload/`, and then creates a paused ad that references the returned native `video_id`. Do not pass the internal `assetId` directly to TikTok. Resolve `post.assetId` to a real `AssetRecord`, confirm `mimeType` starts with `video/`, and only then dispatch the Marketing API calls.
- **TikTok paid account rule:** Live paid TikTok dispatch now depends on a funded advertiser account. If campaign creation returns `Complete payment to continue`, the blocker is account setup, not the code path. If you already have a reusable TikTok lead form, provide it via `TIKTOK_LEAD_FORM_ID`; otherwise the paid flow omits `lead_form_id` and will still fail until the advertiser account is payment-ready.
- **TikTok paid smoke test:** When validating the paid path locally, run `npx tsx lib/campaigns/distribution/platforms/__tests__/tiktok-paid.test.ts`. That test exercises lead-form creation, asset resolution, video upload, native ad creation, and the non-video rejection guard without calling TikTok.

### Probe Loop Scope (Do Not Confuse With Scene Images)
- **What probes currently simulate:** Probes are cheap image renders from `brief.landingStillBible.stillLibrary` only. They validate planned still directions for hero/concept/social still expansion: niche signal, slot role, composition, and generic-cruise fallback risk.
- **What probes do NOT currently simulate:** They are not generated from `brief.productionBible.sceneLibrary`, do not validate storyboard/video scene frames, do not validate documentary detail modules, and do not validate designed ad artifacts.
- **Why all probes may be watercolor:** The current probe path passes each landing still through the same style heuristics used for still prompts. If every landing still includes visible guests, the probes can all resolve to the sketched/watercolor branch even when scene images are expected to be realistic.
- **404 behavior:** `GET /api/groups/campaign/[slug]/media/probe` returns 404 when no probe run has been saved yet. This is expected before the first `POST /api/groups/campaign/[slug]/media/probe`; it is not itself a generation failure.
- **Generation gate reality:** The media orchestrator has an optional `probeGate` (`ignore`, `warn_only`, `require_approved`), but the public `/media/generate` route currently does not expose or force it. If a caller opts into `require_approved`, the gate applies to all spend-gated image types (`hero_image`, `aesthetic_concept`, `scene_image`) even though the probes only validate landing still directions. Treat that as a broad pre-spend quality gate, not proof that scene prompts are correct.
- **When scene images look wrong:** Inspect the Production Bible scene library and `scene_image` `promptUsed` records directly. If the scene library is missing/empty, regenerate the aesthetic brief/production bible before spending on scene images. If the scene library exists but scene images drift, use a directive scoped to scenes or update the production-bible scene prompts; rerunning landing still probes alone will not fix scene-frame prompts.
- **Warning escalation rule:** `scene_niche_cue_missing` and `scene_human_presence_weak` are allowed to auto-run once through a repair pass, but if they persist after that pass the agent must stop and ask the user for an explicit decision before any more scene-image or video spend. Treat persistent scene warnings as `needs_user_decision`, not as background noise.
- **Campaign-flow rule:** When any phase yields a persistent warning after one repair pass, stop at the phase boundary, summarize the gap, and request a user decision. Do not let the agent drift into the next phase to "see if it gets better there." The point is to fix the right layer or escalate, not to bury the mismatch downstream.
- **Recommended next implementation fix:** Add a dedicated scene-probe loop that renders one cheap probe per `productionBible.sceneLibrary` scene and gates `scene_image` generation against that result. Keep landing-still probes for hero/concept stills.

