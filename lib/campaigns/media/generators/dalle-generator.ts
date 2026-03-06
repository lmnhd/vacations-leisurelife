import { CampaignAestheticBrief } from '../../schema';
import { GeneratedImage } from './stability-generator';
import { NANO_BANANA_CONFIG } from '../media-pipeline-config';

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

    const coreBuffer = await generateNanoBananaMerchImage(merch.coreItem.dallePrompt);
    results.push({
        buffer: coreBuffer,
        prompt: merch.coreItem.dallePrompt,
        assetId: 'merch_core_tshirt',
        fileName: `merch/designs/core_tshirt_design.png`,
    });

    const practicalBuffer = await generateNanoBananaMerchImage(merch.practicalItem.dallePrompt);
    results.push({
        buffer: practicalBuffer,
        prompt: merch.practicalItem.dallePrompt,
        assetId: `merch_practical_${merch.practicalItem.productType.toLowerCase().replace(/\s+/g, '_')}`,
        fileName: `merch/designs/${merch.practicalItem.productType.toLowerCase().replace(/\s+/g, '_')}_design.png`,
    });

    for (let i = 0; i < merch.nicheSpecificItems.length; i++) {
        const item = merch.nicheSpecificItems[i];
        const buffer = await generateNanoBananaMerchImage(item.dallePrompt);
        const idx = String(i + 1).padStart(3, '0');
        results.push({
            buffer,
            prompt: item.dallePrompt,
            assetId: `merch_niche_${idx}`,
            fileName: `merch/designs/niche_item_${idx}_design.png`,
        });
    }

    return results;
}
