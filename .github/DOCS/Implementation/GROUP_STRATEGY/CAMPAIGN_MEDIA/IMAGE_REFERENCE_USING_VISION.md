# Image Reference Using Vision

## Goal

Replace brittle text-first ship reference selection with a vision-assisted reference curation pipeline that can:

- judge whether an image actually depicts the intended ship or a plausible same-class analogue
- judge whether the image matches the requested reference category
- initialize governance-friendly curation metadata for downstream image selection
- support iterative reference discovery so operators can reject bad references and fetch new ones without recycling the same assets

This plan is intentionally narrower and more implementation-realistic than the original draft. It is designed to fit the current codebase and fix the actual operator workflow problems that surfaced in testing.

## What Problem We Are Actually Solving

The current ship reference pipeline has three distinct weaknesses:

1. Text metadata can falsely classify an image as a strong match even when the visual content is wrong.
Example: a stateroom image can be scored as an exact-ship destination-view reference because the page metadata contains the correct ship name.

2. Reference generation only recently gained incremental iteration behavior.
Operators need to reject bad references and request additional ones without resurfacing the same URLs or source pages.

3. The downstream governance system scores assets using curation tags, but the reference import path does not yet initialize those tags intelligently.

The solution is not just “add AI.” The solution is to add vision scoring at the correct place in the pipeline, preserve existing human review controls, and write outputs into the curation fields the rest of the media stack already uses.

## Current Code Reality

### Already in place

- `ShipReferenceCandidate` already supports:
	- `aiScore`
	- `aiReasoning`
	- `detectedTags`
	- `antiTags`

- Asset governance already scores against:
	- `curation.suitabilityTags`
	- `curation.antiTags`
	- `curation.approvalState`

- Ship reference generation now supports exclusion-based iteration of previously imported image URLs and source pages.

### Not yet in place

- The current LLM gateway and `callGlobalGenerateObject(...)` path are text-only. They do not yet support multimodal image inputs.
- The current reference import path stores external search result URLs as asset records, but does not guarantee a cached local copy for vision evaluation.
- The current heuristic filter is category-blind at the visual level.

## Non-Negotiable Design Constraints

1. Vision scoring must happen per category, not across mixed categories.
We are not trying to find “the best image overall.” We are trying to find the best image for `exterior`, `destination_view`, `dining`, `atrium`, `pool_deck`, or `stateroom` independently.

2. Vision scoring must not replace human approval.
The model may propose score, reasoning, and curation tags, but operator review remains authoritative.

3. Rejected references must stay excluded on subsequent runs.
The system must append fresh candidates rather than recycle the same already-imported bad references.

4. Downstream selection must consume structured curation fields, not ad hoc model output strings.

5. Vision evaluation failure must degrade gracefully.
If the vision step fails, the system should fall back to current heuristics and still allow iterative operator review.

## Revised Architecture

## Phase 1: Multimodal Evaluation Adapter

### Problem

The original plan assumed we could simply pass image URLs through the current LLM gateway. That is not true today.

### Solution

Add a dedicated vision evaluation module that is allowed to use a provider path capable of image input.

### Recommendation

- Create `lib/campaigns/media/vision-evaluator.ts`
- Do not force this through the current text-only `callGlobalGenerateObject(...)` abstraction immediately
- Either:
	- extend the gateway to support multimodal message payloads, or
	- implement a narrowly scoped OpenAI vision caller inside the evaluator and later unify it behind the gateway

### Model choice

Use `ModelName.GPT_5_HIGH` as the first implementation target.

Reason:

- already present in the model registry
- aligns with current OpenAI-centered structured output paths
- avoids introducing a second simultaneous architecture problem while solving vision evaluation

Do not add a new task mapping until the vision payload shape is finalized.

## Phase 2: Cached Image Evaluation Input

### Problem

External SerpApi result URLs are not a stable evaluation surface. Hosts can block, expire, or serve inconsistent assets.

### Solution

Evaluate downloaded or cached image content, not just third-party URLs.

### Recommendation

For each candidate selected for vision evaluation:

- fetch the image bytes server-side
- reject immediately if fetch fails or content-type is invalid
- store the bytes temporarily in memory for the evaluator call
- only create permanent asset records after evaluation and import

Optional later improvement:

- persist a lightweight cached binary or temporary object-store copy before evaluation if repeated vision passes become expensive

## Phase 3: Per-Category Vision Ranking

### Problem

A single global batch ranking lets strong exterior shots crowd out valid category-specific references.

### Solution

Run evaluation in per-category batches.

### Recommendation

For each category query:

1. Run the existing cheap text/metadata pre-filter.
2. Remove obvious junk with current hard rejects.
3. Evaluate only the remaining candidates for that category.
4. Rank within that category only.
5. Return top N per category.

This preserves current category semantics while improving accuracy.

## Phase 4: Controlled Vision Output Schema

### Problem

Freeform AI tags will not reliably influence downstream governance because `image-selection.ts` expects stable tag strings.

### Solution

Use a constrained tag vocabulary and structured outputs.

### Recommendation

The evaluator should return:

- `aiScore: number`
- `aiReasoning: string`
- `shipMatch: 'exact_ship' | 'same_class' | 'generic_cruise' | 'wrong_ship'`
- `categoryFit: 'strong' | 'weak' | 'wrong_category'`
- `disqualifiers: string[]`
- `detectedTags: string[]`
- `antiTags: string[]`

`detectedTags` and `antiTags` must come from a controlled vocabulary, not arbitrary prose.

### Initial controlled suitability vocabulary

- `ship-identity`
- `ocean-forward`
- `travel-first`
- `headline-safe`
- `wide`
- `clean`
- `minimal`
- `quiet`
- `cinematic`
- `contextual`
- `guest-accessible`
- `public-space`
- `interior`
- `exterior`
- `promenade`
- `atrium`
- `dining`
- `stateroom`

### Initial controlled anti-tag vocabulary

- `wrong-category`
- `wrong-ship`
- `generic-cruise`
- `cgi-or-render`
- `blurry`
- `text-overlay`
- `busy`
- `crowded`
- `interior-heavy`
- `hotel-like`
- `non-public-space`
- `workshop-like`
- `literal-activity`

## Phase 5: Write Into Governance Fields, Not Just Candidate Fields

### Problem

Adding AI fields to `ShipReferenceCandidate` alone does not influence downstream selection.

### Solution

On import, map vision output into `AssetRecord.curation`.

### Recommendation

When building the imported asset record:

- keep top-level metadata for auditability:
	- `selectionScore`
	- `sourceQuery`
	- `sourcePageUrl`
- initialize `curation` with:
	- `approvalState: 'pending_review'`
	- `globalPriority`: derived from `aiScore`
	- `suitabilityTags`: normalized `detectedTags`
	- `antiTags`: normalized `antiTags`
	- `curatorNotes`: AI reasoning + category/ship assessment summary

Important:

- AI must not auto-set `human_approved`
- AI may optionally mark obviously bad assets as `revision_required` in a later phase, but the first implementation should leave approval state pending and let the operator decide

## Phase 6: Integrate With Incremental Reference Iteration

### Problem

The real workflow requirement is not just “pick better references.” It is “reject bad references and then fetch new ones without seeing the same ones again.”

### Solution

Use the new exclusion-aware reference generation path as the base loop.

### Recommendation

The generation pipeline should:

1. Read existing manifest ship-reference assets.
2. Exclude previously imported image URLs and source pages.
3. Search for fresh candidates.
4. Run text pre-filter.
5. Run vision evaluation on remaining candidates.
6. Import only the best new candidates.
7. Append them with new asset IDs.

This must remain compatible with the current iteration logic already added to `media-orchestrator.ts` and `ship-reference-service.ts`.

## Phase 7: Fallback Behavior

### Problem

Vision evaluation introduces a new failure point.

### Solution

Define explicit fallback rules.

### Recommendation

If vision evaluation fails for a category:

- log the failure clearly
- fall back to the current text/heuristic ranking for that category only
- continue other categories

If all categories fail at the vision step but heuristic candidates exist:

- return heuristic candidates marked with no AI curation augmentation

If neither vision nor heuristic filtering produces candidates:

- fail the reference generation job with the current explicit error

This keeps the system resilient while improving quality when the evaluator is available.

## Phase 8: Scope of First Rollout

### Recommendation

Apply the vision evaluator to all ship reference categories, not just exterior.

Reason:

- the biggest observed error was category mismatch
- category mismatch can happen in any class of reference, not just hero exteriors
- partial rollout to only exterior leaves the core workflow problem unsolved

However, evaluation should remain per-category and with small batches to control cost.

## Phase 9: Testing and Verification

### Automated checks

Add tests for:

- category mismatch rejection
- mapping AI output into `AssetRecord.curation`
- fallback to heuristic mode when vision fails
- incremental reference generation excluding previously imported URLs/pages
- appending new ship reference asset IDs rather than overwriting old ones

### Manual verification

1. Open `/tests/media-generation`
2. Load a matched cruise campaign
3. Run `References`
4. Reject category-wrong references
5. Run `References` again
6. Confirm:
	 - new assets are appended
	 - previously imported/rejected URLs do not resurface
	 - curation tags appear on imported assets
	 - category fit is visibly improved

### Success criteria

- A stateroom image cannot survive as a `destination_view` reference merely because metadata says the correct ship name
- Operators can reject bad references and get fresh ones without repetition
- Downstream image selection can benefit from initialized curation tags

## Files To Change

### Required

- `lib/campaigns/media/vision-evaluator.ts`
- `lib/campaigns/media/ship-reference-service.ts`
- `lib/campaigns/media/media-orchestrator.ts`

### Likely required

- `lib/campaigns/schema.ts`
	- verify current fields are sufficient
	- do not duplicate already-added AI fields on `ShipReferenceCandidate`
- `lib/campaigns/media/image-selection.ts`
	- only if tag vocabulary or priority weighting needs adjustment

### Potentially required

- `lib/chat/llm-call.ts`
- `lib/ai/llm-gateway/gateway.ts`
- provider-specific gateway files

Only if the team decides to make multimodal vision evaluation a first-class gateway capability instead of a specialized media-layer caller.

## Explicit Decisions

- Use `GPT_5_HIGH` first
- Evaluate per category, not globally
- Apply to all reference categories
- Keep human review authoritative
- Use controlled tag vocabularies
- Integrate with exclusion-based iteration
- Fall back to heuristics if vision fails

## Out Of Scope For First Version

- teaching the system to avoid “similar bad images” by semantic rejection memory
- automatic approval of references without human review
- full gateway-wide multimodal abstraction cleanup
- using AI to rewrite the search query set itself

Those may come later, but they are not required to solve the current operator workflow problem.

