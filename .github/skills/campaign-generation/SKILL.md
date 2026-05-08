**Name: Campaign Generation Orchestrator**

**Description:** Orchestrates the end-to-end creation of a Leisure Life Interactive shadow group campaign. Use this skill to guide agents through discovery, inventory matching, aesthetic briefing, and final media generation while enforcing hard quality constraints and allowing user intervention.

## 0. Shared Process Memory

Agents using this skill must treat ad hoc user-driven workflow changes as important process evidence, not just one-off conversation details.

- **Read first:** Before substantial campaign work, review [CAMPAIGN_PROCESS_MEMORY.md](./CAMPAIGN_PROCESS_MEMORY.md) for prior adjustments, recurring friction points, and temporary operating rules.
- **Append after meaningful changes:** If the user asks for an ad hoc process change, exception, workaround, new guardrail, or manual override that changes how the campaign pipeline is being operated, document it in [CAMPAIGN_PROCESS_MEMORY.md](./CAMPAIGN_PROCESS_MEMORY.md) before ending the task.
- **What belongs there:** Workflow deviations, recurring blockers, manual operator steps, routing changes, messaging adjustments, inventory/booking exceptions, review heuristics, and any temporary policy that future agents should know about.
- **Why this exists:** This file is the shared memory layer for the campaign-development process across agents. It is meant to accumulate real-world implementation friction so the system can later be refactored with evidence instead of relying on memory or scattered thread history.
- **How to write entries:** Add a dated note with a short title, the trigger or user request, the change that was made, and the broader lesson or refactor implication.

## 1. Core Philosophy & Pitfalls to Avoid

Based on V2 Campaign Strategy and previous iterations, agents using this skill MUST adhere to the following:

- **Vacation First:** The group is an icebreaker, not a curriculum. Avoid mandatory classes, tight schedules, or high-pressure social mechanics.
- **Ship/Inventory Grounding:** Campaigns must match real inventory limits. Do not invent impossible ship amenities or assume retail block structures.
- **Finite Iteration:** Do not loop endlessly in discovery. If a concept requires more than 3 revisions to pass the Red Team, retire it.
- **Honest Readiness:** Do not mark a campaign as "Ready" if it still carries required fixes.
- **Deduplication:** Gemini Deep Research MUST exclude already generated campaigns (the backend pipeline handles this by natively injecting the DynamoDB state into the prompt).
- **Agentic Glue:** Treat the campaign builder as a control loop, not a one-shot generator. The agent should notice gaps, make one targeted repair pass, re-check the result, and escalate persistent uncertainty to the user instead of silently pushing forward.

## 1a. Recurring Pipeline Issues & Mitigations

The following issues have been encountered repeatedly across campaigns. Agents must handle them proactively:

### Dev Server Stability During Heavy Generation
- **Symptom:** Next.js dev server becomes unresponsive or crashes during long-running media generation calls (image/video/audio).
- **Root Cause:** The `POST /api/groups/campaign/[slug]/media/generate` endpoint is synchronous and can take 10â€“20+ minutes. The dev server may exhaust resources or hit memory limits during concurrent heavy calls.
- **Mitigation:**
  - Monitor server health before triggering media generation (`GET /api/groups/discovery` as a heartbeat).
  - If the server is unresponsive, restart it manually (the agent cannot manage the dev server).
  - Consider generating one asset type at a time (e.g., `assetTypes: ['hero_image','scene_image']` first) to reduce load.
  - Use the agent job orchestrator (`campaign_media_generate` workflow) for async durability instead of direct HTTP calls when available.

### Revision API Timeout
- **Symptom:** `POST /api/groups/discovery/revise` and `/revise/bulk` hang beyond 120s.
- **Root Cause:** Structured generation with large prompt + JSON schema validation can exceed default API timeouts.
- **Mitigation:**
  - Always call revision via direct script (`npx tsx scripts/test-revise.ts <slug>`) rather than HTTP when possible â€” scripts have no HTTP timeout.
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
  8. Phase B â€” confirm match against live inventory + generate Odysseus retail link
- **Result:** Pipeline outputs 0â€“5 campaigns. If 0 pass the gate, a descriptive error is thrown suggesting cache refresh or re-spin with relaxed constraints.
- **Phase B is now confirmation-only:** See `scripts/run-phase-b.ts`. It no longer performs primary matching.

### Red Team Verdict Handling
- **PASS:** Proceed to Phase 2.
- **WARN (â‰¤4 fixes):** Safe to auto-revise. Use `POST /api/groups/discovery/revise` or direct script.
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
  - `missing_anchor_binding` (structural): **Hard fail** â€” brief generation aborts.
  - `niche_signal_dropped` / `niche_carry_mismatch` / `duplicate_location_family` (content): **Tolerated up to 4 violations** â€” brief generation continues, but downstream production lint will flag them.
  - If structural violations exist OR content violations exceed 4, the brief is rejected.
- **Mitigation:** Ensure the campaign's `targetingKeywords` are specific and embedded in both `imagePrompt` and `subjectAction` for every landing still. If a campaign already exists in DynamoDB with weak signals, patch the anchor fields (`allowedThemeSignals`, `cruiseNativeMoments`, `optionalGatheringMoments`, `targetingKeywords`) directly via `campaign-store.ts` rather than re-running the expensive discovery pipeline.

### Media Style Dualism ("Sketch = Feeling, Photo = Fact")
- **Symptom:** AI-generated realistic images of people produce uncanny results (plastic skin, inconsistent hands, weird facial features) that undermine trust. Fully illustrated images of ships and cabins feel fake and reduce confidence in the actual product.
- **Rule:** Campaign media must use **two distinct styles** depending on content, never a single uniform style:
  - **SKETCHED / Illustrated** â€” Reserved for people-forward emotional assets when the renderer would otherwise risk uncanny guests. Common examples: aesthetic concept frames, merch designs, and hero/concept directions whose active style resolver selects `sketched`. Purpose: emotional hook, aspiration, first impression. The style is a lush watercolor-and-ink travel illustration with expressive linework, idealized figures, and saturated color washes.
  - **REALISTIC / Photographic** â€” Used for trust assets and ship-forward/source-frame assets. Common examples: ship references, documentary detail modules, scene images for storyboard/video, reference-grounded ship transforms, and probes. Purpose: trust, accuracy, "finish the sell." The style is documentary-grade cruise photography with sharp detail, natural marine lighting, and believable materials.
- **Scene-image rule:** Scene images are realistic-only. The watercolor/sketched branch was an experiment for earlier assets and should not be used for scene generation. If a scene asset looks sketched, the scene pipeline needs repair, not acceptance.
- **Designed ad exception (Phase 2.3):** Designed social/static ads are no longer treated as full AI-rendered scenes. They are code-rendered ad artifacts with model-generated documentary detail modules as image ingredients. Do not expect designed ad artifacts to match hero/concept watercolor composition; compare them against their active visual system and final ad layout.
- **Designed Ads tab semantics:** The review UI's `Designed Ads` tab intentionally includes both `manifest.images.designedAdArtifacts` (final template-rendered ads) and `manifest.images.documentaryDetails` (ingredient/source modules). If the tab looks "mostly full images," first compare the counts of final ad artifacts vs documentary modules before assuming the template renderer failed.
- **Pipeline enforcement:** `stability-generator.ts` and `style-prompts.ts` apply the centralized style prompt strings. Older paths branch on `sceneHasVisiblePeople()` / still people detection; newer paths may also use `identityBlueprint.visualFlavor` for hero/reference/concept decisions. When diagnosing style mismatch, inspect the actual `promptUsed` and style resolver inputs instead of assuming the output should be watercolor.
- **Narrative arc:** Ads and hero banners show the FEELING (illustrated people living the vibe) â†’ landing page details show the REALITY (actual ship, actual cabin, actual deck). The sketch invites imagination; the photo closes the deal.
- **Model assignment:** Nano-Banana (Gemini) handles both styles via prompt control. Do not split providers unless Nano-Banana produces soft ship renders â€” in that case, fall back to `gpt-image-2` or `dall-e-3` for the realistic branch only.
- **Vintage filter rotation (REALISTIC only):** Each realistic image should carry a distinct stylized film grade â€” Kodachrome 70s warmth, late-80s Ektachrome saturation, expired Polaroid shift, or cross-processed slide. This adds character and variety without breaking realism. The filter must look like a physical film stock or lens artifact, not a digital overlay.
- **Theme object anchoring (REALISTIC only):** Since people are absent, the niche/theme must remain faintly legible through subtle environmental props â€” e.g. a guitar on a deck lounger (music cruise), a well-worn notebook on a teak table (writing cruise), dice and a leather case on a bar rail (gaming cruise), vintage binoculars on a rail (birding cruise). The object should feel naturally placed, not staged or central â€” just enough to whisper the theme. Ship/sea/deck architecture remains dominant.
- **Scene image theme preservation:** Even within REALISTIC scene images, the campaign's niche identity stays present through lighting/color temperature aligned with the campaign palette, and composition choices that hint at the community (a circle of chairs, a journal left open, a vinyl record on a bar rail).
- **Video mixing strategy:** Promotional videos may still mix styles, but the scene layer feeding them is always realistic:
  - **Scene source frames** (from `generateSceneImages`) are **REALISTIC** â€” ship-forward, architecture-forward, environment-led motion. These are the trust anchor.
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

## 1b. Campaign Directive System (Surgical Changes)

**Purpose:** The directive system lets an agent (or human) express editorial intent in natural language, resolve it to concrete field overrides, mark only the affected assets stale, and regenerate only those assets — without re-running the full ~100s brief pipeline.

**When to use it:**
- A specific scene image needs a prop or lighting change (e.g. "Change scene_003 to show a vinyl record on the bar rail instead of dice").
- A hero still needs a composition tweak (e.g. "Hero 2 should show the game box spine on the café shelf, not generic dice").
- Prop families or allowed/discouraged props need updating across heroes, concepts, and documentary details.
- Any case where `"sceneImageMode": "all"` would regenerate the entire pool just to fix one or two images.

**When NOT to use it:**
- The production bible itself is missing or has empty `imagePrompt` fields — fix upstream via brief re-generation first.
- The campaign needs a full aesthetic pivot (energy mode, color palette, slogan) — re-run the brief engine instead.

### Two-Step API Flow

**Step 1 — Create the directive (resolves text → concrete patch, marks assets stale):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/directives \
  -H "Content-Type: application/json" \
  -d '{ "text": "Make scene_003 show a vinyl record on the bar rail, keep sunset deck lighting" }'
```
Response includes `directive.id`, `affectedCount`, and inferred `scope`.

**Step 2 — Apply the directive (regenerates only stale assets):**
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

| ❌ Too vague | ✅ Specific and renderable |
|---|---|
| "More board game energy" | "A half-finished Azul tile game on a teak café table with coffee cups, morning sea light" |
| "Less spa-like" | "Remove robes, candles, and towel arrangements. Replace with casual indie wardrobe — denim, vintage tees, canvas bags" |
| "Better lighting" | "Shift all hero stills to morning golden light through port-side lounge windows, not sunset or twilight" |
| "Show the niche more" | "Add a Catan box spine visible on a café shelf in the background of the lounge still" |

### Agent Discipline with Directives

- **Prefer a directive over `"sceneImageMode":"all"`** when the change is targeted. Burning the full scene pool wastes credits and time.
- **Verify the patch scope** in the create response. If you asked for a scene change but `scope` does not include `scenes`, the resolution agent misunderstood — inspect the `patch` and either rephrase the directive or apply it manually via `PATCH /api/groups/campaign/[slug]/brief`.
- **Poll the manifest after apply** the same way you poll after video generation. The apply route returns immediately with a jobId; generation runs in the background.
- **One repair pass rule still applies:** If a directive apply does not fix the issue (e.g. scene still lacks niche signal after regeneration), stop and escalate to the user. Do not chain multiple directives silently.

### When Directives Fail — Manual Scene Patch Fallback

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

## 2. End-to-End Workflow

The agent must follow these steps linearly. At the end of each major phase, the agent should pause and provide the local testing URL to the user so they can review the work visually. Ask the user if they wish to intervene, modify, or approve the transition to the next phase.

### Phase 1: Discovery & Blueprint

1. **CB Inventory Pre-scrape:** Ensure `cb-deals-cache.json` is fresh (<24h old). If stale, prompt the user to run `npx tsx scripts/scrape-cb-deals.ts` before proceeding â€” the discovery pipeline will warn if the cache is stale.
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
   - If `blockerCount > 0` or structural anchor violations exist, generation aborts. If `warningCount > 0` (â‰¤4 tolerated content violations), it continues but flags downstream.
3. **Verify the production bible before proceeding â€” this is mandatory.**
   Check `brief.productionBible.sceneLibrary` in the readiness response. Every scene object must have a non-empty `imagePrompt` field. If all `imagePrompt` fields are empty strings, the production bible generation failed silently and scene images will be generic. Re-run the brief bundle before proceeding to media generation.
   - If the scene library exists but still carries `scene_niche_cue_missing` or `scene_human_presence_weak` after one repair pass, stop and escalate to the user before any image spend. Do not treat that as a soft warning during an agentic campaign flow.
   - The same rule applies to any persistent warning in later phases: one auto-repair pass, then stop and ask for a decision. The agent is the glue between phases, not a substitute for the final call.
4. **User Intervention Checkpoint:**
   - Direct the user to view the aesthetic brief and production bible at `http://localhost:3000/tests/brief-studio`.
   - Ask the user to approve the aesthetic brief before generating heavy media assets.
   - **Agent must explicitly tell user to open their browser and navigate to this URL to review the brief visually before proceeding to media generation.**

### Phase 4: Media & Landing Asset Production

Phase 4 has **three mandatory sequential sub-steps** that cannot be skipped or reordered. Each failed sub-step blocks everything that follows it.

---

#### 4.0 â€” Verify the Production Bible before spending on generation

Before generating any images, confirm that the production bible was generated with proper `imagePrompt` fields. A production bible with empty `imagePrompt` fields produces generic cruise scenes with no niche content â€” this is a generation failure, not a quality issue.

```bash
curl -s http://localhost:3000/api/groups/campaign/[slug]/brief/readiness \
  | python -m json.tool 2>/dev/null
```

Check the response for `brief.productionBible.sceneLibrary`. Every scene must have a non-empty `imagePrompt`. If `imagePrompt` fields are empty strings, **do not proceed to generation** â€” re-run the brief bundle first:

```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/brief
```

Wait for the async brief job to complete (poll `GET /api/groups/campaign/[slug]/brief?jobId=<id>`), then re-check readiness before continuing.

Also verify `brief.landingStillBible.stillLibrary` exists and has at least 4â€“6 stills with non-empty `imagePrompt` fields. If the still library is missing or empty, the brief bundle did not complete correctly.

---

#### 4.1 â€” Approve the brief for media generation

The brief must be in `approved` status before any image generation can run. A brief in `revised` or `pending` status will cause the generate endpoint to return 422.

**Use ONLY this endpoint:**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/brief/approve
```

**NEVER use** `POST /api/groups/campaign/[slug]/media/aesthetic/approve` â€” that is a deprecated route that requires a legacy `redTeamReview` field which the current brief engine does not populate, so it will always fail.

**Success response:** `{ "readiness": "ready_for_media", ... }`
**Failure response 409:** The brief has structural blockers â€” re-run the brief and fix blockers before approving.

If the brief was recently regenerated (`humanReviewStatus: 'revised'`), you must approve it again. Regeneration always resets status to `revised`.

---

#### 4.2 â€” Generate media assets

Once the brief is approved, trigger generation. Always generate **one asset type group at a time** to avoid dev server memory exhaustion.

**Recommended generation order â€” with approval gates:**

Each step below has an implicit **approval gate**: after the step completes, check the manifest for errors and review assets at `http://localhost:3000/tests/media-generation` before proceeding. Do not batch all asset types into one call.

**Step A â€” Ship references (required before heroes and scenes):
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["ship_reference_image"]}'
```
Ship references are SerpAPI photos of the actual vessel. They are used as grounding references for hero and scene generation. Without them, heroes generate without ship context and scenes may fail entirely.

**Step B â€” Hero images + aesthetic concepts:**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["hero_image","aesthetic_concept"]}'
```
These use the ship references as grounding. Run after Step A.

**Step C â€” Scene images (uses production bible imagePrompts):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["scene_image"],"sceneImageMode":"missing_only"}'
```
`sceneImageMode: "missing_only"` skips scenes that already have an image in the manifest. Use `"all"` to regenerate everything (e.g. after a full brief re-run).

**Surgical scene changes:** If only one or a few scenes need revision, use a **Campaign Directive** (see §1b) instead of `"all"`. Create a directive targeting the specific `sceneId`, apply it, and only the affected scenes regenerate. This is cheaper, faster, and preserves existing assets that are already correct.

**Important scope note:** A request to run "through scene images" stops here. It includes Step A (ship references), Step B (heroes + concepts), and Step C (scene images), but it does **not** include documentary detail modules or designed ads. Those belong to Step D and must be requested or executed explicitly if the goal is a full image pack.

**Scene warning gate:** If the scene layer still produces `scene_niche_cue_missing` or `scene_human_presence_weak` after the first repair pass, stop the flow and present the user with a decision checkpoint. The agent may repair once automatically, but it may not silently continue through video generation while those warnings persist.

**Agentic recovery pattern:** For any campaign layer that looks "almost right" but not quite:
1. Inspect the actual source-of-truth artifact that feeds the next step.
2. Repair that artifact once, in the narrowest possible scope.
3. Re-run the downstream check.
4. If the same mismatch survives, stop and escalate to the user with a concrete choice.

**Step D â€” Documentary details + designed ads (together):**
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

**Step E â€” Audio, video, merch (optional, heavy):**

**Prerequisites before running video generation:**
1. **Scene images must exist** â€” Video generation requires `scene_image` assets from Step C. Storyboard videos pull source frames from `manifest.images.sceneImages`. If scene images are missing, video generation will fail silently or produce empty results.
2. **Production Bible must have non-empty `imagePrompt` fields** â€” Verify with `GET /api/groups/campaign/[slug]/brief/readiness`. Empty `imagePrompt`s = generic video frames.
3. **Brief must be approved** â€” Same gate as Step 4.1.

**TikTok promo video rule:**
1. Use the storyboard-driven `tiktok_seed_video` path for the actual promotional video. A saved Production Bible is required because the video must use the generated scene images and storyboard copy.
2. Keep `tiktok` organic delivery and `tiktok_paid` lead-gen delivery separate. They are different distribution contracts, not one shared publish flow.
3. Build the video as a package-first TikTok render: still scenes, overlay cards, hard cuts, and generated copy from the manifest. Motion inside the source image is optional, not the core creative dependency.
4. If the video feels generic, inspect the Production Bible scene library and the storyboard prompts before touching the composer.
5. If the TikTok render still looks like stitched clips instead of a packaged ad, repair the package layer first before asking for more motion or more source-image generation.
6. The final TikTok export should be the ad itself: a full-frame 9:16 package with the still image preserved, text overlays integrated into the video, and only light motion if it helps the composition.

**Audio generation (light, safe to run first):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/generate \
  -H "Content-Type: application/json" \
  -d '{"assetTypes":["ambient_narration","hype_clip","theme_music"],"themeMusicSource":"default"}'
```

**Video generation (expensive, slow â€” run individually):**

**CRITICAL: Generation overlap burns credits. Follow these rules exactly.**

1. **One deliverable per HTTP call** â€” never batch multiple video assetTypes in one request.
2. **Never re-submit the same deliverable** while the prior submission is still processing. The API returns 409 if `isGenerating()` is true for that slug.
3. **HTTP 120s timeout is NOT a failure** â€” the server continues generating after the connection drops. Re-submitting queues a **second** set of clips and doubles costs.
4. **After timeout: poll the manifest, never re-submit.** Use `GET /api/groups/campaign/[slug]/media/manifest` and inspect `videos.tiktokSeed`, `videos.heroExplainer`, etc. If null/empty, wait 60s and poll again. Only if the manifest has been stable (no new assets) for >5 minutes should you consider re-submitting once.
5. **Never run two video scripts or API calls in parallel** for the same campaign slug. Sequential only.
6. **Use the API route for video generation, not standalone scripts.** The `POST /api/groups/campaign/[slug]/media/generate` endpoint checks `isGenerating()` and returns HTTP 409 if a run is already active. Standalone scripts (`npx tsx tmp/...`) call `runMediaGeneration()` directly, bypassing the 409 gate â€” they are the primary cause of overlapping submissions. Always use the API endpoint for video.

```bash
# TikTok seed video only (6 storyboard shots, ~35s final)
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

**Cost warning â€” video provider mismatch:**
The codebase documentation states RunwayML Gen-3 Turbo as the primary video provider (5 credits/second, ~$8.50 total for all storyboard deliverables). However, `getDefaultVideoModelPresetId()` in `lib/campaigns/media/video-models.ts` **defaults to Fal** when `FAL_KEY` is set in the environment, regardless of `MEDIA_VIDEO_PROVIDER` configuration. This can double or triple costs. To force RunwayML, explicitly set `MEDIA_VIDEO_PROVIDER=runway` in `.env.local`, or temporarily unset `FAL_KEY`.

**Generation time expectation:** Each video deliverable submits multiple shots to the active provider sequentially. Allow **5â€“15 minutes per deliverable** depending on queue depth. The API call may HTTP-timeout after 120s while the server continues processing in the background â€” check the manifest afterward instead of re-submitting.

**Important pipeline note:** Designed ad artifacts (`designed_ad_artifact`, `documentary_detail_image`) are **additive** â€” they run alongside the full media pipeline, not instead of it. A generation request with no explicit `assetTypes` generates images, audio, video, and designed ads together. The `DESIGNED_MEDIA_MODE` env var only gates whether designed ads are included; it does not suppress heroes, scenes, videos, or audio.

**TikTok planning note:** The TikTok refactor plan in `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_2_MEDIA_GENERATION/TIKTOK_VIDEO_PRODUCTION/TIKTOK_VIDEO_REFACTOR_PLAN.md` is the implementation guide for maintaining the production TikTok package system. Agents should treat it as the current roadmap for scene intent, storyboard assembly, linting, and the paid vs organic split.
**Text overlay note:** The TikTok path now renders explicit overlay cards into the final MP4. Prompt text is still important, but it is no longer the only text layer. If the rendered video reads as clip-only or the overlay cards are missing, repair the render before treating the asset as complete.

---

#### 4.3 â€” Verify generation results

After each generation step, check the job summary in the response:
- `completionStatus: "complete"` â€” all assets generated
- `completionStatus: "partial"` â€” some failed; check `jobSummary.errors`
- Any `errors[]` entries â€” investigate before proceeding

**Review generated assets in the UI:**
```
http://localhost:3000/tests/media-generation
```

Check each tab systematically:
- **References** â€” ship reference photos present? Correct ship?
- **Heroes & Concepts** â€” images reflect the niche (not generic cruise)? Are the hero/concept assets visually distinct from the realistic scene layer?
- **Scenes** â€” scene images reflect specific locations (pool deck, atrium, dining, etc.)? Do they carry any niche cues?
- **Designed Ads** â€” ad templates rendered? Multiple placements (1:1, 4:5, 9:16)?
  - Remember this tab includes both final designed ads and their source modules. The actual template coverage lives in `manifest.images.designedAdArtifacts`.
- **Crops, Video, Audio, Merch** â€” as applicable

When an output feels technically correct but emotionally flat, compare it against [CAMPAIGN_EXAMPLES.md](../../DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/CAMPAIGN_EXAMPLES.md) before you change the whole pipeline. The examples page shows the difference between generic cruise imagery and campaign-specific imagery that carries the niche in-frame.

If scene images look generic (no niche props, just standard cruise locations), the production bible `imagePrompt` fields were empty when generation ran. Fix: re-run the brief, re-approve, then regenerate with `sceneImageMode: "all"`.

**Scene review stop:** After scenes are generated, stop and ask the user to inspect the scene tab before any TikTok/video generation. Scene quality is the main gate for whether video spend is worth it, so do not move on automatically.

---

#### 4.4 â€” Common failure modes and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `422 AESTHETIC_BRIEF_NOT_READY` on generate | Brief is `revised` or `pending`, not `approved` | `POST /brief/approve` |
| `409` from `/brief/approve` with "blockers" | Brief has structural validation failures | Re-run brief, fix blockers, re-approve |
| `/media/aesthetic/approve` returns red-team error | Wrong endpoint â€” deprecated | Use `POST /brief/approve` instead |
| Scene images are generic cruise (no niche) | `imagePrompt` was empty in production bible | Re-run brief â†’ re-approve â†’ regenerate scenes with `"all"` |
| `GET /media/probe` returns 404 | No probe run saved yet â€” not an error | Run `POST /media/probe` to validate directions, or skip if brief was just regenerated |
| `completionStatus: "partial"` after generation | Some images failed (often API timeout or rate limit) | Re-run same generation with `sceneImageMode: "missing_only"` or `assetTypes` filter |
| Heroes look wrong but stills look correct | Brief was approved before the `imagePrompt` fix; production bible stills are driving the wrong content | Create a directive scoped to `heroes` to patch specific stills |
| Brief reverts to `revised` after a directive apply | `patchBriefForDirective` saves the patched brief back, which resets `humanReviewStatus` | Re-approve with `POST /brief/approve` before the next generation run |

---

#### 4.5 â€” Landing page

Once heroes, scenes, and designed ads are in the manifest:
```
http://localhost:3000/tests/campaign-landing/[slug]
```
The landing page view model reads directly from the manifest. No separate construction step is needed â€” if the manifest is populated, the page renders.

### Phase 5: Publish, Distribute, and Go Live

#### 5.1 â€” Landing Page Publishing

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

#### 5.2 â€” Ad Distribution (Cold Placement)

Campaign assets are distributed via the distribution planner and dispatch system. Full reference: `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_4_DISTRIBUTION/PHASE_4_DISTRIBUTION.md`

**Step A â€” Generate a distribution plan (dry run / simulate):**
```bash
curl -X POST http://localhost:3000/api/groups/campaign/[slug]/media/distribute \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "plan",
    "providerMode": "simulate"
  }'
```

Response includes:
- `plan.posts[]` â€” scheduled posts with platform, copy, image references, timing
- `plan.audience` â€” targeting parameters derived from campaign brief
- `plan.budget` â€” estimated spend (placeholder in simulate mode)

**Step B â€” Review the plan:**
Check that:
- Posts reference actual `assetId`s from the manifest (not stale or missing assets)
- Copy tone matches campaign `voicePersona` and `toneKeywords`
- Hashtag sets differ per platform (Instagram vs TikTok vs Facebook)
- Image tags match platform requirements (1:1 for Instagram feed, 9:16 for stories, etc.)

**Step C â€” Dispatch to platforms (live):**
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

**Step D â€” Mark campaign live:**
```bash
curl -X PATCH http://localhost:3000/api/groups/campaign/[slug] \
  -H "Content-Type: application/json" \
  -d '{"status": "GATHERING_INTEREST"}'
```

#### 5.3 â€” Final QA Checklist

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
