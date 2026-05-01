import { CampaignAestheticBrief } from '../../schema';
import { GeneratedImage } from './stability-generator';
import { NANO_BANANA_CONFIG } from '../media-pipeline-config';
import { resolveMediaStyle } from '../style-prompts';

// ────────────────────────────────────────────────────────────────────────────
// DALL-E 3 Merch Design Generator
// Generates print-ready merch design images from dallePrompt fields.
// All model/API settings controlled via DALLE_CONFIG in media-pipeline-config.ts
// ────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
    const key = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY not set in environment');
    return key;
}

async function generateNanoBananaMerchImage(prompt: string): Promise<Buffer> {
    const response = await fetch(`${NANO_BANANA_CONFIG.apiBase}/models/${NANO_BANANA_CONFIG.model}:generateContent`, {
        method: 'POST',
        headers: {
            'x-goog-api-key': getApiKey(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: {
                    aspectRatio: NANO_BANANA_CONFIG.merchAspectRatio,
                    imageSize: NANO_BANANA_CONFIG.merchImageSize,
                },
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Nano-Banana error ${response.status}: ${errorText}`);
    }

    const payload = await response.json() as {
        candidates?: Array<{
            content?: {
                parts?: Array<{
                    inlineData?: { data?: string };
                    inline_data?: { data?: string };
                }>;
            };
        }>;
    };
    const contentParts = payload.candidates?.[0]?.content?.parts ?? [];
    const imagePart = contentParts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const imageData = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;

    if (!imageData) {
        throw new Error('Nano-Banana did not return a merch image payload');
    }

    return Buffer.from(imageData, 'base64');
}

function buildStyledMerchPrompt(prompt: string, seed: string, themeAnchorProps: readonly string[]): string {
    const resolvedStyle = resolveMediaStyle({
        assetKind: 'merch',
        hasPeople: true,
        seed,
        themeAnchorProps,
    });

    return [
        resolvedStyle.promptBlock,
        prompt,
    ].join('. ');
}

/**
 * Generates merch design images from all merch item dallePrompts in the brief.
 * - coreItem (t-shirt)
 * - practicalItem (lanyard, tote, etc.)
 * - nicheSpecificItems (variable count)
 */
export async function generateMerchDesigns(
    brief: CampaignAestheticBrief
): Promise<GeneratedImage[]> {
    const { merch } = brief;
    const results: GeneratedImage[] = [];
    const themeAnchorProps = brief.visual.plausibilityFramework.allowedProps.slice(0, 2);

    const corePrompt = buildStyledMerchPrompt(merch.coreItem.dallePrompt, 'merch_core_tshirt', themeAnchorProps);
    const coreBuffer = await generateNanoBananaMerchImage(corePrompt);
    results.push({
        buffer: coreBuffer,
        prompt: corePrompt,
        assetId: 'merch_core_tshirt',
        fileName: `merch/designs/core_tshirt_design.png`,
    });

    const practicalAssetId = `merch_practical_${merch.practicalItem.productType.toLowerCase().replace(/\s+/g, '_')}`;
    const practicalPrompt = buildStyledMerchPrompt(merch.practicalItem.dallePrompt, practicalAssetId, themeAnchorProps);
    const practicalBuffer = await generateNanoBananaMerchImage(practicalPrompt);
    results.push({
        buffer: practicalBuffer,
        prompt: practicalPrompt,
        assetId: practicalAssetId,
        fileName: `merch/designs/${merch.practicalItem.productType.toLowerCase().replace(/\s+/g, '_')}_design.png`,
    });

    for (let i = 0; i < merch.nicheSpecificItems.length; i++) {
        const item = merch.nicheSpecificItems[i];
        const idx = String(i + 1).padStart(3, '0');
        const assetId = `merch_niche_${idx}`;
        const prompt = buildStyledMerchPrompt(item.dallePrompt, assetId, themeAnchorProps);
        const buffer = await generateNanoBananaMerchImage(prompt);
        results.push({
            buffer,
            prompt,
            assetId,
            fileName: `merch/designs/niche_item_${idx}_design.png`,
        });
    }

    return results;
}
