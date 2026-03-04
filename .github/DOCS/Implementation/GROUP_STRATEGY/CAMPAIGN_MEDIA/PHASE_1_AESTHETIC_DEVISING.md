# Phase 1: Aesthetic Devising
### Campaign Identity Engine

**Input:** `CampaignConfig` (Phase D object from `GROUP_CAMPAIGN_STRATEGY §6.4`)  
**Output:** `CampaignAestheticBrief` (typed JSON — the creative brief for all downstream media)  
**Endpoint:** `POST /api/campaigns/[slug]/media/aesthetic`  

---

## What This Phase Produces

Before a single image is generated or a video is rendered, the campaign needs a **creative identity** — a locked set of decisions that ensures every asset across every platform feels like it belongs to the same universe. This is the `CampaignAestheticBrief`.

The brief is an AI-generated document, reviewed (and optionally edited) by a human, then committed to DynamoDB as the authoritative creative spec for the campaign. Everything in Phase 2 derives from it.

---

## The CampaignAestheticBrief Schema

```typescript
interface CampaignAestheticBrief {
  slug: string;
  themeName: string;                         // From CampaignConfig
  
  // ── VISUAL IDENTITY ──────────────────────────────────────────
  visual: {
    aestheticLabel: string;                  // e.g., "Retro-Future / Y2K", "Dark Academia", "Solar Punk"
    colorPalette: {
      primary: string;                       // Hex — dominant brand color
      secondary: string;                     // Hex — supporting
      accent: string;                        // Hex — CTA / highlight
      background: string;                    // Hex — dark or light base
      textOnDark: string;
      textOnLight: string;
    };
    typographyDirection: {
      headlineStyle: string;                 // e.g., "Serif editorial", "Brutalist sans", "Handwritten"
      bodyStyle: string;
      suggestedFonts: string[];              // e.g., ["Playfair Display", "Space Grotesk"]
    };
    imageryMood: string;                     // 2–3 sentence description of desired image feel
    lightingStyle: string;                   // e.g., "golden hour warm", "neon-lit night", "diffused cloudy"
    compositionNotes: string;               // e.g., "wide establishing shots, human subjects mid-frame"
    avoidList: string[];                     // e.g., ["stock photography feel", "generic beach umbrellas"]
    referenceMoodboard: string[];            // URLs to Phase B ship reference images (from /api/imageSearch)
  };

  // ── COPY & MESSAGING ─────────────────────────────────────────
  messaging: {
    heroSlogan: string;                      // Primary headline — used on landing page hero
    subSlogan: string;                       // Supporting line beneath hero
    ctaVariants: {
      waitlist: string;                      // e.g., "Claim Your Spot"
      bookNow: string;                       // e.g., "Lock In My Cabin"
      merch: string;                         // e.g., "Rep the Crew"
      share: string;                         // e.g., "Pull a Friend In"
    };
    elevatorPitch: string;                   // 2 sentences — what this trip is, for who, why now
    toneKeywords: string[];                  // e.g., ["playful", "aspirational", "niche", "irreverent"]
    voicePersona: string;                    // Who is the campaign "voice"? e.g., "The Insider Friend who found the coolest trip"
  };

  // ── PLATFORM CONTENT CONCEPTS ────────────────────────────────
  socialConcepts: {
    tiktokOrganic: TikTokConceptSet;
    instagramReels: ReelConceptSet;
    instagramFeed: FeedConceptSet;
    facebookAd: AdConceptSet;
    youtubeShort: YouTubeConceptSet;
    pinterest: PinterestConceptSet;
    emailHeader: EmailConceptSet;
    discordBanner: DiscordConceptSet;
  };

  // ── VIDEO CONCEPT BRIEFS ─────────────────────────────────────
  videoConcepts: {
    heroExplainer: VideoBrief;               // HeyGen avatar — 60s waitlist explainer
    tiktokSeed: VideoBrief;                  // 30s organic hook video
    thresholdAnnouncement: VideoBrief;       // "The trip is GO!" announcement video
    merchReveal: VideoBrief;                 // Merch store launch teaser
    countdownSeries: VideoBrief[];           // 3-part series: "X cabins to go"
  };

  // ── MERCHANDISE DIRECTION ────────────────────────────────────
  merch: {
    conceptStatement: string;               // Why this merch makes sense for this niche/theme
    coreItem: MerchItemBrief;               // Primary t-shirt / tank
    practicalItem: MerchItemBrief;          // Lanyard / tote
    nicheSpecificItems: MerchItemBrief[];   // 1–3 niche-native items
    logoConceptDescription: string;          // Text description for logo/design generation
    tagline: string;                         // Short text on the merch itself
    printStyle: string;                      // e.g., "Retro screen-print", "minimalist one-color", "full-color digital"
  };

  // ── AUDIO IDENTITY ───────────────────────────────────────────
  audio: {
    ambientNarrationScript: string;          // 30s ElevenLabs script for landing page
    hypeClipScript: string;                  // 15s "Trip is GO!" announcement script
    voiceProfile: string;                    // ElevenLabs voice ID or descriptive spec
    musicMood: string;                       // Suno prompt seed — e.g., "lo-fi tropical, 90bpm, nostalgic"
  };

  // ── METADATA ─────────────────────────────────────────────────
  generatedAt: string;                       // ISO timestamp
  generatedBy: 'agent' | 'ui-session';
  humanReviewStatus: 'pending' | 'approved' | 'revised';
  revisionNotes?: string;
}
```

---

## Supporting Type Definitions

```typescript
interface TikTokConceptSet {
  hook: string;             // The first 3 seconds — verbal/visual hook
  narrative: VideoBrief;    // What the video does second-by-second
  caption: string;          // Full caption with hashtags
  hashtags: string[];
  callToAction: string;
}

interface ReelConceptSet {
  visualConcept: string;
  audioTrackType: string;  // e.g., "trending sound", "original ElevenLabs narration"
  caption: string;
  hashtags: string[];
}

interface FeedConceptSet {
  carouselSlides: CarouselSlide[];  // 5–7 slide static carousel
  singlePostConcept: string;
  caption: string;
}

interface CarouselSlide {
  slideNumber: number;
  headline: string;
  bodyText: string;
  visualDescription: string;
}

interface AdConceptSet {
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  visualDescription: string;
}

interface VideoBrief {
  title: string;
  durationSeconds: number;
  tool: 'heygen' | 'runwayml' | 'kling' | 'composite';
  scriptOrNarration: string;
  visualDirectionNotes: string;
  avatarRequired: boolean;
  backgroundDescription: string;
  musicMood: string;
}

interface MerchItemBrief {
  productType: string;       // e.g., "Unisex T-Shirt", "Woven Lanyard"
  designDescription: string; // What the print/design looks like
  colorway: string;
  dallePrompt: string;       // Ready-to-use DALL-E prompt for design generation
  printfulProductId?: string;
}
```

---

## The Generation Process

### Step 1: Base Context Assembly
The system assembles a rich context object from the `CampaignConfig`:
- Theme name, aesthetic label, targeting keywords
- Ship identity (vessel name, itinerary, departure port)
- Highlight events
- Phase B ship reference imagery URLs (from `/api/imageSearch`)
- Price point and audience demographic signals (inferred from targeting keywords)

### Step 2: Primary Aesthetic Prompt (GPT-4o)

The orchestrating LLM receives the assembled context and the full `CampaignAestheticBrief` schema as a structured output spec. The system prompt anchors the generation to the Leisure Life Interactive brand and the cruise-niche intersection:

```
SYSTEM:
You are the Creative Director for Leisure Life Interactive, a boutique cruise campaign studio. 
Your role is to devise the complete aesthetic and creative identity for niche-targeted group 
cruise campaigns. Each campaign targets a specific subculture identity — your creative must speak 
natively to that community while making the cruise feel inevitable and aspirational, not generic.

You have access to: the campaign config, real ship reference images, confirmed pricing, and 
highlight event concepts. Use all of it. Do not produce generic cruise marketing.

Return a complete CampaignAestheticBrief JSON object conforming to the provided schema.

USER:
Campaign Config: {config}
Ship Reference Images: {imageUrls}
Brand Guidelines: {brandTokens}
```

### Step 3: Platform Concept Expansion (GPT-4o — Second Pass)
A focused follow-up call expands only the `socialConcepts` and `videoConcepts` sections with full platform-native detail, taking the aesthetic decisions from Step 2 as fixed constraints. This separation improves quality — the model focuses on platform mechanics rather than trying to invent identity and distribution simultaneously.

### Step 4: Human Review Gate (UI) / Auto-Approve (Agent)

**UI Flow:**  
The `CampaignAestheticBrief` is rendered in `/dashboard/campaigns/[slug]/media/aesthetic` as a structured form with inline editors. The creative director reviews each section, modifies if necessary, and approves. `humanReviewStatus` transitions to `'approved'`.

**Agent Flow:**  
When invoked as part of the automated Blueprint Sprint, the brief auto-approves and proceeds to Phase 2. A Pushover/Slack notification is sent with the brief summary, allowing an async review and override window before asset generation begins (configurable delay: 0 minutes → 4 hours).

### Step 5: Commit to DynamoDB

The approved brief is written to the `lll-shadow-campaigns` table:

```
PK: CAMPAIGN#<slug>
SK: MEDIA#AESTHETIC_BRIEF
```

The campaign `METADATA` record is updated with `aestheticBriefStatus: 'approved'` and `aestheticGeneratedAt: <timestamp>` to signal Phase 2 can proceed.

---

## Aesthetic Archetypes (Reference Library)

Pre-seeded examples to ground AI generation quality. These are starting points, not limits.

| Archetype | Palette Direction | Typography | Imagery Mood | Voice Persona |
|-----------|------------------|------------|-------------|----------------|
| **Retro-Future / Y2K** | Electric blue, chrome silver, magenta accent | Pixel-adjacent, blocky sans | Neon interiors, CRT glow, golden hour deck | The time-traveling hype friend |
| **Dark Academia** | Forest green, deep burgundy, parchment | Serif editorial, aged texture | Overcast light, leather-bound, candlelit library bar | The well-traveled intellectual |
| **Solar Punk** | Mint, warm terracotta, sun yellow | Rounded humanist sans | Lush plants, natural light, rooftop gardens at sea | The optimistic futurist |
| **Cottagecore / Slow Life** | Dusty rose, sage green, cream | Serif with soft weight, handwritten | Golden hour, linen textures, wildflowers, calm water | The gentle escapist |
| **Urban Street / Hypebeast** | Monochrome with a single aggressive accent | Compressed sans heavy | High-contrast editorial, city-meets-sea, motion blur | The tastemaker who found a secret |
| **Wellness / Biohacking** | Clean white, muted teal, biometric green | Clean geometric sans | Clinical-soft, serene ocean, sunrise ritual | The optimized modern human |

---

## Brand Constraint Integration

All generated aesthetics are filtered against the Leisure Life Interactive brand guidelines (see `brand-identity` skill). The following are **hard constraints** that GPT-4o's aesthetic generation cannot override:

- Brand typefaces take precedence on the landing page (campaign-specific aesthetic is layered on top via theme variables)
- CTA buttons always use brand interaction colors — campaign palette applies to decorative and hero elements only
- The LLL wordmark remains in its approved form on all owned-channel assets
- "Your Adventure Starts Here"-level generic cruise messaging is auto-flagged and regenerated

---

## Slogan Quality Gate

The `heroSlogan` and subSlogan fields pass through a quality rubric before the brief is approved:

| Criterion | Check |
|-----------|-------|
| Not a cruise industry cliché | Keywords: "paradise", "perfect vacation", "dream getaway", "sail away" → flag |
| Niche-identity resonant | Must reference or imply the target community identity |
| Curiosity-creating | Should raise a question the CTA answers |
| Concise | Hero: ≤ 8 words, Sub: ≤ 14 words |
| Distinct per campaign | No slogan reuse across active campaigns |

If a generated slogan fails 2+ criteria, Phase 1 automatically re-runs the messaging section with failure feedback appended to the prompt.
