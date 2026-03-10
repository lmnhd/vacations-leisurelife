# Phase 2.1 Media Generation

## Discovery-to-Media Realism Boundary Redesign Plan

**Status:** Planned
**Owner:** Group Campaign Discovery + Campaign Media Pipeline
**Problem Class:** Upstream concept drift causing downstream image plausibility failures

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

This redesign affects five layers:

1. Perplexity Sonar Step 1 prompt
2. Perplexity Sonar Step 2 prompt
3. Structured Blueprint Generation prompt and schema
4. Strategy documentation and system language
5. Downstream aesthetic/media interpretation of blueprint realism data

---

## 6. Implementation Plan

### Phase A — Rewrite Discovery Framing

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

## 7. Concrete Code Changes

### 7.1 Discovery Pipeline

Primary file:

- `app/api/groups/discovery/core-logic.ts`

Changes:

- Rewrite Step 1 Perplexity prompt
- Rewrite Step 2 Perplexity prompt
- Rewrite Step 3 Gateway prompt
- Extend `ThemeBlueprintSchema`
- Update campaign save mapping if new blueprint fields are persisted

### 7.2 Strategy Documentation

Primary file:

- `.github/DOCS/Implementation/GROUP_STRATEGY/GROUP_CAMPAIGN_STRATEGY.md`

Changes:

- Update the documented Step 1, Step 2, and Step 3 prompt philosophy
- Add realism-boundary language to the discovery architecture section
- Clarify that theme generation is vacation-first and cruise-native by design

### 7.3 Campaign Type / Storage Layer

Primary files:

- `lib/campaigns/types.ts`
- any storage mapping or UI surface that renders blueprint fields

Changes:

- Add new blueprint properties if they are stored on the campaign metadata record
- Ensure discovery UI can render the new realism-boundary fields

### 7.4 Aesthetic + Media Pipeline

Primary files:

- `lib/campaigns/aesthetic-engine.ts`
- `lib/campaigns/media/generators/stability-generator.ts`

Changes:

- Use the new blueprint realism fields as source material during aesthetic devising
- Propagate those boundaries into hero/concept prompt construction

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

- read as vacations, not retreats or residencies
- contain naturally plausible shipboard scenes
- avoid industrial, clinical, academic, and workshop-heavy phrasing
- produce more campaign concepts similar to music, reading, nostalgia, craft-social, and scenic hobby communities
- produce fewer campaign concepts centered on systems, labs, diagnostics, fieldwork, or formalized instruction

Media-level success criteria:

- hero and concept images show believable cruise moments first
- niche cues are light, human, and photogenic
- review panels require less aggressive pruning of staged or bizarre imagery

---

## 10. Migration / Testing Plan

### T1. Prompt-Only Test

- Rewrite prompts in discovery pipeline
- Run fresh discovery with cache cleared
- Inspect raw Sonar and Gateway outputs before saving campaigns

### T2. Blueprint Quality Review

For each of the 5 generated blueprints, score:

- vacation plausibility
- cruise-native feel
- hobby/social resonance
- visual plausibility
- over-programming risk

### T3. Downstream Media Test

- Select one newly generated blueprint
- Run aesthetic brief generation
- Run hero and concept generation only
- Compare results against previous problematic campaigns

### T4. Regression Guard

Reject any discovery batch where most outputs read like:

- labs
- workshops
- formal retreat programs
- industrial systems showcases
- institutional culture on a ship

---

## 11. Rollout Order

Recommended order:

1. Update discovery prompts and schema
2. Update strategy documentation
3. Add blueprint realism fields to campaign metadata and UI
4. Thread realism fields into aesthetic devising
5. Re-test hero and concept generation on a fresh campaign

---

## 12. Immediate Next Work

The next implementation session should execute the following:

1. Rewrite Step 1, Step 2, and Step 3 prompts in `app/api/groups/discovery/core-logic.ts`
2. Extend the blueprint schema with realism-boundary fields
3. Update `GROUP_CAMPAIGN_STRATEGY.md` to match the new prompt philosophy
4. Add campaign-type and discovery-UI support for the new fields
5. Run a fresh discovery batch with the research cache cleared and review the resulting 5 blueprints before allowing them into the normal pipeline

---

## 13. Non-Goal

This redesign does **not** attempt to eliminate niche specificity.

The goal is not to make campaigns generic.

The goal is to make campaigns:

- specific without becoming rigid
- aspirational without becoming implausible
- differentiated without becoming industrial
- themed without ceasing to feel like cruises
