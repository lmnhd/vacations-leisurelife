import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { uploadAsset } from '@/lib/campaigns/media/r2-client';
import { saveAssetRecord } from '@/lib/campaigns/media/media-store';
import {
    generateTikTokSeed,
    generateHeroExplainer,
    generateThresholdAnnouncement,
} from '@/lib/campaigns/media/generators/heygen-generator';
import {
    generateCountdownVideos,
    generateBrollClips,
} from '@/lib/campaigns/media/generators/runway-generator';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/test/video
// Generate → upload to R2 → save AssetRecord → return CDN URL.
//
// Body: {
//   generator: 'heygen_tiktok' | 'heygen_explainer' | 'heygen_threshold'
//            | 'runway_countdown' | 'runway_broll'
//   heroImageUrl: string  ← CDN URL of an already-uploaded hero image
// }
// ────────────────────────────────────────────────────────────────────────────

type VideoTestGenerator =
    | 'heygen_tiktok'
    | 'heygen_explainer'
    | 'heygen_threshold'
    | 'runway_countdown'
    | 'runway_broll';

interface VideoTestRequestBody {
    generator: VideoTestGenerator;
    heroImageUrl: string;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const body = await request.json() as VideoTestRequestBody;
    const { generator, heroImageUrl } = body;

    if (!heroImageUrl) {
        return NextResponse.json({
            error: 'heroImageUrl required. Run the Stability Hero image test first, then paste the returned cdnUrl here.'
        }, { status: 400 });
    }

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
        if (generator === 'heygen_tiktok') {
            const video = await generateTikTokSeed(brief, heroImageUrl);
            const cdnUrl = await uploadAsset(slug, video.fileName, video.buffer, 'video/mp4');
            await saveAssetRecord(slug, {
                assetId: video.assetId,
                assetType: 'tiktok_seed_video',
                url: cdnUrl,
                generator: 'heygen',
                promptUsed: video.script,
                durationSeconds: video.durationSeconds,
                fileSizeBytes: video.buffer.length,
                mimeType: 'video/mp4',
                tags: ['video', 'tiktok', 'heygen'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            });
            return NextResponse.json({
                generator: 'heygen', type: 'tiktok_seed_9x16',
                assetId: video.assetId, fileName: video.fileName,
                script: video.script, durationSeconds: video.durationSeconds,
                fileSizeBytes: video.buffer.length, cdnUrl,
            });
        }

        if (generator === 'heygen_explainer') {
            const video = await generateHeroExplainer(brief, heroImageUrl);
            const cdnUrl = await uploadAsset(slug, video.fileName, video.buffer, 'video/mp4');
            await saveAssetRecord(slug, {
                assetId: video.assetId,
                assetType: 'hero_explainer_video',
                url: cdnUrl,
                generator: 'heygen',
                promptUsed: video.script,
                durationSeconds: video.durationSeconds,
                fileSizeBytes: video.buffer.length,
                mimeType: 'video/mp4',
                tags: ['video', 'explainer', 'heygen'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            });
            return NextResponse.json({
                generator: 'heygen', type: 'hero_explainer_16x9',
                assetId: video.assetId, fileName: video.fileName,
                script: video.script, durationSeconds: video.durationSeconds,
                fileSizeBytes: video.buffer.length, cdnUrl,
            });
        }

        if (generator === 'heygen_threshold') {
            const video = await generateThresholdAnnouncement(brief, heroImageUrl);
            const cdnUrl = await uploadAsset(slug, video.fileName, video.buffer, 'video/mp4');
            await saveAssetRecord(slug, {
                assetId: video.assetId,
                assetType: 'threshold_video',
                url: cdnUrl,
                generator: 'heygen',
                promptUsed: video.script,
                durationSeconds: video.durationSeconds,
                fileSizeBytes: video.buffer.length,
                mimeType: 'video/mp4',
                tags: ['video', 'threshold', 'heygen'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            });
            return NextResponse.json({
                generator: 'heygen', type: 'threshold_announcement_16x9',
                assetId: video.assetId, fileName: video.fileName,
                script: video.script, durationSeconds: video.durationSeconds,
                fileSizeBytes: video.buffer.length, cdnUrl,
            });
        }

        if (generator === 'runway_countdown') {
            // Test mode: first countdown clip only
            const videos = await generateCountdownVideos(brief, heroImageUrl);
            const video = videos[0];
            const cdnUrl = await uploadAsset(slug, video.fileName, video.buffer, 'video/mp4');
            await saveAssetRecord(slug, {
                assetId: video.assetId,
                assetType: 'countdown_video',
                url: cdnUrl,
                generator: 'runwayml',
                promptUsed: video.motionPrompt,
                durationSeconds: video.durationSeconds,
                fileSizeBytes: video.buffer.length,
                mimeType: 'video/mp4',
                tags: ['video', 'countdown', 'runwayml'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            });
            return NextResponse.json({
                generator: 'runwayml', type: 'countdown_3cabins',
                note: 'Test mode: generated 1 of 3 countdown clips',
                assetId: video.assetId, fileName: video.fileName,
                motionPrompt: video.motionPrompt, durationSeconds: video.durationSeconds,
                fileSizeBytes: video.buffer.length, cdnUrl,
            });
        }

        if (generator === 'runway_broll') {
            // Test mode: single source image → single B-roll clip
            const videos = await generateBrollClips(brief, [heroImageUrl]);
            const video = videos[0];
            const cdnUrl = await uploadAsset(slug, video.fileName, video.buffer, 'video/mp4');
            await saveAssetRecord(slug, {
                assetId: video.assetId,
                assetType: 'broll_clip',
                url: cdnUrl,
                generator: 'runwayml',
                promptUsed: video.motionPrompt,
                durationSeconds: video.durationSeconds,
                fileSizeBytes: video.buffer.length,
                mimeType: 'video/mp4',
                tags: ['video', 'broll', 'runwayml'],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            });
            return NextResponse.json({
                generator: 'runwayml', type: 'broll_001',
                note: 'Test mode: generated 1 of 3–4 B-roll clips',
                assetId: video.assetId, fileName: video.fileName,
                motionPrompt: video.motionPrompt, durationSeconds: video.durationSeconds,
                fileSizeBytes: video.buffer.length, cdnUrl,
            });
        }

        return NextResponse.json({ error: `Unknown generator: ${generator}` }, { status: 400 });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
