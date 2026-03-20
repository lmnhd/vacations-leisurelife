# Agent Flow: Test Brief Generation Against Existing Campaigns

## Purpose

This is the testing flow for an agent to validate the new brief-generation process against campaigns that already exist in storage.

Use this flow to verify:

- the shared brief-generation contract works for agent callers
- the one-strike generation path behaves correctly
- readiness state is trustworthy
- approval is only possible when blockers are gone

## Important Rules

1. Do not use deprecated `POST /media/aesthetic` generation routes.
2. Use the retained `/brief` endpoints as the primary agent API.
3. Test against existing campaigns first before generating new discovery output.
4. Record both pass cases and blocker cases.
5. Treat `correctiveRepromptUsed` as an important signal, not an automatic failure.

## Primary Agent API Flow

This is the preferred flow when the app server is already running.

### Step 1: Load Existing Campaigns

Call:

```http
GET /api/groups/discovery?load=true
```

Expected result:

- list of persisted campaigns
- each entry includes `id`, `name`, `pricingStatus`, `aestheticBriefStatus`, `shipTarget`, and `targetDates`

Campaign selection guidance:

- choose at least 3 existing campaigns
- prefer a mix of:
  - one campaign with `pricingStatus = CB_MATCHED`
  - one campaign with no existing approved brief
  - one campaign with unusual dates or more complex theme language

### Step 2: Capture Baseline State Per Campaign

For each selected campaign slug, call:

```http
GET /api/groups/campaign/{slug}/brief/readiness
```

Record:

- `readiness`
- current issue count
- whether a brief already exists
- summary text

If a brief already exists and you want a clean generation test, delete it through the retained legacy fetch/delete route:

```http
DELETE /api/groups/campaign/{slug}/media/aesthetic
```

Use deletion only when the test goal is fresh generation.

### Step 3: Trigger Brief Generation

Call:

```http
POST /api/groups/campaign/{slug}/brief
Content-Type: application/json

{}
```

Optional instruction-driven run:

```http
POST /api/groups/campaign/{slug}/brief
Content-Type: application/json

{ "instructions": "Focus the brief on ship-first plausibility and optional social energy." }
```

Record from the response:

- `readiness`
- `summary`
- `autoFixApplied`
- `fixedCodes`
- `correctiveRepromptUsed`
- blocker list
- warning list

Expected semantics:

- `readiness` should return `needs_review` after generation
- `correctiveRepromptUsed = true` means the engine needed its one corrective retry
- blockers remaining after the response means generation stopped cleanly and requires human review or later code fixes

### Step 4: Recheck Stored Readiness

Call again:

```http
GET /api/groups/campaign/{slug}/brief/readiness
```

Verify:

- readiness matches the generation outcome
- issue list is persisted consistently
- summary is coherent with the last generation result

### Step 5: Fetch The Persisted Brief

Call:

```http
GET /api/groups/campaign/{slug}/media/aesthetic
```

Verify the persisted brief includes:

- `productionBible`
- `landingStillBible`
- `productionBuildLint`
- `humanReviewStatus`
- `issueLedger`
- `activeRemediationPlan`

For successful generations, inspect at minimum:

- `messaging.heroSlogan`
- `communityExpression.participationStyle`
- `merch.coreItem.productType`
- `productionBible.globalDirectionNotes`

### Step 6: Attempt Approval Only When Clean

If the generated result has zero blockers, call:

```http
POST /api/groups/campaign/{slug}/brief/approve
```

Expected result:

- `readiness = ready_for_media`

If blockers remain, do not attempt approval as a success-path action.
If you do test approval with blockers, the correct result is failure.

### Step 7: Capture History

Call:

```http
GET /api/groups/campaign/{slug}/brief/history
```

Record:

- generation timestamp
- approval timestamp if applicable
- any revision entries if they exist

## Direct Library Fallback Flow

Use this only if the app server is not running and the agent must test inside the repo directly.

### Entry Points

- `scanAllCampaigns()` from `lib/campaigns/campaign-store.ts`
- `createOrRefreshBrief()` from `lib/campaigns/brief-engine/orchestrator.ts`
- `getReadiness()` from `lib/campaigns/brief-engine/orchestrator.ts`
- `approveForMedia()` from `lib/campaigns/brief-engine/orchestrator.ts`
- `getAestheticBrief()` and `deleteAestheticBrief()` from `lib/campaigns/campaign-store.ts`

### Recommended sequence

1. load campaigns with `scanAllCampaigns()`
2. choose 3 representative existing campaigns
3. optionally clear existing brief with `deleteAestheticBrief(slug)`
4. run `createOrRefreshBrief(slug)`
5. run `getReadiness(slug)`
6. if blocker count is zero, run `approveForMedia(slug)`
7. fetch final brief with `getAestheticBrief(slug)`

## Pass/Fail Rubric

### Pass

A campaign test run counts as pass when:

- generation returns a valid response
- persisted brief exists
- productionBible exists
- landingStillBible exists
- readiness is consistent with the returned issues
- approval succeeds only when blockers are zero

### Soft Pass

A campaign test run counts as soft pass when:

- generation completes
- blockers remain
- the blocker report is explicit and coherent
- the process stops after the one corrective reprompt

This still proves the agent API path is functioning correctly.

### Fail

A campaign test run counts as fail when:

- deprecated routes are still required for happy-path generation
- generation returns malformed or incomplete data
- readiness state contradicts blocker state
- approval succeeds despite blockers
- the engine loops beyond the one corrective reprompt

## Suggested Campaign Batch Strategy

Run the agent in 3 passes:

1. Smoke batch
   - 3 campaigns
   - confirm contract shape and storage behavior
2. Quality batch
   - 5 to 10 campaigns
   - inspect blocker patterns and corrective reprompt frequency
3. Approval batch
   - subset of zero-blocker campaigns
   - confirm clean approval and `ready_for_media` state

## Minimum Result Report The Agent Should Produce

For each campaign tested, capture:

- campaign slug
- campaign name
- baseline readiness
- generation summary
- blocker count
- warning count
- `autoFixApplied`
- `fixedCodes`
- `correctiveRepromptUsed`
- approval attempted: yes/no
- approval result
- final readiness

## Recommended Existing-Campaign Discovery Command

If the agent is working from the repo and not through HTTP, it should first identify viable stored campaigns before testing.

Preferred source:

- `GET /api/groups/discovery?load=true`

Fallback source:

- `scanAllCampaigns()` from the campaign store

## Files The Testing Agent Should Read First

- `current-phase.md`
- `phase-result.md`
- `.github/DOCS/Implementation/BRIEF_STEP_REPLACEMENT.md`
- `lib/campaigns/brief-engine/orchestrator.ts`
- `app/api/groups/campaign/[slug]/brief/route.ts`
- `app/api/groups/campaign/[slug]/brief/readiness/route.ts`
- `app/api/groups/campaign/[slug]/brief/approve/route.ts`

## Final Instruction For The Testing Agent

Test the new brief step through the shared contract.
Do not drift into deprecated route testing except to confirm those routes are no longer the happy path.
Use existing campaigns, record both successes and blocker cases, and treat approval correctness as a hard gate.