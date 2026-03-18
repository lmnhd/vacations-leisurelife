# Aesthetic Pipeline V3 - Trinity Migration

## Kernel-First Rule

Before any Trinity agent orchestration exists, define the deterministic kernel contract.

The kernel is the immutable law that both legacy V2 and Trinity must satisfy.

It does not rewrite copy.
It does not auto-fix artifacts.
It only asserts preconditions and postconditions.

```ts
interface DeterministicKernel {
	validateCampaignContext(campaign: Campaign): void;
	assertBriefValidity(brief: CampaignAestheticBrief): void;
	assertProductionBibleFeasibility(bible: ProductionBible): void;
}
```

Kernel violations must throw immediately. They are contract failures, not prompts for patch generation.

### Kernel Responsibilities

Preconditions:

- campaign has required identity and routing context
- ship and destination inputs are structurally usable
- downstream generation is not invoked on malformed campaign state

Postconditions:

- brief matches `CampaignAestheticBriefSchema`
- production bible matches `ProductionBibleSchema`
- no impossible camera moves
- no interior-window cabin contradictions
- no gangway exchange choreography
- storyboard durations align exactly
- safety-ops language exists where required

### Kernel Non-Responsibilities

- slogan taste
- creative distinctiveness
- community warmth
- visual poetry
- nuanced cross-artifact philosophy review

Those belong to the Trinity agents, especially Reviewer.

---

## Trinity Objective

Replace the current review -> rewrite -> re-review loop with a role-separated, consensus-oriented agent pipeline.

The steady-state path becomes:

1. Kernel validates campaign context.
2. Designer produces creative direction on the canonical brief.
3. Builder turns that brief into production-realistic artifacts.
4. Reviewer approves or rejects against philosophy and consistency.
5. Kernel asserts final structural validity.
6. Persist only on consensus.

## Why V2 Is Still Transitional

V2 improved the current system, but it remains transitional because it still centers repair after generation:

- typed issue ledgers
- remediation plans
- targeted patch engine
- deterministic fix batches
- revalidation orchestration

That is materially better than repeated rewrite loops, but it is still a repair architecture.

Trinity is the intended simplification:

- Designer owns creative identity.
- Builder owns production feasibility.
- Reviewer owns coherence and approval.
- Kernel owns hard guarantees.

The operator should not be trapped in repeated prose deadlocks, stale deterministic suggestions, or post-hoc fixes for artifacts that should have been structurally correct before review.

---

## Why V1 Loops

The current system is not actually one closed loop. It is three partially connected systems:

1. Red team finds issues in prose.
2. Revision rewrites large parts of the brief.
3. Deterministic fixers mutate selected fields after deadlock.

This causes repeated churn for four reasons:

### 1. Findings are prose-first, not closure-first

Current red-team output is good for humans, but not precise enough for automated closure. A finding such as "remove crane/dolly moves" does not specify:

- owning artifact
- exact target paths
- whether the source of truth is brief copy, storyboard, sceneLibrary, or globalDirectionNotes
- whether the right action is patch, regenerate, or invalidate

### 2. Revision uses whole-object rewrite when the problem is field-level repair

Current revision rewrites the brief, but preserves productionBible and landingStillBible outside the revision payload. That means red team can continue seeing blockers in downstream artifacts the reviser is structurally unable to fix in the same pass.

### 3. Deterministic fixes are inferred late instead of planned early

Deterministic fix suggestions are currently surfaced mainly after deadlock. That is too late. V2 should identify deterministic issues on the first validation pass and apply them as part of the standard remediation stage, not as operator rescue.

### 4. Validation is holistic too often and localized too rarely

The system repeatedly re-runs broad judgment passes instead of running targeted closure checks against touched artifacts first.

---

## Trinity Design Principle

The brief remains the law.

Each agent may only modify the same canonical `CampaignAestheticBrief` object, in sequence, under explicit role boundaries.

The loop is:

designer -> builder -> reviewer -> approve or reject -> loop

The kernel sits outside this loop and rejects structurally invalid inputs or outputs.

---

## Trinity Core Concepts

### 1. Single Source of Truth

Do not split canonical truth across revision payloads, scene-library sidecars, or patch deltas.

Canonical artifact:

```ts
CampaignAestheticBrief
```

The Designer, Builder, and Reviewer all receive and return that same object shape.

### 2. Trinity Session

```ts
interface TrinitySession {
	sessionId: string;
	campaignId: string;
	round: number;
	maxRounds: number;
	consensus: boolean;
	status: 'running' | 'approved' | 'rejected' | 'max_rounds_exhausted';
	brief: CampaignAestheticBrief;
	history: AgentTurn[];
	startedAt: string;
	updatedAt: string;
}

interface AgentTurn {
	agent: 'designer' | 'builder' | 'reviewer';
	round: number;
	brief: CampaignAestheticBrief;
	feedback: string[];
	approved: boolean;
	createdAt: string;
}
```

### 3. Agent Roles

Designer:

- messaging
- visual identity
- community expression
- merch concept direction

Builder:

- production bible
- landing still bible
- filmability
- motion realism
- ship-true scene construction

Reviewer:

- philosophy adherence
- cross-artifact coherence
- diversity and anti-stereotype review
- slogan sharpness
- final approval or rejection

### 4. Rejection Semantics

Reviewer rejection must be explicit and structured.

It should state:

- what failed
- why it failed
- which role should fix it next
- whether the failure is philosophical, structural, or consistency-related

### 5. Persistence Rule

Do not persist as final until:

1. Reviewer approves.
2. Deterministic kernel assertions pass.

Persist intermediate Trinity sessions separately from approved briefs.

---

## Migration Order

0. Define the deterministic kernel contract first.
1. Scaffold Trinity types and session state.
2. Implement Designer, Builder, Reviewer prompts as isolated modules.
3. Add Trinity orchestrator loop controller.
4. Add session-store persistence for resumability.
5. Expose new route: `POST /api/groups/campaign/[slug]/media/aesthetic/trinity`.
6. Run side-by-side with legacy V2.
7. Cut over only when Trinity reaches parity on real campaigns.

---

## What Survives From V2

Keep:

- `CampaignAestheticBriefSchema`
- `ProductionBibleSchema`
- campaign-store persistence patterns
- thin deterministic assertions for hard guarantees

Retire or reduce over time:

- large repair-first remediation plans
- broad issue-ledger dependency for normal happy path
- most deterministic fixers as routine workflow steps
- whole-object post-hoc refinement as primary convergence strategy

---

## Immediate Deliverables

This migration starts with:

1. deterministic kernel contract
2. Trinity session types
3. orchestrator skeleton
4. session-store contract

No legacy route replacement happens until those exist.

---

## Target End State

After the first generation round, every blocker should exist as a typed issue record with:

- stable issue code
- severity
- human summary
- owning artifact
- exact target paths
- fix mode
- closure test
- invalidation consequences
- whether it can be auto-applied

This turns the flow into:

generate -> validate -> classify -> fix -> verify -> final red team -> approve

instead of:

generate -> review -> rewrite -> review -> deadlock -> patch -> review -> regenerate -> review

---

## New Core Concepts

### 1. Unified Issue Ledger

Add a stored issue ledger to the aesthetic brief state.

Suggested shape:

```ts
type RemediationMode = 'deterministic' | 'llm_patch' | 'regenerate' | 'manual';

type OwningArtifact =
	| 'brief'
	| 'production_bible'
	| 'landing_still_bible'
	| 'production_build_lint'
	| 'cross_artifact';

interface AestheticIssueRecord {
	issueId: string;
	issueCode: AestheticIssueCode | 'custom';
	severity: 'warning' | 'blocker';
	title: string;
	summary: string;
	evidence: string[];
	owningArtifact: OwningArtifact;
	targetPaths: string[];
	remediationMode: RemediationMode;
	closureChecks: string[];
	invalidates: {
		redTeamReview: boolean;
		productionBible: boolean;
		landingStillBible: boolean;
		productionBuildLint: boolean;
	};
	status: 'open' | 'applied' | 'verified' | 'failed' | 'waived';
	resolver?: {
		kind: 'deterministic' | 'llm_patch' | 'regenerate' | 'manual';
		reference: string;
	};
}
```

Store this on the brief as something like:

```ts
issueLedger?: AestheticIssueRecord[]
```

### 2. Remediation Plan

Add a derived remediation plan that groups open issues into one execution batch.

```ts
interface AestheticRemediationPlan {
	createdAt: string;
	sourceReviewId: string;
	deterministicIssueIds: string[];
	llmPatchIssueIds: string[];
	regenerationSteps: Array<'productionBible' | 'landingStillBible' | 'productionBuildLint'>;
	manualEscalations: string[];
}
```

The operator sees one plan, not fragmented findings.

### 3. Targeted LLM Patch Requests

Replace whole-brief revision as the default remediation primitive.

New patch requests must specify:

- issue IDs to address
- exact fields allowed to change
- preserved sibling fields
- artifact ownership
- forbidden drift zones
- explicit closure conditions

Example:

```ts
interface AestheticPatchRequest {
	issueIds: string[];
	artifact: 'brief' | 'production_bible' | 'landing_still_bible';
	allowedPaths: string[];
	closureChecks: string[];
	instructions: string[];
}
```

The model returns a patch object for allowed paths only, not a full replacement brief.

---

## Proposed Pipeline

### Phase 1 - Initial Generation

Keep the existing first-pass aesthetic generation and downstream artifact generation, but mark outputs with a generation bundle id so later validators and fixers all reference the same snapshot.

Output:

- brief
- productionBible
- landingStillBible
- productionBuildLint
- generationBundleId

### Phase 2 - Unified Validation

Replace the current loosely connected review outputs with one orchestrated validation pass that produces:

- human-readable red-team summary
- typed issue ledger
- remediation plan

Validators contributing to the ledger:

1. deterministic validators
2. production-build lint
3. red-team judgment pass
4. schema integrity checks
5. cross-artifact consistency checks

Important: red team should no longer be responsible for inventing all fix mechanics. It should identify issues, classify severity, and attach evidence. The orchestration layer maps those issues into remediation modes.

### Phase 3 - Remediation

Run remediation in this order:

1. deterministic fix batch
2. targeted LLM patch batch
3. regeneration batch for invalidated downstream artifacts

Rules:

- deterministic should run first because it is cheapest and most reliable
- targeted LLM patch should operate only on allowed fields
- regeneration happens only if earlier steps invalidated downstream artifacts
- all steps append machine-readable history

### Phase 4 - Closure Verification

Run closure checks only for touched issue records first.

Examples:

- banned phrase no longer present
- storyboard duration sums equal declared duration
- all rail scenes contain safety phrasing
- no prohibited camera-move tokens remain in sceneLibrary or storyboards

Only after local closure passes do we run final holistic red team.

### Phase 5 - Final Gate

Final red team should be single-pass and binary in intent:

- either approve
- or emit net-new blockers not covered by closed issue IDs

It should not reopen already verified issues unless new evidence exists.

---

## File-Level Implementation Plan

### 1. Schema Layer

Update [lib/campaigns/schema.ts](lib/campaigns/schema.ts)

Add:

- `AestheticIssueRecordSchema`
- `AestheticRemediationPlanSchema`
- `AestheticPatchRequestSchema`
- `AestheticPatchResultSchema`
- `issueLedger?: AestheticIssueRecord[]`
- `activeRemediationPlan?: AestheticRemediationPlan`

Extend current issue codes where needed, but keep deterministic issue codes separate from red-team-only semantic issue IDs when exact mapping does not exist.

**Implementation Constraint (OpenAI Structured Output):**
When mapping `AestheticIssueRecordSchema` or generation schemas to LLM structured output, do not use Zod `.default()` values. Keep fields as required primitives or exact enums to guarantee consistent JSON schema conversion, and handle any desired defaults during runtime normalization.

### 2. Validation Orchestrator

Add new module:

- [lib/campaigns/aesthetic-validation-orchestrator.ts](lib/campaigns/aesthetic-validation-orchestrator.ts)

Responsibilities:

- run deterministic validators
- run production-build lint collectors
- run red team
- merge findings into typed issue ledger
- derive remediation plan
- deduplicate overlapping issues across artifacts

### 3. Red Team Refactor

Refactor [lib/campaigns/aesthetic-red-team.ts](lib/campaigns/aesthetic-red-team.ts)

Keep the narrative summary and approval recommendation, but add a stricter issue contract:

- title
- evidence array
- severity
- candidate issue code if known
- owning artifact if inferable
- suggested remediation mode if inferable

Red team should stop being the only source of remediation semantics.

### 4. LLM Patch Engine

Add new module:

- [lib/campaigns/aesthetic-patch-engine.ts](lib/campaigns/aesthetic-patch-engine.ts)

Responsibilities:

- accept typed patch request
- expose only allowed fields to the model
- require patch output, not full object regeneration
- validate output against target artifact schema
- compute exact touched paths

**Implementation Constraint (LLM Path Sandboxing):**
To prevent deep path hallucination, the engine must derive a request-scoped finite path enum from `ALLOWED_OPERATION_PATHS` (from `registry.ts`) based on the active artifact and issue set. The structured output schema must force the LLM to select only from that narrowed enum subset rather than inventing arbitrary dot-notation or touching unrelated sibling fields.

This replaces `reviseAestheticBrief` as the default repair engine.

### 5. Revision Route Replacement

Refactor or replace [app/api/groups/campaign/[slug]/media/aesthetic/revise/route.ts](app/api/groups/campaign/[slug]/media/aesthetic/revise/route.ts)

New route behavior:

- `POST /revise` becomes `POST /remediate` or becomes a thin wrapper over remediation orchestration
- response returns remediation plan execution summary, not just another rewritten brief
- deadlock means "unresolved issue IDs remain after all allowed fix modes ran", not "the LLM rewrote twice and still failed"

### 6. Deterministic Fix Layer

Keep [lib/campaigns/aesthetic-modification.ts](lib/campaigns/aesthetic-modification.ts) and the existing fixers, but move them earlier in the lifecycle.

Change the role of deterministic fixers from:

- operator rescue after deadlock

to:

- standard first-stage remediation applied automatically whenever the issue ledger marks an issue as deterministic and auto-applicable

### 7. Cross-Artifact Consistency Checks

Add new module:

- [lib/campaigns/aesthetic-consistency.ts](lib/campaigns/aesthetic-consistency.ts)

Responsibilities:

- ensure source-of-truth alignment between brief, productionBible, storyboards, and sceneLibrary
- emit issues when one artifact was repaired but sibling artifacts still retain banned content
- act as a hard deterministic gatekeeper (e.g., mathematically verifying durations match between `videoConcepts` and `storyboards`), turning subjective review failures into deterministic validator failures backed by focused automated tests.

This directly targets the failure class we saw with storyboard cleanup while sceneLibrary still contained the blocker.

### 8. Test UI

Update [app/(tests)/tests/aesthetic-devising/page.tsx](app/(tests)/tests/aesthetic-devising/page.tsx)

Operator view should show:

- issue ledger
- remediation plan
- which issues are deterministic vs patch vs regenerate
- closure status per issue
- exact reason an issue remains open

Do not show a generic "Deterministic Fix Available" panel detached from current issue state.

---

## New Execution Semantics

### Deterministic Issues

Examples:

- countdown hard scarcity
- exact time strings
- disallowed avatar/tool usage
- rail safety language
- venue genericization
- camera move feasibility when rule-based text replacement is sufficient
- storyboard duration alignment

Handling:

- auto-apply by default
- run closure checks immediately
- mark `verified` if closure checks pass

### Targeted LLM Patch Issues

Examples:

- ambient tone drift
- over-solo VO balance
- weak casting diversity nuance
- merch conflict requiring nuanced restaging
- scene plausibility that needs creative reframing, not string replacement

Handling:

- produce typed patch request
- restrict writable fields
- run local closure checks
- only then run final red team

### Regeneration Issues

Examples:

- entire productionBible invalidated by upstream scene changes
- still library needs rebuild after major visual brief edits

Handling:

- regenerate only the invalidated artifact
- do not rewrite the parent brief unless required

### Manual Issues

Examples:

- genuine business-rule ambiguity
- ship-policy uncertainty requiring human confirmation
- design taste disputes not reducible to deterministic or patchable criteria

Handling:

- explicit operator escalation
- no fake "try revise again" loop

---

## What Changes In Practice

### Old Behavior

1. Red team emits prose.
2. Revise rewrites the brief.
3. Some issues survive because downstream artifacts were preserved.
4. Red team flags them again.
5. Deadlock occurs.
6. Operator manually tries deterministic fixes.

### V2 Behavior

1. Validation emits a typed issue ledger once.
2. Deterministic issues are applied immediately.
3. Creative issues become targeted patch requests.
4. Invalidated artifacts regenerate once.
5. Closure checks verify only what changed.
6. Final red team either passes or returns truly net-new blockers.

---

## Minimum Viable V2

Do not attempt the full redesign in one step. Implement in this order.

### Step 1

Introduce issue ledger storage and remediation plan derivation.

Deliverable:

- red team still exists
- deterministic fixers still exist
- but findings are stored as typed issue records

### Step 2

Auto-run deterministic fixers immediately after validation when issues are marked deterministic.

Deliverable:

- deterministic issues no longer wait for deadlock

### Step 3

Replace whole-brief revise with targeted patch engine for brief-only fields.

Deliverable:

- LLM revisions are path-scoped

### Step 4

Extend targeted patching to productionBible and landingStillBible.

Deliverable:

- reviser can actually close downstream planning issues instead of preserving them unchanged

### Step 5

Add cross-artifact consistency validation and final issue closure semantics.

Deliverable:

- source-of-truth drift becomes a first-class detected issue, not a surprise after no-op fixes

---

## Non-Negotiable Rules For V2

1. No whole-object rewrite when the issue is field-local.
2. No deadlock suggestion panel without live issue ledger backing it.
3. No issue may be reopened after local closure unless there is new evidence.
4. Every remediation step must declare touched paths and invalidation consequences.
5. Red team should judge readiness, not act as the only remediation planner.
6. Deterministic fixes should run before any LLM patch whenever possible.
7. Downstream artifact ownership must be explicit.

---

## Success Criteria

V2 is successful when all of the following are true:

1. A first-pass campaign usually needs at most one remediation batch before final red team.
2. Deterministic issues are fixed automatically without operator rescue.
3. LLM-driven fixes operate on explicit target paths, not broad rewrites.
4. ProductionBible and sceneLibrary blockers are fixable within the same remediation cycle.
5. Final red team returns only unresolved or net-new blockers.
6. The test UI shows issue state, remediation mode, and closure status clearly enough that repeated clicking is unnecessary.

---

## Recommendation

Do not redesign the entire system from scratch.

Redesign the revision stage into a typed remediation stage.

That is the actual missing piece.

The current architecture already has useful components:

- strong red-team judgment
- deterministic fix infrastructure
- production-build lint
- artifact invalidation semantics

V2 should unify them around issue-ledger-based convergence instead of adding more retries.
