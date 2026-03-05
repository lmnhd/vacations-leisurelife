import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import {
    generateHeroImages,
    generateAestheticConcepts,
} from '@/lib/campaigns/media/generators/stability-generator';
import { generatePlatformCrops } from '@/lib/campaigns/media/generators/sharp-processor';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/images
// Test-only route — runs image generators individually without R2 upload.
// Returns base64 previews + metadata so the UI can render results inline.
// Body: { generator: 'stability_hero' | 'stability_concepts' | 'sharp_crops' }
// ────────────────────────────────────────────────────────────────────────────

type ImageTestGenerator = 'stability_hero' | 'stability_concepts' | 'sharp_crops';

interface ImageTestRequestBody {
    generator: ImageTestGenerator;
    /** For sharp_crops: provide a base64-encoded source image to crop */
    sourceImageBase64?: string;
    shipName?: string;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const body = await request.json() as ImageTestRequestBody;
    const { generator, shipName = 'Norwegian Gem', sourceImageBase64 } = body;

    const brief = await getAestheticBrief(slug);
    if (!brief) {
        return NextResponse.json({ error: `No aesthetic brief found for ${slug}` }, { status: 404 });
    }
    if (brief.humanReviewStatus !== 'approved') {
        return NextResponse.json({
            error: `Brief not approved (status: ${brief.humanReviewStatus}). Approve it first.`
        }, { status: 400 });
    }

    try {
        if (generator === 'stability_hero') {
            const images = await generateHeroImages(brief, shipName, 1); // 1 image for test
            const img = images[0];
            return NextResponse.json({
                generator: 'stability_ai',
                assetId: img.assetId,
                fileName: img.fileName,
                prompt: img.prompt,
                sizeBytes: img.buffer.length,
                preview: `data:image/webp;base64,${img.buffer.toString('base64')}`,
            });
        }

        if (generator === 'stability_concepts') {
            const images = await generateAestheticConcepts(brief, 1); // 1 image for test
            const img = images[0];
            return NextResponse.json({
                generator: 'stability_ai',
                assetId: img.assetId,
                fileName: img.fileName,
                prompt: img.prompt,
                sizeBytes: img.buffer.length,
                preview: `data:image/webp;base64,${img.buffer.toString('base64')}`,
            });
        }

        if (generator === 'sharp_crops') {
            if (!sourceImageBase64) {
                return NextResponse.json({
                    error: 'sourceImageBase64 required for sharp_crops. Run stability_hero first, then paste its preview here.'
                }, { status: 400 });
            }
            // Strip data URL prefix if present
            const base64Data = sourceImageBase64.replace(/^data:image\/\w+;base64,/, '');
            const sourceBuffer = Buffer.from(base64Data, 'base64');
            const crops = await generatePlatformCrops(sourceBuffer, 'test_hero_001');

            return NextResponse.json({
                generator: 'sharp',
                cropCount: crops.length,
                crops: crops.map(c => ({
                    format: c.format,
                    width: c.width,
                    height: c.height,
                    sizeBytes: c.buffer.length,
                    preview: `data:image/webp;base64,${c.buffer.toString('base64')}`,
                })),
            });
        }

        return NextResponse.json({ error: `Unknown generator: ${generator}` }, { status: 400 });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
