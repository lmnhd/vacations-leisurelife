import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { uploadAsset } from '@/lib/campaigns/media/r2-client';
import { saveAssetRecord } from '@/lib/campaigns/media/media-store';
import { generateAmbientNarration, generateHypeClip } from '@/lib/campaigns/media/generators/elevenlabs-generator';
import { generateThemeMusic } from '@/lib/campaigns/media/generators/replicate-music-generator';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/audio
// Generate → upload to R2 → save AssetRecord → return CDN URL.
// Body: { generator: 'elevenlabs_narration' | 'elevenlabs_hype' | 'replicate_theme' }
// ────────────────────────────────────────────────────────────────────────────

type AudioTestGenerator = 'elevenlabs_narration' | 'elevenlabs_hype' | 'replicate_theme';

interface AudioTestRequestBody {
    generator: AudioTestGenerator;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const body = await request.json() as AudioTestRequestBody;
    const { generator } = body;

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
        if (generator === 'elevenlabs_narration') {
            const audio = await generateAmbientNarration(brief);
            const cdnUrl = await uploadAsset(slug, audio.fileName, audio.buffer, 'audio/mpeg');
            await saveAssetRecord(slug, {
                assetId: audio.assetId,
                assetType: 'ambient_narration',
                url: cdnUrl,
                generator: 'elevenlabs',
                promptUsed: audio.script,
                durationSeconds: 30,
                fileSizeBytes: audio.buffer.length,
                mimeType: 'audio/mpeg',
                tags: ['audio', 'narration'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            });
            return NextResponse.json({
                generator: 'elevenlabs',
                assetId: audio.assetId,
                fileName: audio.fileName,
                script: audio.script,
                fileSizeBytes: audio.buffer.length,
                cdnUrl,
            });
        }

        if (generator === 'elevenlabs_hype') {
            const audio = await generateHypeClip(brief);
            const cdnUrl = await uploadAsset(slug, audio.fileName, audio.buffer, 'audio/mpeg');
            await saveAssetRecord(slug, {
                assetId: audio.assetId,
                assetType: 'hype_clip',
                url: cdnUrl,
                generator: 'elevenlabs',
                promptUsed: audio.script,
                durationSeconds: 15,
                fileSizeBytes: audio.buffer.length,
                mimeType: 'audio/mpeg',
                tags: ['audio', 'hype'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            });
            return NextResponse.json({
                generator: 'elevenlabs',
                assetId: audio.assetId,
                fileName: audio.fileName,
                script: audio.script,
                fileSizeBytes: audio.buffer.length,
                cdnUrl,
            });
        }

        if (generator === 'replicate_theme') {
            const audio = await generateThemeMusic(brief);
            
            const fileSizeBytes = audio.buffer.length;
            const cdnUrl = await uploadAsset(
                slug,
                audio.fileName,
                audio.buffer,
                'audio/mpeg'
            );

            const record = await saveAssetRecord(slug, {
                assetId: audio.assetId,
                assetType: 'theme_music',
                url: cdnUrl,
                generator: 'replicate',
                promptUsed: audio.script,
                durationSeconds: 30, // Use constant 30s
                fileSizeBytes,
                mimeType: 'audio/mpeg',
                tags: ['audio', 'music', 'theme', 'test'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'auto_approved',
                version: 1,
                active: true,
            });

            return NextResponse.json(record);
        }

        return NextResponse.json({ error: `Unknown generator: ${generator}` }, { status: 400 });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes('not yet implemented') || message.includes('not set') ? 501 : 500;
        return NextResponse.json({ error: message, notImplemented: status === 501 }, { status });
    }
}
