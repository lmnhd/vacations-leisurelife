import { CampaignAestheticBrief, AssetRecord } from '../../schema';
import { randomUUID } from 'crypto';

// ────────────────────────────────────────────────────────────────────────────
// Stability AI Image Generator
// Primary hero image + aesthetic concept art generation
// API: POST https://api.stability.ai/v2beta/stable-image/generate/ultra
// ────────────────────────────────────────────────────────────────────────────

const STABILITY_API_BASE = 'https://api.stability.ai/v2beta';

function getApiKey(): string {
    const key = process.env.STABILITY_API_KEY;
    if (!key) throw new Error('STABILITY_API_KEY not set in environment');
    return key;
}

/**
 * Five hero image prompt variants per the Phase 2 spec:
 * 1. Wide exterior deck shot — ship identity anchor
 * 2. Niche event scene — the unique activity happening on deck
 * 3. Intimate cabin/stateroom — aspirational lifestyle
 * 4. Social gathering shot — group energy, community feeling
 * 5. Destination arrival — port/day excursion
 */
function buildHeroPrompts(brief: CampaignAestheticBrief, shipName: string): string[] {
    const { imageryMood, lightingStyle, compositionNotes, avoidList } = brief.visual;
    const negativeTokens = avoidList.join(', ');

    const scenes = [
        `Wide exterior deck shot on ${shipName}, panoramic ocean view, ship architecture prominent`,
        `${brief.themeName} themed event happening on deck of ${shipName}, participants engaged in niche activity`,
        `Intimate luxury stateroom interior on ${shipName}, aspirational lifestyle, premium cabin details`,
        `Social gathering of ${brief.themeName} enthusiasts on ${shipName}, group energy, community connection`,
        `Destination port arrival from deck of ${shipName}, exotic port in background, golden hour`,
    ];

    return scenes.map(scene =>
        `${imageryMood}, ${scene}, ${lightingStyle}, ${compositionNotes}, editorial travel photography, photorealistic, 8k`
    );
}

function buildConceptPrompts(brief: CampaignAestheticBrief): string[] {
    const { aestheticLabel, imageryMood, colorPalette, lightingStyle } = brief.visual;

    const concepts = [
        `${aestheticLabel} aesthetic mood, abstract representation, ${colorPalette.primary} dominant palette`,
        `${aestheticLabel} lifestyle essence, aspirational feeling, ${colorPalette.secondary} and ${colorPalette.accent} tones`,
        `${aestheticLabel} atmosphere, ethereal quality, ${imageryMood}`,
        `${aestheticLabel} design elements, pattern and texture study, ${colorPalette.primary} and ${colorPalette.background}`,
    ];

    return concepts.map(concept =>
        `${concept}, ${lightingStyle}, conceptual editorial, high contrast, artistic composition`
    );
}

async function generateImage(
    prompt: string,
    negativePrompt: string,
    aspectRatio: '16:9' | '1:1' | '9:16' | '4:5' | '3:2'
): Promise<Buffer> {
    const apiKey = getApiKey();

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('negative_prompt', negativePrompt);
    formData.append('aspect_ratio', aspectRatio);
    formData.append('output_format', 'webp');

    const response = await fetch(`${STABILITY_API_BASE}/stable-image/generate/ultra`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'image/*',
        },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Stability AI error ${response.status}: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

export interface GeneratedImage {
    buffer: Buffer;
    prompt: string;
    assetId: string;
    fileName: string;
}

/**
 * Generate 5 hero images from the aesthetic brief visual fields.
 */
export async function generateHeroImages(
    brief: CampaignAestheticBrief,
    shipName: string,
    count: number = 5
): Promise<GeneratedImage[]> {
    const prompts = buildHeroPrompts(brief, shipName).slice(0, count);
    const negativePrompt = brief.visual.avoidList.join(', ');
    const results: GeneratedImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const buffer = await generateImage(prompts[i], negativePrompt, '16:9');
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: prompts[i],
            assetId: `img_hero_${idx}`,
            fileName: `images/hero/hero_${idx}_source.webp`,
        });
    }

    return results;
}

/**
 * Generate 4 aesthetic concept art images.
 */
export async function generateAestheticConcepts(
    brief: CampaignAestheticBrief,
    count: number = 4
): Promise<GeneratedImage[]> {
    const prompts = buildConceptPrompts(brief).slice(0, count);
    const negativePrompt = brief.visual.avoidList.join(', ');
    const results: GeneratedImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const buffer = await generateImage(prompts[i], negativePrompt, '1:1');
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: prompts[i],
            assetId: `img_concept_${idx}`,
            fileName: `images/concepts/concept_${idx}.webp`,
        });
    }

    return results;
}
