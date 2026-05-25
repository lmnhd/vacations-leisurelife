# 05 Skill Update Plan

**Purpose:** bring `.github/skills/campaign-generation/SKILL.md` and companion docs up to speed with Canva Ads and the merged media-generation path.

The campaign-generation skill is an external-agent contract. If it does not know about Canva Ads, Copy Forge, Templated render packs, the preserved premium display design, or the no-ad-in-ad rule, future agents will keep operating from stale assumptions.

## Current Gap

The skill currently summarizes Phase 4 media as:

`Ships -> heroes -> scenes -> designed ads -> video/audio`

That framing predates the current Canva/Templated Ads path and does not explain:

- Copy Forge
- Canva/Templated copysets
- Template registry
- Render packs
- Page-level render artifacts
- Ad copyset quality gates
- The preserved old premium display template
- The difference between source imagery and final ad artifacts
- The `ad in ad` failure guardrail
- Review UI expectations for Documentary Details and Canva Ads

## Required Skill Updates

### `SKILL.md`

Update Phase 4 summary to something closer to:

`Ships -> heroes -> scenes -> documentary details -> Canva/Templated ads -> preserved premium display ad -> TikTok package/audio`

Add hard rules:

- Canva/Templated Ads are the forward default for generated static ads.
- The older broad designed-ad process is not the default path unless explicitly requested.
- The old `image_detail_ad` design is preserved as a premium Google display reference/template.
- Final ad artifacts must not be selected as source imagery for new ads.
- Documentary/detail assets must be visible during media review because they may feed premium ad source selection.

### `WORKFLOW.md`

Add a Phase 4 subsection for:

- Canva/Templated ad planning
- Copy Forge copyset generation
- Template registry selection
- Render-pack generation
- Quality gate and copy patch scripts
- Page-level render behavior
- Manifest output expectations

Also document where the preserved premium display format runs during media generation.

### `CAMPAIGN_PROCESS_MEMORY.md`

Add an entry for this revamp planning moment:

- Trigger: Wellness and Nature Cruise media audit exposed hidden documentary details, ad-in-ad selection, and one gold-standard legacy ad.
- Operating rule: preserve the premium legacy design but move the default ad path toward Canva/Templated Ads.
- Guardrail: final ads are not source images.
- Refactor implication: audit the full campaign stream, not just image prompts.

### `PIPELINE_ISSUES.md`

Add recurring issue entries for:

- `ad in ad` source-pool contamination.
- Missing UI sections for manifest asset families.
- Multi-page carousel blank renders when render request shape is wrong.
- Stale prompt contamination from upstream instructions.

### `DIRECTIVES.md`

Add guidance for visual revisions:

- If an asset issue should survive regeneration, patch the brief or production bible.
- If a source-image eligibility issue caused a bad ad, patch asset taxonomy/selection rules, not just the rendered ad.
- If a final ad artifact was used as source imagery, treat it as a pipeline bug, not a one-off creative revision.

## Agent-Safe Scripts To Mention

The skill already mentions:

```powershell
npx tsx scripts/agent/ad-copyset-patch.ts <input-json> <output-json> <format> <page-index> <field> <value...>
npx tsx scripts/agent/ad-copyset-recheck.ts <slug> <copyset-json> [format...]
```

Keep these, but clarify they are for deterministic Canva/Templated copyset repair and quality-gate rechecks, not full media regeneration.

## External-Agent Operating Rules

Future agents should follow these rules:

1. Do not assume the old designed-ad system is the default static ad path.
2. Do not delete or ignore the old premium display design; preserve or port it.
3. Do not use a final ad artifact as a source image.
4. Do not proceed with media generation if the required secondary research dossier is missing.
5. Do not treat hidden UI sections as harmless; hidden sections block audit quality.
6. Use Copy Forge and Templated/Canva docs before editing ad copysets.
7. Use the gold-standard reference as a quality target, not as an image source.

## Suggested Update Order

1. Update `CAMPAIGN_PROCESS_MEMORY.md` with the revamp planning entry.
2. Update `SKILL.md` Phase 4 wording and hard rules.
3. Update `WORKFLOW.md` with Canva/Templated media steps.
4. Update `PIPELINE_ISSUES.md` with known failures.
5. Update `DIRECTIVES.md` with durable visual-revision guidance.
6. Cross-link this revamp directory from the skill docs.

## Exit Criteria

The skill is current when an external agent can correctly answer:

- What is Canva/Templated Ads?
- What does Copy Forge produce?
- Does Copy Forge generate new images?
- Which assets can be source images?
- Why are final designed ads blocked from source-image slots?
- What old design must be preserved?
- Where should campaign media be reviewed?
- What should an agent do if the UI hides a manifest section?
