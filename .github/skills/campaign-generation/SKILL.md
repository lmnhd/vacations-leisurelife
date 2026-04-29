**Name: Campaign Generation Orchestrator**

**Description:** Orchestrates the end-to-end creation of a Leisure Life Interactive shadow group campaign. Use this skill to guide agents through discovery, inventory matching, aesthetic briefing, and final media generation while enforcing hard quality constraints and allowing user intervention.

## 1. Core Philosophy & Pitfalls to Avoid

Based on V2 Campaign Strategy and previous iterations, agents using this skill MUST adhere to the following:

- **Vacation First:** The group is an icebreaker, not a curriculum. Avoid mandatory classes, tight schedules, or high-pressure social mechanics.
- **Ship/Inventory Grounding:** Campaigns must match real inventory limits. Do not invent impossible ship amenities or assume retail block structures.
- **Finite Iteration:** Do not loop endlessly in discovery. If a concept requires more than 3 revisions to pass the Red Team, retire it.
- **Honest Readiness:** Do not mark a campaign as "Ready" if it still carries required fixes.
- **Deduplication:** Gemini Deep Research MUST exclude already generated campaigns (the backend pipeline handles this by natively injecting the DynamoDB state into the prompt).

## 1a. Recurring Pipeline Issues & Mitigations

The following issues have been encountered repeatedly across campaigns. Agents must handle them proactively:

### Revision API Timeout
- **Symptom:** `POST /api/groups/discovery/revise` and `/revise/bulk` hang beyond 120s.
- **Root Cause:** Structured generation with large prompt + JSON schema validation can exceed default API timeouts.
- **Mitigation:**
  - Always call revision via direct script (`npx tsx scripts/test-revise.ts <slug>`) rather than HTTP when possible — scripts have no HTTP timeout.
  - If HTTP is required, set `-TimeoutSec 600` minimum on PowerShell `Invoke-RestMethod`.
  - Never attempt bulk revision of more than 1 campaign per HTTP call; batching causes cumulative timeout.

### Inventory Match Gate (replaces Discovery-First vs Inventory-First problem)
- **Resolution:** The pipeline now enforces CB inventory constraints at two levels:
  1. **Step 3 Prompt (GPT hard constraints):** The AVAILABLE CB GROUP INVENTORY list is injected as hard constraints. GPT is instructed to only name ships and destinations from the inventory.
  2. **In-Memory Match Gate:** After GPT generates blueprints but before DynamoDB save, `matchGroupInventoryToCampaign()` is run on each blueprint. Any blueprint scoring below 25 is discarded with a log message. Only matched blueprints proceed to Red Team and DynamoDB.
- **Pipeline order:**
  1. Scrape CB inventory → cache (`scripts/scrape-cb-deals.ts`)
  2. Gemini 3.1 Pro Deep Research — psychographic (Step 1)
  3. Gemini 3.1 Pro Deep Research — aesthetic analysis with inventory context (Step 2)
  4. GPT blueprint generation with inventory HARD CONSTRAINTS (Step 3)
  5. In-memory inventory match gate — discard unmatched (between Step 3 and Step 4)
  6. Red Team review — only on matched blueprints (Step 4)
  7. Save to DynamoDB — only matched blueprints
  8. Phase B — confirm match against live inventory + generate Odysseus retail link
- **Result:** Pipeline outputs 0–5 campaigns. If 0 pass the gate, a descriptive error is thrown suggesting cache refresh or re-spin with relaxed constraints.
- **Phase B is now confirmation-only:** See `scripts/run-phase-b.ts`. It no longer performs primary matching.

### Red Team Verdict Handling
- **PASS:** Proceed to Phase 2.
- **WARN (≤4 fixes):** Safe to auto-revise. Use `POST /api/groups/discovery/revise` or direct script.
- **BLOCK (>4 fixes or structural issues):** STOP. Do not auto-revise. Present the campaign to the user and ask whether to retire it or manually redesign.
- **Stagnation:** If a campaign has been revised 3+ times and still carries warnings, consider retiring it regardless of fix count.

### Anchor Compliance Tolerance (Phase 3)
- **Symptom:** Brief generation fails with "Anchor compliance unresolved".
- **Rules:**
  - `missing_anchor_binding` (structural): **Hard fail** — brief generation aborts.
  - `niche_signal_dropped` / `niche_carry_mismatch` / `duplicate_location_family` (content): **Tolerated up to 4 violations** — brief generation continues, but downstream production lint will flag them.
  - If structural violations exist OR content violations exceed 4, the brief is rejected.
- **Mitigation:** Ensure the campaign's `targetingKeywords` are specific and embedded in both `imagePrompt` and `subjectAction` for every landing still.

## 2. End-to-End Workflow

The agent must follow these steps linearly. At the end of each major phase, the agent should pause and provide the local testing URL to the user so they can review the work visually. Ask the user if they wish to intervene, modify, or approve the transition to the next phase.

### Phase 1: Discovery & Blueprint

1. **CB Inventory Pre-scrape:** Ensure `cb-deals-cache.json` is fresh (<24h old). If stale, prompt the user to run `npx tsx scripts/scrape-cb-deals.ts` before proceeding — the discovery pipeline will warn if the cache is stale.
2. **Psychographic / Niche Identification:** Execute the backend Discovery pipeline (`GET /api/groups/discovery` or equivalent local script). This uses Gemini 3.1 Pro Deep Research to fetch real-time psychographic data and automatically injects existing campaigns to prevent redundancy.
3. **Blueprint Generation with Inventory Constraints:** The pipeline calls GPT-5 to generate blueprints constrained to available CB inventory.
4. **In-Memory Match Gate:** Blueprints that cannot be matched to CB inventory are automatically discarded before saving.
5. **Discovery Red Team:** The system evaluates surviving blueprints against V2 strategy constraints.
   - **Check:** Does it feel like a vacation? Are the events optional and ambient?
6. **User Intervention Checkpoint:**
   - Direct the user to view the blueprints at `http://localhost:3000/tests/groups/discovery`.
   - Present the `pass/warn/block` status to the user. Ask for approval to proceed to Phase 2.

### Phase 2: Inventory Confirmation & Retail Link

1. **Live CB Confirmation:** Run `npx tsx scripts/run-phase-b.ts` to re-scrape live CB inventory and confirm the pre-matched group block still exists.
2. **Retail Link Generation:** Phase B generates the Odysseus retail booking link for each confirmed match.
3. **User Intervention Checkpoint:** Confirm the matched ship, date, and starting price with the user.

### Phase 3: Aesthetic Brief Generation

1. **Visual Strategy:** Trigger generation of the aesthetic brief based on the locked blueprint.
2. **Aesthetic Red Team:** Validate the brief.
   - **Check:** Does the visual plan include actual ship representation? Is it distinct from generic cruise marketing? Are the colors/vibes aligned with the niche without becoming costume parody?
3. **User Intervention Checkpoint:**
   - Direct the user to view the aesthetic brief and production bible at `http://localhost:3000/tests/brief-studio`.
   - Ask the user to approve the aesthetic brief before generating heavy media assets.

### Phase 4: Media & Landing Asset Production

1. **Generate Media:** Trigger image, video, and audio asset pipelines as defined in the Aesthetic Brief.
2. **Review:** Ensure output coverage across hero images, concept images, scene images, and social representations.
   - Direct the user to monitor media generation at `http://localhost:3000/tests/media-generation`.
3. **Landing Page Construction:** Populate the Next.js `[slug]` route using the approved View Model.

### Phase 5: Final QA & Export

1. **Final Review:** Direct the user to view the fully-rendered campaign at `http://localhost:3000/tests/campaign-landing/[slug]`.
2. Run final validation. Ensure waitlist forms and "Book Now" routing (both Group and Retail paths) function as expected.
3. Mark campaign status as `GATHERING_INTEREST`.

## 3. Tooling & API Guidance

Always use the shared `lib/agent-api` orchestrator for durable state.

- Example: `npm run agent:brief-prototype -- <slug>`
- Never try to skip the Agent API workflow system if a durable job record is required.
- **Do not manually prompt Gemini or Perplexity for ideation**; use the built-in `core-logic.ts` pipeline/API route, which already fetches live web data, normalizes it, and passes exclusion context correctly.
