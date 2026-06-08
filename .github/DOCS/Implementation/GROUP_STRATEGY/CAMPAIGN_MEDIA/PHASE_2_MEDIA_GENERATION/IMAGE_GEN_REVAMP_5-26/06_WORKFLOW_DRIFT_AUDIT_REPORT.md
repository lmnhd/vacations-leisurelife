# 06 Workflow Drift Audit Report

**Status:** Audit report for final overhaul planning  
**Date:** 2026-05-26  
**Center Ground:** [`01_VISUAL_AUDIT_INTAKE.md`](./01_VISUAL_AUDIT_INTAKE.md)  
**Audit Plan:** [`02_WORKFLOW_DRIFT_AUDIT_PLAN.md`](./02_WORKFLOW_DRIFT_AUDIT_PLAN.md)

---

## Executive Finding

The media pipeline already contains many of the right ideas: niche retention, ship plausibility, production-build linting, scene libraries, manifest sections, asset curation, Copy Forge, and Canva/Templated rendering.

The problem is not that the system has no visual intelligence. The problem is that the strongest visual rules are inconsistent across phases and are later diluted by conflicting contracts, broad asset pools, conservative still-image rules, legacy video assumptions, and weak source/final artifact separation.

The operator's visual audit is correct: the system is producing plausible cruise imagery but not enough campaign-defining imagery.

The overhaul should not be a prompt tweak. It should be a pipeline contract rebuild around these principles:

- group action is the default visual unit
- theme legibility must be visible in the image itself
- real ship references must be carried through generation
- rail/table/window/passive scenes must be capped
- age and ethnicity diversity must be planned, not hoped for
- controlled embellishment is allowed for ad attention
- time of day and artistic treatment must vary
- source imagery and final ad artifacts must be structurally separated

---

## Highest-Priority Drift Findings

### 1. Group Action Is Introduced, Then Suppressed

**Bucket:** Reject  
**Pipeline Stage:** Aesthetic Engine / Production Bible  
**Files:** `lib/campaigns/aesthetic-engine.ts`

The production bible prompt contains strong group-language early:

- ambient community rule
- human representation rule
- at least 6 of 10 scenes with two or more people
- group cruise, not solo luxury escape

But later in the same prompt, scene rules override that direction:

- default social unit becomes one or two people
- trios and larger groups are exceptions
- maximum of 2 scenes across scenes + stills may show 3 or more people
- phrases like small group, trio, and cluster are banned

This directly conflicts with the Intake compass, where group action should usually show 4-6 people and sometimes up to 10.

**Why it matters:** The current system is structurally biased toward solo/pair images before the image generator ever runs. This explains why heroes/concepts feel lonely or couple-centric, while the stronger 10-scene outputs feel closer to the desired direction.

**Future rule:** Remove legacy image-to-video motion constraints from still/ad source planning. Campaign videos are animated type videos using static images; the system no longer animates people inside generated images. Still images and ad source imagery should default to visible group action.

**Priority:** High

---

### 2. Landing Still Rules Are Too Conservative For Ad-Worthy Source Images

**Bucket:** Reject  
**Pipeline Stage:** Landing Still Bible  
**Files:** `lib/campaigns/aesthetic-engine.ts`

Landing still rules currently prioritize:

- 1-3 people max
- no dense crowds
- low activity density
- one emotional beat
- clean negative space
- rail, balcony, promenade, clean ship-interior compositions

These are useful for headline-safe hero images, but they should not govern the entire source-image pool.

**Why it matters:** A landing hero standard is being asked to serve too many downstream roles. Ads need stronger narrative action, clearer theme activity, and higher visual energy than a calm hero image.

**Future rule:** Create distinct visual contracts:

- `hero_still`: headline-safe, clean, lower density
- `campaign_action_still`: group-driven, theme-legible, ad source eligible
- `documentary_detail`: tight texture and proof cues
- `alternate_art`: watercolor/illustration/experimental
- `scene_image`: campaign scene source image, usable by ads and animated-type video layouts as static imagery

**Priority:** High

---

### 3. Theme Legibility Exists As A Rule, But Is Too Field-Local

**Bucket:** Investigate  
**Pipeline Stage:** Aesthetic Engine / Lint / Prompt Builder  
**Files:** `lib/campaigns/aesthetic-engine.ts`, `lib/campaigns/brief-engine/orchestrator.ts`, `lib/campaigns/media/production-build-lint.ts`

The system has deterministic checks for weak niche signals and identity legibility. This is good. But the enforcement appears concentrated around landing still fields like `imagePrompt`, `subjectAction`, `environmentDetails`, and `composition`.

That catches whether niche language appears, but it does not guarantee that the generated image will visually express the theme in a vivid way.

**Why it matters:** The operator complaint is not just missing keywords. It is that the image can technically include a signal while still reading as generic travel scenery.

**Future rule:** Add a stronger visual-theater requirement per source-image role:

- what are people doing that is specific to this campaign?
- what object, gesture, gathering, timing, or environment makes the niche legible?
- would the campaign be recognizable if the image had no caption?

**Priority:** High

---

### 4. Ship References Are Available, But Not Guaranteed To Survive Generation

**Bucket:** Investigate  
**Pipeline Stage:** Ship Reference Service / Scene Generation / Prompt Construction  
**Files:** `lib/campaigns/media/media-orchestrator.ts`, `lib/campaigns/media/ship-reference-service.ts`, `lib/campaigns/media/generators/stability-generator.ts`

The orchestrator correctly requires ship references before scene image generation and passes approved/active reference candidates into `generateSceneImages`.

However, the current audit evidence suggests final generated images still collapse into narrow ship areas and miss defining vessel features.

Likely drift points:

- reference candidates are available but not role-assigned per scene
- prompts may summarize ship identity generically rather than binding specific reference categories to outputs
- scene slots may not demand underused ship locations strongly enough
- generated images may preserve cruise-like style but not vessel-specific architecture

**Why it matters:** Without stronger reference-to-scene binding, the model can satisfy ship context with generic deck, rail, window, and pool visuals.

**Future rule:** Every generated source image should carry a `referenceCategory`, `referenceAssetIds`, and `mustPreserveShipFeatures[]` contract. The audit/report path should show whether those features appeared.

**Priority:** High

---

### 5. Broad Asset Pools Can Still Select The Wrong Image Family

**Bucket:** Reject  
**Pipeline Stage:** Templated Ads / Render Pack / Asset Selection  
**Files:** `lib/ads/render-pack.ts`, `lib/campaigns/media/ad-pack-adapter.ts`, `lib/ads/types.ts`

`AdAssetType` is broad:

- `scene_image`
- `ship_reference`
- `hero`
- `aesthetic_concept`
- `still`
- `merch`

The render pack maps these to broad fallback pools. For example:

- `hero` can pull hero, platform crops, scene images, aesthetic concepts, documentary details, ship references
- `scene_image` can pull scene images, documentary details, platform crops, hero, aesthetic concepts
- `still` can pull documentary details, platform crops, scene images, hero, aesthetic concepts

This is flexible but structurally unsafe.

**Why it matters:** Copy Forge can ask for a semantically reasonable slot, but render-pack selection can satisfy it with a technically usable but visually wrong source family. This is the same class of issue as the prior `ad in ad` failure, even though designed ad artifacts are not currently listed as an `AdAssetType` option.

**Future rule:** Replace broad asset types with source roles:

- `source.hero_clean`
- `source.group_action`
- `source.theme_detail`
- `source.ship_context`
- `source.editorial_alt`
- `final.ad_artifact`
- `final.channel_deliverable`
- `reference.audit_only`

Ad rendering should only select from source roles, never final roles.

**Priority:** High

---

### 6. Designed Ad Artifacts Are Separated In Manifest But Need A Hard Eligibility Contract

**Bucket:** Investigate  
**Pipeline Stage:** Manifest / Templated Ads / Review UI  
**Files:** `lib/campaigns/media/asset-manifest-section.ts`, `lib/ads/render-pack.ts`, `lib/campaigns/media/generators/templated-ad-generator.ts`

The manifest has a dedicated `designedAdArtifacts` section and Templated outputs are saved as `designed_ad_artifact`. That is good.

The current render-pack `AdAssetType` does not include designed ad artifacts, which helps prevent direct selection. But the broader system still needs a first-class policy that final artifacts are never eligible source imagery.

**Why it matters:** The previous `ad in ad` failure proves that relying on convention is not enough.

**Future rule:** Add `assetRole` or `eligibilityRole` independent from `assetType`, with hard enforcement:

- source_image
- source_reference
- final_ad
- final_video
- final_audio
- review_only
- alternate_art

**Priority:** High

---

### 7. Copy Forge Has Strong Composition Thinking But Cannot Fix Weak Source Pools

**Bucket:** Preserve / Investigate  
**Pipeline Stage:** Copy Forge  
**Files:** `lib/ads/copy-forge/prompt.ts`, `lib/ads/types.ts`

Copy Forge correctly asks for:

- unified copy + imagery composition
- imageSlotDirectives
- unique narrative roles per slot
- diversified image set
- niche-specific copy
- template slot budgets

This should be preserved.

But Copy Forge only sees available image counts, not visual inventory quality. It does not know whether available scene images are rail-heavy, table-heavy, bland, bright daylight, low-diversity, or weakly thematic.

**Why it matters:** Copy Forge can choose a better narrative role, but if every available source image has the same composition family, the final ad still fails visually.

**Future rule:** Copy Forge input should include source-image quality metadata:

- compositionFamily
- peopleCount
- demographicCoverage
- timeOfDay
- shipLocationFamily
- themeLegibilityScore
- groupActionScore
- artisticTreatment
- sourceEligibilityRole

**Priority:** High

---

### 8. Watercolor / Illustration Needs A Dedicated Alternate-Art Lane

**Bucket:** Reject / Preserve As Alternate  
**Pipeline Stage:** Asset Taxonomy / Review UI / Image Selection

The Intake compass is clear: watercolor-style images may be useful for special campaign sections, but they should not enter main hero or source-photo pools.

Current asset typing does not appear to include a strong visual-style lane separating photo-real source imagery from illustration/alternate art.

**Why it matters:** If watercolor images are just `aesthetic_concept` or another general image type, they may leak into hero, crops, ad source pools, or moodboard-like contexts.

**Future rule:** Add `alternate_art` or style classification metadata. Block alternate art from `hero`, `ad_source`, and `platform_crop` unless the request explicitly asks for it.

**Priority:** Medium

---

### 9. Scene Slots Contain Defaults That Encourage Unwanted Repetition

**Bucket:** Reject  
**Pipeline Stage:** Production Bible / Scene Taxonomy  
**Files:** `lib/campaigns/aesthetic-engine.ts`

The prompt contains corrective language against generic fallback, but still includes recurring location families and slot assumptions that can recreate the problem:

- rail-side moments
- balcony/window/cabin contemplation
- theater-like scenes
- nightclub-like scenes
- destination/offboard requirements

Some of these may be valid for specific campaigns, but they should not be default scene obligations.

**Why it matters:** The operator sees too many rail/table/window scenes because the system still treats those as safe cruise-native defaults.

**Future rule:** Scene taxonomy should use campaign-fit gates:

- theater only if theme-native
- nightclub only if theme-native
- destination/offboard only if visually specific and meaningful
- rail/table/window capped globally
- group-action scenes required as a named source category

**Priority:** High

---

### 10. Legacy Video Constraints Are Bleeding Into Still Image Quality

**Bucket:** Investigate  
**Pipeline Stage:** Production Bible / Storyboard / Scene Images  
**Files:** `lib/campaigns/aesthetic-engine.ts`, `lib/campaigns/media/generators/tiktok-seed-generator.ts`

The current campaign video direction is animated type videos with static images. The system no longer needs to script around image-to-video people animation, human motion, hands, limbs, prop choreography, or close-up interactions inside generated images.

Some prompt rules still appear shaped by older image-to-video concerns. Those rules push scene images toward environment-led frames and away from human activity.

**Why it matters:** The strongest ad source images need people, activity, group energy, and theme-specific action. Legacy video safety rules make images safer but duller, even though people are no longer animated in-image.

**Future rule:** Treat video as a layout/composition consumer of static images, not as a motion-generation constraint on the image itself:

- `scene_campaign_action`: human-rich, still/ad source eligible
- `scene_static_video_image`: static image chosen for animated type video layout
- `final.animated_type_video`: final video deliverable, not reusable source imagery

**Priority:** High

---

### 11. Curation Preferences Are Not Consistently Enforced Across All Image Selectors

**Bucket:** Reject  
**Pipeline Stage:** Image Selection / Ad Rendering / Landing Page Selection  
**Files:** `lib/campaigns/media/image-selection.ts`, `lib/ads/render-pack.ts`, `components/campaign-landing/landing-page-visual-system.tsx`

The curation system provides comprehensive preference controls: `globalPriority`, `contextPriorities`, `approvedContexts`, `blockedContexts`, `suitabilityTags`, and `antiTags`. The `image-selection.ts` module correctly honors these preferences.

However, the ad rendering path in `render-pack.ts` only uses `globalPriority` and basic tag matching. It does not respect `contextPriorities`, `approvedContexts`, `blockedContexts`, `suitabilityTags`, or `antiTags`.

**Why it matters:** When an operator curates an image for specific use cases (e.g., "only for landing hero, blocked from Facebook ads"), that preference should be authoritative across every downstream selector. Currently, an image marked as inappropriate for ads can still be selected by the Canva/Templated ad generator.

**Current workflow gaps:**
- Setting `approvedContexts = ["landing_hero_primary"]` works for landing page selection but not for ad generation
- Setting `blockedContexts = ["meta_ad_creative"]` works for some selectors but not others
- Context-specific priorities are ignored by ad rendering
- Tags are not consistently mapped between UI curation slots and Copy Forge `preferTags`

**Future rule:** Every image selector must honor the complete curation contract. No selector should bypass operator preferences.

**Priority:** High

---

## Field Lineage Map

| Stage | Primary Inputs | Adds / Rewrites | Downstream Source Fields | Drift Risk |
|---|---|---|---|---|
| Discovery | campaign concept, research rationale, audience signals, cruise-native moments | campaign framing, target community, ship/date | `Campaign` fields | generic campaign personality can become sticky |
| Phase B inventory | CB ship/date/route/group metadata | real ship, itinerary, pricing, booking link | `matchedShipName`, `matchedSailDate`, `odysseusPortsOfCall` | media may imply unsupported ship features |
| Research dossier | approved discovery context | niche examples, allowed/discouraged signals | `campaign.researchDossier`, `brief.campaignResearchDossier` | generated too late or not absorbed by brief |
| Aesthetic brief | campaign + dossier | visual palette, messaging, plausibility framework, identity | `brief.visual`, `brief.messaging`, `identityBlueprint` | free-text contradictions enter visual prompts |
| Landing still bible | brief + campaign | 6 still specs | `landingStillBible` | hero-safe rules suppress group/action imagery |
| Production bible | brief + campaign | 10 scene specs, storyboards, avoid directives | `productionBible.sceneLibrary` | legacy video-safe rules suppress human activity despite static-image video direction |
| Ship references | matched ship / ship target | reference candidates/assets | `manifest.images.shipReferences` | references not bound strongly to generated scenes |
| Image generation | still specs, scenes, references | rendered source imagery | manifest image sections | prompt conflicts become visual sameness |
| Copy Forge | campaign, brief, dossier, available image counts | copy set + imageSlotDirectives | `AdCopySet` | cannot see visual quality metadata |
| Render pack | manifest + directives | selected image assets per ad slot | Templated render requests | broad pools select wrong family |
| Distribution | final manifest | channel-ready outputs | distribution views/actions | technical pass can override visual intent |

---

## Asset Eligibility Matrix Recommendation

| Role | Examples | Can Feed Ads? | Can Feed Hero? | Can Feed Animated Type Video? | Notes |
|---|---|---:|---:|---:|---|
| `source.hero_clean` | headline-safe hero still | Yes | Yes | Maybe | lower density, clean copy space |
| `source.group_action` | 4-10 people doing theme activity | Yes | Maybe | Yes | should become primary ad pool and can support static video layouts |
| `source.theme_detail` | objects, gestures, documentary details | Yes | No | Maybe | strong for supporting slots |
| `source.ship_context` | actual ship spaces, architecture | Yes | Maybe | Yes | should preserve reference ids |
| `alternate_art` | watercolor, illustration, stylized art | Only explicit | Only explicit | No | separate UI section |
| `final.ad_artifact` | designed/templated rendered ads | No | No | No | distribution only |
| `final.channel_deliverable` | final crops/videos/audio | No | No | Distribution | not reusable source |
| `reference.audit_only` | raw ship references | Limited | No | Limited | should inform generation, not be final ad art unless approved |

---

## Prompt Conflict Inventory

| Conflict | Location | Current Effect | Required Fix |
|---|---|---|---|
| group warmth vs solo/pair cap | `aesthetic-engine.ts` production prompt | suppresses group action | remove legacy image-to-video constraints from still/ad source rules |
| hero-safe stills vs ad source needs | landing still bible | calm/bland imagery | add campaign action still role |
| niche keywords vs visual theme legibility | lint/prompt fields | keyword compliance without visual specificity | require visual action proof |
| ship plausibility vs generic cruise fallback | scene/image prompts | rail/deck/window sameness | bind references by category and feature |
| legacy video motion safety vs still image energy | storyboard rules | dull human action | treat videos as animated type layouts using static images |
| destination/offboard requirement vs operator preference | scene rules | low-value port/rail scenes | make destination scene conditional |
| broad asset types vs usage eligibility | render pack | wrong source family selected | introduce source/final roles |
| curation preferences vs inconsistent selector enforcement | image selection vs ad rendering | operator preferences bypassed | make all selectors honor complete curation contract |

---

## Gate Map

| Gate | Exists? | Strength | Gap |
|---|---:|---|---|
| approved aesthetic brief required | Yes | Strong | does not guarantee visual compass compliance |
| research dossier required before approval | Yes | Medium | timing can still drift if regenerated later |
| production build lint | Yes | Strong structurally | should add group/action/time/day/style checks |
| probe gate | Optional | Medium | default is ignore, so spend path can bypass visual probing |
| manifest governance | Yes | Medium | approval state exists, source/final role absent |
| Copy Forge quality gate | Yes | Medium | copy/slot quality, not source image quality |
| render-pack asset filter | Yes | Medium | blocks rejected assets, but pools are broad |
| review UI visibility | Partial | Medium | must expose all source/final lanes distinctly |
| distribution approval | Partial | Unknown | needs visual-intent gate before publish |

---

## Preserve List

- Production-build lint concept.
- Research dossier before brief approval.
- Niche retention scanner, but strengthen it beyond keyword presence.
- Ship reference requirement before scene image generation.
- Copy Forge composition model and imageSlotDirectives.
- Dedicated `designedAdArtifacts` manifest section.
- Canva/Templated route as scalable ad path.
- Gold-standard older display ad as reusable design target.
- 10-scene output strengths: scene planning, group atmosphere, darker/more varied time of day, richer theme specificity.

---

## Reject List

- Default solo/pair grammar for all campaign imagery.
- Maximum-2-larger-groups rule for still/ad source imagery.
- Repeated rail, balcony, window, coffee, and table fallbacks.
- Theater and nightclub as recurring generic scene slots.
- Destination/port scenes unless destination is visually specific and campaign-relevant.
- Watercolor/illustration in main photo source pools.
- Broad render pools where `hero`, `scene_image`, or `still` can substitute too freely.
- Any final ad artifact becoming source imagery for another asset.

---

## Recommended Default Scene Mix

For each campaign source-image generation pass:

| Category | Target Count | Notes |
|---|---:|---|
| Group action theme scenes | 4 | 4-6 people, theme activity visible |
| Large atmosphere/group energy | 1 | up to 10 people, not overcrowded |
| Ship-specific environment scenes | 2 | explicit reference-category binding |
| Documentary/theme detail | 2 | hands/objects/gestures, not final ads |
| Clean hero-safe still | 2 | headline-safe, not all rails/windows |
| Alternate artistic treatment | 1-2 optional | isolated alternate-art lane only |
| Animated-type video image candidates | selected from source pool | static images only, no in-image people animation |

---

## Recommended People Standard

- Default ad/source image: 4-6 people.
- Optional large social frame: up to 10 people.
- Quiet solo/pair moments: allowed, capped.
- Hero-safe stills: may use 1-3 people, but cannot dominate the source pool.
- Each set should include planned age and ethnicity variety.
- Repeated same-couple archetype should be a blocker.

---

## Recommended Time-Of-Day Standard

Each full image set should include at least:

- one dusk/blue-hour image
- one night or evening interior/deck image when campaign-appropriate
- one sunrise/golden-hour image
- one neutral daylight ship-context image
- no more than half bright daylight

---

## Recommended Artistic Treatment Standard

Add treatment metadata to generated source imagery:

- natural documentary photography
- 35mm film grain
- sepia variant
- black-and-white variant
- contrast curve / high-contrast editorial
- color-shifted campaign palette variant
- overlay/texture treatment
- alternate-art watercolor/illustration

Treatments should be role-aware. Main hero/ad source stays believable photography. Alternate art stays isolated.

---

## Fix Path For Final Overhaul Plan

1. **Separate visual roles from asset types.** Add source/final/alternate/reference eligibility roles.
2. **Remove legacy image-to-video constraints from still/ad prompts.** Videos use animated type over static images, so still imagery should not be dulled for human-motion safety.
3. **Create a group-action still generator path.** Use 4-6 people by default with theme-specific activity.
4. **Promote 10-scene strengths into core image planning.** Use it as the baseline for vivid scene articulation.
5. **Replace default scene slots with conditional scene taxonomy.** Theater, nightclub, and destination slots require campaign-fit justification.
6. **Bind ship references to generation outputs.** Require reference IDs, categories, and preserved features per generated image.
7. **Add visual metadata to source assets.** peopleCount, compositionFamily, timeOfDay, shipLocationFamily, themeLegibilityScore, groupActionScore, treatment.
8. **Make Copy Forge consume visual metadata.** It should select by role and quality, not only asset type and tags.
9. **Enforce curation preferences across all selectors.** Every image selector (landing, ads, templated rendering) must honor `contextPriorities`, `approvedContexts`, `blockedContexts`, `suitabilityTags`, and `antiTags`.
10. **Add hard no-final-as-source enforcement.** Designed/templated ads must never feed source image pools.
11. **Update `/tests/media-generation` review lanes.** Show source, final, alternate, and reference artifacts separately.
12. **Add visual compass lint.** Gate against rail/table repetition, weak group action, weak theme legibility, all-daylight sets, and demographic monotony.

---

## Final Assessment

The current pipeline is architecturally close but visually misweighted.

It already has the skeleton for a strong system: discovery context, dossier, production bible, manifest, review, Copy Forge, and templated rendering. The overhaul should preserve that skeleton while replacing the loose visual contracts that allow bland travel imagery to pass.

The central change is this:

**The pipeline must stop treating a calm, plausible cruise image as success. It must require campaign-specific group action, visible theme behavior, ship-reference specificity, demographic variety, and role-safe asset eligibility before images become source material for ads or landing pages.**
