**Name: Campaign Generation Orchestrator**

**Description:** Orchestrates the end-to-end creation of a Leisure Life Interactive shadow group campaign. Use this skill to guide agents through discovery, inventory matching, aesthetic briefing, and final media generation while enforcing hard quality constraints and allowing user intervention.

## 1. Core Philosophy & Pitfalls to Avoid

Based on V2 Campaign Strategy and previous iterations, agents using this skill MUST adhere to the following:

- **Vacation First:** The group is an icebreaker, not a curriculum. Avoid mandatory classes, tight schedules, or high-pressure social mechanics.
- **Ship/Inventory Grounding:** Campaigns must match real inventory limits. Do not invent impossible ship amenities or assume retail block structures.
- **Finite Iteration:** Do not loop endlessly in discovery. If a concept requires more than 3 revisions to pass the Red Team, retire it.
- **Honest Readiness:** Do not mark a campaign as "Ready" if it still carries required fixes.
- **Deduplication:** Perplexity research MUST exclude already generated campaigns (the backend pipeline handles this by natively injecting the DynamoDB state into the prompt).

## 2. End-to-End Workflow

The agent must follow these steps linearly. At the end of each major phase, the agent should pause and provide the local testing URL to the user so they can review the work visually. Ask the user if they wish to intervene, modify, or approve the transition to the next phase.

### Phase 1: Discovery & Blueprint

1. **Psychographic / Niche Identification:** Execute the backend Discovery pipeline (`GET /api/groups/discovery` or equivalent local script). This uses Perplexity Sonar to fetch real-time psychographic data and automatically injects existing campaigns to prevent redundancy.
2. **Drafting the Blueprint:** The pipeline calls GPT-5 to generate the typed `campaign-config` (Target Audience, Ship Match, Dates, Pricing, Highlight Events).
3. **Discovery Red Team:** The system evaluates the blueprint against the V2 strategy constraints.
   - **Check:** Does it feel like a vacation? Are the events optional and ambient?
4. **User Intervention Checkpoint:**
   - Direct the user to view the blueprints at `http://localhost:3000/tests/groups/discovery`.
   - Present the `pass/warn/block` status to the user. Ask for approval to proceed to Phase 2.

### Phase 2: Inventory & Pricing Match

1. **CB Inventory Match:** Run the background script (or Agent API workflow) to match the blueprint with actual Cruise Brothers group inventory.
2. **Pre-load Links:** Capture both the `cbGroupId` / `cbPersonalLink` AND the `odysseusRetailBookingLink`.
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
- **Do not manually prompt Perplexity for ideation**; use the built-in `core-logic.ts` pipeline/API route, which already fetches live web data, normalizes it, and passes exclusion context correctly.
