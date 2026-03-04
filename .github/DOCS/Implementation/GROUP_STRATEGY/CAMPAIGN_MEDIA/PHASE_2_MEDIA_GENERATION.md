# Phase 2: Media Generation Pipeline
### Asset Production — Every Format, Every Platform

**Input:** `CampaignAestheticBrief` (from Phase 1, status `'approved'`)  
**Output:** `CampaignMediaManifest` — fully populated index of all generated assets with CDN URLs  
**Endpoint:** `POST /api/campaigns/[slug]/media/generate`

---

## What Gets Generated

| Asset Type | Count | Tool | Destination |
|------------|-------|------|-------------|
| Hero images (landing page) | 5–6 | Midjourney / Stability AI | Landing page hero section |
| Aesthetic concept art | 4–5 | Midjourney | Moodboard, email headers |
| Platform-sized image crops | Varies | Sharp (server-side resize) | Each social format |
| TikTok / Reels seed video | 1 | HeyGen + ElevenLabs | TikTok organic, Instagram Reels |
| Hero explainer video | 1 | HeyGen | Landing page, YouTube |
| Threshold announcement video | 1 | HeyGen | Email, social |
| Countdown video series | 3 | RunwayML + ElevenLabs | Social, email nurture |
| Cinematic B-roll clips | 3–4 | RunwayML Gen-3 | Video compositing |
| Landing page ambient narration | 1 | ElevenLabs | Landing page hero audio |
| Threshold hype clip | 1 | ElevenLabs | SMS hook (Twilio), email |
| Campaign theme music | 1 | Suno AI | Video background, landing page |
| Merch design files | 3–5 | DALL-E 3 | Printful / Printify upload |
| Email header graphics | 3 | Derived from hero images | Klaviyo template stages 1–3 |
| Facebook / Meta ad creatives | 3 | Derived from hero images + copy | Meta Ads Manager |
| Social carousel (Instagram) | 1 (7 slides) | Generated per slide spec | Instagram feed |

---

## Generation Job Architecture

All generation happens via an async job queue. Each job type is independent and can run in parallel. The `CampaignMediaManifest` record is created empty at job start and updated as each asset completes.

```typescript
interface MediaGenerationJob {
  jobId: string;
  campaignSlug: string;
  assetType: AssetType;
  status: 'queued' | 'in_progress' | 'complete' | 'failed' | 'needs_review';
  generator: GeneratorService;
  promptUsed: string;
  outputUrl?: string;
  outputMetadata?: AssetMetadata;
  retryCount: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

type AssetType =
  | 'hero_image' | 'aesthetic_concept' | 'platform_crop'
  | 'tiktok_seed_video' | 'hero_explainer_video' | 'threshold_video'
  | 'countdown_video' | 'broll_clip'
  | 'ambient_narration' | 'hype_clip' | 'theme_music'
  | 'merch_design' | 'email_header' | 'ad_creative' | 'carousel_slide';

type GeneratorService = 
  | 'midjourney' | 'stability_ai' | 'dalle3' 
  | 'heygen' | 'runwayml' | 'kling'
  | 'elevenlabs' | 'openai_tts'
  | 'suno' | 'udio'
  | 'sharp'; // server-side image processing
```

---

## Image Generation

### Hero Images (5–6 images)
**Tool:** Midjourney (via API or automation layer) → fallback Stability AI SDXL  
**Purpose:** Primary landing page hero, email headers, social backgrounds

Each image prompt is assembled from the `CampaignAestheticBrief.visual` fields:

```
{imageryMood} on {ship.name}, {lightingStyle}, {compositionNotes},
editorial travel photography, --ar 16:9 --style raw --v 6.1
```

**Prohibit tokens** (appended automatically from `avoidList`):  
`--no {avoidList.join(', ')}`

**Five prompt variants generated per campaign:**
1. Wide exterior deck shot — ship identity anchor
2. Niche event scene — the unique activity happening on deck
3. Intimate cabin/stateroom — aspirational lifestyle, price-tier anchor
4. Social gathering shot — group energy, community feeling
5. Destination arrival — port/day excursion

**Quality Gate:** Each image passes through a CLIP-score check against the aesthetic label. Images scoring below threshold auto-trigger a regeneration with a refined prompt. Max 3 retries before flagging for human review.

### Aesthetic Concept Art (4–5 images)
**Tool:** Midjourney → fallback DALL-E 3  
**Purpose:** Brand moodboard, email headers, social carousel backgrounds

These are less literal than hero images — they establish the aesthetic *feeling* rather than the cruise location. Generated from the `imageryMood` + `colorPalette` + `aestheticLabel` fields with artistic latitude:

```
{aestheticLabel} aesthetic, {imageryMood}, {colorPalette.primary} dominant palette,
{lightingStyle}, conceptual editorial, high contrast, --ar 1:1 --style raw
```

### Server-Side Resizing (Sharp)
All generated images are automatically processed into the required platform crops using the Sharp library. No additional generation calls — one source image produces all formats:

| Format | Dimensions | Use |
|--------|-----------|-----|
| `hero_16x9` | 1920×1080 | Landing page, YouTube thumbnail, HeyGen background |
| `hero_4x5` | 1080×1350 | Instagram feed, Facebook feed |
| `story_9x16` | 1080×1920 | Instagram Story, TikTok background overlay |
| `square_1x1` | 1080×1080 | Instagram feed, Discord embed |
| `banner_3x1` | 1500×500 | Twitter/X header, Discord server banner |
| `email_header` | 600×300 | Klaviyo email templates |
| `og_image` | 1200×630 | Open Graph / social share card for landing page |
| `thumbnail` | 400×225 | Internal dashboard previews |

---

## Video Generation

### TikTok Seed Video (30–45s)
**Tool:** HeyGen (avatar) + ElevenLabs (voice) + Midjourney images (background)  
**Purpose:** §5.5A organic seeding — the zero-budget proof-of-concept post

**Assembly:**
1. ElevenLabs renders the `tiktokSeed.scriptOrNarration` in the specified `voiceProfile`
2. HeyGen generates avatar footage: talking head speaking to camera, campaign-aesthetic background (hero image as HeyGen backdrop)
3. B-roll inserts: 2–3 ship reference images cut in at key narrative moments
4. On-screen text overlays: hook line (first 3 seconds), CTA slug at end

**Script template:**
```
[HOOK — 0–3s]: {tiktokOrganic.hook}
[BODY — 3–25s]: {videoConcepts.tiktokSeed.scriptOrNarration}  
[CTA — 25–30s]: "Sign up below — link in bio."
```

### Hero Explainer Video (60s)
**Tool:** HeyGen  
**Purpose:** Landing page hero embed, YouTube, Facebook ad creative

Full HeyGen avatar presentation. Script derived from `messaging.elevatorPitch` expanded to 60s:
- First 10s: identity-hook ("If you're the kind of person who...")
- Middle 30s: the trip specifics (ship, dates, events, price signal)
- Last 20s: the Shadow Group mechanic explained in plain language + CTA

### Threshold Announcement Video (30s)
**Tool:** HeyGen  
**Purpose:** "The Trip is GO!" email embed, social announcement

Pre-generated *before* threshold is reached with placeholder handling:
```
Script: "We just hit [THRESHOLD_COUNT] cabins — [CAMPAIGN_NAME] is officially happening. 
You have 72 hours to complete your details and lock in your spot."
```
`[THRESHOLD_COUNT]` and `[CAMPAIGN_NAME]` are dynamic tokens rendered server-side at email send time rather than baked into the video — keeps generation synchronous with campaign setup, not threshold event.

### Countdown Video Series (3× 15s clips)
**Tool:** RunwayML Gen-3 Alpha  
**Purpose:** Social posts during Seed Phase — "X cabins to go" urgency content

Three variants generated: 3 cabins remaining, 2 remaining, 1 remaining. RunwayML receives:
- Source image: landing page hero image
- Motion prompt: subtle camera push, atmosphere movement (waves, neon flicker, leaves)
- Duration: 15 seconds
- On-screen text rendered in post via Sharp

### Cinematic B-Roll Clips (3–4× 6–10s clips)
**Tool:** RunwayML Gen-3 Alpha  
**Purpose:** Video compositing inserts for explainer and ad videos

Short atmospheric motion clips derived from Midjourney images. RunwayML `image-to-video` endpoint with motion prompts tuned to the `lightingStyle`:
- Pool deck, late afternoon — ambient movement
- Dining venue — candlelight, light crowd motion
- Port arrival — ship deck, destination in background
- Niche event scene — motion-hinted still (gentle zoom, atmosphere)

---

## Voice & Audio Generation

### Ambient Narration (30s)
**Tool:** ElevenLabs  
**Script Source:** `CampaignAestheticBrief.audio.ambientNarrationScript`  
**Voice Profile:** Defined in brief — matched to `voicePersona` identity

Rendered at landing page activation. Used as optional audio autoplay (muted by default, user-toggled) in landing page hero.

**ElevenLabs API call:**
```typescript
await elevenlabs.textToSpeech({
  text: brief.audio.ambientNarrationScript,
  voice_id: brief.audio.voiceProfile,
  model_id: 'eleven_multilingual_v2',
  voice_settings: {
    stability: 0.65,
    similarity_boost: 0.80,
    style: 0.45,
    use_speaker_boost: true
  }
});
```

### Threshold Hype Clip (15s)
**Tool:** ElevenLabs  
**Purpose:** SMS attachment hook (Twilio), email top-of-fold audio embed

High-energy delivery. Voice settings adjusted: stability 0.45 (more expressive), style 0.70.  
Script: `CampaignAestheticBrief.audio.hypeClipScript`

### Campaign Theme Music (60–120s loop)
**Tool:** Suno AI  
**Purpose:** Video background audio, landing page ambient music option

Generated from `CampaignAestheticBrief.audio.musicMood` as the Suno prompt seed.  
Output: one instrumental loop, 60–120 seconds, loopable. Exported as `.mp3`.

```
Suno Prompt: {musicMood}, instrumental only, no lyrics, loop-friendly, 
upbeat but not frantic, [BPM estimate from mood], [genre keywords from aesthetic]
```

---

## Merch Design Generation

### Process Flow

```
CampaignAestheticBrief.merch.coreItem.dallePrompt
          │
          ▼
DALL-E 3 API → raw design concept image (1024×1024, PNG)
          │
          ▼
Sharp → clean white/transparent background isolation
          │
          ▼
Manual review flag (UI) OR auto-approve (agent mode)
          │
          ▼
Printful API → product mockup generation
  (product_id × colorway → mockup image with print placement)
          │
          ▼
Stored in R2 + DynamoDB MEDIA# record
          │
          ▼
Merch page populated at /campaigns/[slug]/merch
```

### Design Prompt Strategy

Each `MerchItemBrief.dallePrompt` is structured to produce print-ready quality:

```
[design description], isolated on white background, flat lay graphic design,
[print style], suitable for screen printing, vector-clean edges,
[campaign color palette], no realistic textures, no shadows
```

**Core t-shirt example:**
```
Retro pixel art cruise ship with [campaign tagline] text beneath in 80s 
arcade font, isolated on white, flat graphic design, 2-color screen print, 
electric blue and chrome silver palette, vector-clean edges, no shadows
```

### Printful Integration
All approved merch designs are submitted to the Printful API:
- `POST /v2/mockup-generator/tasks` — generate product mockup image
- `POST /stores/{storeId}/products` — create product in connected store (activated at `THRESHOLD_MET`)

Products are created in `DRAFT` state and published via `PATCH /stores/{storeId}/products/{productId}` when the campaign triggers `THRESHOLD_MET` — matching the `merchandiseStoreUrl` population logic in §2.7.

---

## Copy & Caption Generation

All text-based assets are generated by GPT-4o, taking the `CampaignAestheticBrief.messaging` and the platform-specific `socialConcepts` as input. Generated in a single structured batch call returning all variants simultaneously:

- 7× Instagram carousel slide texts
- 3× Facebook ad copy variants (A/B/C)
- TikTok caption + hashtag set (3 variants for testing)
- 3× email subject line variants per Klaviyo nurture stage
- Pinterest pin descriptions (5×)
- Discord channel announcement message

---

## The CampaignMediaManifest Output

```typescript
interface CampaignMediaManifest {
  slug: string;
  generatedAt: string;
  totalAssets: number;
  completionStatus: 'partial' | 'complete';
  
  images: {
    hero: AssetRecord[];
    aestheticConcepts: AssetRecord[];
    platformCrops: Record<ImageFormat, AssetRecord[]>;
  };
  
  videos: {
    tiktokSeed: AssetRecord;
    heroExplainer: AssetRecord;
    thresholdAnnouncement: AssetRecord;
    countdown: AssetRecord[];
    broll: AssetRecord[];
  };
  
  audio: {
    ambientNarration: AssetRecord;
    hypeClip: AssetRecord;
    themeMusic: AssetRecord;
  };
  
  merch: {
    designs: AssetRecord[];
    mockups: AssetRecord[];
    printfulProductIds: string[];
  };
  
  copy: {
    carouselSlides: string[];
    adVariants: AdCopySet[];
    captions: PlatformCaptions;
    emailSubjectLines: EmailSubjectSet;
  };
}

interface AssetRecord {
  assetId: string;
  assetType: AssetType;
  url: string;                  // CDN URL (Cloudflare R2)
  generator: GeneratorService;
  promptUsed: string;
  dimensions?: { width: number; height: number };
  durationSeconds?: number;
  fileSizeBytes: number;
  mimeType: string;
  tags: string[];
  createdAt: string;
  reviewStatus: 'auto_approved' | 'human_approved' | 'needs_review';
}
```
