# Image Governance & Context-Aware Selection
### Human-Guided Asset Curation for Downstream Agent Decisions

**Status:** In Progress  
**Branch:** `feature/shadow-groups`  
**Primary Goal:** Stop downstream image usage from being determined by array order or recency. Replace it with human-guided, context-aware, approval-aware selection.

---

## Why This Exists

The media pipeline now produces enough images that simple review state is not enough.

Before this system:

- the approved `CampaignAestheticBrief` gated media generation
- individual image assets could be marked approved or flagged
- downstream consumers still often used the newest image or the first image in a manifest slot
- there was no structured way to say an image is good for one downstream use but bad for another

That created a gap between human judgment and downstream agent behavior.

This system closes that gap by introducing explicit image governance.

---

## Design Objective

The operator should be able to curate image sets down to each individual image.

The system must support:

1. Approving or blocking an image before downstream use
2. Ranking an image globally and by intended usage context
3. Declaring where an image is allowed or not allowed to be used
4. Attaching suitability and anti-pattern tags that influence selection
5. Requiring downstream systems to operate only inside the approved pool when approved assets exist
6. Allowing revision-before-use workflows for weak assets

---

## Core Model

The system now separates three concerns:

### 1. Asset Record
The generated binary and generation metadata.

### 2. Curation Layer
Human intent about whether an asset should be used, where, and with what priority.

### 3. Selection Engine
Deterministic logic that chooses assets for downstream contexts using governance rules.

This means the source of truth is no longer "last image wins." It becomes:

- asset exists
- asset is curated
- asset is context-eligible
- asset is scored for that context
- best eligible asset wins

---

## Implemented Data Model

The schema now includes:

### `ImageContext`

Supported contexts currently include:

- `landing_hero_primary`
- `landing_hero_alt`
- `waitlist_page_hero`
- `email_header`
- `meta_ad_creative`
- `instagram_cover`
- `storyboard_fallback`
- `explainer_backplate`
- `general_moodboard`

### `AssetCuration`

Each asset can now store:

- `approvalState`
- `globalPriority`
- `contextPriorities`
- `approvedContexts`
- `blockedContexts`
- `suitabilityTags`
- `antiTags`
- `downstreamLocked`
- `curatorNotes`

### `MediaGovernancePolicy`

Manifest-level governance supports selection policy such as:

- `approved_only`
- `approved_if_any_else_fallback`
- `priority_only`

Current default:

- `approved_if_any_else_fallback`

---

## Implemented Selection Logic

The new selector lives in:

- `lib/campaigns/media/image-selection.ts`

Selection now works like this:

1. Determine target `ImageContext`
2. Build an eligible pool
3. Exclude blocked, rejected, revision-required, or locked assets according to policy
4. If human-approved assets exist for the target context, restrict the pool to those assets
5. Score remaining assets using approval state, priority, tags, and context fit
6. Return the best asset or ranked subset

### Scoring Inputs

- approval state
- context priority if present
- global priority
- suitability tag matches
- anti-tag penalties

This gives downstream agents structured decision-making rather than vague inference.

---

## Current UI Support

The review card in `/tests/media-generation` now includes a curation surface.

Current controls:

- approval state selector
- global priority
- downstream lock checkbox
- approved context chip toggles
- blocked context chip toggles
- suitability tag chips with quick-add suggestions
- anti-tag chips with quick-add suggestions
- curator notes

The UX direction is intentionally operator-first:

- contexts are selected via chips instead of raw comma strings
- tags are easy to add, inspect, and remove
- secondary operational controls are grouped under `More`
- curation is elevated as a first-class action

---

## Current Downstream Adoption

The new selector is already used in the following places:

### Media Test Page

- preferred hero for `landing_hero_primary`
- preferred concept for `general_moodboard`

### Revision-Aware Regeneration

- storyboard fallback now prefers curated hero assets instead of blindly using `manifest.images.hero[0]`

This is the first phase of adoption. More consumers still need to be migrated.

---

## What Is Not Complete Yet

The foundation is live, but the full system is not complete.

Not yet finished:

1. Full per-context numeric priority editing in the UI
2. A "current winners by context" dashboard in the media review surface
3. Complete migration of all downstream consumers to selector-based reads
4. Manifest-level persisted resolved selections for each context
5. Agent-facing APIs that return ranked candidates plus reasoning for a requested context

---

## Recommended Next Steps

### Phase 1: Context Priority UX

Add per-context priority controls so the operator can say:

- asset A is best for `landing_hero_primary`
- asset B is best for `email_header`
- asset C is allowed but low-priority fallback only

### Phase 2: Winner Visibility

Add a panel showing the currently selected winner per image context, including why it won.

### Phase 3: Full Downstream Enforcement

Replace remaining array-order consumers across image, video, and distribution paths with selector-based resolution.

### Phase 4: Approved-Only Lockdown Mode

Allow campaign-level switching into strict governance mode where downstream systems are forbidden from using unapproved imagery.

---

## Practical Rule Going Forward

If approved assets exist for a context, downstream consumers should work within those approved assets only.

That is the governing principle behind this system.

Everything else is implementation detail.
