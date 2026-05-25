# 02 Workflow Drift Audit Plan

**Purpose:** find every phase where campaign meaning, visual direction, asset eligibility, or ad copy can drift.

The overhaul must audit the full Shadow Campaign Strategy stream. Image prompts are only one layer. Every phase can introduce, dilute, contradict, or over-specify the campaign aesthetic.

## Audit Principle

For each phase, identify:

- What campaign intent enters the phase.
- What the phase adds, rewrites, filters, or discards.
- Which fields become source of truth downstream.
- Which fields are free text and therefore likely to drift.
- Which generated artifacts become eligible for later generation.
- Which validation gates prevent bad drift from moving forward.

## Phase Map

### Phase 1: Discovery

Audit:

- Discovery research prompt language.
- Campaign concept framing.
- Niche/audience assumptions.
- Exclusion of prior campaigns.
- Any early aesthetic or emotional language that later becomes sticky.

Risk:

- Broad discovery language can create a generic campaign personality that later media phases inherit.

### Phase 2: Phase B / Inventory Grounding

Audit:

- Ship, sailing, route, date, price, and availability fields.
- Link validation and live inventory rules.
- Any transformation from real itinerary facts into marketing language.

Risk:

- Media may imply amenities, locations, or experiences not grounded in the selected ship/sailing.

### Phase 3: Brief

Audit:

- Aesthetic brief.
- Landing still bible.
- Production bible.
- Secondary research dossier.
- `nicheResearch` and `cruiseTranslation`.
- Hard gates before media approval.

Risk:

- Briefs may carry conflicting instructions: lifestyle vs documentary, premium vs literal, niche-specific vs vacation-first, itinerary detail vs emotional simplicity.

### Phase 4: Media Generation

Audit:

- Ship image generation.
- Hero generation.
- Scene generation.
- Documentary/detail images.
- Designed ads.
- Canva/Templated Ads.
- TikTok package.
- Audio and voiceover.
- Manifest writing and asset taxonomy.

Risk:

- Source assets and final artifacts can become mixed in the same selection pools.
- Prompt language can include stale cues from previous concepts.
- Generated final ads can accidentally become source images for later ads.

### Phase 4A: Copy Forge / Ad Copy Planning

Audit:

- Copyset generation.
- `imageSlotDirectives`.
- Format-specific page plans.
- Whether Copy Forge asks for new images or only selects existing assets.
- How directives resolve into manifest assets.

Risk:

- Copy may be elegant but select the wrong image family.
- Image directives may be semantically correct but structurally unsafe if the source pool is too broad.

### Phase 4B: Canva/Templated Rendering

Audit:

- Template registry.
- Slot contracts.
- Render-pack construction.
- Page-level render requests.
- Quality gates.
- External render request ids.

Risk:

- Multi-page formats can render incorrectly if page data is not passed per page.
- Templates can accept finished ad artifacts where they should only accept source imagery.

### Phase 5: Publish / Distribution

Audit:

- Distribution asset selection.
- Channel mappings.
- Review state requirements.
- Human approval rules.
- Final manifest reads.

Risk:

- A flawed generated asset can reach distribution if it passes technical validation but violates visual-system intent.

## Cross-Cutting Drift Sources

- Free-text fields copied forward without normalization.
- Asset tags that describe mood but not usage eligibility.
- Reused prompts with stale campaign-specific tokens.
- Broad `still`, `detail`, or `hero` selectors.
- UI sections that hide asset families during review.
- Designed ads stored alongside source imagery without hard type separation.
- External agents using outdated skill docs.

## Required Audit Artifacts

1. **Field lineage map**

   Track where campaign visual language starts and where it is consumed.

2. **Asset eligibility matrix**

   Define which asset types can be used as source images, final ads, review-only references, or distribution deliverables.

3. **Prompt conflict inventory**

   List conflicting instructions and stale language by phase.

4. **Gate map**

   Identify which gates are hard, which are advisory, and which are missing.

5. **Skill/doc delta**

   List where agent instructions differ from the current production path.

## Exit Criteria

The drift audit is complete when every phase has:

- A named source of truth.
- A known handoff contract.
- A list of drift risks.
- A validation or review gate.
- A documented fix path.
