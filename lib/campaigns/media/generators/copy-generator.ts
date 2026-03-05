import {
    CampaignAestheticBrief,
    AdCopySet,
    EmailSubjectSet,
    PlatformCaptions
} from '../../schema';
import { callLLM, modelForTask } from '@/lib/ai/llm-gateway';

// ────────────────────────────────────────────────────────────────────────────
// Copy & Caption Generator
// Single structured GPT call to produce all platform copy variants.
// Uses LLM gateway with modelForTask('creative').
// ────────────────────────────────────────────────────────────────────────────

export interface GeneratedCopy {
    carouselSlides: string[];
    adVariants: AdCopySet[];
    captions: PlatformCaptions;
    emailSubjectLines: EmailSubjectSet[];
}

/**
 * Generates all platform copy in a single LLM call.
 * Returns structured JSON with carousel slides, ad variants, captions, and email subjects.
 */
export async function generatePlatformCopy(
    brief: CampaignAestheticBrief
): Promise<GeneratedCopy> {
    const model = modelForTask('creative');

    const systemPrompt = `You are the copywriter for Leisure Life Interactive, a boutique cruise campaign studio.
You write platform-native copy that is sharp, niche-specific, and avoids generic cruise marketing language.
Return ONLY valid JSON matching the exact schema specified. No markdown, no explanation.`;

    const userPrompt = `Generate all platform copy for this campaign. Return JSON matching this schema exactly:

{
  "carouselSlides": ["slide 1 text", "slide 2 text", ... (7 slides for Instagram carousel)],
  "adVariants": [
    { "headline": "", "primaryText": "", "description": "", "cta": "", "variant": "A" },
    { "headline": "", "primaryText": "", "description": "", "cta": "", "variant": "B" },
    { "headline": "", "primaryText": "", "description": "", "cta": "", "variant": "C" }
  ],
  "captions": {
    "tiktok": [
      { "caption": "", "hashtags": ["", ""] },
      { "caption": "", "hashtags": ["", ""] },
      { "caption": "", "hashtags": ["", ""] }
    ],
    "pinterest": [
      { "title": "", "description": "" },
      { "title": "", "description": "" },
      { "title": "", "description": "" },
      { "title": "", "description": "" },
      { "title": "", "description": "" }
    ],
    "discord": "Single Discord channel announcement message"
  },
  "emailSubjectLines": [
    { "stage": "welcome", "variants": ["subject 1", "subject 2", "subject 3"] },
    { "stage": "nurture_day3", "variants": ["subject 1", "subject 2", "subject 3"] },
    { "stage": "nurture_day7", "variants": ["subject 1", "subject 2", "subject 3"] }
  ]
}

Campaign Context:
- Theme: ${brief.themeName}
- Hero Slogan: ${brief.messaging.heroSlogan}
- Sub Slogan: ${brief.messaging.subSlogan}
- Elevator Pitch: ${brief.messaging.elevatorPitch}
- Tone Keywords: ${brief.messaging.toneKeywords.join(', ')}
- Voice Persona: ${brief.messaging.voicePersona}
- CTA Variants: Waitlist: "${brief.messaging.ctaVariants.waitlist}", Book: "${brief.messaging.ctaVariants.bookNow}"
- Aesthetic: ${brief.visual.aestheticLabel}
- TikTok Hook (reference): ${brief.socialConcepts.tiktokOrganic.hook}
- Instagram Feed Caption (reference): ${brief.socialConcepts.instagramFeed.caption}
- Facebook Ad Headline (reference): ${brief.socialConcepts.facebookAd.headline}

Generate copy that is niche-native, avoids generic cruise tropes, and matches the ${brief.visual.aestheticLabel} aesthetic.`;

    const { content } = await callLLM(model, userPrompt, {
        systemPrompt,
        maxTokens: 4000,
        temperature: 0.8,
    });

    // Parse the JSON response — strip any markdown fencing if present
    const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr) as GeneratedCopy;

    return parsed;
}
