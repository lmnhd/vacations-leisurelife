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

---

## The Four-Phase Flow

```
CAMPAIGN CONFIG OBJECT (Phase D → GROUP_CAMPAIGN_STRATEGY §6.4)
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│  PHASE 1: AESTHETIC DEVISING                                   │
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
| Video — All Deliverables | RunwayML Gen-3 Turbo (Production Bible path) | HeyGen (legacy path) | Storyboard-driven multi-shot videos with per-shot scene images |
| Voice / Audio | ElevenLabs | OpenAI TTS | Narration, hype clips, landing page ambient audio |
| Music / Soundscape | Shared Default Library + Replicate MusicGen | — | Background music for video, theme song |
| Copy / Captions | LLM gateway (configurable model) | — | Platform captions, email copy, slogan generation |
| Merch Design | Nano-Banana (Gemini 2.5 Flash) | DALL-E 3 | T-shirts, lanyards, niche-specific items |

---

## Relationship to GROUP_CAMPAIGN_STRATEGY.md

This system implements and expands **Phase C: "Vibe" Asset Generation** (§6.3) into a complete automated production and distribution pipeline. It also integrates with:

- **§5.4 "Synthetic Influencer Strategy"** — HeyGen + ElevenLabs assets produced here feed the TikTok/Meta ad creative
- **§5.5 TikTok — Organic Seeding** — the 30–60s concept videos are produced in Phase 2
- **§2.7 Branded Merchandise** — merch design files generated in Phase 2, activated at `THRESHOLD_MET`
- **§7.1 Monthly Blueprint Sprint** — Phase 1 + 2 run as part of the batch sprint for all 5 campaigns
