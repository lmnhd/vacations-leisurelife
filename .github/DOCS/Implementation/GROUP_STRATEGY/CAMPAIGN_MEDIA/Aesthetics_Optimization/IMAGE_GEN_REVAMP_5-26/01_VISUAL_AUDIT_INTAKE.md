# 01 Visual Audit Intake

**Purpose:** capture the operator's visual review before the system is rewritten.

This audit should happen before the major image-generation and prompt-system rebuild. The goal is to preserve what works, identify what failed, and separate taste-level issues from structural pipeline issues.

## Campaign Under Review

`wellness-and-nature-cruise`

## Required UI Sections To Review

The `/tests/media-generation` page should expose every relevant asset family. During review, confirm these sections are present and populated when the campaign manifest contains matching assets:

- References
- Heroes and concepts
- Crops
- Scenes
- Documentary Details
- Designed Ads
- Canva/Templated Ads
- Video
- Audio
- Merch
- Copy Results
- TikTok Promotion Package

If a manifest section exists but the UI does not show it, log it as a review-blocking visibility issue.

## Asset Review Buckets

Use these buckets while reviewing each visible asset.

### Preserve

Assets, styles, layouts, or copy treatments that should become part of the future system.

Capture:

- Asset id
- Asset type
- Why it works
- What phase likely produced the useful trait
- Whether it should become a reusable rule, template, or reference example

### Reject

Assets that should not be repeated.

Capture:

- Asset id
- Asset type
- What is wrong
- Whether the issue is visual, conceptual, prompt-related, template-related, source-selection-related, or UI/routing-related
- Whether the bad output came from the source image, the copy, the ad template, or the asset selection layer

### Investigate

Assets where the failure source is unclear.

Capture:

- Asset id
- Visible symptom
- Suspected source
- Data needed to confirm
- Whether DynamoDB, manifest, prompt logs, copyset JSON, or render request JSON should be checked

## Known Immediate Review Questions

1. Which documentary/detail images are visually strong enough to become premium ad source material?
2. Which images feel cruise-native versus generic wellness imagery?
3. Which images are too object-forward, too staged, too literal, or too brochure-like?
4. Which assets have useful composition traits such as negative space, quiet human presence, premium materials, and horizon light?
5. Which final ads should be considered channel deliverables only and never source images?
6. Which Canva/Templated formats are already close enough to keep?
7. Which old designed-ad templates deserve preservation or porting?

## Gold Standard To Preserve

The current gold-standard ad is the older designed ad:

`ad_image_detail_191x100`

It should be reviewed as a reusable design target, not as a source image for another ad.

Reference:

[Gold Standard Ad Reference](../../PHASE_2_MEDIA_GENERATION/CANVA_TEMPLATE_BASED_ADS/TEMPLATED_IO/GOLD_STANDARD_AD_REFERENCE.md)

## Audit Output Format

Use this simple format for each note:

```text
Asset:
Type:
Bucket: Preserve | Reject | Investigate
What I see:
Why it matters:
Likely source of issue or success:
Future rule:
```

## Exit Criteria

The visual audit is ready to inform the rebuild when:

- Strong assets have been identified as reusable visual standards.
- Failed assets have been grouped by failure type.
- The `ad in ad` case has been documented with the exact asset ids involved.
- Hidden or missing UI sections have been logged or fixed.
- The old premium Google display design has a clear preservation path.
