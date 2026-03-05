import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { generateMerchDesigns } from '@/lib/campaigns/media/generators/dalle-generator';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/merch
// Test-only route — runs DALL-E 3 merch design generator.
// Returns base64 design images inline. No R2 upload.
// Body: { itemIndex?: number } — 0 = core, 1 = practical, 2+ = niche items
// ────────────────────────────────────────────────────────────────────────────

interface MerchTestRequestBody {
    /** Which merch item to generate: 0=core, 1=practical, 2+= niche specific */
    itemIndex?: number;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const body = await request.json() as MerchTestRequestBody;
    const itemIndex = body.itemIndex ?? 0;

    const brief = await getAestheticBrief(slug);
    if (!brief) {
        return NextResponse.json({ error: `No aesthetic brief found for ${slug}` }, { status: 404 });
    }
    if (brief.humanReviewStatus !== 'approved') {
        return NextResponse.json({
            error: `Brief not approved (status: ${brief.humanReviewStatus}). Approve it first.`
        }, { status: 400 });
    }

    // Build a single-item brief variant to generate only the requested item
    const { merch } = brief;
    const allItems = [
        { type: 'core', label: merch.coreItem.productType, prompt: merch.coreItem.dallePrompt },
        { type: 'practical', label: merch.practicalItem.productType, prompt: merch.practicalItem.dallePrompt },
        ...merch.nicheSpecificItems.map((item, i) => ({
            type: `niche_${i + 1}`,
            label: item.productType,
            prompt: item.dallePrompt,
        })),
    ];

    if (itemIndex >= allItems.length) {
        return NextResponse.json({
            error: `itemIndex ${itemIndex} out of range. This brief has ${allItems.length} merch items (0–${allItems.length - 1}).`,
            availableItems: allItems.map((item, i) => ({ index: i, type: item.type, label: item.label })),
        }, { status: 400 });
    }

    const targetItem = allItems[itemIndex];

    try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'dall-e-3',
                prompt: targetItem.prompt,
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

        const data = await response.json() as { data: Array<{ b64_json: string; revised_prompt?: string }> };
        const result = data.data[0];

        return NextResponse.json({
            generator: 'dalle3',
            itemIndex,
            itemType: targetItem.type,
            productLabel: targetItem.label,
            promptUsed: targetItem.prompt,
            revisedPrompt: result.revised_prompt,
            allItems: allItems.map((item, i) => ({ index: i, type: item.type, label: item.label })),
            preview: `data:image/png;base64,${result.b64_json}`,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
