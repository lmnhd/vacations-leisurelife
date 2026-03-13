import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { buildElevenLabsVoiceTags } from '@/lib/campaigns/media/elevenlabs-voices';
import { uploadAsset } from '@/lib/campaigns/media/r2-client';
import { saveAssetRecord, upsertManifestAssetSection } from '@/lib/campaigns/media/media-store';
import { generateAmbientNarration, generateHypeClip } from '@/lib/campaigns/media/generators/elevenlabs-generator';
import { generateThemeMusic } from '@/lib/campaigns/media/generators/replicate-music-generator';
import { buildDefaultThemeMusicRecord, buildThemeMusicSelectionReason, selectDefaultThemeMusicTrack } from '@/lib/campaigns/media/theme-music-library';
import type { AssetRecord } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/audio
// Generate → upload to R2 → save AssetRecord → return CDN URL.
// Body: { generator: 'elevenlabs_narration' | 'elevenlabs_hype' | 'replicate_theme' }
// ────────────────────────────────────────────────────────────────────────────

type AudioTestGenerator = 'elevenlabs_narration' | 'elevenlabs_hype' | 'replicate_theme' | 'default_theme';

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
            const record: AssetRecord = {
                assetId: audio.assetId,
                assetType: 'ambient_narration',
                url: cdnUrl,
                generator: 'elevenlabs',
                promptUsed: audio.script,
                durationSeconds: 30,
                fileSizeBytes: audio.buffer.length,
                mimeType: 'audio/mpeg',
                tags: ['audio', 'narration', ...buildElevenLabsVoiceTags(audio.voiceRole, audio.voiceId, audio.voiceName)],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            };
            await saveAssetRecord(slug, record);
            await upsertManifestAssetSection(slug, 'ambientNarration', record);
            return NextResponse.json({
                generator: 'elevenlabs',
                assetId: audio.assetId,
                fileName: audio.fileName,
                script: audio.script,
                voiceId: audio.voiceId,
                voiceName: audio.voiceName,
                fileSizeBytes: audio.buffer.length,
                cdnUrl,
            });
        }

        if (generator === 'elevenlabs_hype') {
            const audio = await generateHypeClip(brief);
            const cdnUrl = await uploadAsset(slug, audio.fileName, audio.buffer, 'audio/mpeg');
            const record: AssetRecord = {
                assetId: audio.assetId,
                assetType: 'hype_clip',
                url: cdnUrl,
                generator: 'elevenlabs',
                promptUsed: audio.script,
                durationSeconds: 15,
                fileSizeBytes: audio.buffer.length,
                mimeType: 'audio/mpeg',
                tags: ['audio', 'hype', ...buildElevenLabsVoiceTags(audio.voiceRole, audio.voiceId, audio.voiceName)],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            };
            await saveAssetRecord(slug, record);
            await upsertManifestAssetSection(slug, 'hypeClip', record);
            return NextResponse.json({
                generator: 'elevenlabs',
                assetId: audio.assetId,
                fileName: audio.fileName,
                script: audio.script,
                voiceId: audio.voiceId,
                voiceName: audio.voiceName,
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

            const record: AssetRecord = {
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
            };
            await saveAssetRecord(slug, record);
            await upsertManifestAssetSection(slug, 'themeMusic', record);

            return NextResponse.json(record);
        }

        if (generator === 'default_theme') {
            const selectedTrack = await selectDefaultThemeMusicTrack(brief);
            if (!selectedTrack) {
                return NextResponse.json({ error: 'No default theme music tracks are available in the shared library' }, { status: 404 });
            }

            const selectionReason = buildThemeMusicSelectionReason(brief, selectedTrack);
            const record = buildDefaultThemeMusicRecord(slug, selectedTrack, selectionReason);
            await saveAssetRecord(slug, record);
            await upsertManifestAssetSection(slug, 'themeMusic', record);
            return NextResponse.json(record);
        }

        return NextResponse.json({ error: `Unknown generator: ${generator}` }, { status: 400 });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes('not yet implemented') || message.includes('not set') ? 501 : 500;
        return NextResponse.json({ error: message, notImplemented: status === 501 }, { status });
    }
}
