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

### Adopted Approach

- Created `lib/campaigns/media/vision-evaluator.ts`
- Utilizes the centralized `callLLM` gateway method which supports multimodal message payloads with `images` arrays containing base64 data and mime types.

### Model choice

Use `ModelName.CLAUDE_4_SONNET` as the core vision evaluator.

Reason:

- Provides excellent spatial and visual context analysis required for cruise ship feature identification.
- Natively supports high-reliability structured JSON output from complex multimodal prompts.
- Avoids strict token generation limits when outputting categorization arrays.
## Phase 2: Cached Image Evaluation Input

### Problem

External SerpApi result URLs are not a stable evaluation surface. Hosts can block, expire, or serve inconsistent assets.

### Solution

Evaluate downloaded or cached image content, not just third-party URLs.

### Adopted Approach

For each candidate selected for vision evaluation:

- Fetch the image bytes server-side with an explicit timeout.
- Reject immediately if the fetch fails or the content-type is non-image.
- Store the bytes temporarily in memory via `Buffer` and convert to Base64 for the `callLLM` evaluator call.
- Only create permanent asset records after successful evaluation and validation.

Optional later improvement:

- persist a lightweight cached binary or temporary object-store copy before evaluation if repeated vision passes become expensive

## Phase 3: Per-Category Vision Ranking

### Problem

A single global batch ranking lets strong exterior shots crowd out valid category-specific references.

### Solution

Run evaluation in per-category batches.

### Adopted Approach

For each category query:

1. Run the existing cheap text/metadata pre-filter (`scoreReferenceCandidate`).
2. Remove obvious junk with current hard-reject terms (`shouldHardRejectReferenceCandidate`).
3. Limit the pre-filtered candidates to a sensible test batch.
4. Evaluate only the remaining candidates for that category (`applyVisionEvaluationToCategory`).
5. AI filters candidates scoring below `VISION_MIN_AI_SCORE` (30), failed ship match, or wrong category.
6. Rank surviving candidates within that category using a blended score of text selection + AI score.
7. Return top N per category.

This preserves current category semantics while dramatically improving accuracy.

## Phase 4: Controlled Vision Output Schema

### Problem

Freeform AI tags will not reliably influence downstream governance because `image-selection.ts` expects stable tag strings.

### Solution

Use a constrained tag vocabulary and structured outputs.

### Adopted Approach

The evaluator expects a strictly shaped JSON response from the unified LLM payload:

- `aiScore: number` (0-100 threshold filtering via `VISION_MIN_AI_SCORE`)
- `aiReasoning: string`
- `shipMatch: 'exact_ship' | 'same_class' | 'generic_cruise' | 'wrong_ship'` (For `offboard_excursion`, forced to evaluate as `generic_cruise`)
- `categoryFit: 'strong' | 'weak' | 'wrong_category'`
- `disqualifiers: string[]`
- `detectedTags: string[]`
- `antiTags: string[]`

`detectedTags` and `antiTags`/`disqualifiers` are strictly filtered against a valid `Set` to prevent hallucinated tags from poisoning governance records.

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

### Adopted Approach

When building the candidate into an imported asset record (`buildCurationFromCandidateAI`):

- keep top-level metadata for auditability (`selectionScore`, `sourceQuery`, `sourcePageUrl`)
- initialize `AssetRecord.curation` with:
	- `approvalState: 'pending_review'`
	- `globalPriority`: clamped from `candidate.aiScore` (0-100)
    - `contextPriorities: {}`, `approvedContexts: []`, `blockedContexts: []`
	- `suitabilityTags`: strictly filtered `candidate.detectedTags`
	- `antiTags`: strictly filtered union of `candidate.antiTags` and `candidate.disqualifiers`
	- `curatorNotes`: formatted as `"[AI] " + candidate.aiReasoning`
    - `downstreamLocked: false`
    - `updatedAt`: ISO timestamp

Important:

- AI does not auto-set approval—it always initializes to `pending_review`.
- The operator interface consumes these standard governance tags identically to human modifications.

## Phase 6: Integrate With Incremental Reference Iteration

### Problem

The real workflow requirement is not just “pick better references.” It is “reject bad references and then fetch new ones without seeing the same ones again.”

### Solution

Use the new exclusion-aware reference generation path as the base loop.

### Adopted Approach

The `discoverShipReferenceCandidatesWithExclusions` pipeline handles this:

1. Request base Google Images results utilizing the category map.
2. Exclude previously imported image URLs and source context URLs.
3. Reject known bad URLs (e.g. crawler traps like Instagram lookaside).
4. Run the text heuristic ranking.
5. Group by category and pass the top batch to `applyVisionEvaluationToCategory`.
6. Import only the best surviving new candidates after validation filtering.
7. Return those matching the `maxPerCategory` constraint.

This is fundamentally woven into the new revision service architectures.

## Phase 7: Fallback Behavior

### Problem

Vision evaluation introduces a new failure point.

### Solution

Define explicit fallback rules.

### Adopted Approach

Fallback behavior is securely defined via `Promise.allSettled` evaluation boundaries:

If a single candidate fails image fetching or API timeout:
- It returns a rejection, logging the candidate's infrastructure failure but proceeding with the batch.

If ALL candidates in a category fail (e.g., API outage or network down):
- `applyVisionEvaluationToCategory` returns the original heuristic candidate batch (heuristic fallback).

If candidates are evaluated but ALL visually fail (score too low, wrong ship, etc.):
- The evaluator returns an empty array, securely dropping the category instead of falling back to heuristic junk.

## Phase 8: Scope of First Rollout

### Adopted Approach

The vision evaluator is applied to all ship reference categories, not just exterior.

Reason:

- The biggest observed error previously was category mismatch.
- Category mismatch can happen in any class of reference, not just hero exteriors.
- Partial rollout to only exterior would leave the core workflow problem unsolved.

The evaluation remains per-category and strictly throttled with small batches to ensure high quality.

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

- Use `CLAUDE_4_SONNET` for all deep spatial/context vision evaluation tasks.
- Evaluate strictly per category, never globally across mixed sets.
- Apply to all reference categories universally.
- Keep human review operator authoritative: AI only primes pending queues.
- Use explicit, hardened controlled tag vocabularies across the stack.
- Strongly integrate with exclusion-based reference iteration loops.
- Fall back gracefully to heuristics when vision infrastructure is unavailable, dropping only on strict visual mismatch.

## Out Of Scope For First Version

- teaching the system to avoid “similar bad images” by semantic rejection memory
- automatic approval of references without human review
- full gateway-wide multimodal abstraction cleanup
- using AI to rewrite the search query set itself

Those may come later, but they are not required to solve the current operator workflow problem.

