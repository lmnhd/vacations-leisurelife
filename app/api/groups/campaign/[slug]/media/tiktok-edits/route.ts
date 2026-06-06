import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { getMediaManifest, updateManifestTikTokVideoEdits } from '@/lib/campaigns/media/media-store';
import { inferTikTokFormat } from '@/lib/campaigns/media/generators/tiktok-formats/index';
import { collectSelectableImageGroups, type HtmlTemplateManifest } from '@/lib/ads/html-templates/core';
import type { AssetRecord, CampaignMediaManifest, TikTokBeatEdit } from '@/lib/campaigns/schema';
import type { TikTokSequenceBeat } from '@/lib/campaigns/media/generators/tiktok-formats/package-template';

export const dynamic = 'force-dynamic';

// ────────────────────────────────────────────────────────────────────────────
// VERTICAL_VIDEO_EDITOR — save per-beat edits
//
// PATCH merges a sparse patch of operator overrides into manifest.tiktokVideoEdits
// and returns the freshly rebuilt resolved sequence so the editor refreshes in
// one round-trip. Validates beat indices against the real beat count and image
// overrides against the active selectable pool — the same guarantee the Canva
// /media/selections route gives for ad image slots.
// ────────────────────────────────────────────────────────────────────────────

const EDITABLE_COPY_FIELDS = ['headline', 'subline', 'badge', 'cta', 'spokenText'] as const;

interface BeatEditPatch {
    imageAssetId?: string | null;
    headline?: string | null;
    subline?: string | null;
    badge?: string | null;
    cta?: string | null;
    spokenText?: string | null;
    hideBrandLockup?: boolean | null;
}

interface TikTokEditsPatchBody {
    beats?: Record<string, BeatEditPatch | null>;
    applyFilmGrain?: boolean | null;
    grainStrength?: number | null;
    replace?: boolean;
}

// Full selectable image library — same pool as the Canva ad studio and the
// tiktok-sequence GET route. An override may point at any of these.
function selectableBeatAssets(manifest: CampaignMediaManifest): AssetRecord[] {
    return collectSelectableImageGroups(manifest as HtmlTemplateManifest) as unknown as AssetRecord[];
}

function resolveBeatImage(beat: { imageAssetId?: string; sceneId: string }, manifest: CampaignMediaManifest, pool: AssetRecord[]) {
    if (beat.imageAssetId) {
        const override = pool.find((r) => r.assetId === beat.imageAssetId);
        if (override) return { assetId: override.assetId, url: override.url, fromOverride: true, missing: false };
    }
    const scene = manifest.images.sceneImages.find((r) => r.active && r.tags.includes(beat.sceneId));
    if (scene) return { assetId: scene.assetId, url: scene.url, fromOverride: false, missing: false };
    return { assetId: null, url: null, fromOverride: false, missing: true };
}

/** Mirror of readBeatBaseline in the tiktok-sequence GET route. */
function readBeatBaseline(beat: TikTokSequenceBeat, sceneImageAssetId: string | null) {
    const tag = beat.overlaySpecs.find((s) => s.variant === 'tag');
    const statement = beat.overlaySpecs.find((s) => s.variant === 'statement');
    const cta = beat.overlaySpecs.find((s) => s.variant === 'cta');
    const primary = beat.overlaySpecs[0];
    let headline = '';
    let subline = '';
    let ctaLabel = '';
    switch (beat.presetId) {
        case 'hook':
            headline = tag?.headline ?? primary?.headline ?? '';
            subline = tag?.subline ?? primary?.subline ?? '';
            break;
        case 'social':
            headline = tag?.headline ?? '';
            subline = statement?.headline ?? '';
            break;
        case 'cta':
            headline = statement?.headline ?? '';
            subline = statement?.subline ?? '';
            ctaLabel = cta?.headline ?? '';
            break;
    }
    return {
        headline,
        subline,
        badge: primary?.badge ?? '',
        cta: ctaLabel,
        spokenText: beat.spokenText,
        sceneImageAssetId,
    };
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;

    try {
        const [brief, manifest] = await Promise.all([
            getAestheticBrief(slug),
            getMediaManifest(slug),
        ]);

        if (!brief?.productionBible) {
            return NextResponse.json({ error: `No Production Bible found for ${slug}` }, { status: 404 });
        }
        if (!manifest) {
            return NextResponse.json({ error: `No media manifest found for ${slug}` }, { status: 404 });
        }

        const storyboard = brief.productionBible.storyboards.find((e) => e.deliverableId.startsWith('tiktok'));
        if (!storyboard) {
            return NextResponse.json({ error: `No TikTok storyboard found for ${slug}` }, { status: 422 });
        }
        const promotionPackage = manifest.tiktokPromotionPackage ?? null;
        if (!promotionPackage) {
            return NextResponse.json(
                { error: 'TikTok promotion package not synthesized; cannot edit yet.' },
                { status: 422 },
            );
        }

        const format = inferTikTokFormat(storyboard.deliverableId);
        // Build with the CURRENT edits to learn the authoritative beat count.
        const currentBeats = format.buildSequenceBeats(brief, storyboard, promotionPackage, manifest.tiktokVideoEdits ?? null);
        const beatCount = currentBeats.length;

        const body = (await request.json().catch(() => ({}))) as TikTokEditsPatchBody;
        const pool = selectableBeatAssets(manifest);
        const selectableIds = new Set(pool.map((r) => r.assetId));

        // Validate + normalize the per-beat patch.
        const normalizedBeats: Record<string, Partial<TikTokBeatEdit> | null> = {};
        for (const [key, patch] of Object.entries(body.beats ?? {})) {
            const idx = Number(key);
            if (!Number.isInteger(idx) || idx < 0 || idx >= beatCount) {
                return NextResponse.json(
                    { error: `Beat index ${key} is out of range (0–${beatCount - 1}).` },
                    { status: 400 },
                );
            }
            if (patch === null) {
                normalizedBeats[String(idx)] = null;
                continue;
            }
            const normalized: Partial<TikTokBeatEdit> = {};
            if (patch.imageAssetId !== undefined) {
                if (patch.imageAssetId === null || patch.imageAssetId === '') {
                    normalized.imageAssetId = undefined;
                } else if (!selectableIds.has(patch.imageAssetId)) {
                    return NextResponse.json(
                        { error: `Asset ${patch.imageAssetId} is not an active selectable image for beat ${idx}.` },
                        { status: 400 },
                    );
                } else {
                    normalized.imageAssetId = patch.imageAssetId;
                }
            }
            for (const field of EDITABLE_COPY_FIELDS) {
                const value = patch[field];
                if (value === undefined) continue;
                normalized[field] = value === null ? undefined : String(value);
            }
            if (patch.hideBrandLockup !== undefined) {
                normalized.hideBrandLockup = patch.hideBrandLockup === null ? undefined : Boolean(patch.hideBrandLockup);
            }
            normalizedBeats[String(idx)] = normalized;
        }

        let grainStrength = body.grainStrength;
        if (typeof grainStrength === 'number') {
            grainStrength = Math.max(0, Math.min(20, grainStrength));
        }

        const existingBeatKeys = Object.keys(manifest.tiktokVideoEdits?.beats ?? {});
        const replacementClears = body.replace
            ? Object.fromEntries(
                existingBeatKeys
                    .filter((key) => normalizedBeats[key] === undefined)
                    .map((key) => [key, null] as const),
            )
            : {};

        const updatedManifest = await updateManifestTikTokVideoEdits(slug, {
            beats: { ...replacementClears, ...normalizedBeats },
            applyFilmGrain: body.applyFilmGrain,
            grainStrength,
        });

        // Rebuild the resolved sequence with the saved edits for a one-round-trip refresh.
        const edits = updatedManifest.tiktokVideoEdits ?? null;
        const beats = format.buildSequenceBeats(brief, storyboard, promotionPackage, edits);
        const baselineBeats = format.buildSequenceBeats(brief, storyboard, promotionPackage, null);
        const resolved = beats.map((beat, index) => {
            const sceneDefault = updatedManifest.images.sceneImages.find(
                (r) => r.active && r.tags.includes(beat.sceneId),
            );
            return {
                index,
                beat,
                image: resolveBeatImage(beat, updatedManifest, pool),
                baseline: readBeatBaseline(baselineBeats[index] ?? beat, sceneDefault?.assetId ?? null),
            };
        });

        return NextResponse.json({
            status: 'ok',
            tiktokVideoEdits: edits,
            grain: {
                applyFilmGrain: edits?.applyFilmGrain ?? true,
                grainStrength: edits?.grainStrength ?? 6,
            },
            beats: resolved,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
