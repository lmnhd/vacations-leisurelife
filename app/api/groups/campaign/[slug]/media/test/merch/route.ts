import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { uploadAsset } from '@/lib/campaigns/media/r2-client';
import { saveAssetRecord } from '@/lib/campaigns/media/media-store';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/merch
// DALL-E 3 merch design → upload PNG to R2 → save AssetRecord → return CDN URL.
// Body: { itemIndex?: number }  0=core, 1=practical, 2+=niche
// ────────────────────────────────────────────────────────────────────────────

interface MerchTestRequestBody {
    itemIndex?: number;
}

interface DalleResponse {
    data: Array<{ b64_json: string; revised_prompt?: string }>;
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
            error: `itemIndex ${itemIndex} out of range. ${allItems.length} items available (0–${allItems.length - 1}).`,
            availableItems: allItems.map((item, i) => ({ index: i, type: item.type, label: item.label })),
        }, { status: 400 });
    }

    const targetItem = allItems[itemIndex];

    try {
        const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
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

        if (!dalleResponse.ok) {
            const errorText = await dalleResponse.text();
            throw new Error(`DALL-E 3 error ${dalleResponse.status}: ${errorText}`);
        }

        const dalleData = await dalleResponse.json() as DalleResponse;
        const result = dalleData.data[0];
        const imageBuffer = Buffer.from(result.b64_json, 'base64');
        const assetId = `merch_${targetItem.type}_${randomUUID().slice(0, 8)}`;
        const fileName = `merch/${targetItem.type}_design.png`;

        const cdnUrl = await uploadAsset(slug, fileName, imageBuffer, 'image/png');
        await saveAssetRecord(slug, {
            assetId,
            assetType: 'merch_design',
            url: cdnUrl,
            generator: 'dalle3',
            promptUsed: result.revised_prompt ?? targetItem.prompt,
            dimensions: { width: 1024, height: 1024 },
            fileSizeBytes: imageBuffer.length,
            mimeType: 'image/png',
            tags: ['merch', targetItem.type],
            createdAt: new Date().toISOString(),
            reviewStatus: 'needs_review',
            version: 1,
            active: true,
        });

        return NextResponse.json({
            generator: 'dalle3',
            itemIndex,
            itemType: targetItem.type,
            productLabel: targetItem.label,
            promptUsed: targetItem.prompt,
            revisedPrompt: result.revised_prompt,
            assetId,
            fileSizeBytes: imageBuffer.length,
            cdnUrl,
            availableItems: allItems.map((item, i) => ({ index: i, type: item.type, label: item.label })),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
