# 04 Failure Cases And Guardrails

**Purpose:** keep concrete failures visible while redesigning the system.

These examples should be treated as evidence. They are not just bugs; they reveal missing contracts in the pipeline.

## Failure Case 1: Ad In Ad

### Symptom

A finished designed ad appeared as the image inside a generated carousel ad.

The screenshot showed a Google-style designed ad being used as a source image on Page 2 of a square carousel format.

### Why It Matters

This creates a nested ad artifact: an ad inside another ad. It looks broken, confuses the creative hierarchy, and proves that the image-selection system is not distinguishing between source ingredients and final channel deliverables.

### Likely Cause

The source pool for an ad image slot was broad enough to include a `designed_ad_artifact`.

The system treated "visually usable image" and "source image eligible for templating" as the same thing.

### Guardrail

`designed_ad_artifact` must be excluded from all source-image slots by default.

Allowed usage:

- Final channel deliverable
- Review reference
- Gold-standard reference
- Explicit mockup/nested-ad workflow only

Disallowed usage:

- `hero_image`
- carousel card background
- detail image source
- scene source
- documentary/detail source
- any default Canva/Templated source slot

## Failure Case 2: Hidden Documentary Details

### Symptom

The media-generation UI did not expose a clear `Documentary Details` section even though documentary/detail assets existed in the manifest.

### Why It Matters

If operators cannot see an asset family, they cannot audit it, approve it, reject it, or diagnose why downstream ads selected it.

### Guardrail

Every manifest asset family that can influence downstream generation must have a visible review surface.

Minimum visible families:

- Source references
- Heroes
- Crops
- Scenes
- Documentary details
- Designed ads
- Canva/Templated ads
- Video
- Audio
- Merch
- Copy
- TikTok package

## Failure Case 3: Stale Prompt Contamination

### Symptom

An otherwise excellent wellness/cruise source image carried stale music-like prompt cues from another concept.

### Why It Matters

The final image can still look good, which makes the contamination harder to catch. But stale instructions reduce reliability and can produce confusing artifacts in future campaigns.

### Guardrail

Prompt construction must separate:

- Campaign-specific niche cues
- Cruise-native visual grammar
- Reusable aesthetic rules
- Forbidden stale terms
- Asset-specific composition requirements

Prompt lineage should be auditable from brief to production bible to final generated asset.

## Failure Case 4: Copy/Image Semantic Match Without Structural Safety

### Symptom

Copy can correctly ask for a still, detail, or quiet source image, but the resolver can still choose the wrong structural asset type.

### Why It Matters

Copy Forge may be doing its job while the asset resolver violates the intended media contract.

### Guardrail

Image directives should resolve through an asset eligibility matrix, not just semantic tags.

Example matrix:

| Asset type | Source image slot | Final ad slot | Review reference | Distribution |
| --- | --- | --- | --- | --- |
| `scene_image` | yes, if approved | no | yes | maybe |
| `documentary_detail_image` | yes, if premium-source approved | no | yes | maybe |
| `designed_ad_artifact` | no | yes | yes | yes |
| `templated_ad_artifact` | no | yes | yes | yes |
| `tiktok_seed_video` | no | yes | yes | yes |

## Failure Case 5: Multi-Page Render Shape Mismatch

### Symptom

A multi-page carousel request rendered Page 1 correctly while later pages were blank.

### Why It Matters

The render request shape must match the external renderer's expected contract. A technically completed render can still be creatively empty.

### Guardrail

Each carousel page should produce its own page-level render request unless the renderer has a proven multi-page contract for that template.

Each page artifact should retain the exact render request used to generate it.

## System-Level Guardrails

1. Final ad artifacts are never source images by default.
2. Asset eligibility is explicit and typed, not inferred from vibes.
3. UI must expose every asset family that can affect downstream output.
4. Prompt lineage must be auditable.
5. Copy Forge selects and describes, but it should not bypass asset-type rules.
6. Canva/Templated formats must define strict slot contracts.
7. Gold-standard legacy designs should be ported or scoped, not left as broad competing systems.
8. Human visual audit remains a first-class gate during the revamp.
