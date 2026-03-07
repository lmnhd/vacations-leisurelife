import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { uploadAsset } from '@/lib/campaigns/media/r2-client';
import { saveAssetRecord, upsertManifestAssetSection } from '@/lib/campaigns/media/media-store';
import { NANO_BANANA_CONFIG, getMediaImageGeneratorService } from '@/lib/campaigns/media/media-pipeline-config';
import type { AssetRecord } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/merch
// DALL-E 3 merch design → upload PNG to R2 → save AssetRecord → return CDN URL.
// Body: { itemIndex?: number }  0=core, 1=practical, 2+=niche
// ────────────────────────────────────────────────────────────────────────────

interface MerchTestRequestBody {
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
        const googleApiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
        if (!googleApiKey) {
            throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY not set in environment');
        }

        const imageResponse = await fetch(`${NANO_BANANA_CONFIG.apiBase}/models/${NANO_BANANA_CONFIG.model}:generateContent`, {
            method: 'POST',
            headers: {
                'x-goog-api-key': googleApiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: targetItem.prompt }] }],
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    imageConfig: {
                        aspectRatio: NANO_BANANA_CONFIG.merchAspectRatio,
                        imageSize: NANO_BANANA_CONFIG.merchImageSize,
                    },
                },
            }),
        });

        if (!imageResponse.ok) {
            const errorText = await imageResponse.text();
            throw new Error(`Nano-Banana error ${imageResponse.status}: ${errorText}`);
        }

        const payload = await imageResponse.json() as {
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

        const imageBuffer = Buffer.from(imageData, 'base64');
        const assetId = `merch_${targetItem.type}_${randomUUID().slice(0, 8)}`;
        const fileName = `merch/${targetItem.type}_design_${assetId}.png`;

        const cdnUrl = await uploadAsset(slug, fileName, imageBuffer, 'image/png');
        const record: AssetRecord = {
            assetId,
            assetType: 'merch_design',
            url: cdnUrl,
            generator: getMediaImageGeneratorService(),
            promptUsed: targetItem.prompt,
            dimensions: { width: 1024, height: 1024 },
            fileSizeBytes: imageBuffer.length,
            mimeType: 'image/png',
            tags: ['merch', targetItem.type],
            createdAt: new Date().toISOString(),
            reviewStatus: 'needs_review',
            version: 1,
            active: true,
        };
        await saveAssetRecord(slug, record);
        await upsertManifestAssetSection(slug, 'designs', [record]);

        return NextResponse.json({
            generator: getMediaImageGeneratorService(),
            itemIndex,
            itemType: targetItem.type,
            productLabel: targetItem.label,
            promptUsed: targetItem.prompt,
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
