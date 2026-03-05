import { CampaignAestheticBrief } from '../../schema';
import { STABILITY_CONFIG } from '../media-pipeline-config';

// ────────────────────────────────────────────────────────────────────────────
// Stability AI Image Generator
// Primary hero image + aesthetic concept art generation.
// All settings controlled via STABILITY_CONFIG in media-pipeline-config.ts.
// ────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
    const key = process.env.STABILITY_API_KEY;
    if (!key) throw new Error('STABILITY_API_KEY not set in environment');
    return key;
}

function buildHeroPrompts(brief: CampaignAestheticBrief, shipName: string): string[] {
    const { imageryMood, lightingStyle, compositionNotes } = brief.visual;

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
    aspectRatio: typeof STABILITY_CONFIG.heroAspectRatio | typeof STABILITY_CONFIG.conceptAspectRatio
): Promise<Buffer> {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('negative_prompt', negativePrompt);
    formData.append('aspect_ratio', aspectRatio);
    formData.append('output_format', STABILITY_CONFIG.outputFormat);

    const response = await fetch(
        `${STABILITY_CONFIG.apiBase}${STABILITY_CONFIG.endpoint}`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getApiKey()}`,
                'Accept': 'image/*',
            },
            body: formData,
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Stability AI error ${response.status}: ${errorText}`);
    }

    return Buffer.from(await response.arrayBuffer());
}

export interface GeneratedImage {
    buffer: Buffer;
    prompt: string;
    assetId: string;
    fileName: string;
}

export async function generateHeroImages(
    brief: CampaignAestheticBrief,
    shipName: string,
    count: number = STABILITY_CONFIG.heroCount
): Promise<GeneratedImage[]> {
    const prompts = buildHeroPrompts(brief, shipName).slice(0, count);
    const negativePrompt = brief.visual.avoidList.join(', ');
    const results: GeneratedImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const buffer = await generateImage(prompts[i], negativePrompt, STABILITY_CONFIG.heroAspectRatio);
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

export async function generateAestheticConcepts(
    brief: CampaignAestheticBrief,
    count: number = STABILITY_CONFIG.conceptCount
): Promise<GeneratedImage[]> {
    const prompts = buildConceptPrompts(brief).slice(0, count);
    const negativePrompt = brief.visual.avoidList.join(', ');
    const results: GeneratedImage[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const buffer = await generateImage(prompts[i], negativePrompt, STABILITY_CONFIG.conceptAspectRatio);
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
