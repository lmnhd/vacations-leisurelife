# API Endpoint Reference — Group Campaign System

**Root prefix: `/api/groups/`**
**ALL campaign-related API routes live here. No exceptions.**

> ⚠️ **Convention Rule**: New endpoints are NEVER added under `/api/campaigns/`, `/api/media/`, or any other top-level prefix. The namespace is `/api/groups/` — period. If you are adding a new endpoint, it goes here first.

---

## Namespace Hierarchy

```
/api/groups/
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
│       ├── store/ [NOT STARTED]       # Phase 2C — Binary Asset Storage
│       │   ├── POST /api/groups/campaign/:slug/media/store            Upload asset → R2 + DynamoDB
│       │   ├── GET  /api/groups/campaign/:slug/media/manifest         Retrieve CampaignMediaManifest
│       │   ├── GET  /api/groups/campaign/:slug/media/assets           Query assets by type/format
│       │   └── POST /api/groups/campaign/:slug/media/regenerate       Swap asset version
│       │
│       ├── distribute/ [NOT STARTED]  # Phase 2D — Platform Distribution
│       │   ├── POST /api/groups/campaign/:slug/media/distribute       Full dispatch or targeted platform
│       │   └── POST /api/groups/campaign/:slug/media/distribute/tiktok   TikTok-only dispatch
│       │
│       └── generate/ [NOT STARTED]    # Phase 2B — Asset Generation Jobs
│           └── POST /api/groups/campaign/:slug/media/generate         Trigger async generation jobs
│
└── health/ [NOT STARTED]              # Phase 7 — Lifecycle Tracking
    └── GET  /api/groups/health                        All-campaigns health report
```

---

## Implemented Endpoints (Detailed)

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

Phase 2A: Aesthetic → /api/groups/campaign/:slug/media/aesthetic (POST)
       ↓ writes MEDIA#AESTHETIC_BRIEF to DynamoDB
Phase 2A: Approve  → /api/groups/campaign/:slug/media/aesthetic/approve (POST)
       ↓ locks humanReviewStatus: 'approved'

[Phase 2B–D: NOT YET BUILT — add here when implemented]
```

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/campaigns/types.ts` | `Campaign`, `CampaignWaitlistEntry` types |
| `lib/campaigns/schema.ts` | `CampaignAestheticBriefSchema` + all nested Zod schemas |
| `lib/campaigns/campaign-store.ts` | DynamoDB read/write operations |
| `lib/campaigns/aesthetic-engine.ts` | Two-pass GPT-4o brief generation engine |
| `lib/campaigns/cb-inventory-matcher.ts` | Phase B fuzzy-matching logic |

---

*Last Updated: 2026-03-04*
*Maintained in: `.github/DOCS/Implementation/GROUP_STRATEGY/API_REFERENCE.md`*
