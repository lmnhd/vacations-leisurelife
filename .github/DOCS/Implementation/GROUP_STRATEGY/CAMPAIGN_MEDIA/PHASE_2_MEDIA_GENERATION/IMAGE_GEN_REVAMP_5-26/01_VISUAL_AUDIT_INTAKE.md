# 01 Visual Audit Intake Compass

**Purpose:** define the operator-led visual standard that will guide the complete audit of the media generation pipeline before the overhaul plan is finalized.

This document is no longer just an intake worksheet. It is the compass for the agent-led audit and report across the entire media-generation stream: discovery language, aesthetic devising, research dossier, production bible, scene planning, reference selection, image prompt construction, manifest roles, media review UI, ad templating, copy/image pairing, and final channel deliverables.

The audit should determine why the current system produces visually safe but often bland campaign imagery, then identify the exact pipeline changes needed to produce vivid, group-driven, theme-specific, cruise-native, ad-worthy media.

---

## Primary Campaign Under Review

`wellness-and-nature-cruise`

Use other available campaign outputs as comparison examples when they expose recurring system behavior, especially hero images, concept images, documentary details, 10-scene outputs, Canva/Templated Ads, and older designed ads.

---

## Operator Visual Thesis

The current media system is producing technically plausible cruise imagery, but not enough campaign-defining imagery.

The desired system should generate images that are:

- group-driven rather than solitary or couple-focused
- deeply expressive of the campaign theme
- visibly anchored in the actual ship reference set
- demographically varied across age and ethnicity
- active, vivid, and socially magnetic
- editorial, artistic, and slightly embellished without becoming dishonest
- varied across time of day, composition, location, and visual treatment
- separated cleanly between source imagery and final ad artifacts

The audit should treat bland correctness as a failure mode.

---

## Non-Negotiable Visual Principles

### 1. Group Action Is The Priority

Most generated campaign imagery should show 4-6 people, and sometimes larger groups up to roughly 10 people, actively participating in a scene tied to the cruise theme.

The system should not default to:

- one person staring out a window
- couples leaning on rails
- quiet table scenes
- passive coffee moments
- generic travel enjoyment

Small quiet scenes can exist, but they should be a minority supporting texture, not the main campaign identity.

### 2. Theme Must Be Visually Legible

Every key image should make the niche visible without requiring caption explanation.

For example, a sky-watching campaign should not merely show people looking upward in bright daylight. It should show a specific, vivid, theme-native scene: dusk or night conditions, visible sky object or atmospheric phenomenon, people gathered with binoculars/telescopes/star charts, ship deck context, and a shared sense of anticipation.

Audit question:

- Would a viewer understand the campaign fantasy from the image alone?

### 3. Ship References Must Be Used More Fully

The current images appear to reuse a narrow part of the ship environment and miss many defining features of the actual vessel.

The audit must inspect whether ship references are:

- available to the generator
- summarized accurately
- selected diversely
- reflected in prompts
- preserved through final image generation
- visible in final assets

The report should identify where ship-reference specificity is lost.

### 4. Avoid Rail/Table Monotony

Rail-overlook scenes, restaurant tables, coffee cups, drinking, eating, and passive window-gazing should be capped.

Working target:

- these quiet/passive scenes should represent about 10% of the generated set, not the majority

The audit should specifically count repeated composition families such as:

- people at rail
- couple at rail
- people seated at table
- coffee/window gaze
- generic deck lounge
- forced theater
- forced nightclub

### 5. Diversity Must Be Designed In

The system currently overproduces similar thirty-something white couples.

Audit all visible assets for:

- age diversity
- ethnic diversity
- body-type diversity
- solo/couple/group balance
- repeated face/person archetypes
- whether prompts explicitly require demographic variety
- whether prompt language accidentally narrows the cast

### 6. Embellishment Is Allowed For Attention

The system may slightly heighten theme activity for ads and campaign hooks, as long as the landing page clarifies that events are potential/community-driven and not guaranteed inclusions.

The audit should distinguish:

- useful promotional embellishment
- dishonest operational promises
- implausible shipboard fantasy
- visually necessary exaggeration that makes the theme legible

The future pipeline should not be so literal that it becomes dull.

### 7. Time Of Day Must Vary

The current outputs are too bright-daylight-heavy.

Audit for coverage across:

- sunrise
- golden hour
- dusk
- blue hour
- night deck scenes
- indoor evening scenes
- moody weather or atmospheric conditions where campaign-appropriate

### 8. Artistic Treatment Matters

The system should produce believable but stylized campaign photography, not plain stock-travel photorealism.

Audit whether prompts and post-processing support:

- film grain
- sepia tones
- black and white variants
- contrast curves
- overlays
- color alterations
- hue shifts
- documentary/editorial framing
- campaign-specific visual treatments

Watercolor or illustration-like outputs should not enter the main hero/source-photo pool unless intentionally assigned to a separate alternate-art section.

---

## Asset Families To Audit

The `/tests/media-generation` page should expose every relevant asset family. If a manifest section exists but the UI does not show it, log that as a review-blocking visibility issue.

Review at minimum:

- References
- Heroes and concepts
- Crops
- Scenes
- 10-scene outputs
- Documentary Details
- Designed Ads
- Canva/Templated Ads
- Video
- Audio
- Merch
- Copy Results
- TikTok Promotion Package

For each family, evaluate whether it should be a source-image pool, final deliverable pool, alternate-art pool, or audit-only artifact.

---

## Specific Scene-Type Findings To Validate

### 10-Scene Outputs

The 10-scene images are currently the strongest baseline because they better express real group activity, darker sky conditions, larger ship atmosphere, and more thought-through campaign moments.

Audit requirement:

- identify what the 10-scene flow does better than heroes/concepts
- determine whether its scene planning should become the baseline for all image generation
- extract reusable rules for group scale, theme specificity, time of day, and ship context

### Theater Scenes

Theater scenes often look forced and should not be automatically included in every campaign.

Audit requirement:

- determine where theater scenes are being inserted
- restrict them to campaigns where theater activity is actually theme-native

### Destination Port Scenes

Destination port scenes are currently low-value because they often become another rail-overlook image and may depict the departure port rather than meaningful destination experience.

Audit requirement:

- determine whether destination-port scenes should be removed from default generation
- only preserve them when the destination itself is campaign-defining and visually specific

### Nightclub Scenes

Nightclub scenes often look forced and should not be a default requirement.

Audit requirement:

- remove nightclub as a generic recurring slot
- include it only when campaign theme, ship, and audience make it believable

### Watercolor / Illustration Outputs

Watercolor-style images should not be selected into the main hero/source-photo pool.

Audit requirement:

- identify where illustration-like images are generated
- separate them into an intentional alternate-art section if they are useful
- block them from main selected photo pools unless explicitly requested

---

## Pipeline Areas To Inspect

The audit report should map failures to pipeline source, not just describe bad images.

Inspect:

1. Discovery and campaign concept language
2. Aesthetic brief generation
3. Research dossier timing and content
4. Production bible scene planning
5. Ship-reference retrieval and summarization
6. Image prompt builder logic
7. Scene taxonomy and required scene slots
8. Documentary/detail prompt rules
9. Hero/concept prompt rules
10. Manifest asset roles and eligibility
11. Source-image selection for ads
12. Canva/Templated Ads image selection
13. Designed-ad artifact handling
14. Media review UI visibility
15. Copy/image pairing
16. Final channel distribution assumptions

For each failure, identify the earliest stage where the issue appears.

---

## Asset Review Buckets

Use these buckets while reviewing visible assets.

### Preserve

Assets, styles, layouts, prompts, or pipeline behaviors that should become part of the future system.

Capture:

- Asset id
- Asset type
- Why it works
- What phase likely produced the useful trait
- Whether it should become a reusable rule, template, scene type, visual treatment, or reference example

### Reject

Assets or behaviors that should not be repeated.

Capture:

- Asset id
- Asset type
- What is wrong
- Whether the issue is visual, conceptual, prompt-related, template-related, source-selection-related, manifest-related, or UI/routing-related
- Whether the bad output came from source image generation, ad selection, copy, template, or final render logic

### Investigate

Assets where the failure source is unclear.

Capture:

- Asset id
- Visible symptom
- Suspected source
- Data needed to confirm
- Whether DynamoDB, manifest, prompt logs, copyset JSON, render request JSON, or generated prompt text should be checked

---

## Required Audit Questions

1. Are ship references present, diverse, and actually visible in final generated assets?
2. Where does the system collapse into one repeated ship/deck/rail visual family?
3. Which prompts or scene slots are causing table, rail, coffee, or passive-window repetition?
4. Which pipeline step suppresses group action?
5. Which asset families best express theme-specific action?
6. Why do heroes and concepts feel weaker than the 10-scene outputs?
7. Are people counts, demographics, and group activity instructions consistent across all prompt layers?
8. Which images are too bland, stock-like, or normal-travel-coded?
9. Which images are acceptably embellished and attention-grabbing?
10. Which images overpromise activities the campaign cannot reasonably support?
11. Where are watercolor/illustration outputs entering selected photo pools?
12. Are final ad artifacts ever reused as source images for other ads?
13. Which documentary/detail images are strong enough to become premium ad source material?
14. Which Canva/Templated formats should be preserved?
15. Which old designed-ad templates deserve preservation or porting?
16. What exact changes are required before this pipeline can reliably produce launch-quality campaign media?

---

## Gold Standards To Preserve Or Study

### Older Designed Ad

The current gold-standard ad remains:

`ad_image_detail_191x100`

It should be reviewed as a reusable design target, not as a source image for another ad.

Reference:

[Gold Standard Ad Reference](../../PHASE_2_MEDIA_GENERATION/CANVA_TEMPLATE_BASED_ADS/TEMPLATED_IO/GOLD_STANDARD_AD_REFERENCE.md)

### 10-Scene Outputs

Treat the strongest 10-scene outputs as a candidate baseline for future generation because they better express group activity, theme articulation, realistic ship atmosphere, and more varied scene construction.

---

## Audit Output Format

Use this format for each asset or pipeline finding:

```text
Finding:
Asset(s) / File(s):
Pipeline Stage:
Bucket: Preserve | Reject | Investigate
What I see:
Why it matters:
Likely source of issue or success:
Evidence needed:
Future rule:
Priority: High | Medium | Low
```

---

## Final Report Requirements

The final audit report should produce:

1. A visual failure taxonomy.
2. A source-of-failure map across the pipeline.
3. A preserve list of assets, scene types, templates, and visual treatments.
4. A reject list of recurring patterns and scene slots.
5. A revised asset taxonomy for source images vs final artifacts.
6. A recommended default scene mix.
7. A recommended people/group-action standard.
8. A recommended time-of-day and demographic diversity standard.
9. A recommended artistic-treatment system.
10. A concrete overhaul plan for the final implementation phase.

---

## Exit Criteria

The audit is ready to inform the rebuild when:

- Strong assets have been identified as reusable visual standards.
- Failed assets have been grouped by failure type.
- The rail/table/passive-window repetition pattern has been traced to source.
- The group-action deficit has been traced to source.
- The theme-blandness problem has been traced to source.
- The ship-reference underuse problem has been traced to source.
- The watercolor/alternate-art issue has a routing rule.
- The `ad in ad` case has been documented with exact asset ids.
- Hidden or missing UI sections have been logged.
- The old premium Google display design has a preservation path.
- The 10-scene output strengths have been translated into reusable pipeline rules.
