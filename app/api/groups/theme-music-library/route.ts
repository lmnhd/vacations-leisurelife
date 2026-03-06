import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { storeAsset } from '@/lib/campaigns/media/storage-client';
import { saveAssetRecord } from '@/lib/campaigns/media/media-store';
import {
    SHARED_THEME_MUSIC_LIBRARY_SLUG,
    listThemeMusicLibraryTracks,
    parseThemeMusicTags,
    selectDefaultThemeMusicTrackForCampaign,
} from '@/lib/campaigns/media/theme-music-library';

const ThemeMusicLibraryBulkUploadMetadataSchema = z.object({
    tags: z.array(z.string()).default([]),
    promptUsed: z.string().default(''),
    durationSeconds: z.number().min(1).optional(),
});

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const campaignSlug = searchParams.get('campaignSlug')?.trim() ?? '';
        const tracks = await listThemeMusicLibraryTracks();

        if (!campaignSlug) {
            return NextResponse.json({
                librarySlug: SHARED_THEME_MUSIC_LIBRARY_SLUG,
                tracks,
                count: tracks.length,
            });
        }

        const selectedTrack = await selectDefaultThemeMusicTrackForCampaign(campaignSlug);
        return NextResponse.json({
            librarySlug: SHARED_THEME_MUSIC_LIBRARY_SLUG,
            campaignSlug,
            tracks,
            count: tracks.length,
            selectedTrack,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load theme music library';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    let formData: FormData;

    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
    }

    const files = formData.getAll('files').filter((value): value is File => value instanceof File);
    if (files.length === 0) {
        return NextResponse.json({ error: 'At least one audio file is required' }, { status: 400 });
    }

    const tagsValue = formData.get('tags');
    const promptUsedValue = formData.get('promptUsed');
    const durationSecondsValue = formData.get('durationSeconds');

    const parsedMetadata = ThemeMusicLibraryBulkUploadMetadataSchema.safeParse({
        tags: typeof tagsValue === 'string'
            ? tagsValue.split(',').map((tagValue) => tagValue.trim()).filter(Boolean)
            : [],
        promptUsed: typeof promptUsedValue === 'string' ? promptUsedValue : '',
        durationSeconds: typeof durationSecondsValue === 'string' && durationSecondsValue.trim().length > 0
            ? Number(durationSecondsValue)
            : undefined,
    });

    if (!parsedMetadata.success) {
        return NextResponse.json({ error: 'Invalid upload metadata', issues: parsedMetadata.error.issues }, { status: 400 });
    }

    try {
        const createdTracks = await Promise.all(files.map(async (file, trackIndex) => {
            const assetId = `library_theme_music_${Date.now()}_${trackIndex}`;
            const buffer = Buffer.from(await file.arrayBuffer());
            const normalizedFileName = file.name.replace(/\s+/g, '_');
            const fileName = `audio/library/${assetId}_${normalizedFileName}`;
            const url = await storeAsset(
                SHARED_THEME_MUSIC_LIBRARY_SLUG,
                assetId,
                fileName,
                buffer,
                file.type || 'audio/mpeg',
            );

            const record = {
                assetId,
                assetType: 'theme_music' as const,
                url,
                generator: 'default_library' as const,
                promptUsed: parsedMetadata.data.promptUsed,
                fileSizeBytes: buffer.length,
                mimeType: file.type || 'audio/mpeg',
                tags: parseThemeMusicTags(parsedMetadata.data.tags.join(',')),
                createdAt: new Date().toISOString(),
                reviewStatus: 'human_approved' as const,
                version: 1,
                active: true,
                ...(parsedMetadata.data.durationSeconds !== undefined ? { durationSeconds: parsedMetadata.data.durationSeconds } : {}),
            };

            await saveAssetRecord(SHARED_THEME_MUSIC_LIBRARY_SLUG, record);
            return record;
        }));

        return NextResponse.json({
            librarySlug: SHARED_THEME_MUSIC_LIBRARY_SLUG,
            createdTracks,
            count: createdTracks.length,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to upload theme music tracks';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
