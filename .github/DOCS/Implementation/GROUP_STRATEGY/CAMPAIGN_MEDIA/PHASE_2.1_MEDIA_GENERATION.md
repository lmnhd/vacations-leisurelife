# Phase 2.1 Media Generation

## Discovery-to-Media Realism Boundary Redesign Plan

**Status:** In Progress — Core redesign implemented, event-framing guardrails validated, downstream image regression still required
**Owner:** Group Campaign Discovery + Campaign Media Pipeline
**Problem Class:** Upstream concept drift causing downstream image plausibility failures
**Last Updated:** 2026-03-11

---

## 0. Status Update

### 0.1 Completed Implementation

- Discovery prompt framing has been rewritten in `app/api/groups/discovery/core-logic.ts` to be vacation-first and cruise-native rather than trend-heat and infrastructure-first.
- Step 1 now filters more aggressively against clinical, workshop, optimization, and gear-dependent niche selection.
- Step 2 now evaluates believable cruise-native expression before ship fit and includes implausibility analysis.
- Step 3 blueprint generation now enforces explicit realism boundaries and uses the extended structured schema.
- Blueprint realism fields were added and persisted on campaign metadata:
	- `vacationFitRationale`
	- `cruiseNativeMoments`
	- `nicheExpressionMode`
	- `implausibleLiteralizations`
	- `allowedThemeSignals`
	- `discouragedThemeSignals`
- Discovery UI support for those realism fields has been implemented in the group discovery test page.
- Strategy documentation in `GROUP_CAMPAIGN_STRATEGY.md` has already been updated to reflect the new discovery philosophy.
- Aesthetic and media generation have already been updated to consume realism boundaries and plausibility guidance downstream.
- Aesthetic generation now also consumes matched route context where available, including destination, matched sail date, departure port, and sailing length.
- Discovery cache invalidation was strengthened with prompt-versioning so prompt fixes do not silently reuse stale same-day research.
- Additional anti-drift guardrails were added specifically to prevent pastoral / cottagecore / slow-living themes from collapsing into generic quiet-luxury language.
- A dedicated refinement phase was added after initial aesthetic generation so the full brief receives a final GPT-5.4 quality pass before being returned and saved.
- The refinement phase is explicitly tuned to remove residual organized-program language, reduce repetitive prop cues, strengthen cruise-first hierarchy, and lightly integrate route-aware destination texture.
- Shared event-framing guidance was added to the aesthetic pipeline so real itinerary-timed events, seasonal phenomena, and holidays can shape atmosphere without silently becoming the campaign's primary promise.
- The aesthetic prompts now explicitly instruct every major pass to keep secondary real-world events as backdrop context unless the campaign is intentionally sold as that event experience.
- Supporting verification workflow fixes were shipped:
	- invalid `gpt-5-instant` model resolution was fixed
	- discovery Step 3 now explicitly uses GPT-5 structured generation
	- Phase B status UI now reflects live CB-matched pricing state instead of remaining stuck on AI estimates
	- discovery now persists `targetDestination`
	- Phase B now stores matched departure port and matched nights alongside matched ship and sail date
	- Phase B CB inventory matching now treats explicit ship names as hard constraints so one campaign cannot silently inherit a sister ship's inventory context

### 0.2 Verified Outcomes So Far

- A fresh discovery batch after the realism redesign produced substantially more plausible campaign shapes:
	- `Sea of Stories`
	- `Sundown Spirits`
	- `Needle Drop`
	- `Salt & Meadow`
	- `Deck & Dice`
- These blueprints read much more like real cruise products than prior workshop / lab / residency-like concepts.
- Phase B CB Inventory Match successfully matched 5/5 campaigns to real Cruise Brothers group inventory.
- The discovery UI now correctly reflects matched pricing states after the Phase B UI status fix.
- Iteration on `deck-and-dice-2026` shows the aesthetic system is now materially closer to target: more cruise-first, more route-aware, less convention-like, and less dependent on repeated tabletop prop cues.
- Cross-campaign aesthetic re-generation now confirms the recent prompt changes are universal rather than slug-specific:
	- `deck-and-dice-2026` improved cleanly with clearer CTAs, stronger cruise-first hierarchy, and broader non-object social cues.
	- `needle-drop-2026` also improved in cruise-first and non-object terms, but exposed a new residual drift class: quiet-luxe / softly curated listening-room language.
	- That residual drift has now been targeted with an additional shared prompt rule set aimed at suppressing exclusivity-coded music copy and semi-hosted listening-room phrasing.
- A fresh March 11 verification pass confirmed the new event-framing rule is general rather than slug-specific:
	- `salt-and-meadow-2026` no longer lets eclipse-week context overtake the campaign identity.
	- `sea-of-stories-2026` and `sundown-spirits-2026` now keep flagged event/program language mostly inside avoid or discouraged lists rather than user-facing campaign copy.
	- `needle-drop-2026` and `deck-and-dice-2026` remained cruise-first during the same verification sweep.
- The `sundown-spirits-2026` wrong-ship mismatch was resolved at the matcher layer, preventing sister-ship metadata from leaking into downstream media generation.

### 0.3 Still Remaining

- A fully explicit post-guardrail discovery verification run should still be documented and reviewed with raw Sonar output after forcing a truly fresh cache miss.
- The cottagecore / pastoral anti-drift fix has been implemented, but it still needs a deliberate verification run to confirm that "quiet luxury" language no longer leaks into future generations.
- A downstream media regression pass is still needed on one of the newly grounded blueprints to confirm that hero and concept generations now require materially less pruning.
- Acceptance criteria should be re-scored after that downstream media test, not just after blueprint review.
- True port-by-port itinerary and excursion detail are still not being pulled from CB Agent Tools; the current route awareness is limited to destination, sail date, departure port, and sailing length.
- The new refinement phase has now been validated across more than one campaign, but the latest universal anti-drift rule should still be re-tested on a fresh music-forward rerun to confirm that quiet-luxe / salon language drops without flattening campaign character.
- The March 11 event-framing verification was strong enough to clear this issue as a blocker, but the verifier itself is still blunt and over-flags terms that only appear inside negative constraints.
- A minor non-blocking wording cleanup may still be worthwhile for `sundown-spirits-2026` merch language where one concept used "badge" as a graphic label rather than a stronger travel-native term such as "crest" or "seal".

---

## 1. Why This Plan Exists

The current Group Campaign Discovery pipeline is producing theme blueprints that are often intellectually interesting but poorly matched to how a real cruise vacation feels.

The resulting failure pattern is consistent:

- Discovery selects niches based on trend heat, spend willingness, and infrastructure compatibility.
- The blueprint model formalizes those niches into campaign concepts without enough vacation realism boundaries.
- Aesthetic devising and media generation inherit those assumptions.
- Hero, concept, and thumbnail imagery drift toward staged workshops, labs, retreats, formal instruction, or industrial/corporate-looking environments.

This creates a recurring mismatch between:

- what makes a niche look differentiated on paper
- what actually feels like a believable, relaxed, social, exploration-driven cruise experience

This plan redesigns the pipeline so campaigns are generated as:

**vacation-first, cruise-native, hobby-friendly, socially magnetic experiences**

instead of:

**equipment-heavy, operational, clinical, academic, or corporate-seeming programs placed onto a ship**

---

## 2. Root Cause Summary

### 2.1 Discovery Prompt Bias

The current discovery prompts over-reward:

- high-growth online subcultures
- high willingness-to-spend communities
- ship infrastructure compatibility
- ownable aesthetics

They do **not** strongly constrain for:

- cruise-native leisure behavior
- low-pressure social bonding
- believable shipboard moments
- vacation plausibility
- laid-back recreational expression of the niche

### 2.2 Blueprint Formalization Bias

The structured blueprint generation step currently asks for high-value, aspirational, differentiated concepts, but it does not require the model to explain:

- why this would feel enjoyable as a cruise vacation
- what cruise-native moments define the experience
- what kinds of literalizations would make the idea feel too formal, technical, or industrial

### 2.3 Media Consequence

When the upstream campaign concept is framed as:

- expedition platform
- field lab
- biomarker retreat
- darkroom residency
- hydroponics systems commons
- fermentation lab

the media system has to fight uphill to produce relaxed, plausible hero imagery.

Even when prompt engineering improves, the conceptual source is still malformed.

---

## 3. Governing Principle

The entire Group Campaign pipeline should adopt this rule:

> A valid group cruise theme must feel like a desirable vacation first, and only secondarily like a niche identity expression.

Operational interpretation:

- The niche is the **social flavor layer**, not the operational center of the trip.
- The cruise must still feel attractive if the guest ignores most themed programming.
- The strongest campaign concepts are those where the niche naturally modulates how guests relax, mingle, explore, discover, dress, listen, read, observe, or celebrate.
- The weakest concepts are those that require specialized equipment, formal instruction, clinical settings, workshops, residencies, or structured productivity in order to make sense.

---

## 4. Target Outcome

After this redesign, the pipeline should preferentially generate campaigns like:

- listening salons
- analog photography social voyages
- reader and conversation cruises
- cottagecore slow-travel river journeys
- retro gaming lounge culture cruises
- hobbyist discovery cruises with lightweight themed rituals

and should reject or heavily down-rank campaigns that primarily read like:

- field labs
- clinical retreats
- maker residencies
- formal workshop sailings
- industrial systems showcases
- structured educational programs disguised as vacations

---

## 5. Implementation Scope

This redesign affects six layers:

1. Perplexity Sonar Step 1 prompt
2. Perplexity Sonar Step 2 prompt
3. Structured Blueprint Generation prompt and schema
4. Strategy documentation and system language
5. Downstream aesthetic/media interpretation of blueprint realism data
6. Final aesthetic refinement and route-aware polish

---

## 6. Implementation Plan

### Phase A — Rewrite Discovery Framing

**Implementation Status:** Completed

#### A1. Replace Trend-Heat Framing With Cruise-Compatibility Framing

Current issue:

- The Step 1 prompt asks Perplexity to identify fast-growing, spend-ready communities discussing digital burnout, IRL meetups, or aesthetic retreats.
- This naturally pulls the system toward industrialized wellness, optimization, structured learning, and “retreat logic.”

Implementation change:

- Rewrite Step 1 to identify communities that are:
	- hobby-centric
	- identity-rich
	- socially expressive
	- cruise-compatible
	- vacation-positive
	- visually ownable without requiring heavy programming

- Explicitly exclude communities whose appeal depends on:
	- clinical testing
	- formal instruction
	- technical workshops
	- activist labor
	- performance optimization culture
	- professional advancement
	- specialized equipment as the core attraction

New Step 1 emphasis:

- relaxed social identity
- low-friction meetups
- conversation-rich niches
- scenic participation
- fandom or hobby rituals
- laid-back communal discovery

#### A2. Remove “Controlled Environment” Language

Current issue:

- The phrase “controlled environment” implies retreat, protocol, workshop, lab, or managed behavioral container.

Implementation change:

- Replace with cruise-native framing such as:
	- shared floating vacation environment
	- low-friction social travel environment
	- immersive shipboard getaway
	- laid-back, all-in-one group voyage

Expected effect:

- Perplexity should stop over-associating cruise concepts with corporate retreat logic.

---

### Phase B — Reframe Ship-Fit Analysis Around Experience, Not Infrastructure

**Implementation Status:** Completed

#### B1. Rewrite Step 2 Prompt Order

Current issue:

- Step 2 asks: “what onboard amenities are most requested?” and “which ships have the infrastructure?”
- This prioritizes facility matching over emotional or experiential fit.

Implementation change:

- Step 2 should first ask:
	- what cruise-native moments express this niche most believably?
	- what does this theme look like when translated into relaxed guest behavior?
	- what would feel implausible, too programmatic, or too operational on a cruise?

- Only after that should it ask:
	- which ships support those moments naturally?

#### B2. Introduce “Plausible Theme Expression” Analysis

Step 2 outputs should explicitly describe:

- cruise-native moments
- niche-enhanced moments
- lightweight props or rituals
- implausible literalizations
- atmosphere fit
- ship-type fit

Examples:

- Good: listening salons, deck conversations, journaling, stargazing, scenic hobby practice, gentle mixers
- Bad: lab benches, classroom rows, formal critique rooms, technical restoration stations, biomarker testing suites, fermentation labs dominating the guest experience

---

### Phase C — Strengthen Structured Blueprint Generation

**Implementation Status:** Completed

#### C1. Extend Blueprint Schema

Current issue:

- The current schema stores descriptive and research fields, but no realism-boundary fields.

Implementation change:

- Add new blueprint fields such as:
	- `vacationFitRationale`
	- `cruiseNativeMoments`
	- `nicheExpressionMode`
	- `implausibleLiteralizations`
	- `allowedThemeSignals`
	- `discouragedThemeSignals`

These fields will make each blueprint explain not only why the niche matters, but how it should appear on a ship without drifting into operational fantasy.

#### C2. Add Blueprint-Level Rejection Rules

The Gateway model should be instructed to reject any campaign concept that:

- feels like a retreat more than a vacation
- depends on specialized rooms or lab-grade infrastructure
- centers formal teaching, instruction, protocols, or workshops
- reads as industrial, clinical, or corporate
- would be more believable at a conference, residency, or campus than on a cruise ship

#### C3. Define the Correct Theme Shape

The blueprint generator should prefer concepts where:

- guests can imagine themselves lounging, mingling, observing, listening, wandering, or sharing taste
- themed moments are lightweight, pleasurable, photogenic, and easy to join
- the ship and destination remain central to the appeal
- the niche enriches the trip rather than replacing the trip

---

### Phase D — Feed Blueprint Realism Into Aesthetic and Media Systems

**Implementation Status:** Mostly Completed — downstream prompt consumption, realism threading, and event-framing guardrails are implemented, but a fresh hero/concept regression pass is still required

#### D1. Aesthetic Brief Consumption

The Aesthetic Brief generator should ingest the new realism-boundary blueprint fields and convert them into:

- governing principle
- cruise-native moments
- believable niche modulation
- banned literalizations
- allowed props and discouraged props

#### D2. Media Prompt Consumption

Hero, concept, and thumbnail prompts should use those fields to:

- stay vacation-first
- stay cruise-legible
- keep niche signals light and believable
- avoid workshop, lab, and demo staging

#### D3. Selection and Review Support

The media review system should retain governance tags that align with discovery realism, such as:

- `travel-first`
- `ocean-forward`
- `headline-safe`
- `workshop-like`
- `literal-activity`
- `interior-heavy`
- `off-brief`

This allows the approval layer to reinforce the same realism logic the discovery layer now encodes.

---

### Phase E — Final Aesthetic Refinement

**Implementation Status:** Completed — verification breadth still pending

#### E1. Add Post-Draft Creative QA Pass

Implementation change:

- After the initial aesthetic draft is generated, run a dedicated schema-constrained refinement pass using GPT-5.4.
- Preserve the core identity, but polish weak phrasing and residual drift before the brief is saved.

Refinement focus:

- remove organized-program or meetup-operations language
- tighten cruise-first hierarchy
- soften prop repetition across concepts
- improve interpersonal chemistry and human warmth
- lightly integrate route-aware destination texture where supported

#### E2. Route-Aware Polishing

Implementation change:

- Feed route context into the aesthetic generator and refinement pass, including:
	- target destination
	- matched sail date
	- departure port
	- sailing length

Expected effect:

- Aesthetic briefs can reference believable destination mood and off-ship texture without becoming excursion-led or inventing unsupported details.

---

## 7. Concrete Code Changes

### 7.1 Discovery Pipeline

Primary file:

- `app/api/groups/discovery/core-logic.ts`

Changes:

- Completed: Rewrite Step 1 Perplexity prompt
- Completed: Rewrite Step 2 Perplexity prompt
- Completed: Rewrite Step 3 Gateway prompt
- Completed: Extend `ThemeBlueprintSchema`
- Completed: Persist the new blueprint fields onto campaign metadata
- Completed: Add cache prompt-version invalidation to prevent stale research reuse
- Completed: Add anti-drift wording guardrails for pastoral / cottagecore / slow-living themes
- Completed: Fix Step 3 model resolution so discovery can complete reliably
- Completed: Persist `targetDestination` so downstream systems retain route context from discovery

### 7.2 Strategy Documentation

Primary file:

- `.github/DOCS/Implementation/GROUP_STRATEGY/GROUP_CAMPAIGN_STRATEGY.md`

Changes:

- Completed: Update the documented Step 1, Step 2, and Step 3 prompt philosophy
- Completed: Add realism-boundary language to the discovery architecture section
- Completed: Clarify that theme generation is vacation-first and cruise-native by design

### 7.3 Campaign Type / Storage Layer

Primary files:

- `lib/campaigns/types.ts`
- any storage mapping or UI surface that renders blueprint fields

Changes:

- Completed: Add the new blueprint properties to campaign metadata types
- Completed: Persist and hydrate the new realism-boundary fields
- Completed: Ensure the discovery UI renders the new realism-boundary fields
- Completed: Ensure Phase B status can rehydrate visible cards with matched ship / price state
- Completed: Persist matched departure port and sailing length from Phase B

### 7.4 Aesthetic + Media Pipeline

Primary files:

- `lib/campaigns/aesthetic-engine.ts`
- `lib/campaigns/media/generators/stability-generator.ts`

Changes:

- Completed: Use the new blueprint realism fields as source material during aesthetic devising
- Completed: Propagate those boundaries into hero / concept prompt construction
- Completed: Add explicit plausibility framing to downstream media prompt building
- Completed: Feed matched route context into aesthetic generation
- Completed: Add a final refinement pass that reviews and polishes the full brief with GPT-5.4
- Completed: Add shared event-framing guidance so real itinerary events affect mood, timing, and atmosphere without hijacking campaign identity unless explicitly core to the product
- Completed: Preserve canonical ship identity in the aesthetic pipeline even when matched inventory metadata is noisy or conflicted
- Remaining: run a fresh regression pass on a newly generated post-redesign blueprint and record the result

### 7.5 Phase B Inventory Fidelity

Primary file:

- `lib/campaigns/cb-inventory-matcher.ts`

Changes:

- Completed: Treat explicit campaign ship names as hard constraints during Cruise Brothers inventory matching
- Completed: Prevent sister-ship cross-matching from winning on shared line / route tokens alone
- Completed: Validate the fix against the `sundown-spirits-2026` mismatch that had previously pulled the wrong ship into downstream context

---

## 8. Prompt Redesign Direction

### Step 1 — New Discovery Goal

The system should search for:

- communities whose identity can be expressed through leisure
- subcultures that would enjoy sharing space on a ship
- niches that enhance sightseeing, conversation, music, taste, creativity, or low-pressure play

The system should not search for:

- communities best expressed through protocols, diagnostics, instruction, or gear-heavy practice

### Step 2 — New Evaluation Goal

The system should analyze:

- believable cruise-native expressions
- emotional cadence of the niche at sea
- ship atmosphere compatibility
- plausible event and prop scale

before:

- technical facility or amenity matching

### Step 3 — New Blueprint Goal

The system should generate concepts that answer:

- Why does this feel like a great cruise?
- Why would strangers want to spend several days living inside this vibe together?
- How does the theme show up lightly and pleasantly rather than structurally and aggressively?

---

## 9. Acceptance Criteria

This redesign is successful when newly generated blueprints:

- Partially Verified: read as vacations, not retreats or residencies
- Partially Verified: contain naturally plausible shipboard scenes
- Partially Verified: avoid industrial, clinical, academic, and workshop-heavy phrasing
- Partially Verified: produce more campaign concepts similar to music, reading, nostalgia, craft-social, and scenic hobby communities
- Partially Verified: produce fewer campaign concepts centered on systems, labs, diagnostics, fieldwork, or formalized instruction

Media-level success criteria:

- Not Yet Re-Verified on the latest grounded blueprint batch: hero and concept images show believable cruise moments first
- Not Yet Re-Verified on the latest grounded blueprint batch: niche cues are light, human, and photogenic
- Not Yet Re-Verified on the latest grounded blueprint batch: review panels require less aggressive pruning of staged or bizarre imagery
- Partially Verified: aesthetic briefs are now reading more cruise-first, less convention-like, and more route-aware during iterative `deck-and-dice-2026` regeneration
- Partially Verified: real itinerary events now stay proportional in user-facing aesthetic copy rather than turning campaigns into event-program sailings
- Partially Verified: canonical ship fidelity is now protected earlier in the pipeline so downstream media generation is less likely to inherit wrong-ship context

---

## 10. Migration / Testing Plan

### T1. Prompt-Only Test

- Completed: Rewrite prompts in discovery pipeline
- Partially Completed: Run fresh discovery and inspect resulting blueprint quality
- Remaining: force a deliberately fresh cache-cleared / prompt-version-invalidated discovery pass and inspect raw Sonar + Gateway outputs specifically for cottagecore anti-drift behavior

### T2. Blueprint Quality Review

For each of the 5 generated blueprints, score:

- vacation plausibility
- cruise-native feel
- hobby/social resonance
- visual plausibility
- over-programming risk

Status:

- Completed informally on the latest batch; the outputs were judged materially stronger and more cruise-legible than the prior generation set.
- Remaining: capture a more explicit scored review if this document is to remain the formal record of acceptance.

### T3. Downstream Media Test

- Partially Completed: Re-run aesthetic brief generation iteratively on `deck-and-dice-2026` after prompt, route-context, refinement, and event-framing updates
- Partially Completed: Run a March 11 cross-campaign aesthetic verification sweep covering `needle-drop-2026`, `deck-and-dice-2026`, `sea-of-stories-2026`, and `sundown-spirits-2026`
- Partially Completed: Spot-check full confirmation outputs for `sea-of-stories-2026` and `sundown-spirits-2026` to separate true regressions from avoid-list false positives
- Remaining: Select one newly generated post-redesign blueprint
- Remaining: Run hero and concept generation only
- Remaining: Compare results against previous problematic campaigns and record whether pruning pressure is lower

### T4. Regression Guard

Reject any discovery batch where most outputs read like:

- labs
- workshops
- formal retreat programs
- industrial systems showcases
- institutional culture on a ship

Status:

- Partially Implemented in prompts and blueprint rejection rules
- Remaining: verify this guard by reviewing at least one intentionally fresh batch after the latest anti-drift changes

---

## 11. Rollout Order

Recommended order:

1. Completed: Update discovery prompts and schema
2. Completed: Update strategy documentation
3. Completed: Add blueprint realism fields to campaign metadata and UI
4. Completed: Thread realism fields into aesthetic devising
5. Completed: Add final refinement pass for aesthetic polishing
6. Remaining: Re-test hero and concept generation on a fresh post-redesign campaign

---

## 12. Immediate Next Work

The next verification session should execute the following:

1. Run a deliberately fresh discovery batch after invalidating or clearing the research cache and inspect raw Step 1 / Step 2 output for any remaining quiet-luxury drift.
2. Re-score the resulting 5 blueprints explicitly against the acceptance criteria in Section 9.
3. Select one of the newly grounded blueprints and verify that the refinement phase consistently improves the aesthetic brief rather than merely changing wording.
4. Generate hero and concept media for that blueprint and compare the outputs against previous problematic campaigns.
5. Record whether the downstream review workflow now needs less manual pruning of implausible imagery.
6. Decide whether the verifier should be upgraded to distinguish user-facing copy from avoid / discouraged sections before relying on raw keyword flags.
7. Decide whether a future CB itinerary-detail scraper is worth implementing to move beyond destination-level route awareness.

---

## 13. Non-Goal

This redesign does **not** attempt to eliminate niche specificity.

The goal is not to make campaigns generic.

The goal is to make campaigns:

- specific without becoming rigid
- aspirational without becoming implausible
- differentiated without becoming industrial
- themed without ceasing to feel like cruises
