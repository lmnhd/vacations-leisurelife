# Campaign Process Memory

**Purpose:** Shared process memory for the campaign-generation workflow.  
**Audience:** Any agent or human working through campaign discovery, repair, briefing, media generation, distribution, landing-page adjustments, or booking/inventory handling.  
**Use:** Read before substantial work. Append after meaningful ad hoc process changes or newly discovered operating rules.

---

## What To Record

Record items that change how the campaign system is actually being operated, especially when those changes were discovered through real user collaboration rather than original design.

Good examples:

- ad hoc workflow changes requested by the user
- temporary operating rules that future agents should follow
- recurring blockers or failure modes
- booking/inventory exceptions
- landing-page messaging or CTA policy shifts
- media-review heuristics that became part of the practical process
- manual operator steps that the automated system still depends on
- new stop conditions, escalation rules, or readiness gates

Do not use this file for ordinary implementation notes that only matter inside one small code change.

---

## Entry Format

Use this format for each new note:

```markdown
### YYYY-MM-DD: Short Title

**Trigger / Context:** Why the change happened (e.g., "The user requested...", "Model X consistently fails at...")  
**The Change / Rule:** The actual instruction or process update to follow.  
**Broader Lesson:** Why this matters for future pipeline refactors or operations.
```

Keep entries short and concrete. The goal is to preserve operational learning, not to write long narratives.

---

### 2026-05-08: Shared Process Memory Introduced

**Trigger / Context:** The campaign-generation skill needed a common place for agents to record ad hoc workflow changes that emerge during live collaboration with the user.  
**The Change / Rule:** Added a shared process-memory requirement near the top of `SKILL.md` and established this file as the global memory layer for the campaign-development process.  
**Broader Lesson:** Repeated entries in this file should later be mined to simplify the campaign pipeline, formalize temporary policies, and eliminate recurring manual workarounds.

### 2026-05-08: Tropical Destination Background Alignment

**Trigger / Context:** Campaign image outputs for tropical cruises drifted toward mountainous or otherwise non-tropical background scenery that did not match the actual destination promise.  
**The Change / Rule:** Agents should actively watch for background-environment mismatch as a recurring review pattern, especially when a campaign is positioned as Caribbean, tropical, warm-water, island, beach, or palm-driven. If the imagery reads alpine, rocky-coastal, fjord-like, or generically mountainous, the issue should be called out and repaired rather than treated as a one-off aesthetic miss.  
**Broader Lesson:** If this pattern repeats, the visual pipeline should gain stronger upstream destination-environment constraints so tropical campaigns default toward believable tropical water, vegetation, light, and port/deck context instead of generic scenic backdrops.

### 2026-05-09: Anchor Compliance and Starter Conversation Reliability

**Trigger / Context:** The campaign pipeline failed randomly due to `gpt-4o` either omitting the `role` field on `starterConversation` (schema violation) or dropping exact verbatim strings of `nicheSignal` and `nicheCarryThrough` in the generated `imagePrompt` and `subjectAction` fields (Anchor Compliance error limit exceeded).  
**The Change / Rule:** Implemented a new deterministic fixer (`normalizeAnchorContent` in `editors-room.ts`) to inject the missing anchor strings into `imagePrompt` and `subjectAction` automatically before the compliance check. Also modified the `starterConversation` schema to coerce and supply the missing `role` field where applicable.  
**Broader Lesson:** Do not rely purely on LLM strict substring compliance for complex artifacts when it's easily injectable. If it maps to a stable text pattern and can be injected safely without ruining creative context, write a deterministic fixer to normalize the output rather than failing the whole brief job.

### 2026-05-23: Templated Copy Forge Surgical Repair Loop

**Trigger / Context:** Copy Forge multi-format runs became expensive, and most failures were one or two visible-copy blockers after the generated set was already creatively close.  
**The Change / Rule:** Agents should not rerun Copy Forge just to fix isolated Templated/Canva copy blockers. Edit the generated copy set directly in `/tests/canva-ads`, or patch a saved JSON copy set with `scripts/agent/ad-copyset-patch.ts`, then re-run the deterministic gate with `/tests/canva-ads` or `scripts/agent/ad-copyset-recheck.ts`.  
**Broader Lesson:** High-cost creative generation should produce a draft source artifact; final fitting, niche-anchor, and CTA corrections should be handled as cheap deterministic repair steps whenever possible.

### 2026-05-25: Discovery Niche Evidence Must Be Community-Native

**Trigger / Context:** The user observed that discovery still felt biased toward travel niches, with outputs using travel-sector evidence such as astrotourism growth ahead of true community proof.  
**The Change / Rule:** Discovery prompts and schema descriptions now require niche evidence to be community-native first. Travel sectors, itinerary categories, destination trends, and tourism labels may support ship or route plausibility, but `researchRationale` and `audienceSignals` should lead with non-travel signals such as platforms, tools, gear, clubs, creators, meetups, rituals, jargon, spend behavior, or social psychology.  
**Broader Lesson:** "Vacation first" should protect cruise realism without turning niche discovery into travel-market discovery. The durable split is: community evidence proves the niche; travel evidence explains the venue fit.

### 2026-05-25: Phase B Should Operate on Active Campaigns Only

**Trigger / Context:** The Phase B discovery UI and runner were still showing or matching retired campaigns, making the inventory section hard to navigate and operationally noisy.  
**The Change / Rule:** Phase B status and default runs now exclude campaigns with `discoveryIteration.retiredAt` or `recommendedNextAction === "retire"`. The UI should present Phase B as an active inventory queue with attention, pending, confirmed, and all-active filters rather than a database-wide status wall.  
**Broader Lesson:** Retired campaigns should remain available for deduplication and history, but operational work queues should default to active records only.

### 2026-05-25: Discovery Match Is Not Booking-Link Proof

**Trigger / Context:** Phase A/Discovery successfully pre-matched new campaigns to CB inventory rows, but Phase B failed most of them because it could not recover Personal Booking Links from the CB group detail pages.  
**The Change / Rule:** Treat CB row matching and booking-link validation as separate gates. Cache refresh should preserve row-level `detailUrl` and `personalLink` whenever CB exposes them, matching should carry `personalLink` into Phase B candidates, and Phase B should write debug artifacts when detail-page extraction fails.  
**Broader Lesson:** A campaign is not operationally confirmed until the handoff link has been retained or validated. Inventory match confidence should not be interpreted as booking readiness.

### 2026-05-25: Dossier Should Precede Brief When It Can

**Trigger / Context:** The user noticed the Production Bible is created during the brief process and asked how the dossier was being used to improve it.  
**The Change / Rule:** When the campaign research dossier can be generated before the brief bundle, do that first so the dossier can influence the landing still bible and Production Bible. If the brief was already created, regenerate the Production Bible or full brief bundle after the dossier exists before approving for media.  
**Broader Lesson:** The dossier is not only a gate. It is upstream creative input, and sequencing determines whether it shapes the first pass or merely validates the result afterward.

### 2026-05-26: Canva Ads Become Default Static Ad Path

**Trigger / Context:** The user found an "ad inside an ad" failure where a finished legacy designed ad was selected as source imagery for a Canva/Templated carousel page, and requested the media-generation baseline path be checked before the image-system revamp.  
**The Change / Rule:** Treat `designed_ad_artifact` as the Canva/Templated static ad pack by default, plus the one preserved premium legacy display template. Keep `documentary_detail_image` as a separate source/audit layer in the normal all-media bundle, and never allow final designed ads to be selected as source images for another ad.  
**Broader Lesson:** Static ads are final distribution artifacts, not reusable still-image ingredients. The pipeline should keep source imagery, optional audit modules, and final rendered ads visibly separated to prevent recursive creative drift.

### 2026-05-29: "Regenerate Brief" in Lint Panel ≠ Full Brief Regeneration

**Trigger / Context:** User kept clicking "Regenerate Brief" in the pre-media lint panel expecting the heroSlogan to update, but it never changed.  
**The Change / Rule:** The "Regenerate Brief" button in the pre-media lint/spend-gate panel calls `regenerateLandingStills` — it only regenerates the 6 landing stills and production bible. It preserves the core aesthetic brief (heroSlogan, ctaVariants, colors, etc.) unchanged. To regenerate the full brief including messaging, run `npx tsx scripts/enqueue-and-run-brief.ts <slug>` from the terminal, or use the full "Generate Brief" flow in Brief Studio (not the lint panel button).  
**Broader Lesson:** There are two distinct "regenerate" actions in the UI. Document or visually distinguish them to avoid confusion. The pre-media lint panel's "Regenerate Brief" is stills-only.

### 2026-05-29: heroSlogan Slug Anchor Enforcement

**Trigger / Context:** The aesthetic engine consistently generated generic "Choose the window" slogans for `glass-observatory-winter-sea-watchers` — no niche identity, no slug words.  
**The Change / Rule:** Added a hard `SLUG_ANCHOR` check to `checkSloganQuality` in `aesthetic-engine.ts`. heroSlogan must contain at least one stem-matched word from the campaign slug (stopwords filtered). Failures are non-tolerable — the loop retries. After 3 failed attempts a deterministic safety net rewrites the slogan by prepending the last two slug content words. Separately, a post-refinement safety net restores the pre-refinement slogan if the refinement pass strips the niche anchor back to generic copy. The quality gate prompt also injects the slug words with worked examples at the top of `baseContext`.  
**Broader Lesson:** The model consistently defaults to evocative-but-generic copy unless explicitly told which words to anchor to. Slug words are the canonical niche identity — require at least one verbatim in the hero slogan. The refinement pass is a separate threat that can undo PASS 1 acceptance; guard it independently.

### 2026-05-29: Regex Bug in sloganContainsSlugWord — Use Tokenization

**Trigger / Context:** The slug anchor check was in the code but the quality gate kept accepting non-anchored slogans. Investigation revealed the regex was silently broken: template literal `` `\\b${stem}\\w*` `` passed to `new RegExp()` produces a backspace character instead of a word boundary, so every match returned false.  
**The Change / Rule:** Do not use template literals with `new RegExp` for regex patterns that rely on `\b` or `\w`. Replaced with simple string tokenization: `slogan.toLowerCase().split(/[^a-z]+/).filter(Boolean)` — then check if any token equals (short words) or starts with the stem (long words). No regex escaping required.  
**Broader Lesson:** The bash/Node test environment makes this bug invisible — `'\\b'.length === 1` in bash heredocs returns 1 (backspace), masking the real behavior. When debugging regex via shell scripts, use `.toString()` on the constructed RegExp object to confirm what was actually built.

### 2026-05-29: CTA "Book" Language Banned for Shadow Campaigns

**Trigger / Context:** Brief generation was producing CTAs like "Book the Sailing", "Book Now" — booking language implying an open-sale transaction, inappropriate for shadow/waitlist group campaigns.  
**The Change / Rule:** Added a CRITICAL MESSAGING rule to `aesthetic-engine.ts` banning booking verbs in `ctaVariants.bookNow` and `ctaWaitlist`. Banned: "Book Now", "Book the Sailing", "Book the Trip", "Reserve a Cabin", "Buy Now". Required: waitlist-forward language — "Get First Access", "Join the Waitlist", "Save My Spot", "Reserve Your Spot". Also added `"book"` to the `disallow` arrays in all CTA slots in `lib/ads/template-registry/templates.json`, and to the copy-forge prompt hard rules.  
**Broader Lesson:** Shadow campaigns are not open-sale listings. Any CTA surface that uses booking imperative verbs misleads the audience about purchase readiness. The ban must live in the prompt, the quality gate schema, and the template slot disallow lists simultaneously.

### 2026-05-29: Brief Fields Can Be Patched Directly in DynamoDB

**Trigger / Context:** After a brief regeneration the `ctaVariants.bookNow` field was still "Book Now" and a full regeneration (6+ min, LLM cost) was not warranted just to fix one field.  
**The Change / Rule:** Use the AWS DynamoDB UpdateItem command to patch individual nested brief fields without regenerating. Key structure: `PK = CAMPAIGN#<slug>`, `SK = MEDIA#AESTHETIC_BRIEF`, `UpdateExpression = 'SET messaging.ctaVariants.bookNow = :v'`. Run as a plain Node.js script with `@aws-sdk/lib-dynamodb`. Do not go through the campaign-store's `saveAestheticBrief` for single-field patches — it rebuilds identityBlueprint and re-parses the full schema unnecessarily.  
**Broader Lesson:** DynamoDB's document path update syntax makes surgical field patches cheap and safe. Prefer it over full brief regeneration for isolated copy fixes.

### 2026-05-29: HTML Screenshot Ad Pipeline Replaces Templated.io

**Trigger / Context:** User questioned whether the $30/month Canva Pro + Templated.io render pipeline was necessary given the ad templates could be built in HTML/CSS.  
**The Change / Rule:** Built a parallel `html_screenshot` ad render provider. Key files: `lib/ads/html-templates/` (shared React components for all 8 formats), `app/ads/render/[slug]/[format]/page.tsx` (stripped server render page for Playwright), `lib/ads/providers/html-screenshot.ts` (Playwright screenshotter), `lib/campaigns/media/generators/html-ad-generator.ts` (uploads PNGs to R2 + saves AssetRecords). Set `AD_RENDER_PROVIDER=html_screenshot` in env (now the default). The Templated.io path still works via `AD_RENDER_PROVIDER=templated`. View the preview at `/tests/canva-templates`.  
**Broader Lesson:** HTML/CSS ad templates backed by Playwright screenshots are cheaper, version-controlled, and use the same slot names as the Templated.io templates. The image slot names (`hero_image`, `tile_image_1`, etc.) come from `lib/ads/template-registry/templates.json` and use the same `preferredAssetTypes` priority order as the Templated render path.

### 2026-05-29: weak_niche_signal Now Has a Targeted Fix Contract

**Trigger / Context:** The production-build lint UI showed "Regenerate Brief" as the only option for `weak_niche_signal` blockers. The contract architecture already existed but no contract was written for this code.  
**The Change / Rule:** Added `weak_niche_signal` to `lib/campaigns/media/lint-fix-contracts.ts`. Mutable fields: `subjectAction`, `environmentDetails`, `imagePrompt`, `nicheCue`, `nicheCarryThrough`. Frozen: everything else including `location`, `mood`, `lighting`, `slotRole`. The success predicate runs `detectCueStrength` directly against the campaign's expanded niche keywords — same function the lint uses, so the fix provably clears the rule. Also added `'weak_niche_signal'` to `TARGETED_FIX_RULE_CODES` in `brief-studio/page.tsx` so the "Fix Issue" button appears. The root cause of most `weak_niche_signal` blockers is the model generating generic composition families (`rail_couple_laugh`, `dining_intimacy`) without injecting niche keywords into the primary fields.  
**Broader Lesson:** Every lint blocker should eventually have a targeted-fix contract. Forcing a full still regeneration for a niche-cue miss is expensive; surgically rewriting `subjectAction` and `imagePrompt` on the 4 failing stills is a 30-second LLM call.

### 2026-05-29: Reference Image Selection Was Ignoring Scored Bindings

**Trigger / Context:** User observed that generated scene images showed less visual variety than the reference image pool, suspecting the same reference was being used for every scene.  
**The Change / Rule:** Confirmed the bug: `generateSceneImages` in `stability-generator.ts` was using `shipReferences.find(ref => ref.category === scene.referenceCategory)` — a naive first-match that ignored `scene.referenceAssetIds[]`, which the binding phase (`bindReferencesToScenes`) had already populated with the top-scored references for each scene. Fixed by: (1) adding `manifestReferenceRecords: AssetRecord[]` parameter to `generateSceneImages`, (2) building a `Map<assetId, url>` lookup at the top of the function, (3) preferring `scene.referenceAssetIds[0]` over the naive `.find()`, (4) passing `manifestReferenceRecords` from the orchestrator call site. The binding phase was already doing excellent work (scoring by category, AI vision, ship match quality, tags) — it just wasn't being consumed.  
**Broader Lesson:** The binding phase and generation phase were architecturally disconnected. Any time scored/ranked data is being computed but not consumed, check whether the consumer is actually reading the result.

### 2026-05-31: WORKFLOW.md and PIPELINE_ISSUES.md Have Encoding Corruption

**Trigger / Context:** Attempted to update those two files to reflect new pipeline additions. Both files contain UTF-8 multibyte sequences (em-dashes, arrows) that the Edit tool cannot match, making in-place edits impossible without re-encoding the files.  
**The Change / Rule:** Do not attempt to Edit WORKFLOW.md or PIPELINE_ISSUES.md directly — the encoding mismatch will fail silently. All urgent agent-facing updates are recorded here in CAMPAIGN_PROCESS_MEMORY.md instead, where the encoding is clean.  
**Broader Lesson:** Re-encode both files (UTF-8 with standard ASCII punctuation) during the next workflow refactor pass so they become editable again.

---

### 2026-05-31: Flyer Images Are a New First-Class Pipeline Asset Type

**Trigger / Context:** Added `flyer_image` to the production media bundle as a dedicated section for "single-image poster" assets generated from a minimal slug-prompt.  
**The Change / Rule:**
- Asset type: `flyer_image`, stored in `manifest.images.flyerImages` (never auto-consumed by ads/landing — operator places them manually).
- Default: 6 renditions per run, one per variation axis. Generated alongside heroes/concepts in the same generation call: `{"assetTypes":["hero_image","aesthetic_concept","flyer_image"]}`.
- **Tunable per-campaign:** Open the "Flyer Generation Controls" panel in `/tests/media-generation` before generating to edit negation rules, variation axes, and active image models. Changes are saved to `manifest.flyerControls` and honored by the next generation run.
- **Finalized negation rules** (2026-05-31): full-ship exterior hero shots; drone/aerial framing; unrealistic fantasy scale/sci-fi vessels; any text/logos/watermarks/UI; old-fashioned or "painted" style imagery.
- **Review:** In `/tests/media-generation`, check the new **Flyers tab** after generation. Approve/curate/regenerate like any other image section. The source-LLM toggle appears when gpt-image-2 was enabled (see below).  
**Broader Lesson:** Flyers fill the gap between brief-grounded scene imagery (complex, ship-grounded) and ads (fixed-slot templates). They are best for landing-page hero and gallery placement where a single vivid image is needed.

---

### 2026-05-31: GPT Image 2 Is Available as a Second Image Backend (Opt-In for Flyers)

**Trigger / Context:** Added `gpt-image-2` (released April 2026, API access May 2026) as an optional second image model for flyer generation.  
**The Change / Rule:**
- Enable via the Flyer Generation Controls panel → Image Models → tick "GPT Image 2". Saves to `manifest.flyerControls.models`.
- When enabled, each flyer rendition is generated by BOTH Gemini and GPT Image 2 (sequential, ~61s each at quality=medium). Results are stored as variant groups in `manifest.images.flyerImages`.
- The **source-LLM toggle** in the Flyers review tab lets you switch each logical flyer between the two model versions and save the preference. Only the selected version surfaces in the picker / landing page.
- `gpt-image-2` is **NOT used for heroes, scenes, or concepts** — Gemini only for those.
- `dall-e-3` was deprecated and retired May 2026.
- Quality: `low` ≈ 40s, `medium` ≈ 61s, `high` > 110s. Defaulted to `medium` (`GPT_IMAGE_2_CONFIG.quality`).  
**Broader Lesson:** Multi-model comparison is now viable for flyers. Enable only when you want to compare outputs — it roughly doubles generation time and cost for the flyer step.

---

### 2026-05-31: Landing Image Studio — Manual Control Over Landing Page Images

**Trigger / Context:** Built a dedicated studio for manually controlling which images appear on the campaign landing page, replacing the previously invisible `imageSelections` override.  
**The Change / Rule:**
- **Studio URL:** `/tests/landing-studio` — campaign selector, visual-system switcher (Production / Editorial / Nostalgia / Zine), live iframe preview with scroll preservation, hero thumbnail picker, and a gallery curated-set tray.
- **Hero override:** `manifest.imageSelections["section:landingHero:primary"]` — pick any image from the full manifest pool. Applies immediately on click. "Auto" clears it (system resumes automatic selection).
- **Gallery curated set:** `manifest.landingImageSets.gallery` (array of assetIds) — FULL-REPLACE semantics: the page shows exactly these images in this order. Edit the set in the studio tray (add via thumbnail grid, reorder with ↑↓, remove), then press **Apply** for a single reload.
- **Auto fallback:** When `landingImageSets.gallery` is absent or empty, the view-model falls back to the original automatic algorithm. Backward-compatible — existing campaigns are unaffected until you curate.
- **Eligible pool:** both the hero picker and gallery use `collectSelectableImageGroups` (variant-collapsed — one canonical model-version per logical item). Selected assetIds resolve via `buildImageAssetIndex` (uncollapsed), so a specific model-variant can be placed.
- **API:** `GET/PATCH /api/groups/campaign/[slug]/media/landing-images` manages the `gallery` and `trust` lists.
- **Trust images:** Phase 3 (not yet built) — same pattern as gallery, stored in `manifest.landingImageSets.trust`.  
**Broader Lesson:** Treat the Landing Image Studio as the operator's final creative pass after media generation and curation. Hero and gallery choices should be made there, not guessed from the automatic algorithm.

---

### 2026-05-31: Probe 404 Noise Is Now Suppressed in the Media-Generation UI

**Trigger / Context:** Every manifest refresh (including post-approval reloads) was firing `GET /media/probe` and showing 404 in the browser console for campaigns without a probe run, confusing operators into thinking something had failed.  
**The Change / Rule:** The `/tests/media-generation` page now only fetches the probe endpoint when `brief.landingStillBible` exists (the same condition that gates the Probe Renders UI section). Campaigns without a Production Bible will never trigger the probe fetch. The 404 in the console is gone for normal campaign flows.  
**Broader Lesson:** If you ever see a probe 404 now, it means the campaign has a `landingStillBible` but no probe run — which is meaningful, not noise.

### 2026-05-28: Revision Notes Must Be Composed, Not Appended

**Trigger / Context:** The user noted that regeneration repair notes appended to existing image prompts can create redundancy or contradiction, especially when multiple visual-lint findings are applied.  
**The Change / Rule:** Append-mode media regeneration should rewrite the original prompt plus repair note into one coherent generation prompt before calling the image model. Section-level batch regeneration is acceptable when it uses that composed prompt path, skips locked assets, and preserves the original campaign/ship/asset role.  
**Broader Lesson:** Repair notes are operator intent, not final model prompts. The durable pipeline should treat them as patch input and compile them into clean prompts before spending on regeneration.
