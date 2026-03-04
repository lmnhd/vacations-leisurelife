# Phase 3: Storage & Organization
### Asset Storage Architecture

**Input:** `CampaignMediaManifest` (from Phase 2)  
**Output:** All assets committed to indexed, addressable storage with CDN URLs  
**Responsibility:** Every generated binary and its metadata are persisted in a queryable, campaign-keyed structure

---

## Storage Stack

| Layer | Service | Purpose |
|-------|---------|---------|
| Binary storage | Cloudflare R2 (primary) | All media files — images, video, audio |
| Binary fallback | AWS S3 | Overflow or redundancy for large video files |
| Metadata index | DynamoDB `lll-shadow-campaigns` | Asset records keyed to campaign slug |
| CDN delivery | Cloudflare (R2 public bucket) | Edge-served URLs for all assets |
| Draft/temp storage | `/tmp` (serverless) | Generation intermediate files, cleared after commit |

---

## R2 Bucket Structure

**Bucket name:** `lll-campaign-media`

```
lll-campaign-media/
  campaigns/
    {slug}/                              e.g., analog-voyage-2026/
      aesthetic/
        brief.json                       The CampaignAestheticBrief
      images/
        hero/
          hero_001_16x9.webp
          hero_001_4x5.webp
          hero_001_9x16.webp
          hero_001_1x1.webp
          hero_001_og.webp
          hero_002_16x9.webp
          ...
        concepts/
          concept_001.webp
          concept_002.webp
          ...
      video/
        tiktok_seed.mp4
        hero_explainer.mp4
        threshold_announcement.mp4
        countdown_3cabins.mp4
        countdown_2cabins.mp4
        countdown_1cabin.mp4
        broll_001.mp4
        broll_002.mp4
        broll_003.mp4
      audio/
        ambient_narration.mp3
        hype_clip.mp3
        theme_music.mp3
      merch/
        designs/
          core_tshirt_design.png
          lanyard_design.png
          niche_item_001_design.png
        mockups/
          core_tshirt_mockup_front.webp
          core_tshirt_mockup_lifestyle.webp
          lanyard_mockup.webp
      copy/
        platform_captions.json
        ad_variants.json
        email_subjects.json
        carousel_slides.json
      manifests/
        media_manifest.json             The CampaignMediaManifest
```

**Key design decisions:**
- WebP for all static images (quality 85, ~60–70% size of JPEG at equal quality)
- MP4 H.264 for all video (broad compatibility; H.265 variant generated for iOS/Safari)
- Public read access on CDN URLs; write access only via server-side API with R2 token
- Folder paths are deterministic from `slug` — no lookup needed to construct a URL

### CDN URL Pattern
```
https://cdn.leisurelifeinteractive.com/campaigns/{slug}/{path}

Examples:
  https://cdn.leisurelifeinteractive.com/campaigns/analog-voyage-2026/images/hero/hero_001_16x9.webp
  https://cdn.leisurelifeinteractive.com/campaigns/analog-voyage-2026/video/tiktok_seed.mp4
```

---

## DynamoDB Schema Extensions

### New Record Type: `MEDIA#AESTHETIC_BRIEF`
Stores the full `CampaignAestheticBrief` JSON.

```
PK: CAMPAIGN#analog-voyage-2026
SK: MEDIA#AESTHETIC_BRIEF
─────────────────────────────
aestheticBriefJson:  <full CampaignAestheticBrief serialized>
generatedAt:         ISO timestamp
humanReviewStatus:   'approved'
revisionNotes:       (optional)
```

### New Record Type: `MEDIA#MANIFEST`
Stores the full `CampaignMediaManifest` — the complete asset index with CDN URLs.

```
PK: CAMPAIGN#analog-voyage-2026
SK: MEDIA#MANIFEST
─────────────────────────────
manifestJson:        <full CampaignMediaManifest serialized>
generatedAt:         ISO timestamp
totalAssets:         37
completionStatus:    'complete'
```

### New Record Type: `MEDIA#ASSET#{assetId}`
Individual record per generated asset. Enables per-asset querying, status tracking, and version management.

```
PK: CAMPAIGN#analog-voyage-2026
SK: MEDIA#ASSET#img_hero_001_16x9
─────────────────────────────
assetId:            img_hero_001_16x9
assetType:          hero_image
url:                https://cdn.../hero_001_16x9.webp
generator:          midjourney
promptUsed:         <full prompt string>
dimensions:         { width: 1920, height: 1080 }
fileSizeBytes:      284672
mimeType:           image/webp
tags:               ['hero', '16x9', 'landing_page']
createdAt:          ISO timestamp
reviewStatus:       auto_approved
version:            1
```

### METADATA Record Updates
When Phase 3 completes, the `METADATA` record receives two new fields:

```
mediaStatus:         'ready'     // 'not_started' | 'generating' | 'partial' | 'ready'
mediaGeneratedAt:    ISO timestamp
mediaManifestUrl:    https://cdn.../manifests/media_manifest.json
```

---

## Asset Versioning

All assets support versioning. When a human reviewer regenerates an asset (e.g., requests a new hero image), the previous version is retained:

- Old asset: `SK: MEDIA#ASSET#img_hero_001_16x9` — `version: 1`, `active: false`
- New asset: `SK: MEDIA#ASSET#img_hero_001_16x9_v2` — `version: 2`, `active: true`

The manifest always references the `active: true` version for each `assetId`.

---

## Generation Job Tracking

Each generation job (from Phase 2) writes a job record to DynamoDB:

```
PK: CAMPAIGN#analog-voyage-2026
SK: MEDIAJOB#job_{uuid}
─────────────────────────────
jobId:          job_abc123
assetType:      hero_image
status:         complete
generator:      midjourney
promptUsed:     <prompt>
outputUrl:      https://cdn.../hero_001_16x9.webp
retryCount:     0
createdAt:      ISO timestamp
completedAt:    ISO timestamp
```

Job records enable:
- Resumable generation (failed jobs are retried without re-running completed jobs)
- Cost tracking (count calls per generator per campaign)
- Audit trail for quality review

---

## Storage API

### Store Asset
```typescript
// POST /api/campaigns/[slug]/media/store
interface StoreAssetRequest {
  assetType: AssetType;
  generator: GeneratorService;
  promptUsed: string;
  fileBuffer: Buffer;
  mimeType: string;
  tags: string[];
  dimensions?: { width: number; height: number };
  durationSeconds?: number;
}

// Returns: AssetRecord with CDN URL
```

### Get Media Manifest
```typescript
// GET /api/campaigns/[slug]/media/manifest
// Returns: CampaignMediaManifest or 404 if not generated
```

### Get Asset by Type
```typescript
// GET /api/campaigns/[slug]/media/assets?type=hero_image&format=16x9
// Returns: AssetRecord[]
```

### Regenerate Asset
```typescript
// POST /api/campaigns/[slug]/media/regenerate
interface RegenerateRequest {
  assetId: string;
  overridePrompt?: string;   // Optional human-provided prompt override
  keepPrevious: boolean;     // Whether to retain old version
}
```

---

## Storage Cost Estimates

Based on typical campaign asset set (~150–200MB total):

| Item | Monthly Cost |
|------|-------------|
| R2 storage (1GB campaign library × 20 campaigns) | ~$0.015/GB = $0.30 |
| R2 egress (CDN traffic) | First 10GB/month free on R2 |
| DynamoDB reads/writes | Minimal — within free tier for this pattern |
| **Estimated total** | **< $5/month** at 20 active campaigns |

R2 is chosen over S3 specifically for the zero egress cost on CDN-served public assets — all landing page hero images, social embeds, and video previews serve from R2 via Cloudflare without egress charges.
