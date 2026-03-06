import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveAssetRecord, saveAssetRecord } from '@/lib/campaigns/media/media-store';
import { SHARED_THEME_MUSIC_LIBRARY_SLUG, parseThemeMusicTags } from '@/lib/campaigns/media/theme-music-library';

const ThemeMusicLibraryUpdateSchema = z.object({
    tags: z.array(z.string()).optional(),
    promptUsed: z.string().optional(),
    durationSeconds: z.number().min(1).optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ assetId: string }> }
) {
    const { assetId } = await params;

    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsedBody = ThemeMusicLibraryUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
        return NextResponse.json({ error: 'Invalid request body', issues: parsedBody.error.issues }, { status: 400 });
    }

    try {
        const existingTrack = await getActiveAssetRecord(SHARED_THEME_MUSIC_LIBRARY_SLUG, assetId);
        if (!existingTrack) {
            return NextResponse.json({ error: `Track not found: ${assetId}` }, { status: 404 });
        }

        const updatedTrack = {
            ...existingTrack,
            ...(parsedBody.data.tags ? { tags: parseThemeMusicTags(parsedBody.data.tags.join(',')) } : {}),
            ...(parsedBody.data.promptUsed !== undefined ? { promptUsed: parsedBody.data.promptUsed } : {}),
            ...(parsedBody.data.durationSeconds !== undefined ? { durationSeconds: parsedBody.data.durationSeconds } : {}),
        };

        await saveAssetRecord(SHARED_THEME_MUSIC_LIBRARY_SLUG, updatedTrack);

        return NextResponse.json({
            librarySlug: SHARED_THEME_MUSIC_LIBRARY_SLUG,
            track: updatedTrack,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to update theme music track';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
