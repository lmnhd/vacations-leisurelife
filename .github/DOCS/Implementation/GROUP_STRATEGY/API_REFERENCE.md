# API Endpoint Reference — Group Campaign System

**Root prefix: `/api/groups/`**
**ALL campaign-related API routes live here. No exceptions.**

> ⚠️ **Convention Rule**: New endpoints are NEVER added under `/api/campaigns/`, `/api/media/`, or any other top-level prefix. The namespace is `/api/groups/` — period. If you are adding a new endpoint, it goes here first.

---

## Namespace Hierarchy

```
/api/groups/
│
├── theme-music-library/                # Shared default theme music library
│   ├── GET   /api/groups/theme-music-library                List all shared tracks; optional campaignSlug returns current best match
│   ├── POST  /api/groups/theme-music-library                Bulk upload tracks into the shared library
│   └── PATCH /api/groups/theme-music-library/:assetId       Update tags / notes / duration for a library track
│
├── discovery/                          # Phase A & B — Campaign Discovery Pipeline
│   ├── GET  /api/groups/discovery                     Phase A: run discovery OR load existing
│   ├── GET  /api/groups/discovery/phase-b             Phase B: status check (no run)
│   ├── GET  /api/groups/discovery/phase-b?run=true    Phase B: AI agent trigger
│   ├── POST /api/groups/discovery/phase-b             Phase B: UI trigger
│   └── DELETE /api/groups/discovery/clear             Wipe all campaigns + research cache
│
├── campaign/[slug]/                    # Per-Campaign Operations
│   ├── GET    /api/groups/campaign/:slug               Fetch campaign record (full flat JSON)
│   ├── DELETE /api/groups/campaign/:slug               Delete campaign METADATA record
│   │
│   └── media/                         # Phase 2 — Campaign Media Pipeline
│       │
│       ├── aesthetic/                 # Phase 2A — Identity Engine
│       │   ├── GET  /api/groups/campaign/:slug/media/aesthetic        Fetch existing brief
│       │   ├── POST /api/groups/campaign/:slug/media/aesthetic        Generate + persist brief
│       │   └── POST /api/groups/campaign/:slug/media/aesthetic/approve  Approve brief (Zod-validated)
│       │
│       ├── generate/              # Phase 2B — Asset Generation Jobs
│       │   └── POST /api/groups/campaign/:slug/media/generate         Trigger generation (full or by assetType[]; optional themeMusicSource)
│       │
│       ├── manifest/              # Phase 2B — Manifest Retrieval
│       │   └── GET  /api/groups/campaign/:slug/media/manifest         Retrieve CampaignMediaManifest
│       │
│       ├── assets/                # Phase 2B — Asset Queries
│       │   └── GET  /api/groups/campaign/:slug/media/assets?type=     Query by AssetType
│       │
│       ├── test/                  # Phase 2B — Per-Generator Test Routes
│       │   ├── POST /api/groups/campaign/:slug/media/test/copy        GPT-4o copy batch
│       │   ├── POST /api/groups/campaign/:slug/media/test/audio       ElevenLabs narration/hype + Replicate/default theme music
│       │   ├── POST /api/groups/campaign/:slug/media/test/images      Stability AI hero/concepts + Sharp crops
│       │   └── POST /api/groups/campaign/:slug/media/test/merch       DALL-E 3 single merch item by index
│       │
│       ├── store/ [NOT STARTED]   # Phase 2C — Binary Asset Storage
│       │   └── POST /api/groups/campaign/:slug/media/store            Upload asset → R2 + DynamoDB
│       │
│       └── distribute/ [NOT STARTED]  # Phase 2D — Platform Distribution
│           └── POST /api/groups/campaign/:slug/media/distribute       Full dispatch or targeted platform
│
└── health/ [NOT STARTED]              # Phase 7 — Lifecycle Tracking
    └── GET  /api/groups/health                        All-campaigns health report
```

---

## Implemented Endpoints (Detailed)

### Shared Theme Music Library

| Method | Path | File | Status |
|--------|------|------|--------|
| `GET` | `/api/groups/theme-music-library` | `app/api/groups/theme-music-library/route.ts` | ✅ Live |
| `POST` | `/api/groups/theme-music-library` | `app/api/groups/theme-music-library/route.ts` | ✅ Live |
| `PATCH` | `/api/groups/theme-music-library/:assetId` | `app/api/groups/theme-music-library/[assetId]/route.ts` | ✅ Live |

### Discovery Pipeline

| Method | Path | File | Status |
|--------|------|------|--------|
| `GET` | `/api/groups/discovery` | `app/api/groups/discovery/route.ts` | ✅ Live |
| `GET` | `/api/groups/discovery/phase-b` | `app/api/groups/discovery/phase-b/route.ts` | ✅ Live |
| `POST` | `/api/groups/discovery/phase-b` | `app/api/groups/discovery/phase-b/route.ts` | ✅ Live |
| `DELETE` | `/api/groups/discovery/clear` | `app/api/groups/discovery/clear/route.ts` | ✅ Live |

### Per-Campaign

| Method | Path | File | Status |
|--------|------|------|--------|
| `GET` | `/api/groups/campaign/:slug` | `app/api/groups/campaign/[slug]/route.ts` | ✅ Live |
| `DELETE` | `/api/groups/campaign/:slug` | `app/api/groups/campaign/[slug]/route.ts` | ✅ Live |

### Campaign Media — Phase 2A (Aesthetic)

| Method | Path | File | Status |
|--------|------|------|--------|
| `GET` | `/api/groups/campaign/:slug/media/aesthetic` | `app/api/groups/campaign/[slug]/media/aesthetic/route.ts` | ✅ Live |
| `POST` | `/api/groups/campaign/:slug/media/aesthetic` | `app/api/groups/campaign/[slug]/media/aesthetic/route.ts` | ✅ Live |
| `POST` | `/api/groups/campaign/:slug/media/aesthetic/approve` | `app/api/groups/campaign/[slug]/media/aesthetic/approve/route.ts` | ✅ Live |

### Campaign Media — Phase 2B (Generation)

| Method | Path | File | Status |
|--------|------|------|--------|
| `POST` | `/api/groups/campaign/:slug/media/generate` | `app/api/groups/campaign/[slug]/media/generate/route.ts` | ✅ Live (`assetTypes[]`, optional `themeMusicSource: 'default' | 'replicate'`) |
| `GET` | `/api/groups/campaign/:slug/media/manifest` | `app/api/groups/campaign/[slug]/media/manifest/route.ts` | ✅ Live |
| `GET` | `/api/groups/campaign/:slug/media/assets` | `app/api/groups/campaign/[slug]/media/assets/route.ts` | ✅ Live |

### Campaign Media — Phase 2B Test Routes

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST` | `/api/groups/campaign/:slug/media/test/copy` | `{}` | Full copy JSON (slides, variants, captions, subjects) |
| `POST` | `/api/groups/campaign/:slug/media/test/audio` | `{ generator: 'elevenlabs_narration' \| 'elevenlabs_hype' \| 'replicate_theme' \| 'default_theme' }` | AssetRecord with CDN URL |
| `POST` | `/api/groups/campaign/:slug/media/test/images` | `{ generator: 'stability_hero' \| 'stability_concepts' \| 'sharp_crops', sourceImageBase64? }` | base64 image or crop array |
| `POST` | `/api/groups/campaign/:slug/media/test/merch` | `{ itemIndex: 0\|1\|2... }` | base64 image + revised prompt |

---

## Identifier: Slug vs ID

> **`slug`** is the canonical campaign identifier everywhere. It is set at discovery time and is the `PK` suffix in DynamoDB (`CAMPAIGN#<slug>`). Use `[slug]` for all dynamic route folder names.

---

## Data Flow Summary

```
Discovery (Phase A) → /api/groups/discovery
       ↓ writes Campaign records to DynamoDB (METADATA)
CB Match (Phase B) → /api/groups/discovery/phase-b
       ↓ updates Campaign records with pricing + CB booking link
Campaign Lookup → /api/groups/campaign/:slug
       ↓ read by downstream phases

Phase 2A: Aesthetc  → /api/groups/campaign/:slug/media/aesthetic (POST)
       ↓ writes MEDIA#AESTHETIC_BRIEF to DynamoDB
Phase 2A: Approve  → /api/groups/campaign/:slug/media/aesthetic/approve (POST)
       ↓ locks humanReviewStatus: 'approved'

Shared Theme Music Library → /api/groups/theme-music-library (GET/POST/PATCH)
       ↓ stores premade tracks under shared slug with AI-selectable tags

Phase 2B: Generate → /api/groups/campaign/:slug/media/generate (POST)
       ↓ runs 8 generators in parallel groups, using either shared default theme music or Replicate for theme_music
Phase 2B: Manifest → /api/groups/campaign/:slug/media/manifest (GET)
       ↓ returns CampaignMediaManifest with all CDN URLs
Phase 2B: Assets   → /api/groups/campaign/:slug/media/assets?type= (GET)
       ↓ returns AssetRecord[] filtered by AssetType

[Phase 2C–D: NOT YET BUILT — add here when implemented]
```

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/campaigns/types.ts` | `Campaign`, `CampaignWaitlistEntry` types |
| `lib/campaigns/schema.ts` | All Zod schemas: aesthetic brief, asset records, media jobs, manifest |
| `lib/campaigns/campaign-store.ts` | DynamoDB read/write: campaign, brief, pricing match |
| `lib/campaigns/aesthetic-engine.ts` | Two-pass GPT-4o brief generation engine |
| `lib/campaigns/cb-inventory-matcher.ts` | Phase B fuzzy-matching logic |
| `lib/campaigns/media/r2-client.ts` | Cloudflare R2 upload/delete, CDN URL builder |
| `lib/campaigns/media/media-store.ts` | DynamoDB ops: jobs, assets, manifests, campaign media status |
| `lib/campaigns/media/media-orchestrator.ts` | Two-phase parallel generation pipeline |
| `lib/campaigns/media/theme-music-library.ts` | Shared theme music library helpers, tag parsing, and default selection logic |
| `lib/campaigns/media/generators/` | Generator modules (stability, sharp, dalle, heygen, runway, elevenlabs, replicate music, copy) |

---

*Last Updated: 2026-03-04*
*Maintained in: `.github/DOCS/Implementation/GROUP_STRATEGY/API_REFERENCE.md`*
