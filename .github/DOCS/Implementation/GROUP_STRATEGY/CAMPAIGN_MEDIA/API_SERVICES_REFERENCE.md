# API & Services Reference
### Complete Third-Party Integration Stack for Campaign Media

---

## Service Overview

| Service | Role | Phase | Pricing Model |
|---------|------|-------|--------------|
| **Nano-Banana (Gemini 2.5 Flash)** | **Primary image generation — ALL image types** | 2 | Pay-per-token (Google AI) |
| DALL-E 3 (OpenAI) | Merch design fallback | 2 | Pay-per-image API |
| SerpAPI | Ship reference image discovery | 2 | Pay-per-search |
| **RunwayML Gen-3 Turbo** | **All video generation (Production Bible path)** | 2 | **5 credits/second · $0.01/credit** |
| HeyGen | Legacy avatar video (legacy path only) | 2 | $29–$89/mo (credits) |
| ElevenLabs | Voice narration / hype clips | 2 | $5–$22/mo (characters) |
| OpenAI TTS | Voice fallback | 2 | Pay-per-character |
| Shared Theme Music Library | Premade default campaign theme music | 2 | Existing licensed / owned assets |
| Replicate MusicGen | Generated campaign theme music | 2 | Pay-per-generation |
| Cloudflare R2 | Binary asset storage + CDN | 3 | $0.015/GB-month, free egress |
| DynamoDB | Asset metadata index | 3 | Pay-per-request (negligible) |
| TikTok Content API | TikTok organic posting | 4 | Free (quota-based) |
| Meta Graph API | Instagram posting + Ads | 4 | Free posting; CPM for ads |
| Klaviyo | Email campaign management | 4 | $20/mo base + volume |
| Twilio | SMS dispatch | 4 | $0.0079/SMS + MMS rate |
| Printful | Merch production + fulfillment | 4 | Base cost per product order |
| Discord Webhook | Community channel posting | 4 | Free |
| Pinterest API | Long-tail organic discovery | 4 | Free |
| LLM Gateway (configurable) | Copy, slogans, aesthetic brief | 1, 2 | Pay-per-token |
| Sharp | Server-side image resizing | 3 | Open-source (no cost) |

---

## Image Generation

### Nano-Banana (Gemini 2.5 Flash) — PRIMARY
**Role:** All image generation — hero transforms, scene images, aesthetic concepts, merch designs  
**API Base:** `https://generativelanguage.googleapis.com/v1beta`  
**Model:** `gemini-2.5-flash-image`  
**Auth:** `?key={GOOGLE_GENERATIVE_AI_API_KEY}` (query param) or `Authorization: Bearer`

**Key characteristics:**
- Reference-grounded image editing: pass an existing ship reference image as seed, guide the transform via text prompt
- Maintains ship identity (real vessel architecture preserved) while adding campaign aesthetic
- Generates at 2K resolution for hero/scene images, 1K for merch
- Output: `image/png` base64 encoded in response JSON

**Environment Variables:**
```env
GOOGLE_GENERATIVE_AI_API_KEY=
```

**Cost:** Approximately $0.04/image at 2K. Full campaign set (~20 images) ≈ $0.80.

**Config:** `lib/campaigns/media/media-pipeline-config.ts` → `NANO_BANANA_CONFIG`

---

### DALL-E 3 (via OpenAI)
**Role:** Merch design fallback  
**API Base:** `https://api.openai.com/v1/images/generations`  

**Key parameters for merch:**
```json
{
  "model": "dall-e-3",
  "prompt": "...",
  "size": "1024x1024",
  "quality": "hd",
  "style": "natural",
  "response_format": "url"
}
```

**Cost:** $0.080/image (HD 1024×1024). ~$0.40–$0.80 per campaign merch set.

Uses existing `OPENAI_API_KEY` env var (already in project).

---

## Video Generation

### Video Provider Architecture

Video generation now resolves through a provider abstraction layer instead of wiring provider-specific HTTP logic into every route and generator.

- Active provider resolution: `lib/campaigns/media/video-providers/provider-registry.ts`
- Base contract: `lib/campaigns/media/video-providers/base-provider.ts`
- Current implementation: `lib/campaigns/media/video-providers/runway-provider.ts`
- Reserved future implementation: `lib/campaigns/media/video-providers/fal-provider.ts`
- Config source: `lib/campaigns/media/media-pipeline-config.ts` → `VIDEO_PROVIDER_CONFIG`

Current state:

- Active provider: `runway`
- Active generator service: `runwayml`
- Planned secondary provider: `fal`

Operationally, this means the full pipeline, storyboard path, `/tests/runway-test`, and the targeted video test route all share the same provider seam.

### HeyGen
**Role:** AI avatar video production (explainers, seed videos, threshold announcements)  
**API Base:** `https://api.heygen.com/v2`  
**Auth:** `X-Api-Key: {HEYGEN_API_KEY}`

**Video Generation Flow:**
```
POST /video/generate
{
  "video_inputs": [{
    "character": {
      "type": "avatar",
      "avatar_id": "{avatarId}",        // Chosen per campaign voicePersona
      "avatar_style": "normal"
    },
    "voice": {
      "type": "text",
      "input_text": "{script}",
      "voice_id": "{elevenlabsVoiceId}" // HeyGen supports ElevenLabs voices
    },
    "background": {
      "type": "image",
      "url": "{heroImage_16x9_cdnUrl}"  // Campaign hero as backdrop
    }
  }],
  "dimension": { "width": 1920, "height": 1080 },
  "aspect_ratio": "16:9"
}
```

**Poll for completion:**
```
GET /video/{videoId}
// Returns status: 'pending' | 'processing' | 'completed' | 'failed'
// On 'completed': response.video_url = download URL
```

**Cost:** $29/mo starter (4 credits = ~4 short videos) → $89/mo for higher volume. Credits reset monthly.

**Environment Variables:**
```env
HEYGEN_API_KEY=
HEYGEN_DEFAULT_AVATAR_ID=         # Base avatar for standard campaigns
```

---

### RunwayML
**Role:** All video generation in the Production Bible path — TikTok seed, hero explainer, threshold announcement, countdown  
**API Base:** `https://api.dev.runwayml.com/v1`  
**Auth:** `Authorization: Bearer {RUNWAYML_API_KEY}`  
**API Version Header:** `X-Runway-Version: 2024-11-06` (required on all requests)

**Image-to-Video (Gen-3 Turbo):**
```
POST /image_to_video
{
  "model": "gen3a_turbo",
  "promptImage": "{base64_or_url_of_source_image}",
  "promptText": "{motion description, max 512 chars}",
  "duration": 10,                  // 5 or 10 seconds
  "ratio": "1280:768",
  "seed": 42
}
```

**Poll:** `GET /tasks/{taskId}` — status `PENDING` → `RUNNING` → `SUCCEEDED`  
**Output:** `response.output[0]` = video URL (download promptly — signed URLs expire)

**Credit balance check:**
```
GET /organization
Authorization: Bearer {RUNWAYML_API_KEY}
X-Runway-Version: 2024-11-06

Response: { "creditBalance": 1000, "tier": {...} }
```
Use this before generation to verify sufficient credits. Integrated into `checkMediaCredits()` in `lib/campaigns/media/credit-check-service.ts`.

**Actual pricing (gen3a_turbo):**

| Duration | Credits | Cost |
|----------|---------|------|
| 5 seconds | 25 credits | $0.25 |
| 10 seconds | 50 credits | $0.50 |

> Rate: **5 credits/second**. 1 credit = $0.01. Full Production Bible = 17 clips × 10s = **850 credits = $8.50**.

**Per-campaign video cost breakdown:**

| Deliverable | Shots | Credits | Cost |
|-------------|-------|---------|------|
| tiktok_seed | 4 | 200 | $2.00 |
| hero_explainer | 6 | 300 | $3.00 |
| threshold_announcement | 4 | 200 | $2.00 |
| countdown_1 | 3 | 150 | $1.50 |
| **TOTAL** | **17** | **850** | **$8.50** |

**Environment Variables:**
```env
RUNWAYML_API_KEY=
```

**Config:** `lib/campaigns/media/media-pipeline-config.ts` → `RUNWAYML_CONFIG` and `VIDEO_PROVIDER_CONFIG`

**Abstraction role:** Runway is now the concrete implementation behind the active video provider registry. To switch providers later, the pipeline should change provider selection in config rather than rewriting storyboard generation or orchestration logic.

---

## Voice & Audio Generation

### ElevenLabs
**Role:** All voice narration — landing page ambient, hype clips, video voiceover  
**API Base:** `https://api.elevenlabs.io/v1`  
**Auth:** `xi-api-key: {ELEVENLABS_API_KEY}`

**Text to Speech:**
```
POST /text-to-speech/{voice_id}
{
  "text": "{script}",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.65,
    "similarity_boost": 0.80,
    "style": 0.45,
    "use_speaker_boost": true
  }
}
Accept: audio/mpeg
```

**Voice Library endpoint (find voice profiles):**
```
GET /voices
```

**Pre-selected voice profiles for campaign archetypes:**
| Archetype | Voice Profile | Notes |
|-----------|--------------|-------|
| Retro-Future / Y2K | `Adam` or `Josh` | Confident, mid-range |
| Dark Academia | `Charlotte` or `Dorothy` | Measured, intelligent |
| Solar Punk | `Elli` or `Domi` | Warm, optimistic |
| Urban Street | `Antoni` | Street-credible, direct |
| Wellness | `Rachel` or `Serena` | Calm, aspirational |

**Cost:** Starter $5/mo (30K chars) → $22/mo (100K chars). One campaign set ≈ 3,000–5,000 chars.

**Environment Variables:**
```env
ELEVENLABS_API_KEY=
```

---

### Shared Theme Music Library
**Role:** Default campaign theme music source using premade tracks  
**Access:** Internal shared library endpoints + shared R2/Dynamo asset records  

**Selection Inputs:**
```
{aestheticLabel}, {imageryMood}, {musicMood}, tone keywords, niche hashtags
        ↓
best match from stored tags + prompt notes on shared library tracks
```

**Operational Notes:**
- Tracks are uploaded in bulk through `/api/groups/theme-music-library`
- Tracks are tagged for AI-agent selection in `/tests/theme-music-library`
- The media pipeline can request `themeMusicSource: 'default'`

### Replicate MusicGen
**Role:** Generated campaign theme music / background audio  
**Access:** Replicate model invocation via `replicate` SDK  

**Prompt structure:**
```
ambient instrumental music, {aestheticLabel} vibe, {imageryMood} atmosphere,
background loop, no vocals, high quality
```

**Environment Variables:**
```env
REPLICATE_API_TOKEN=
```

---

## Storage

### Cloudflare R2
**Auth:** Account ID + R2 Access Key via S3-compatible SDK  
**SDK:** `@aws-sdk/client-s3` with R2 endpoint override

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Upload asset
await r2.send(new PutObjectCommand({
  Bucket: 'lll-campaign-media',
  Key: `campaigns/${slug}/${path}`,
  Body: fileBuffer,
  ContentType: mimeType,
  CacheControl: 'public, max-age=31536000',  // 1 year — assets are immutable by version
}));
```

**Environment Variables:**
```env
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BUCKET_URL=https://cdn.leisurelifeinteractive.com
```

---

## Distribution Integrations

### Meta Graph API
**Environment Variables:**
```env
META_APP_ID=
META_APP_SECRET=
META_LONG_LIVED_TOKEN=        # Generated from short-lived token exchange
META_AD_ACCOUNT_ID=           # Format: act_XXXXXXXXXX
META_IG_USER_ID=              # Instagram Business Account ID
META_PAGE_ID=                 # Facebook Page ID
```

---

### TikTok Content API
**Docs:** `https://developers.tiktok.com/doc/content-posting-api-get-started/`  
**Environment Variables:**
```env
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_ACCESS_TOKEN=          # User OAuth token — refresh periodically
TIKTOK_OPEN_ID=               # Creator account open_id
```

---

### Klaviyo
**Environment Variables:**
```env
KLAVIYO_PRIVATE_KEY=
KLAVIYO_PUBLIC_KEY=
KLAVIYO_CAMPAIGN_LIST_ID=     # Default campaign waitlist email list
```

**Key event names (fired from Lambda on DynamoDB transitions):**
```
lll_waitlist_join
lll_threshold_met
lll_manifest_submitted
lll_campaign_expired
```

---

### Twilio
**Environment Variables:**
```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=          # Twilio-provisioned SMS number
```

---

### Printful
**API Base:** `https://api.printful.com`  
**Auth:** `Authorization: Bearer {PRINTFUL_API_KEY}`  
**Environment Variables:**
```env
PRINTFUL_API_KEY=
PRINTFUL_STORE_ID=
```

---

### Discord
**Environment Variables:**
```env
DISCORD_BOT_TOKEN=            # For bot API calls
# Webhook URLs are stored per-campaign in DynamoDB METADATA.communityChannelUrl
```

---

## Full `.env` Additions Summary

```env
# ── IMAGE GENERATION ─────────────────────────────────────────
STABILITY_API_KEY=
MIDJOURNEY_API_KEY=
# DALL-E uses existing OPENAI_API_KEY

# ── VIDEO GENERATION ─────────────────────────────────────────
HEYGEN_API_KEY=
HEYGEN_DEFAULT_AVATAR_ID=
RUNWAYML_API_KEY=

# ── VOICE & AUDIO ────────────────────────────────────────────
ELEVENLABS_API_KEY=
SUNO_API_KEY=

# ── STORAGE ──────────────────────────────────────────────────
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BUCKET_URL=https://cdn.leisurelifeinteractive.com

# ── DISTRIBUTION ─────────────────────────────────────────────
META_APP_ID=
META_APP_SECRET=
META_LONG_LIVED_TOKEN=
META_AD_ACCOUNT_ID=
META_IG_USER_ID=
META_PAGE_ID=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_ACCESS_TOKEN=
TIKTOK_OPEN_ID=
KLAVIYO_PRIVATE_KEY=
KLAVIYO_PUBLIC_KEY=
KLAVIYO_CAMPAIGN_LIST_ID=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
PRINTFUL_API_KEY=
PRINTFUL_STORE_ID=
DISCORD_BOT_TOKEN=
```

---

## Service Dependency Graph

```
Phase 1 (Aesthetic)
  └── GPT-4o (existing OPENAI_API_KEY)

Phase 2 (Generation)
  ├── Images:  Nano-Banana/Gemini → DALL-E 3 (merch fallback) → Sharp (resize)
  ├── Video:   RunwayML Gen-3 Turbo (Production Bible path) | HeyGen (legacy path fallback)
  ├── Audio:   ElevenLabs → OpenAI TTS (fallback)
  ├── Music:   Shared Default Library → Replicate MusicGen
  └── Copy:    LLM Gateway (configurable model)

Phase 3 (Storage)
  └── Cloudflare R2 + DynamoDB (existing AWS credentials)

Phase 4 (Distribution)
  ├── Social:  TikTok API → Meta Graph API → Pinterest API
  ├── Email:   Klaviyo
  ├── SMS:     Twilio
  ├── Merch:   Printful API
  └── Community: Discord Webhook
```
