import { randomUUID } from 'crypto';
import { getAssetsByType } from './media-store';
import { getAestheticBrief } from '../campaign-store';
import { AssetRecord, CampaignAestheticBrief } from '../schema';

export const SHARED_THEME_MUSIC_LIBRARY_SLUG = 'shared-theme-music';

function normalizeTagValue(tagValue: string): string {
    return tagValue.trim().toLowerCase();
}

export function parseThemeMusicTags(tagText: string): string[] {
    return Array.from(new Set(
        tagText
            .split(',')
            .map(normalizeTagValue)
            .filter(Boolean)
    ));
}

export async function listThemeMusicLibraryTracks(): Promise<AssetRecord[]> {
    const tracks = await getAssetsByType(SHARED_THEME_MUSIC_LIBRARY_SLUG, 'theme_music');
    return tracks.sort((leftTrack, rightTrack) => {
        return new Date(rightTrack.createdAt).getTime() - new Date(leftTrack.createdAt).getTime();
    });
}

function collectThemeMusicKeywords(brief: CampaignAestheticBrief): string[] {
    const keywordSource = [
        brief.themeName,
        brief.visual.aestheticLabel,
        brief.visual.imageryMood,
        brief.visual.lightingStyle,
        brief.audio.musicMood,
        ...brief.messaging.toneKeywords,
        ...brief.socialConcepts.tiktokOrganic.hashtags,
    ].join(', ');

    return Array.from(new Set(
        keywordSource
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .map((keyword) => keyword.trim())
            .filter((keyword) => keyword.length >= 3)
    ));
}

function scoreThemeMusicTrack(track: AssetRecord, brief: CampaignAestheticBrief): number {
    const keywords = collectThemeMusicKeywords(brief);
    const trackText = `${track.tags.join(' ')} ${track.promptUsed}`.toLowerCase();

    return keywords.reduce((scoreTotal, keyword) => {
        if (track.tags.some((tagValue) => normalizeTagValue(tagValue) === keyword)) {
            return scoreTotal + 5;
        }

        if (trackText.includes(keyword)) {
            return scoreTotal + 2;
        }

        return scoreTotal;
    }, 0);
}

function pickRandomTrack(tracks: AssetRecord[]): AssetRecord | null {
    if (tracks.length === 0) {
        return null;
    }

    const randomIndex = Math.floor(Math.random() * tracks.length);
    return tracks[randomIndex] ?? null;
}

export async function selectDefaultThemeMusicTrack(brief: CampaignAestheticBrief): Promise<AssetRecord | null> {
    const tracks = await listThemeMusicLibraryTracks();
    if (tracks.length === 0) {
        return null;
    }

    const scoredTracks = tracks.map((track) => ({
        track,
        score: scoreThemeMusicTrack(track, brief),
    }));

    scoredTracks.sort((leftTrack, rightTrack) => {
        if (rightTrack.score !== leftTrack.score) {
            return rightTrack.score - leftTrack.score;
        }

        return new Date(rightTrack.track.createdAt).getTime() - new Date(leftTrack.track.createdAt).getTime();
    });

    const highestScore = scoredTracks[0]?.score;
    if (highestScore === undefined) {
        return null;
    }

    const highestScoringTracks = scoredTracks
        .filter((scoredTrack) => scoredTrack.score === highestScore)
        .map((scoredTrack) => scoredTrack.track);

    return pickRandomTrack(highestScoringTracks);
}

export async function selectDefaultThemeMusicTrackForCampaign(slug: string): Promise<AssetRecord | null> {
    const brief = await getAestheticBrief(slug);
    if (!brief) {
        throw new Error(`No aesthetic brief found for ${slug}`);
    }

    if (brief.humanReviewStatus !== 'approved') {
        throw new Error(`Brief not approved (status: ${brief.humanReviewStatus}). Approve it first.`);
    }

    return selectDefaultThemeMusicTrack(brief);
}

export function buildDefaultThemeMusicRecord(slug: string, selectedTrack: AssetRecord, selectionReason: string): AssetRecord {
    return {
        assetId: `audio_theme_music_default_${randomUUID().slice(0, 8)}`,
        assetType: 'theme_music',
        url: selectedTrack.url,
        generator: 'default_library',
        promptUsed: selectionReason,
        fileSizeBytes: selectedTrack.fileSizeBytes,
        mimeType: selectedTrack.mimeType,
        tags: Array.from(new Set(['audio', 'music', 'theme', 'default', ...selectedTrack.tags])),
        createdAt: new Date().toISOString(),
        reviewStatus: 'auto_approved',
        version: 1,
        active: true,
        ...(selectedTrack.durationSeconds !== undefined ? { durationSeconds: selectedTrack.durationSeconds } : {}),
    };
}

export function buildThemeMusicSelectionReason(brief: CampaignAestheticBrief, selectedTrack: AssetRecord): string {
    return `default theme music selected for ${brief.slug} using tags [${selectedTrack.tags.join(', ')}] against ${brief.visual.aestheticLabel} / ${brief.visual.imageryMood} / ${brief.audio.musicMood}`;
}
