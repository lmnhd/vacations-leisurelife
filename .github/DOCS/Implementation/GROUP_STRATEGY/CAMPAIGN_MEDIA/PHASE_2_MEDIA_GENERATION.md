# Phase 2: Media Generation Pipeline
### Asset Production — Every Format, Every Platform

**Input:** `CampaignAestheticBrief` (from Phase 1, status `'approved'`)  
**Output:** `CampaignMediaManifest` — fully populated index of all generated assets with CDN URLs  
**Endpoint:** `POST /api/groups/campaign/[slug]/media/generate`

---

## Single Manifest Source of Truth

All media creation paths now target the same persisted `CampaignMediaManifest` object for a campaign slug.

- `/tests/media-generation` actions are not sandbox-only previews; they persist real manifest artifacts.
- Manual operator runs and targeted regeneration are expected to merge into the existing manifest instead of creating disconnected side outputs.
- Agentic orchestration uses the same manifest object and the same asset records.
- Partial reruns must preserve untouched manifest sections.
- The test surfaces double as controlled customization points for operators or downstream agents.

In practice, this means copy, audio, image, video, merch, and review actions should all resolve to one campaign-level media state object rather than separate per-surface records.

---

## What Gets Generated

| Asset Type | Count | Tool | Destination |
|------------|-------|------|-------------|
| Ship reference images | 6–12 | SerpAPI Google Images discovery | Source-of-truth for real ship visuals |
| Hero images (landing page) | 3–5 | Nano-Banana image edit over SerpAPI references | Landing page hero section |
| Aesthetic concept art | 4–5 | Nano-Banana | Moodboard, email headers |
| Platform-sized image crops | Varies | Sharp (server-side resize) | Each social format |
| TikTok / Reels seed video | 1 | RunwayML multi-shot image-to-video + ElevenLabs + local ffmpeg | TikTok organic, Instagram Reels |
| Hero explainer video | 1 | HeyGen | Landing page, YouTube |
| Threshold announcement video | 1 | HeyGen | Email, social |
| Countdown video series | 3 | RunwayML + ElevenLabs | Social, email nurture |
| Cinematic B-roll clips | 3–4 | RunwayML Gen-3 | Video compositing |
| Landing page ambient narration | 1 | ElevenLabs | Landing page hero audio |
| Threshold hype clip | 1 | ElevenLabs | SMS hook (Twilio), email |
| Campaign theme music | 1 | Replicate MusicGen | Video background, landing page |
| Merch design files | 3–5 | Nano-Banana | Printful / Printify upload |
| Email header graphics | 3 | Derived from hero images | Klaviyo template stages 1–3 |
| Facebook / Meta ad creatives | 3 | Derived from hero images + copy | Meta Ads Manager |
| Social carousel (Instagram) | 1 (7 slides) | Generated per slide spec | Instagram feed |

---

## Generation Job Architecture

All generation paths ultimately converge on the same persisted manifest. Full pipeline generation uses async job execution, while targeted test/manual operations update the same underlying record section-by-section. The `CampaignMediaManifest` is therefore the canonical asset ledger regardless of entry point.

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
  | 'ship_reference_image' | 'hero_image' | 'aesthetic_concept' | 'platform_crop'
  | 'tiktok_seed_video' | 'hero_explainer_video' | 'threshold_video'
  | 'countdown_video' | 'broll_clip'
  | 'ambient_narration' | 'hype_clip' | 'theme_music'
  | 'merch_design' | 'email_header' | 'ad_creative' | 'carousel_slide';

type GeneratorService = 
  | 'midjourney' | 'stability_ai' | 'dalle3' | 'serpapi'
  | 'heygen' | 'runwayml' | 'kling'
  | 'elevenlabs' | 'openai_tts'
  | 'replicate' | 'udio'
  | 'sharp'; // server-side image processing
```

---

## Image Generation

### Ship Reference Discovery
**Tool:** SerpAPI Google Images  
**Purpose:** Gather real photos of the actual matched ship as the source-of-truth visual layer

The pipeline resolves the campaign's matched ship identity, then runs structured image searches for multiple venue categories:

- exterior
- pool deck
- dining
- stateroom
- atrium
- destination-facing deck view

Candidate images are ranked automatically using ship-name match, cruise-line tokens, category match, and image size, while penalizing floor plans, logos, brochures, and illustrations.

### Hero Images (3–5 images)
**Tool:** SerpAPI reference discovery + Nano-Banana guided transform  
**Purpose:** Primary landing page hero, email headers, social backgrounds

Hero assets are selected from the ranked real ship reference set, then transformed through a reference-grounded Nano-Banana pass that preserves ship identity while adding campaign-specific cinematic embellishment. This keeps the landing page visually anchored to the actual vessel without reducing the hero to a plain import.

### Aesthetic Concept Art (4–5 images)
**Tool:** Nano-Banana  
**Purpose:** Brand moodboard, email headers, social carousel backgrounds

These are less literal than hero images — they establish the aesthetic *feeling* rather than the literal ship identity. Generated from the `imageryMood` + `colorPalette` + `aestheticLabel` fields with artistic latitude:

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
**Tool:** RunwayML image-to-video + ElevenLabs narration + local ffmpeg composition  
**Purpose:** §5.5A organic seeding — the zero-budget proof-of-concept post

**Assembly:**
1. ElevenLabs renders a combined narration script assembled from `tiktokOrganic.hook`, `videoConcepts.tiktokSeed.scriptOrNarration`, and `tiktokOrganic.callToAction`
2. RunwayML generates a deterministic multi-shot sequence from the approved real-ship hero image using four explicit shot prompts rather than a single pan/zoom pass
3. Local `ffmpeg-static` concatenates the generated clips into one vertical sequence and muxes the narration track over the final output MP4
4. The generated TikTok asset is stored with a unique asset ID and filename per run to avoid stale CDN/browser cache collisions on immutable asset URLs

**Current shot-plan strategy:**
```
Shot 1: premium social ad opener with immediate forward camera momentum and visible scene energy
Shot 2: experiential reveal with layered foreground action, crowd movement, luxury details, and ship fidelity
Shot 3: emotional peak with dramatic reveal, celebration energy, and destination-scale atmosphere
Shot 4: polished CTA finish with aspirational momentum and a strong end-frame for overlay/call-to-action treatment
```

**Current implementation notes:**
- Voiceover-first flow — no HeyGen dependency for the TikTok seed asset
- Single approved hero image still acts as the visual source, so the output is stronger than the original single moving still but may still need higher-end model/provider options later
- Prompting is now explicitly biased away from slideshow pan/parallax behavior and toward environmental motion, subject movement, and cinematic blocking
- This exact implementation should be revisited during later **Distribution** phases if the campaign needs more premium social output quality or broader model choice evaluation (for example, `fal.ai` provider comparisons)

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
- Source image: real-ship hero image
- Motion prompt: subtle camera push, atmosphere movement (waves, neon flicker, leaves)
- Duration: 15 seconds
- On-screen text rendered in post via Sharp

### Cinematic B-Roll Clips (3–4× 6–10s clips)
**Tool:** RunwayML Gen-3 Alpha  
**Purpose:** Video compositing inserts for explainer and ad videos

Short atmospheric motion clips derived from real ship hero/reference images. RunwayML `image-to-video` endpoint with motion prompts tuned to the `lightingStyle`:
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

### Merch Design Images
**Tool:** Nano-Banana  
**Purpose:** Print-ready campaign merch art derived from the approved merch prompts in the brief

All merch design image generation now flows through the same media-pipeline image provider as hero and concept images. This keeps the visual language more coherent across hero art, moodboards, and merchandise.

### Campaign Theme Music (30s loop)
**Tool:** Shared Default Library or Replicate MusicGen  
**Purpose:** Video background audio, landing page ambient music option

Two supported paths now exist:

1. **Default Library** — selects the best premade track from a shared global library using AI-agent-friendly tags plus prompt notes stored with each track record.
2. **Replicate MusicGen** — generates a fresh instrumental track from the approved brief when a custom track is preferred.

Output: one instrumental loop, 30 seconds, exported as `.mp3`.

```
Default Library selection inputs: stored tags + prompt notes matched against {aestheticLabel}, {imageryMood}, {musicMood}, tone keywords, and niche hashtags

Replicate Prompt: ambient instrumental music, {aestheticLabel} vibe, {imageryMood} atmosphere, background loop, no vocals, high quality
```

### Shared Theme Music Library
Premade tracks are stored under a reserved shared slug and exposed through library endpoints so both the UI and external agents can use the same selection pool.

**Capabilities:**
- Bulk upload multiple `.mp3` tracks into the shared library
- Edit tags per track for AI-agent selection
- Store freeform prompt notes / usage notes per track
- Return the best current match for a specific campaign slug

**Endpoints:**
```
GET   /api/groups/theme-music-library
GET   /api/groups/theme-music-library?campaignSlug={slug}
POST  /api/groups/theme-music-library
PATCH /api/groups/theme-music-library/{assetId}
```

**UI Test Page:**
```
/tests/theme-music-library
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
    shipReferences: AssetRecord[];
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
