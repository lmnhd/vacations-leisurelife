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
  - **SKETCHED / Illustrated** — Used for images **with people** (guests, couples, groups, characters). Applied to: hero images, aesthetic concept frames, merch designs, social ad creatives. Purpose: emotional hook, aspiration, first impression. The style is a lush watercolor-and-ink travel illustration with expressive linework, idealized figures, and saturated color washes.
  - **REALISTIC / Photographic** — Used for images **without people** (ship structure, decks, pools, cabins, ports, sunsets, architecture). Applied to: scene images (storyboard source frames), reference-grounded ship transforms, landing page detail imagery. Purpose: trust, accuracy, "finish the sell." The style is documentary-grade cruise photography with sharp detail, natural marine lighting, and believable materials.
- **Pipeline enforcement:** `stability-generator.ts` branches on `sceneHasVisiblePeople()` (from `storyboard-motion-policy.ts`) and a people detector for still specs to inject the correct style prompt string. Style prompt strings are centralized in `style-prompts.ts`. Reference-grounded heroes resolve style from the intended source still/scene or hero variant intent, not from vision-inspecting the SerpAPI reference photo.
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
3. **User Intervention Checkpoint:**
   - Direct the user to view the aesthetic brief and production bible at `http://localhost:3000/tests/brief-studio`.
   - Ask the user to approve the aesthetic brief before generating heavy media assets.
   - **Agent must explicitly tell user to open their browser and navigate to this URL to review the brief visually before proceeding to media generation.**

### Phase 4: Media & Landing Asset Production

1. **Generate Media:** Trigger image, video, and audio asset pipelines as defined in the Aesthetic Brief.
2. **Review:** Ensure output coverage across hero images, concept images, scene images, and social representations.
   - Direct the user to monitor media generation at `http://localhost:3000/tests/media-generation`.
3. **Landing Page Construction:** Populate the Next.js `[slug]` route using the approved View Model.

### Phase 5: Final QA & Export

1. **Final Review:** Direct the user to view the fully-rendered campaign at `http://localhost:3000/tests/campaign-landing/[slug]`.
2. Run final validation. Ensure waitlist forms and "Book Now" routing (both Group and Retail paths) function as expected.
3. Mark campaign status as `GATHERING_INTEREST`.

## 3. Tooling & API Guidance

Always use the shared `lib/agent-api` orchestrator for durable state.

- Brief generation: `npx tsx scripts/enqueue-and-run-brief.ts <slug>` (recommended)
- Alternative: `npm run agent:brief-prototype -- <slug>` (if configured in package.json)
- Never try to skip the Agent API workflow system if a durable job record is required.
- **Do not manually prompt Gemini or Perplexity for ideation**; use the built-in `core-logic.ts` pipeline/API route, which already fetches live web data, normalizes it, and passes exclusion context correctly.
- Standalone scripts (e.g., `tmp/run-media-generation.ts`) that call internal Next.js modules must import `loadEnvConfig` from `@next/env` at the top to access `.env.local` variables: `loadEnvConfig(process.cwd())`.
