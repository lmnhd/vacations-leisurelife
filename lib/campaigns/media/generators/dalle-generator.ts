import { CampaignAestheticBrief } from '../../schema';
import { GeneratedImage } from './stability-generator';

// ────────────────────────────────────────────────────────────────────────────
// DALL-E 3 Merch Design Generator
// Generates print-ready merch design images from dallePrompt fields.
// Uses existing OPENAI_API_KEY.
// ────────────────────────────────────────────────────────────────────────────

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';

function getApiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set in environment');
    return key;
}

async function generateDalleImage(prompt: string): Promise<Buffer> {
    const apiKey = getApiKey();

    const response = await fetch(OPENAI_IMAGES_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'dall-e-3',
            prompt,
            size: '1024x1024',
            quality: 'hd',
            style: 'natural',
            response_format: 'b64_json',
            n: 1,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DALL-E 3 error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as { data: Array<{ b64_json: string }> };
    return Buffer.from(data.data[0].b64_json, 'base64');
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

    // Core item
    const coreBuffer = await generateDalleImage(merch.coreItem.dallePrompt);
    results.push({
        buffer: coreBuffer,
        prompt: merch.coreItem.dallePrompt,
        assetId: 'merch_core_tshirt',
        fileName: `merch/designs/core_tshirt_design.png`,
    });

    // Practical item
    const practicalBuffer = await generateDalleImage(merch.practicalItem.dallePrompt);
    results.push({
        buffer: practicalBuffer,
        prompt: merch.practicalItem.dallePrompt,
        assetId: `merch_practical_${merch.practicalItem.productType.toLowerCase().replace(/\s+/g, '_')}`,
        fileName: `merch/designs/${merch.practicalItem.productType.toLowerCase().replace(/\s+/g, '_')}_design.png`,
    });

    // Niche-specific items
    for (let i = 0; i < merch.nicheSpecificItems.length; i++) {
        const item = merch.nicheSpecificItems[i];
        const buffer = await generateDalleImage(item.dallePrompt);
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
