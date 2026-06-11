# To Fix - Home Page Deals System

## FOUNDATIONAL PRINCIPLE: Visual Verification & Manual Testing

**Every process step must be manually testable in the test UI. Non-negotiable.**

Do not build backend-only. Do not assume it works because tests pass. Build features so the operator (Nate) can:
1. See the process happening in real-time
2. Manually verify each step produces correct output
3. Inspect intermediate results
4. Test variations side-by-side
5. Make decisions based on visible evidence

**Why this matters:**
- Tests verify code correctness, not intelligence quality
- You can have passing tests with broken AI reasoning
- Visual inspection catches: bad prompts, hallucinations, misaligned output, edge cases tests miss
- The operator needs to approve each major stage before it flows downstream

**Implementation rules:**
- **Every AI call must be visible:** Show the prompt sent, the response received, the parsed output
- **Every generation must have a UI:** Don't just save to cache — render it so Nate can see it
- **Every stage page must show intermediates:** Research context before pitch is generated, pitch before copy is generated
- **Variations must be comparable:** Side-by-side view of 3 angles/audiences/headlines/copy options
- **Locking must be explicit:** Clear visual confirmation when a stage is locked + locked status shows downstream
- **Errors must be visible:** If guardrail validation fails, show exactly what failed + why

**For agents building this:**
- No "run script in the background and update cache" without UI
- No "generate copy via API and store silently"
- Build the test page FIRST, then wire it to the backend
- The test page IS the product — it's where Nate will work
- Every PR should have screenshots or a video of the feature being tested manually

**Testing discipline:**
- Typecheck passes ✓
- Tests pass ✓
- **AND you manually tested it in the UI** ✓ ← required before merge
- Screenshots/video of manual testing in the PR description

---

## FOUNDATIONAL PRINCIPLE: AI-FIRST ARCHITECTURE

**This entire system is AI-powered. Non-negotiable.**

Every intelligent operation must use top-tier AI models (Claude Opus / GPT-4o equivalent). This is not optional, not a fallback, not "nice to have." This is the foundation.

**Where AI is required (mandatory):**
- Discovery research (analyzing niches, trends, competition)
- Audience targeting (profiling, emotional drivers, segmentation)
- Sales pitch development (customer-voice editorial decisions)
- Copy generation (headlines, offers, hero copy, CTAs)
- Strategic angle extraction from promo intelligence
- Ad structure & channel targeting (hooks, keywords, hypotheses)
- Media planning & visual concepts
- Guardrail detection & voice validation
- Variant generation & A/B comparison
- Everything else that involves reasoning or creativity

**Where deterministic scaffolding is NOT acceptable:**
- Pitch brief generation (currently deterministic — FIX THIS)
- Angle research (currently deterministic — FIX THIS)
- Targeting demographic (currently deterministic — FIX THIS)
- Copy generation fallbacks (currently template-based — FIX THIS)

**AI model requirements:**
- Use Claude Opus or GPT-4o for all reasoning tasks
- Use Claude 3.5 Sonnet minimum for supporting tasks
- Never downgrade to Haiku or weaker models for core intelligence
- Cost is not a constraint — intelligence is

**Prompt engineering standards:**
- Every AI call includes full context (research, audience, promo, cruise facts)
- Every prompt includes guardrails (voice rules, claim qualifiers, fact constraints)
- Every output is validated against guardrails before using
- Every brainstorm request asks for 3+ variations for comparison
- Every generation is marked with generator model + timestamp

**This applies to all phases:**
- Phase 7 (Angle Research) → AI-powered niche & trend analysis
- Phase 8 (Targeting) → AI-powered audience profiling
- Phase 9B (Pitch Brief) → AI-powered editorial decisions
- Phase 9A (Copy/Ad/Media) → AI-powered creative generation
- Phase 5A (Promo Angles) → AI-powered strategic extraction

**Update 2026-06-10:** the deals-system Step 3 path is now live as the unified-manifest
and copywriter workflow. See `COPYWRITER_DESIGN.md` for the implemented behavior,
payload shape, guardrails, and dashboard entry points.

---

## CB Promo Intelligence Extraction — Deep Angle Harvest

**Issue:** Current promo extraction (Phase 5) captures basic structured data (offer types, claims, windows), but misses the **strategic packaging angles** that make each promotion valuable.

**Current extraction (shallow):**
- Offer types: "dollars off", "onboard credit", "free guests"
- Public claims: "Select sailings may qualify for 50% off"
- Agent notes: combinability rules
- **Missing:** Why this deal? When to use it? What audience? What emotional hook?

**What we need (deep):**
Looking at CB Agent Tools screenshot, there are 40+ promotion tiles, each representing:
1. **Specific cruise lines** (Celebrity, Royal Caribbean, Carnival, Disney, etc.)
2. **Specific time windows** (summer sale, May clearance, last-minute deals)
3. **Specific audience hooks** (families with kids free, luxury extras included, honeymoon credit, solo traveler specials)
4. **Specific packaging strategies** (onboard credit angles, free perks, upgrades, exclusive access)

**Example deep extraction:**

**Tile:** "Celebrity Cruises - Summer Sale - Dollars Off, Onboard Credit"
- Current extraction: offer types + claims
- **Deep extraction needed:**
  - **When:** June-July sailing window
  - **Why Celebrity:** Summer peak season, family travel, Mediterranean/Caribbean
  - **Angle hooks:** "Summer escape with onboard flexibility" | "Family vacations made affordable" | "Last-minute summer booking advantage"
  - **Audience fit:** Families (kids), last-minute bookers, budget-conscious luxury seekers
  - **Packaging opportunity:** Any Celebrity package in June-July can leverage this
  - **Positioning:** "Don't wait for fall — summer deals are happening NOW with onboard credit for upgrades"
  - **Ad angle:** "Flexible summer cruising: book the sailing, use credit for dining/spa/drinks"

**Current system flaw:**
- Phase 4 scrapes raw text ✓
- Phase 5 extracts structured rules ✓
- **Missing Phase 5A: Strategic angle extraction** ✗

When an operator builds a Deal:
- They see: "Available promos: onboard credit, dollars off, free guests" (generic)
- They should see: "Available promos: **Summer family sales** (perfect for June package), **Solo traveler specials** (if targeting that), **Onboard credit angles** (for luxury positioning)" (strategic)

**What needs to change in promo extraction:**

1. **Expand `CbPromoIntelligenceRecord` to include:**
   ```ts
   strategicAngles: Array<{
     audienceSegment: string;        // "families", "honeymoons", "solo travelers", "luxury seekers"
     emotionalHook: string;          // "escape guilt-free", "quality time together", "independence", "indulgence"
     packagingOpportunity: string;   // "summer peak", "shoulder season clearance", "last-minute", "early-bird"
     positioningStatement: string;   // How to frame this offer to a customer
     adHooks: string[];              // Channel-specific angles
   }>;
   timingStrategy: {
     bestSailingWindows: string[];   // "June-July peak", "May shoulder", "Aug-Sept back-to-school"
     sailingTypes: string[];         // "family sailings", "romantic itineraries", "adventure routes"
     recommendedPackageNights: string; // "5-7 nights optimal", "10+ nights for loyalty", etc
   };
   ```

2. **Deep extraction should ask:**
   - Who is this promotion FOR? (families, honeymooners, solos, repeat guests, luxury seekers)
   - Why NOW? (seasonality, market conditions, inventory management)
   - What makes it special? (what competitors don't offer)
   - How do we talk about this to customers? (emotional language, not agent language)
   - What packages fit? (nights, cruise line, destination, date windows)

3. **In copy/pitch development:**
   - When operator develops a Deal, show: "Matching promos for this package"
   - Don't just list "onboard credit available" — show "Summer family sale angle: onboard credit for dining flexibility"
   - Suggest angles: "This Celebrity Caribbean package in June could leverage the summer family sale positioning"

**Implementation strategy:**

**Option A: Expand Phase 5 extraction**
- Run current extraction as-is
- Add GPT call: "Given this promotion tile + agent instructions, what are the strategic angles? Who is this for? Why is it valuable RIGHT NOW?"
- Store strategic angles alongside structured rules

**Option B: Create Phase 5A - Strategic Angle Mining**
- After Phase 5 structured extraction completes
- Dedicated process: "Mine strategic packaging angles from this promo"
- Connect to Group Discovery research: "Do we have a niche that matches this audience hook?"
- Surface in Deal development: operator sees "Matching research + matching promo angles"

**Why it matters:**
- Right now: operator assembles a deal, promo extraction feels disconnected
- Ideal: operator develops research, system shows "Hey, there's a promotion perfectly aligned with your research angle"
- The promo intelligence becomes a **second product discovery mechanism** alongside broker deals
- Example: "Research says solo travelers + adventure → system suggests: 'Solo traveler special promos available Jan-Mar'"

**Files to create/modify:**
- `lib/cb/deals-system/promo-intelligence-types.ts` (expand `CbPromoIntelligenceRecord` with strategic angles + timing)
- `lib/cb/deals-system/promo-extraction.ts` (add deep angle extraction via GPT)
- Optionally create `lib/cb/deals-system/promo-angle-mining.ts` (Phase 5A dedicated process)
- Update copy/pitch generation to surface matching promo angles
- Update Deal creation dashboard: show "Available research angles" + "Available promo angles" side-by-side

## Campaign Stage Dependencies Are Implicit, Not Enforced

**Issue:** The "Run stages independently" buttons (Trip research, Targeting, Sales pitch, Deal copy, Ad structure, Media plan) allow running stages out of logical order with silent auto-generation of missing prerequisites.

**Current behavior:**
- Running "Targeting" without "Research" → auto-generates research in the background; operator never sees it
- Running "Sales pitch" without both research AND targeting → uses whatever's in the Deal (may be `undefined` for targeting)
- Running "Deal copy" without "Sales pitch" → auto-generates a pitch first, then copy

**Problem:**
The system enforces dependencies in code (`runDealCampaignStage` regenerates missing stages) but the **UI doesn't show this**. All buttons appear equally available. An operator can:
1. Run research (gets deterministic scaffold)
2. Skip targeting entirely
3. Run pitch → pitch brief becomes generic because targeting demographic is `undefined`
4. Run copy from that broken pitch → produces copy without audience insight

**What should happen (per Phase 9B plan):**
- Research → Targeting → Pitch → Copy is a strict sequence
- Each stage should visually depend on the previous one
- Pitch brief requires BOTH research AND targeting to exist (not auto-generated)
- Copy requires an explicitly-run pitch brief (not auto-generated fallback)

**Fix:**
Add UI validation to the workbench:
1. Disable "Targeting" button until research exists and is visible
2. Disable "Sales pitch" button until BOTH research and targeting exist
3. Show a warning if "Deal copy/Ad/Media" are about to use an auto-generated pitch (not operator-reviewed)
4. Consider adding a "workflow" mode that enforces strict left-to-right stage progression

**Files involved:**
- `app/(tests)/tests/deals-system/campaign-workbench.tsx` (UI button state + warnings)
- `lib/cb/deals-system/curated-deal-assembly.ts` (already has dependencies, just needs UI to reflect them)

## Text-Only Launch Doesn't Actually Hide Media

**Issue:** When a Deal is approved with "Waive media (text-only launch)" checked, the `textOnlyLaunchWaived` flag is stored in approval state, but the public page rendering ignores it.

**Current behavior:**
- Operator checks "Waive media (text-only launch)" and approves
- Deal goes public with hero image + full media layout (same as if media was final)

**Expected behavior:**
- Text-only launch should hide the hero image section
- Keep copy, CTAs, trip facts, offer details
- Indicate to visitor that images are coming soon

**Fix:**
1. Add `textOnlyLaunchWaived: boolean` to `PublicDealPage` projection
2. Update `components/cb/curated-deal-page.tsx` to conditionally render hero section based on this flag
3. When media is waived, show a notice: "Images coming soon — book now while rates are available"

**Files involved:**
- `lib/cb/deals-system/public-deal-projection.ts` (add flag to projection)
- `components/cb/curated-deal-page.tsx` (conditional hero rendering)

## Deterministic Pitch Brief Must Be Replaced With AI

> Note: the deals-system Step 3 copywriter now performs this expansion in the live
> workflow. Keep the design below as the broader Phase 9B direction, but the
> manifest-driven deals path is no longer template-only.

**Issue:** Phase 9B promised an intelligent editorial decision layer. What's implemented is string interpolation with zero reasoning.

**Current (broken):**
```ts
generateDealPitchBrief() {
  return {
    tripSummary: `${nights} nights from ${departurePort}...`,
    primaryHook: `A curated ${destination} sailing...`,
    // Just template filling
  };
}
```
**Expected (AI-powered):**
```ts
generateDealPitchBrief() {
  const response = await llm.call({
    model: "claude-opus",
    messages: [{
      role: "user",
      content: `
        Research angle: ${angleResearch.recommendedPrimaryAngle}
        Target audience: ${targetingDemographic.primaryAudience}
        Promo context: ${promoRecords.map(p => p.publicClaimsAllowed).join(', ')}
        
        Write a customer-voice pitch brief answering:
        1. What is this trip? (one sentence, customer voice)
        2. Why should THIS audience care? (emotional, specific)
        3. What makes it feel chosen for them? (positioning)
        4. Three strongest selling facts (qualified claims)
        
        Forbidden phrases: [ANALYST_VOICE_FORBIDDEN list]
        Required qualifiers: [standard cruise qualifiers]
      `
    }],
    systemPrompt: PITCH_BRIEF_SYSTEM_PROMPT
  });
  return parse(response);
}
```

**Why AI is mandatory here:**
- Pitch brief must analyze research + audience + promo + facts to find the ONE emotional hook that works
- That's reasoning, not templating
- Current deterministic approach produces generic output (wrong for every Deal)
- AI approach produces specific output (right for this audience + this research + this offer)

**Fix (immediate):**
Replace `generateDealPitchBrief` with AI-backed version:
1. Claude Opus call with angle research + targeting + promo + cruise facts
2. System prompt enforces customer voice + guardrails
3. Output: 4-field pitch brief (trip summary, audience statement, primary hook, curated reason, selling facts)
4. Validation: detect analyst phrases + require qualifiers
5. Generate 3 variations for operator to compare, pick strongest

**Files involved:**
- `lib/cb/deals-system/campaign-generators.ts` (replace `generateDealPitchBrief` with AI call)
- Update system prompt: `PITCH_BRIEF_SYSTEM_PROMPT`
- Add validator: `validatePitchBriefVoice()` to catch analyst language
- Wire through LLM gateway: `generateStructuredObject()` with Zod schema for `DealPitchBrief`

## Critical: Workflow Order — Research First, Package Second

**Issue:** Current system assumes: "Pick a ship/sailing → assemble → build campaign around it"

**Actual workflow should be:** "Research niche/trend → design ideal package → find matching ship"

**Current flow (WRONG):**
1. Operator uses Package Lookup to find a real cruise package
2. Fills in package details (ship, date, destination)
3. Assembles the Deal with those facts
4. Runs research based on the package
5. Problem: research is constrained by what ships exist, not what trends demand

**Correct flow:**
1. Operator runs discovery research (trends, niches, audiences)
2. Defines ideal package: "Travelers who want exclusive island experiences + solo travel friendly + under 7 nights"
3. Uses those parameters to search for matching packages via Package Lookup
4. Once package found, assembles Deal with lock-in facts
5. Runs targeting/pitch/copy/ads/media around the research hypothesis

**Why it matters:**
- Discovery research drives the entire campaign angle
- Package lookup should be a **search tool informed by research**, not the starting point
- Operators need to develop research first, then constrain package lookup to match
- The Deal system should be built on validated research insights, not whatever packages happen to be available

**Implementation order (critical):**
1. **FIRST: Make discovery research the entry point**
   - New Deal creation should start with research, not package lookup
   - Or: link to Group Discovery research as a starting point
   - Or: run fresh Retail Discovery research before touching any package data

2. **SECOND: Parameterize package lookup by research**
   - Package Lookup form should be pre-filled by research outputs
   - "Research says: target solo travelers, 5-7 nights, exotic destinations"
   - Package lookup searches filtered by these criteria
   - Returns ranked candidates that match the research hypothesis

3. **THIRD: Lock in the package facts**
   - Once package selected, all cruise facts are locked
   - Research can continue (refine angle, validate against the actual ship)
   - But you can't change the package without starting over

**Two Entry Points for Deal Creation:**

### Option 1: Research-Driven Discovery (Niche/Trend First)
- Start with discovery research (Group Discovery brief or new Retail Discovery)
- Define ideal package parameters based on research insights
- Use Package Lookup to find matching real packages
- Assemble Deal around validated research hypothesis

**Starting points:**
- "New Deal from Group Research" → pulls existing Group niche brief
- "New Deal from Retail Discovery" → runs fresh research on trend/niche
- Both route to `/develop/[dealId]/research` as entry

### Option 2: Broker Deals Discovery (Product Opportunity First)
- Pull current promotions from cruise brokers' websites (we already scrape these)
- See what cruise lines are pushing right now (bestsellers, seasonal promos, clearance)
- Analyze those deals: "Why are they promoting THIS package RIGHT NOW?"
- Build our angle research + targeting around why that deal is available
- Reverse-engineer the niche: "Who would want this deal the cruise line is pushing?"

**Starting points:**
- "New Deal from Broker Discovery" → shows list of current broker promos
- Pick a promo → auto-populates: package ID, cruise line, dates, current offer
- Then research: "Why is [cruise line] promoting this? What audience? What angle?"
- Routes to `/develop/[dealId]/research` with pre-filled package facts

**Key difference:**
- Option 1 (Research-First): "We found a niche, now match it to a package"
- Option 2 (Broker-First): "A package is being promoted, now figure out why + who it's for"

Both are valid. Option 1 is proactive (we control the angle). Option 2 is reactive (we capitalize on existing momentum).

**Files to create/modify:**
- Rethink Deal creation flow: two entry points (research-first OR broker-first)
- Link Group Discovery briefs: "Start Deal from Group Research"
- Add Retail Discovery research entry: "Start Deal from Retail Discovery"
- Add Broker Deal scraper integration: "Start Deal from Broker Promo" → pulls live scraped data
- Parameterize Package Lookup with research outputs (search-aware)
- Both paths route to `/develop/[dealId]/research` but with different pre-fills
- Create "Product Discovery" dashboard showing: Group niches available + Broker promos available

## Stage-Level Development Pages — Simplified Deal Campaign Flow

**Vision:** Replicate the Group Campaign development workflow for Deals, but simplified. Each stage gets its own focused page where operators develop + brainstorm + iterate, just like `/campaigns/[id]/discover` or `/campaigns/[id]/positioning`.

**Design principle:** Deals stage pages should **feel exactly like Group campaign development pages** — same UI patterns, same brainstorming workflow, same save/lock/regenerate mechanics. No new paradigm, just reapplied to cruise deals.

### Parallel to Group Campaign Workflow

**Group campaigns have:**
- `/campaigns/[id]/discover` — research phase (niche, audiences, trends)
- `/campaigns/[id]/positioning` — positioning + angle decisions
- `/campaigns/[id]/messaging` — pitch + copy development
- `/campaigns/[id]/creative` — ad structure + media planning

**Deal stages should mirror:**
- `/deals/[dealId]/research` — angle + destination + ship research (analogous to discover)
- `/deals/[dealId]/targeting` — audience + demographic targeting (analogous to positioning)
- `/deals/[dealId]/pitch` — sales pitch brief (analogous to messaging)
- `/deals/[dealId]/copy` — copy package + offers (extension of messaging)
- `/deals/[dealId]/ads` — ad structure + channel strategy (analogous to creative)
- `/deals/[dealId]/media` — media planning (analogous to creative)

### Per-Stage Development Pages

Create new routes reusing Group campaign component patterns:
- `/tests/deals-system/develop/[dealId]/research` — Trip research + angle discovery
- `/tests/deals-system/develop/[dealId]/targeting` — Audience + demographic research
- `/tests/deals-system/develop/[dealId]/pitch` — Sales pitch brief editorial decisions
- `/tests/deals-system/develop/[dealId]/copy` — Copy generation + offers
- `/tests/deals-system/develop/[dealId]/ads` — Campaign structure + channel targeting
- `/tests/deals-system/develop/[dealId]/media` — Media planning + visual concepts

### Consistent Workflow Per Stage

**Each page follows the same pattern (reuse Group campaign UX):**

1. **Context panel** (top, collapsible)
   - Upstream stage outputs (read-only reference)
   - Cruise facts / Deal basics
   - Promo available
   - Search/research tools available for this stage

2. **Generation + Brainstorming** (main)
   - "Generate [stage name]" button (calls AI + scaffold)
   - "Generate 3 variations" (brainstorm alternatives)
   - Edit fields directly (inline, with guardrail feedback)
   - "Try different approach" (adjust variables, regenerate)

3. **Comparison** (side-by-side)
   - See 2-3 versions stacked for comparison
   - Pick the best one, discard others
   - Comments/notes: "Why we're going with this version"

4. **Lock + Save**
   - "Approve this version" → marks stage as locked
   - Locked stages don't auto-regenerate when upstream changes
   - Can unlock to iterate further
   - Timestamp + operator note on each lock

5. **Navigation**
   - "Back to Deal" → returns to campaign workbench
   - "Next Stage" → jumps to targeting/pitch/copy/ads/media
   - Breadcrumb shows position in workflow

### Research Stage Example (`/develop/[dealId]/research`)

**AI-powered discovery research (Claude Opus):**
- Analyze ship amenities, destination appeal, competitive positioning
- Research niche angles: "Who would this sailing be perfect for?"
- Identify trend opportunities: "What travel trends does this package fit?"
- Find blind spots: "What aren't competitors highlighting?"

**Context (collapsible):**
- Cruise facts (ship, destination, dates, nights, departure port)
- Promo available (which offers apply to this package)
- Link to Group Discovery brief (if this deal came from one)

**Generation (AI-powered):**
- "Generate angle research" button → Claude Opus call
  - Input: all cruise facts + promo context
  - Output: 3 different angle hypotheses (niche focus, trend focus, luxury focus)
  - Each includes: primary angle, target audience, emotional drivers, guardrails, sources

**Brainstorm (AI-enhanced):**
- "Explore 3 alternative angles" → generates variations on different positioning
- "What if we target [segment]?" → regenerates research for that segment
- "Compare to Group Discovery" → shows alignment with existing niche research
- Pick the strongest, lock it

**Operator controls:**
- Edit research directly (AI-assisted suggestions as you type)
- Validate guardrails (factual constraints, what to avoid)
- Save versions + compare

**Same UX as Group campaign discovery page, but AI-first**

### Targeting Stage Example (`/develop/[dealId]/targeting`)

**AI-powered audience profiling (Claude Opus):**
- Analyze cruise angle: "Who would love this positioning?"
- Research audience segments: emotional drivers, spending patterns, decision triggers
- Generate niche keywords + trend signals + channel strategies
- Identify secondary audiences + emotional mismatches to avoid

**Context (collapsible):**
- Current angle research (what we're selling)
- Cruise facts + ship class profile
- Group Discovery niche brief (if applicable)

**Generation (AI-powered):**
- "Generate targeting-demographic" button → Claude Opus call
  - Input: angle research + cruise facts + promo context
  - Output: 3 audience profiles (each with primary + secondary audiences, keywords, emotional drivers, channel strategies)
  - Each includes: positioning statement, confidence score, red flags

**Brainstorm (AI-enhanced):**
- "Try different audience segment" → regenerates targeting for new persona
- "What if we target [audience2]?" → shows copy/ad implications
- "Which audience loves this angle most?" → AI recommends strongest fit
- Compare profiles side-by-side
- Pick + lock

**Operator controls:**
- Edit audience labels, keywords, channel notes
- AI suggests related keywords + trends as you type
- Preview: "How would THIS audience see our pitch?"

**Same UX as Group campaign positioning page, but AI-first**

### Pitch / Copy / Ads / Media Stages

**All AI-powered.**

**Pitch (Claude Opus):**
- Read: angle research + targeting demographic + promo
- Generates 3 customer-voice pitch briefs for comparison
- Enforces voice rules + guardrails
- Pick strongest, lock it

**Copy (Claude Opus):**
- Read: pitch brief + promo claims + targeting
- Generates 3 headline options + 3 offer variations
- Validates guardrails + qualifiers
- Operator picks best combination

**Ads (Claude Opus):**
- Read: pitch + targeting + promo positioning
- Generates channel-specific hooks, keywords, creative hypotheses
- Meta angles + Google themes + TikTok concepts + email strategies
- Operator refines

**Media (Claude Opus or Vision):**
- Read: pitch + targeting + visual direction
- Generates visual concept prompts for image slots
- Suggests video shot lists
- Identifies asset gaps

**Every stage follows:** Context → Generate (AI) → Brainstorm (AI variations) → Pick → Lock

---

## Stage Development Pages Must Have Full Visual Transparency

**The test pages are where Nate develops Deals. They must show everything.**

### Visual Structure (Non-Negotiable)

**Research Page** (`/develop/[dealId]/research`)

```
┌─────────────────────────────────────────────────────┐
│ CONTEXT (collapsible)                               │
│ - Cruise facts: ship, destination, dates, nights    │
│ - Promo available: offer types + windows            │
│ - Group Discovery brief (if applicable)             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ AI GENERATION                                        │
│                                                     │
│ PROMPT SENT (collapsed/expandable)                 │
│ ─────────────────────────────────────────          │
│ << Expand to see system prompt + input             │
│                                                     │
│ [Generate angle research]  [Show variations: 3]     │
│                                                     │
│ RESPONSE RECEIVED (collapsed/expandable)            │
│ ─────────────────────────────────────────          │
│ << Model: claude-opus | Time: 2.3s                 │
│ << Expand to see full raw response                 │
└─────────────────────────────────────────────────────┘

┌──────────┬──────────┬──────────┐
│ ANGLE 1  │ ANGLE 2  │ ANGLE 3  │ (side-by-side comparison)
├──────────┼──────────┼──────────┤
│ Title    │ Title    │ Title    │
│ Audience │ Audience │ Audience │
│ Hooks    │ Hooks    │ Hooks    │
│ Angles   │ Angles   │ Angles   │
│ Sources  │ Sources  │ Sources  │
│          │          │          │
│ [Pick]   │ [Pick]   │ [Pick]   │
└──────────┴──────────┴──────────┘

[Add custom notes]
[Lock this version] ← When clicked, shows: "Research locked v1.0 by Nate at 2:45 PM"
[Unlock to iterate] ← Appears after locked
```

**Pitch Page** (`/develop/[dealId]/pitch`)

```
┌─────────────────────────────────────────────────────┐
│ CONTEXT (collapsible)                               │
│ - Current angle research (selected version)         │
│ - Targeting demographic (selected version)          │
│ - Promo context: available claims                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ AI GENERATION                                        │
│                                                     │
│ PROMPT SENT (collapsed) - System: transform to      │
│                          customer voice             │
│ [Generate pitch brief]  [Show variations: 3]        │
│                                                     │
│ RESPONSE RECEIVED - Model: claude-opus | Time: 1.8s │
│ << Expand to see full response                      │
└─────────────────────────────────────────────────────┘

┌──────────┬──────────┬──────────┐
│ PITCH 1  │ PITCH 2  │ PITCH 3  │
├──────────┼──────────┼──────────┤
│ Trip     │ Trip     │ Trip     │
│ Summary  │ Summary  │ Summary  │
│          │          │          │
│ Audience │ Audience │ Audience │
│ Statement│ Statement│ Statement│
│          │          │          │
│ Primary  │ Primary  │ Primary  │
│ Hook     │ Hook     │ Hook     │
│          │          │          │
│ Curated  │ Curated  │ Curated  │
│ Reason   │ Reason   │ Reason   │
│          │          │          │
│ Selling  │ Selling  │ Selling  │
│ Facts    │ Facts    │ Facts    │
│          │          │          │
│ [Pick]   │ [Pick]   │ [Pick]   │
└──────────┴──────────┴──────────┘

[Voice validation: ✓ No analyst phrases | ✓ Customer-focused]
[Add notes]
[Lock this version]
```

**Copy Page** (`/develop/[dealId]/copy`)

```
┌─────────────────────────────────────────────────────┐
│ CONTEXT (collapsible)                               │
│ - Pitch brief (locked version shown)                │
│ - Promo context + claims available                  │
│ - Audience: targeting demographic                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ AI GENERATION                                        │
│                                                     │
│ [Generate copy package]  [Show headline variants]   │
│                         [Show offer variants]       │
│                                                     │
│ RESPONSE: Model: claude-opus | Time: 3.2s           │
│ << Expand to see full response                      │
└─────────────────────────────────────────────────────┘

┌─ HEADLINES ─────────────────────────────────────────┐
│ Variant 1: "6 Nights to Paradise..."               │
│ Variant 2: "Exclusive Island Escape..."            │
│ Variant 3: "Your Perfect Caribbean Adventure..."   │
│ [Compare side-by-side] [Pick headline]             │
└─────────────────────────────────────────────────────┘

┌─ OFFER LINES ───────────────────────────────────────┐
│ Variant 1:                                          │
│  • Save on onboard credit for dining               │
│  • Book early, sail with flexibility               │
│  • Add adventures to your sailing                   │
│                                                     │
│ Variant 2:                                          │
│  • Select sailings qualify for 50% off             │
│  • Onboard credit available                         │
│  • Free beverage package included                   │
│                                                     │
│ [Compare] [Pick offers]                             │
└─────────────────────────────────────────────────────┘

[Guardrail validation: ✓ All claims qualified | ✓ No guarantees]
[Preview on public page: View how this renders]
[Add notes]
[Lock this version]
```

### Why full transparency matters:

1. **AI debugging:** Nate can see exactly what prompt was sent and what came back
2. **Quality gates:** Nate visually verifies each stage before locking (not trusting tests)
3. **Reasoning visibility:** Variations show different strategic approaches — Nate can understand the options
4. **Iteration safety:** If something is wrong, Nate can unlock and re-run with feedback
5. **Guardrail enforcement:** Red flags are visible before locking (not hidden in logs)

### Testing checklist for agents:

Before shipping a stage development page:
- [ ] Prompt is visible (collapsed but expandable)
- [ ] Response is visible (collapsed but expandable)
- [ ] Model + latency shown
- [ ] Variations are side-by-side (not stacked)
- [ ] Guardrails are validated + shown visually
- [ ] Lock/unlock states are explicit + tracked
- [ ] Upstream context is collapsible but referenced
- [ ] Manual test done: generated content, compared variations, locked stage
- [ ] Screenshot of the page in PR description
- [ ] Video walkthrough in PR if complex (brainstorm → compare → pick → lock)

### Implementation Notes

**Stage pages should:**
1. Show upstream stages (read-only context) at the top
2. Show the current stage content (editable, with AI assistance)
3. Show downstream impact (preview of how copy changes affect ad structure, etc.)
4. Support versioning: save iterations as "v1", "v2", "final" with timestamps
5. Link back to the Deal Campaign Workbench to apply a chosen version
6. Use collapsible sections for research context + tools + output

**Critical: All changes persist to the Deal record**
- Every edit on a stage development page immediately updates the Deal in the cache
- There is no "draft" or "preview" mode — changes are live
- Downstream stages automatically reflect upstream changes (if not locked)
- Locking a stage prevents it from being overwritten by downstream regenerations
- The entire Deal system is one interconnected record, not separate documents
- Operator sees immediate ripple effects: change copy → see ad structure update → see media concepts shift
- This enforces coherence: if you change the pitch hook, copy/ads automatically realign

**Reuse existing Group campaign patterns:**
- Component layout: copy from `/campaigns/[id]/discover` layout + styling
- Brainstorming UI: reuse the "generate variants + compare" panels from group positioning
- Voice/guardrails: same `ANALYST_VOICE_FORBIDDEN` + red flag detection used for copy validation
- Versioning/lock workflow: same as group campaign stage locking (can unlock to iterate, re-lock)
- Navigation: breadcrumb + next/prev stage buttons exactly like group campaigns
- Research tools: ship amenities, destination trends, niche signals (already cached/available)

**Operator workflow:**
1. Assemble a Deal in the Campaign Workbench (basic form)
2. Click "Develop Research" → opens `/develop/[dealId]/research`
3. Run research tools, brainstorm angles, pick best one, lock it
4. Click "Next: Targeting" or "Back to Deal"
5. On targeting page: refine audience, brainstorm segments, lock
6. Continue for pitch → copy → ads → media
7. At any stage, can unlock + iterate further
8. When all stages locked + no blocking gates, "Approve & Publish"

**Files to create/modify:**
- `app/(tests)/tests/deals-system/develop/[dealId]/` (new directory, mirror group campaign layout)
- `app/(tests)/tests/deals-system/develop/[dealId]/layout.tsx` (reuse styles/navigation from `/campaigns/[id]/layout.tsx`)
- `app/(tests)/tests/deals-system/develop/[dealId]/research/page.tsx`
- `app/(tests)/tests/deals-system/develop/[dealId]/targeting/page.tsx`
- `app/(tests)/tests/deals-system/develop/[dealId]/pitch/page.tsx`
- `app/(tests)/tests/deals-system/develop/[dealId]/copy/page.tsx`
- `app/(tests)/tests/deals-system/develop/[dealId]/ads/page.tsx`
- `app/(tests)/tests/deals-system/develop/[dealId]/media/page.tsx`
- Extend `CuratedOdysseusDeal` to track locked status + version history per stage (similar to `GroupCampaign.stageStatus`)
- **No new UI paradigm** — all components and workflows mirror existing Group campaign pages
