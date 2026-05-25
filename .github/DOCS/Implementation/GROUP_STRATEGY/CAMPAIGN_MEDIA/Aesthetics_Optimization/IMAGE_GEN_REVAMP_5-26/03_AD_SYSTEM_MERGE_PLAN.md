# 03 Ad System Merge Plan

**Purpose:** finalize the Canva/Templated Ads path while preserving the one older designed-ad template that reached the desired quality bar.

## Current Situation

There are two ad-generation families in play:

1. **Older designed-ad process**

   This produced deterministic designed ad artifacts, including the gold-standard `Reset by Sea` display ad.

2. **Canva/Templated Ads process**

   This is the newer direction for scalable, template-based channel ads using Copy Forge, template registry definitions, render packs, and external Templated renders.

The strategic direction is to move toward Canva/Templated Ads, but not to throw away the one older design that worked exceptionally well.

## Merge Goal

The final media-generation pipeline should produce:

- Canva/Templated channel ads as the primary ad family.
- A preserved premium Google display ad based on the old `image_detail_ad` layout.
- Clear manifest typing so final ad artifacts cannot be reused as source imagery.
- Review UI sections that let operators inspect both source assets and final ads.
- Agent instructions that describe the new merged path accurately.

## Preserve The Gold-Standard Design

Reference asset:

`ad_image_detail_191x100`

Reference template behavior:

`system_4_modular` -> `image_detail_ad`

Preserve these traits:

- 1.91:1 landscape display canvas.
- Left cinematic image panel.
- Deep dark right-side copy panel.
- Thin vertical accent rule.
- Small campaign badge.
- Uppercase route eyebrow.
- Large minimal headline.
- Compact sensory supporting copy.
- Soft pill CTA.
- Bottom metadata strip.

See:

[Gold Standard Ad Reference](../../PHASE_2_MEDIA_GENERATION/CANVA_TEMPLATE_BASED_ADS/TEMPLATED_IO/GOLD_STANDARD_AD_REFERENCE.md)

## Preferred Future Implementation

Port the premium display design into the Canva/Templated system as a first-class format.

Candidate format names:

- `google_display_premium_landscape`
- `google_display_image_detail`
- `premium_display_landscape`

Recommended slot contract:

```json
{
  "hero_image": "premium cinematic source image, never a final ad artifact",
  "eyebrow": "route or small campaign context",
  "headline": "2-5 word emotional promise",
  "subhead": "one sensory sentence with optional ship/route specificity",
  "cta": "promise-led imperative",
  "vessel": "auto-injected itinerary metadata",
  "departure": "auto-injected itinerary metadata"
}
```

## Transitional Implementation

If the template cannot be ported immediately, keep the older deterministic renderer only for this premium display format.

Rules for transitional coexistence:

- It must output final ad artifacts only.
- Its outputs must not enter source-image pools.
- It should be labeled as preserved legacy premium display, not as the default designed-ad process.
- It should be reviewed in the same final-ad UI family as Canva/Templated ads.

## Main Pipeline Integration

During media generation, the campaign pipeline should eventually run:

1. Source assets
2. Curated source-image eligibility tagging
3. Canva/Templated ad copy planning
4. Canva/Templated render packs
5. Premium Google display format using the preserved design
6. Review UI publication
7. Distribution-ready manifest mapping

The older broad designed-ad process should not run as an independent competing ad system unless explicitly requested.

## `/tests/media-generation` Requirements

The page should make it obvious which artifacts are:

- Source imagery
- Documentary/detail source imagery
- Final Canva/Templated ads
- Final preserved premium display ads
- Legacy designed ads that are retained for reference only

The review UI should not hide documentary/detail sections, because those are likely to be important during the revamp audit.

## Distribution Requirements

Distribution should consume final ads, not source images.

Source-image families should only feed ad generation, not channel distribution, unless the channel explicitly supports raw image posts and the asset is approved for that use.

## Exit Criteria

The ad-system merge is complete when:

- The Canva/Templated path is the default ad path in media generation.
- The gold-standard premium display design exists as a current supported format.
- The old broad designed-ad process is retired, scoped down, or clearly marked transitional.
- Final ad artifacts cannot be selected as source images.
- The media-generation UI shows all relevant source and final-ad families.
- `.github/skills/campaign-generation/SKILL.md` describes the merged process accurately.
