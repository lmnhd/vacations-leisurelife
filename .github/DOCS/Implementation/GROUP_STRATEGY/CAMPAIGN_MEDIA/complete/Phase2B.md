# Phase 2B Media Generation — Walkthrough

## What Was Built

Complete media generation pipeline consuming an **approved aesthetic brief** and producing images, video, audio, copy, and merch assets — uploaded to R2 with DynamoDB tracking.

## Architecture

```
Aesthetic Brief (Phase 1 output)
        │
        ▼
┌──────────────────────┐
│  media-orchestrator   │  ← coordinates everything
│                      │
│  Group 1 (parallel): │
│    • Stability AI    │  hero images (5×) + concept art (4×)
│    • DALL-E 3        │  merch designs (3–5×)
│    • ElevenLabs      │  narration + hype clip
│    • Theme Music     │  shared default library OR Replicate MusicGen
│    • GPT-4o copy     │  captions, ad variants, email subjects
│                      │
│  Group 2 (parallel): │  ← depends on hero images
│    • Sharp           │  8 platform crops per hero
│    • HeyGen          │  TikTok seed, explainer, threshold
│    • RunwayML        │  countdown (3×) + B-roll (3–4×)
└──────────────────────┘
        │
        ▼
  CampaignMediaManifest → DynamoDB + R2
```

## Files Created

| Layer | File | Purpose |
|-------|------|---------|
| Types | [schema.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/schema.ts) | 13 new Zod schemas + type exports |
| Storage | [r2-client.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/r2-client.ts) | R2 upload/delete, CDN URL builder |
| Storage | [media-store.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/media-store.ts) | DynamoDB ops for jobs, assets, manifests |
| Generator | [stability-generator.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/generators/stability-generator.ts) | Stability AI hero + concept images |
| Generator | [sharp-processor.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/generators/sharp-processor.ts) | 8-format platform crops |
| Generator | [dalle-generator.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/generators/dalle-generator.ts) | DALL-E 3 merch designs |
| Generator | [heygen-generator.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/generators/heygen-generator.ts) | HeyGen avatar videos (TikTok, explainer, threshold) |
| Generator | [runway-generator.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/generators/runway-generator.ts) | RunwayML countdown + B-roll |
| Generator | [elevenlabs-generator.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/generators/elevenlabs-generator.ts) | ElevenLabs narration + hype clip |
| Generator | [replicate-music-generator.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/generators/replicate-music-generator.ts) | Replicate MusicGen theme music |
| Library | [theme-music-library.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/theme-music-library.ts) | Shared default theme music library selection + metadata helpers |
| Generator | [copy-generator.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/generators/copy-generator.ts) | GPT-4o copy batch via LLM gateway |
| Orchestrator | [media-orchestrator.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/media/media-orchestrator.ts) | Two-phase parallel coordinator |
| API | [generate/route.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/app/api/groups/campaign/%5Bslug%5D/media/generate/route.ts) | POST trigger with optional assetTypes filter |
| API | [manifest/route.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/app/api/groups/campaign/%5Bslug%5D/media/manifest/route.ts) | GET manifest retrieval |
| API | [assets/route.ts](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/app/api/groups/campaign/%5Bslug%5D/media/assets/route.ts) | GET assets by type |
| Test | [page.tsx](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/app/%28tests%29/tests/media-generation/page.tsx) | Per-category generation UI with cost warnings |
| Test | [theme-music-library/page.tsx](file:///c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/app/%28tests%29/tests/theme-music-library/page.tsx) | Shared theme music library bulk upload + tag editor |

## Dependencies Added

- `sharp` — server-side image processing
- `@aws-sdk/client-s3` — R2 uploads (S3-compatible)

## Build Verification

`npx tsc --noEmit` — **zero errors** from all new files.

## Remaining

- End-to-end test with live campaign (requires API keys)
- Validate shared default library selection quality against multiple campaigns
- Confirm library tags produce acceptable default picks before full agent rollout
