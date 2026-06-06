import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { assertAestheticBriefReadyForMedia } from '@/lib/campaigns/aesthetic-red-team';
import { getMediaManifest, saveAssetRecord, upsertManifestAssetSection } from '@/lib/campaigns/media/media-store';
import {
    buildDefaultThemeMusicRecord,
    buildThemeMusicSelectionReason,
    listThemeMusicLibraryTracks,
} from '@/lib/campaigns/media/theme-music-library';
import type { AssetRecord } from '@/lib/campaigns/schema';

interface PatchThemeMusicBody {
    trackAssetId?: string;
}

function findSourceTrackId(record: AssetRecord | null | undefined, libraryTracks: AssetRecord[]): string | null {
    if (!record) return null;

    const sourceTag = record.tags.find((tag) => tag.startsWith('source_track:'));
    if (sourceTag) {
        return sourceTag.slice('source_track:'.length) || null;
    }

    return libraryTracks.find((track) => track.url === record.url)?.assetId ?? null;
}

function toLibraryTrackPayload(track: AssetRecord) {
    return {
        assetId: track.assetId,
        url: track.url,
        generator: track.generator,
        promptUsed: track.promptUsed,
        tags: track.tags,
        durationSeconds: track.durationSeconds,
        fileSizeBytes: track.fileSizeBytes,
        mimeType: track.mimeType,
        createdAt: track.createdAt,
    };
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const [manifest, libraryTracks] = await Promise.all([
        getMediaManifest(slug),
        listThemeMusicLibraryTracks(),
    ]);
    const currentTrack = manifest?.audio.themeMusic ?? null;

    return NextResponse.json({
        slug,
        currentTrack,
        selectedLibraryTrackAssetId: findSourceTrackId(currentTrack, libraryTracks),
        libraryTracks: libraryTracks.map(toLibraryTrackPayload),
    });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const body = await request.json() as PatchThemeMusicBody;
    const trackAssetId = body.trackAssetId?.trim();
    if (!trackAssetId) {
        return NextResponse.json({ error: 'trackAssetId is required' }, { status: 400 });
    }

    const brief = await getAestheticBrief(slug);
    if (!brief) {
        return NextResponse.json({ error: `No aesthetic brief found for ${slug}` }, { status: 404 });
    }

    try {
        assertAestheticBriefReadyForMedia(brief, slug);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Brief failed release gate.';
        return NextResponse.json({ error: message }, { status: 400 });
    }

    const libraryTracks = await listThemeMusicLibraryTracks();
    const selectedTrack = libraryTracks.find((track) => track.assetId === trackAssetId);
    if (!selectedTrack) {
        return NextResponse.json({ error: `Theme music library track not found: ${trackAssetId}` }, { status: 404 });
    }

    const selectionReason = `${buildThemeMusicSelectionReason(brief, selectedTrack)}; manually selected by operator`;
    const record: AssetRecord = {
        ...buildDefaultThemeMusicRecord(slug, selectedTrack, selectionReason),
        curation: {
            approvalState: 'human_approved',
            globalPriority: 100,
            contextPriorities: {},
            approvedContexts: [],
            blockedContexts: [],
            suitabilityTags: ['operator_selected_music'],
            antiTags: [],
            downstreamLocked: true,
            generationLocked: true,
            curatorNotes: `Manual theme music library selection: ${selectedTrack.assetId}`,
            updatedAt: new Date().toISOString(),
        },
    };

    await saveAssetRecord(slug, record);
    const manifest = await upsertManifestAssetSection(slug, 'themeMusic', record);

    return NextResponse.json({
        slug,
        currentTrack: record,
        selectedLibraryTrackAssetId: selectedTrack.assetId,
        manifest,
        libraryTracks: libraryTracks.map(toLibraryTrackPayload),
    });
}
