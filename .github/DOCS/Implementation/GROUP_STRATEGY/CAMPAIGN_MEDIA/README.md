# Campaign Media Automation System
### Leisure Life Interactive — Promotional Media Pipeline

**Status:** Blueprint / Phase Design  
**Branch:** `feature/shadow-groups`  
**Linked Strategy:** `../GROUP_CAMPAIGN_STRATEGY.md` (Phase C & §5)

---

## What This System Does

Every Shadow Group campaign requires a cohesive set of promotional media to move from *concept* to *conversion*. This system automates the full lifecycle:

1. **Devise** — AI-generated campaign aesthetic identity (visual style, slogans, color palette, content concepts, merch direction)
2. **Generate** — Automated production of all media assets (images, video, voice, copy) using a curated stack of generation APIs
3. **Store** — Structured asset storage keyed to campaign slugs (DynamoDB metadata + S3/R2 binaries)
4. **Distribute** — Automated delivery of the right asset to the right platform at the right stage of the campaign lifecycle

The system exposes both a **UI flow** (for human-driven campaign creation sessions) and an **agent-callable API layer** (for fully automated batch processing inside the monthly Blueprint Sprint).

---

## Document Index

| Document | Purpose |
|----------|---------|
| [PHASE_1_AESTHETIC_DEVISING.md](./PHASE_1_AESTHETIC_DEVISING.md) | Campaign identity engine — how aesthetic, slogans, style, and conceptual direction are generated |
| [PHASE_2_MEDIA_GENERATION.md](./PHASE_2_MEDIA_GENERATION.md) | Asset production pipeline — every media type, its generator, prompt strategy, and output spec |
| [PHASE_3_STORAGE_ORGANIZATION.md](./PHASE_3_STORAGE_ORGANIZATION.md) | Asset storage architecture — DynamoDB schema extensions, file naming, R2/S3 bucket structure |
| [PHASE_4_DISTRIBUTION.md](./PHASE_4_DISTRIBUTION.md) | Distribution engine — platform mapping, stage-triggered dispatch, scheduling, and automation hooks |
| [API_SERVICES_REFERENCE.md](./API_SERVICES_REFERENCE.md) | Complete reference for every third-party service in the stack — endpoints, auth, rate limits, cost |
| [AGENTIC_MODIFICATION_INFRASTRUCTURE.md](./AGENTIC_MODIFICATION_INFRASTRUCTURE.md) | Agent API layer — credit checks, targeted asset regeneration, approval gates, human confirmation patterns |
| [IMAGE_GOVERNANCE_SELECTION_SYSTEM.md](./IMAGE_GOVERNANCE_SELECTION_SYSTEM.md) | Human-guided image curation, approval rules, context-aware downstream asset selection, and implementation progress |

---

## The Four-Phase Flow

```
CAMPAIGN CONFIG OBJECT (Phase D → GROUP_CAMPAIGN_STRATEGY §6.4)
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│  PHASE 1: Aesthetic Design                                   │
│  AI generates the full campaign identity brief:                │
│  • Visual style, color palette, typography direction           │
│  • Slogan set (hero, sub, CTA variants)                       │
│  • Platform-specific content concept bank                      │
│  • Merch design direction                                      │
│  OUTPUT: CampaignAestheticBrief (typed JSON)                  │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  PHASE 2: MEDIA GENERATION                                     │
│  Batch production of all assets from the Aesthetic Brief:      │
│  • Real ship references + hero imagery (SerpAPI-based)        │
│  • Video content (HeyGen avatars, RunwayML scenes)            │
│  • Voice narration (ElevenLabs)                               │
│  • Copy / captions (GPT-4o)                                   │
│  • Merch design files (DALL-E → Printful)                     │
│  OUTPUT: CampaignMediaManifest (all asset URLs + metadata)    │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  PHASE 3: STORAGE & ORGANIZATION                               │
│  All generated assets committed to structured storage:         │
│  • Binary files → Cloudflare R2 (primary) / S3 (fallback)    │
│  • Asset metadata → DynamoDB MEDIA# records                   │
│  • Campaign media index → METADATA record updated             │
│  OUTPUT: Fully indexed, campaign-keyed asset library          │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  PHASE 4: DISTRIBUTION                                         │
│  Right asset → Right platform → Right campaign stage          │
│  • Landing page hero assets auto-populated                    │
│  • Social posts queued per platform per week                  │
│  • Email assets auto-linked in Klaviyo templates              │
│  • Merch store opened with generated designs at threshold     │
│  • Community channel media package dispatched at Stage 2.6   │
└────────────────────────────────────────────────────────────────┘
```

---

## Entry Points

### UI Entry Point
`/dashboard/campaigns/[slug]/media` — Campaign Media Studio  
Human-in-the-loop session. Displays the Aesthetic Brief for review/edit, allows individual asset regeneration, manual overrides, and one-click distribution scheduling.

### Agent Entry Points

**Cost pre-check (always first):**  
`GET /api/groups/campaign/[slug]/media/credit-check`  
Query cost estimate and live RunwayML balance before committing to generation. Returns `canProceed`, `blockers`, and a full `summary` string suitable for agent output. Agents must surface this to the operator and request confirmation before any video generation.

**Full or targeted generation:**  
`POST /api/groups/campaign/[slug]/media/generate`  
Runs the full pipeline or a targeted `assetTypes` subset. Performs credit pre-check internally. Skips any deliverable already in the manifest. Merges into existing manifest.

**Manifest inspection:**  
`GET /api/groups/campaign/[slug]/media/manifest`  
Fetch the current `CampaignMediaManifest` to determine gaps and asset URLs.

**Production Bible (re)generation:**  
`POST /api/groups/campaign/[slug]/media/aesthetic/production-bible`  
Rewrites scene library and storyboards. Call before generating scene images or videos when creative direction changes.

See [AGENTIC_MODIFICATION_INFRASTRUCTURE.md](./AGENTIC_MODIFICATION_INFRASTRUCTURE.md) for the full agent API surface, targeted asset replacement spec, and human confirmation patterns.

---

## Media Stack Summary

| Category | Primary Tool | Fallback | Use Case |
|----------|-------------|----------|----------|
| Image Generation | Nano-Banana (Gemini 2.5 Flash) | — | Hero images, scene images, aesthetic concepts, merch art |
| Ship Reference Discovery | SerpAPI Google Images | — | Real ship photos as source-of-truth visual anchor |
| Video — All Deliverables | RunwayML Gen-3 Turbo via provider abstraction layer | HeyGen (legacy path), fal.ai (planned) | Storyboard-driven multi-shot videos with per-shot scene images and future provider swapping |
| Voice / Audio | ElevenLabs | OpenAI TTS | Narration, hype clips, landing page ambient audio |
| Music / Soundscape | Shared Default Library + Replicate MusicGen | — | Background music for video, theme song |
| Copy / Captions | LLM gateway (configurable model) | — | Platform captions, email copy, slogan generation |
| Merch Design | Nano-Banana (Gemini 2.5 Flash) | DALL-E 3 | T-shirts, lanyards, niche-specific items |

---

## Relationship to GROUP_CAMPAIGN_STRATEGY.md

This system implements and expands **Phase C: "Vibe" Asset Generation** (§6.3) into a complete automated production and distribution pipeline. It also integrates with:

- **§5.4 "Synthetic Influencer Strategy"** — HeyGen + ElevenLabs assets produced here feed the TikTok/Meta ad creative
- **§5.5 TikTok — Organic Seeding** — the 30–60s concept videos are produced in Phase 2
- TikTok video implementation is split between storyboard-driven promotional video generation and distribution-layer delivery. The active roadmap for improving TikTok promo quality lives in `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/PHASE_2_MEDIA_GENERATION/TIKTOK_VIDEO_PRODUCTION/TIKTOK_VIDEO_REFACTOR_PLAN.md`.
- **§2.7 Branded Merchandise** — merch design files generated in Phase 2, activated at `THRESHOLD_MET`
- **§7.1 Monthly Blueprint Sprint** — Phase 1 + 2 run as part of the batch sprint for all 5 campaigns

---

## Proposed Refactor: Phase 1.5 Secondary Campaign Research

### Why This Needs To Exist

The current pipeline is strong at moving from:

1. broad niche discovery
2. blueprint approval
3. aesthetic brief generation
4. media generation
5. distribution

But once a single blueprint is approved, the system still tends to move downstream with only a high-level understanding of the campaign niche.

That is not enough for the current quality bar.

Downstream systems now need richer campaign-specific intelligence such as:

- what people in this niche are actually doing right now
- what products, rituals, routines, or formats define participation
- what makes this trend newly relevant instead of evergreen-generic
- what details feel insider-true versus lazy stereotype
- what concrete sub-activities, social signals, props, phrases, and moments should appear in copy and media

Examples:

- A board-games-at-sea campaign should not stop at "people like board games." It should know whether the current social energy is casual modern strategy games, cozy co-op tables, social deduction, legacy campaign fandom, portable deck-builders, or café-style open-table culture.
- A health-and-wellness cruise should not collapse into generic yoga imagery. It should know whether the current trend cycle is driven by recovery rituals, sleep optimization, walking clubs, sound baths, cold-plunge-adjacent curiosity, longevity framing, breathwork, wearable tracking, or some newer hybrid behavior.

The missing layer is not another full discovery pass.

It is a **targeted campaign-deepening pass** that happens only after the campaign has already been selected.

### Placement In The Existing Pipeline

This should be inserted immediately after:

- discovery blueprint approval
- inventory / ship plausibility confirmation

And before:

- aesthetic brief generation
- production bible generation
- media generation
- downstream copy and distribution planning

Recommended updated flow:

1. Discovery blueprint
2. Discovery red team
3. Discovery revision if needed
4. Ship matcher / pricing match
5. **Secondary campaign research**
6. Aesthetic brief generation
7. Aesthetic red team
8. Aesthetic revision if needed
9. Aesthetic approval
10. Media and landing asset production
11. Final QA / export gates

### Strategic Goal

The purpose of Phase 1.5 is to create a **campaign-specific research dossier** that gives all downstream systems a grounded, current, niche-literate view of the selected campaign.

It should answer:

- what this niche looks like in practice today
- what kinds of people are participating and how
- which micro-trends are rising inside the niche
- what behaviors feel current and authentic
- which details are visually useful
- which details are copy-useful
- which details are socially magnetic on a cruise
- which details should be avoided because they are cliché, outdated, too operationally heavy, or not cruise-plausible

### Design Constraints

This phase should be intentionally lighter and cheaper than the original discovery stack.

Requirements:

- run per selected campaign, not for the whole slate
- use fewer tokens than the original Gemini / Deep Research discovery phase
- prefer synthesis over exploration breadth
- leverage already-known campaign context instead of starting from zero
- produce structured outputs that downstream systems can consume directly

This is a **depth pass**, not a second campaign ideation pass.

It should not re-litigate whether the campaign exists. It should deepen the selected campaign so the rest of the system can execute with specificity.

### Proposed Output: Campaign Research Dossier

Phase 1.5 should produce a typed object stored on the campaign record and made available to all later phases.
The dossier is split into two layers:

- `nicheResearch` for the pure niche intelligence
- `cruiseTranslation` for cruise-plausible adaptation and downstream guidance

Recommended conceptual output:

```ts
interface CampaignResearchDossier {
  nicheResearch: {
    nicheTitle: string;
    trendCycleSummary: string;
    whyThisTrendFeelsDistinctNow: string;
    audienceRoutineInsights: string[];
    specificExamples: string[];
    allowedSignals: string[];
    discouragedSignals: string[];
    sourceNotes?: string[];
  };
  cruiseTranslation: {
    cruiseNativeTranslationNotes: string[];
    downstreamImplications: {
      briefDirection: string[];
      mediaGeneration: string[];
      copyDirection: string[];
    };
  };
}
```

This object should be concise enough to generate cheaply, but rich enough to drive image prompts, storyboard logic, copy generation, landing-page language, and ad targeting angles.

### How Phase 1.5 Should Work

#### Option A: Cached Research + Focused Refresh

Recommended default.

Inputs:

- approved discovery blueprint
- ship / pricing match context
- existing discovery research artifacts
- current campaign slug, theme, psychographic framing, and niche language

Process:

1. Start from already-approved campaign context.
2. Reuse discovery findings instead of repeating deep open-ended research.
3. Run a narrow refresh prompt aimed at current niche specifics and rising sub-trends.
4. Produce the typed dossier.
5. Run a short validation / red-team pass for cliché drift and unsupported claims.

This keeps the token burn low while still letting the system answer "what exactly are these people into right now?"

#### Option B: Lightweight Multi-Step Synthesis

If more rigor is needed without paying for full deep research, split the work into three smaller calls:

1. extract what is already known from the approved blueprint
2. perform a narrow trend-and-specificity refresh
3. synthesize both into the final dossier

This is still much cheaper than re-running the full discovery stack across the whole slate.

### Where It Should Be Stored

Recommended persistence:

- add a `campaignResearchDossier` field to the campaign record
- keep the approved blueprint unchanged as the canonical selection artifact
- treat the dossier as downstream-enablement context, not as a replacement for the blueprint

That separation matters:

- the blueprint says **what the campaign is**
- the dossier says **what the niche currently feels like in detail**

### Downstream Consumers

This new dossier should be injected everywhere that currently relies too heavily on the brief alone.

#### 1. Aesthetic Brief Generation

The dossier should inform:

- visual cues
- prop families
- human styling specifics
- believable activity selection
- what should count as niche truth versus costume logic

This gives the brief engine more than abstract vibe language.

#### 2. Production Bible / Landing Still Bible

The dossier should directly improve:

- scene specificity
- activity realism
- object selection
- conversational and social moments
- image prompts that feel themed without becoming absurd

#### 3. Copy Generation

The dossier should supply:

- vocabulary
- current-interest hooks
- insider-but-accessible phrasing
- detail anchors for captions, ads, and landing modules

This is where "why now" and "trend cycle" detail becomes especially valuable.

#### 4. TikTok / Video Package Generation

The dossier should shape:

- beat selection
- proof points
- social details
- on-screen text specificity
- what feels trend-literate instead of generic

#### 5. Distribution Planning

The dossier should support:

- better audience-angle notes
- stronger platform-specific positioning
- more specific ad framing
- better differentiation between organic social proof and paid acquisition hooks

### Operator UI Surfaces

The research should be visible in the main working surfaces, not buried in storage.

Recommended UI placement:

- `/tests/brief-studio` should show the selected campaign research next to the brief, so the operator can see why the brief engine emphasized certain details.
- `/tests/media-generation` should show the same research above the manifest and asset tabs, so the operator can see why scenes, heroes, copy, and package layout lean toward specific niche cues.
- Brief Studio should expose a visible Generate / Regenerate Dossier action because the dossier is a mandatory brief-stage gate and should not feel like a one-time hidden artifact.
- Both pages should render the dossier directly, with a collapsed raw JSON fallback for full auditability.

### Guardrails

This phase should not become runaway research.

Hard rules:

- one selected campaign at a time
- narrow, campaign-specific prompts only
- no full-slate re-analysis
- no open-ended "tell me everything about wellness" behavior
- prefer structured facts and usable downstream notes over essay-length prose
- run one short validation pass for cliché drift, trend exaggeration, and cruise implausibility

### Implementation Plan

#### Phase A: Data Model + Storage

1. Add `campaignResearchDossier` to campaign schema and persistence layer.
2. Track `researchDossierGeneratedAt` on the campaign record so refreshes are auditable.
3. Keep the dossier split between niche research and cruise translation so downstream consumers do not blur the two.

#### Phase B: Generation Service

1. Create a new service responsible for dossier generation.
2. Feed it the approved blueprint, discovery findings, and matched ship context.
3. Keep the prompt tightly scoped to present-day niche specifics and usable downstream detail.
4. Return a typed dossier object.

Recommended shape:

- `lib/campaigns/campaign-research.ts`
- optional route: `POST /api/groups/campaign/[slug]/research-dossier`
- optional read route: `GET /api/groups/campaign/[slug]/research-dossier`

#### Phase C: Validation Pass

1. Add a lightweight review step that checks for:
   - cliché drift
   - unsupported hype language
   - generic wellness / generic hobby fallback
   - non-cruise-plausible recommendations
2. Store review notes alongside the dossier if needed.

This should be much lighter than full discovery red-team logic.

#### Phase D: Brief Engine Integration

1. Inject dossier content into aesthetic brief generation.
2. Update prompt assembly so the brief engine pulls:
   - rising activities
   - routines and rituals
   - visual props and objects
   - anti-generic fallbacks
   - copy and distribution notes
3. Prefer dossier-backed specifics when building visual plausibility and community-expression layers.

#### Phase E: Media / Copy / Distribution Integration

1. Pass dossier notes into image prompt builders.
2. Pass dossier notes into copy generation and TikTok synthesis.
3. Pass dossier notes into distribution planning and ad-angle selection.
4. Expose dossier details in review UIs so the operator can inspect the research context driving generation.

### Lowest-Risk Rollout Order

To avoid a large refactor all at once:

1. Ship the dossier schema and generation route.
2. Store dossier output on campaigns.
3. Inject it into the aesthetic brief engine only.
4. Validate quality lift on one campaign at a time.
5. Then wire it into copy, TikTok package generation, and distribution planning.

This lets the dossier improve the system at the highest-leverage point first: the brief layer that all later artifacts inherit from.

### Expected Benefits

If implemented well, this phase should:

- reduce generic downstream outputs
- improve authenticity and specificity in media and copy
- make trend-sensitive campaigns feel current instead of template-driven
- reduce late-stage fixes caused by vague upstream understanding
- create a reusable campaign intelligence layer for every downstream component

### Summary

The system currently has a gap between **campaign selection** and **campaign expression**.

Phase 1.5 should fill that gap.

Discovery tells us which campaign is worth building.
Secondary campaign research should tell the rest of the stack what that campaign actually looks like in the weeds, right now, in a form that media, copy, landing, and distribution systems can all use directly.
