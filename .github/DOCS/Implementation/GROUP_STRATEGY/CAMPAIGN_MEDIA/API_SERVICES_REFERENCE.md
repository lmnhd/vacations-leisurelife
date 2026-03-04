# API & Services Reference
### Complete Third-Party Integration Stack for Campaign Media

---

## Service Overview

| Service | Role | Phase | Pricing Model |
|---------|------|-------|--------------|
| Midjourney | Primary image generation | 2 | $10–$30/mo (subscription) |
| Stability AI | Image fallback / programmatic | 2 | Pay-per-image API |
| DALL-E 3 (OpenAI) | Merch design, quick concepts | 2 | Pay-per-image API |
| HeyGen | AI avatar video production | 2 | $29–$89/mo (credits) |
| RunwayML | Cinematic video / B-roll | 2 | Pay-per-second generated |
| Kling AI | Video fallback | 2 | Pay-per-generation |
| ElevenLabs | Voice narration / hype clips | 2 | $5–$22/mo (characters) |
| OpenAI TTS | Voice fallback | 2 | Pay-per-character |
| Suno AI | Campaign theme music | 2 | $8–$24/mo (subscription) |
| Cloudflare R2 | Binary asset storage + CDN | 3 | $0.015/GB-month, free egress |
| DynamoDB | Asset metadata index | 3 | Pay-per-request (negligible) |
| TikTok Content API | TikTok organic posting | 4 | Free (quota-based) |
| Meta Graph API | Instagram posting + Ads | 4 | Free posting; CPM for ads |
| Klaviyo | Email campaign management | 4 | $20/mo base + volume |
| Twilio | SMS dispatch | 4 | $0.0079/SMS + MMS rate |
| Printful | Merch production + fulfillment | 4 | Base cost per product order |
| Discord Webhook | Community channel posting | 4 | Free |
| Pinterest API | Long-tail organic discovery | 4 | Free |
| GPT-4o | Copy, slogans, aesthetic brief | 1, 2 | Pay-per-token |
| Sharp | Server-side image resizing | 3 | Open-source (no cost) |

---

## Image Generation

### Midjourney
**Role:** Primary hero image generation  
**API Access:** Midjourney does not have an official public API. Two approaches:
1. **Midjourney API (third-party):** Services like `useapi.net` or `imagineapi.dev` expose unofficial Midjourney API wrappers. Viable for automation but subject to ToS risk.
2. **MidJourney Direct (Discord Automation):** Use a bot token to submit `imagine` commands via the Midjourney Discord bot and scrape results. More brittle but zero cost beyond subscription.

**Recommended approach:** Use **Stability AI** as the primary programmatic API (stable, official, versioned) and reserve Midjourney for high-priority UI-initiated hero image generation sessions where quality ceiling matters most.

**Environment Variables:**
```env
MIDJOURNEY_API_KEY=           # Third-party wrapper API key
MIDJOURNEY_CHANNEL_ID=        # Discord channel ID for bot if using automation
```

---

### Stability AI
**Role:** Primary programmatic image generation  
**API Base:** `https://api.stability.ai/v2beta`  
**Auth:** `Authorization: Bearer {STABILITY_API_KEY}`

**Key Endpoint:**
```
POST /stable-image/generate/ultra
Content-Type: multipart/form-data

Fields:
  prompt: string                  (max 10,000 chars)
  negative_prompt?: string
  aspect_ratio: '16:9' | '1:1' | '9:16' | '4:5' | '3:2'
  output_format: 'webp' | 'png'
  seed?: number                   (for reproductibility)
```

**Response:** Binary image stream (set `Accept: image/*`)

**Cost:** Ultra model — $0.008/image. ~$0.40 for a full set of 50 images per campaign.

**Environment Variables:**
```env
STABILITY_API_KEY=
```

---

### DALL-E 3 (via OpenAI)
**Role:** Merch design generation, quick concept drafts  
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
**Role:** Cinematic B-roll clips, countdown video motion  
**API Base:** `https://api.dev.runwayml.com/v1`  
**Auth:** `Authorization: Bearer {RUNWAYML_API_KEY}`

**Image-to-Video (Gen-3 Alpha):**
```
POST /image_to_video
{
  "model": "gen3a_turbo",
  "promptImage": "{base64_or_url_of_source_image}",
  "promptText": "{motion description, max 512 chars}",
  "duration": 10,                  // 5 or 10 seconds
  "ratio": "1280:720",
  "seed": 42
}
```

**Poll:** `GET /tasks/{taskId}` — status `PENDING` → `RUNNING` → `SUCCEEDED`  
**Output:** `response.output[0]` = video URL (download within 24h)

**Motion prompt strategy:**
```
"Slow cinematic push forward, [lightingStyle], atmosphere [calm/vibrant], 
subtle environmental motion [waves/lights/crowd], no camera shake, 
letterbox aspect, color grade: [colorPalette primary tones]"
```

**Cost:** RunwayML Gen-3 Alpha Turbo — ~$0.05/second generated = $0.50 per 10s clip

**Environment Variables:**
```env
RUNWAYML_API_KEY=
```

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

### Suno AI
**Role:** Campaign theme music / background audio  
**Access:** Suno API (currently in limited beta — use web automation or partner API key)  
**Alternative:** Udio API (`https://udio.com`) — similar capability, API available

**Prompt structure for Suno:**
```
{musicMood from aesthetic brief}, instrumental, no vocals, loop-friendly,
{BPM range}, {genre}, {mood keywords from colorPalette/aestheticLabel}

Example: "lo-fi tropical surf, 88bpm, nostalgic nostalgia, gentle guitar, 
warm synth pads, instrumental only, loop-friendly, chill upbeat"
```

**Environment Variables:**
```env
SUNO_API_KEY=      # Or UDIO_API_KEY= if using Udio
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
  ├── Images:  Stability AI → DALL-E 3 (fallback) → Sharp (resize)
  ├── Video:   HeyGen (avatar) + RunwayML (cinematic)
  ├── Audio:   ElevenLabs → Suno AI
  └── Copy:    GPT-4o

Phase 3 (Storage)
  └── Cloudflare R2 + DynamoDB (existing AWS credentials)

Phase 4 (Distribution)
  ├── Social:  TikTok API → Meta Graph API → Pinterest API
  ├── Email:   Klaviyo
  ├── SMS:     Twilio
  ├── Merch:   Printful API
  └── Community: Discord Webhook
```
