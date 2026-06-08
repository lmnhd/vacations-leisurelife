import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import { inferTikTokFormat } from '@/lib/campaigns/media/generators/tiktok-formats/index';
import { collectSelectableImageGroups, type HtmlTemplateManifest } from '@/lib/ads/html-templates/core';
import { collapseAssetVariantGroups } from '@/lib/campaigns/media/image-selection';
import type { AssetRecord, CampaignMediaManifest } from '@/lib/campaigns/schema';
import type { TikTokSequenceBeat } from '@/lib/campaigns/media/generators/tiktok-formats/package-template';

export const dynamic = 'force-dynamic';

// ────────────────────────────────────────────────────────────────────────────
// VERTICAL_VIDEO_EDITOR — resolved sequence read
//
// Returns the exact beat sequence the production renderer would build for this
// campaign's TikTok video, with each beat's image URL already resolved
// (operator override → storyboard scene default). This is the single source of
// truth the editor strip renders from, so the editor preview equals the render.
// ────────────────────────────────────────────────────────────────────────────

interface ResolvedBeatImage {
    /** assetId backing this beat, or null when no image is available yet. */
    assetId: string | null;
    /** URL backing this beat, or null when no image is available yet. */
    url: string | null;
    /** Whether the image came from an operator override vs the scene default. */
    fromOverride: boolean;
    /** True when the beat's scene has no active image and no valid override. */
    missing: boolean;
}

/**
 * The synthesized (no-edit) values for the fields the editor exposes, per beat.
 * Drives input placeholders and "reset to synthesized" without the client having
 * to replicate the slot mapping. Extracted from a beat built with NO edits.
 */
interface BeatBaseline {
    headline: string;
    subline: string;
    badge: string;
    cta: string;
    spokenText: string;
    sceneImageAssetId: string | null;
}

interface ResolvedBeat {
    index: number;
    beat: TikTokSequenceBeat;
    image: ResolvedBeatImage;
    baseline: BeatBaseline;
}

/**
 * Reads the editor-facing fields out of a built beat using the same per-preset
 * slot semantics applyBeatEdit writes to, so a baseline value shown as a
 * placeholder lands back in the same slot when typed over.
 *   hook    → tag card headline/subline; primary badge
 *   social  → tag headline (headline), statement headline (subline)
 *   cta     → statement headline/subline; cta pill headline (cta)
 */
function readBeatBaseline(beat: TikTokSequenceBeat, sceneImageAssetId: string | null): BeatBaseline {
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

/**
 * Pool of image assets a beat may be backed by — the FULL selectable image
 * library (hero, scene, flyer, concepts, documentary, ship refs, platform crops),
 * model-version-collapsed and eligibility-filtered. Same pool the Canva ad studio
 * offers, so the operator can pick any campaign image for a beat, not just the
 * storyboard scene image.
 */
function selectableBeatAssets(manifest: CampaignMediaManifest): AssetRecord[] {
    return collectSelectableImageGroups(manifest as HtmlTemplateManifest) as unknown as AssetRecord[];
}

function resolveBeatImage(
    beat: TikTokSequenceBeat,
    manifest: CampaignMediaManifest,
    pool: AssetRecord[],
): ResolvedBeatImage {
    if (beat.imageAssetId) {
        const override = pool.find((record) => record.assetId === beat.imageAssetId);
        if (override) {
            return { assetId: override.assetId, url: override.url, fromOverride: true, missing: false };
        }
        // Override points at a stale/inactive asset — fall through to the scene
        // default rather than render nothing.
    }

    // MULTI_MODEL_IMAGES (Phase F): collapse scenes to the selected model-version
    // so the per-beat scene default resolves the operator's A/B pick.
    const scene = collapseAssetVariantGroups(manifest.images.sceneImages, manifest.modelVersionSelections).find(
        (record) => record.active !== false && record.tags.includes(beat.sceneId),
    );
    if (scene) {
        return { assetId: scene.assetId, url: scene.url, fromOverride: false, missing: false };
    }

    return { assetId: null, url: null, fromOverride: false, missing: true };
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;

    try {
        const [brief, manifest] = await Promise.all([
            getAestheticBrief(slug),
            getMediaManifest(slug),
        ]);

        if (!brief?.productionBible) {
            return NextResponse.json(
                { error: `No Production Bible found for ${slug}`, status: 'no_brief' },
                { status: 404 },
            );
        }
        if (!manifest) {
            return NextResponse.json(
                { error: `No media manifest found for ${slug}`, status: 'no_manifest' },
                { status: 404 },
            );
        }

        const storyboard = brief.productionBible.storyboards.find(
            (entry) => entry.deliverableId.startsWith('tiktok'),
        );
        if (!storyboard) {
            return NextResponse.json(
                { error: `No TikTok storyboard found for ${slug}`, status: 'no_storyboard' },
                { status: 422 },
            );
        }

        const promotionPackage = manifest.tiktokPromotionPackage ?? null;
        if (!promotionPackage) {
            // Production rule: TikTok render requires the synthesized package and
            // has no brief-era fallback. Surface a blocked state, do not invent copy.
            return NextResponse.json(
                {
                    status: 'no_promotion_package',
                    error: 'TikTok promotion package has not been synthesized for this campaign yet.',
                    storyboard: { deliverableId: storyboard.deliverableId, totalDurationSeconds: storyboard.totalDurationSeconds },
                },
                { status: 422 },
            );
        }

        const format = inferTikTokFormat(storyboard.deliverableId);
        const edits = manifest.tiktokVideoEdits ?? null;
        const beats = format.buildSequenceBeats(brief, storyboard, promotionPackage, edits);
        // Baseline = the same beats with NO edits applied, so the editor can show
        // synthesized placeholders and offer reset-to-synthesized per field.
        const baselineBeats = format.buildSequenceBeats(brief, storyboard, promotionPackage, null);

        const pool = selectableBeatAssets(manifest);
        const collapsedScenes = collapseAssetVariantGroups(manifest.images.sceneImages, manifest.modelVersionSelections);
        const resolved: ResolvedBeat[] = beats.map((beat, index) => {
            const sceneDefault = collapsedScenes.find(
                (r) => r.active !== false && r.tags.includes(beat.sceneId),
            );
            return {
                index,
                beat,
                image: resolveBeatImage(beat, manifest, pool),
                baseline: readBeatBaseline(baselineBeats[index] ?? beat, sceneDefault?.assetId ?? null),
            };
        });

        return NextResponse.json({
            status: 'ok',
            slug,
            formatId: format.formatId,
            distributionTag: format.distributionTag,
            storyboard: {
                deliverableId: storyboard.deliverableId,
                title: storyboard.title,
                totalDurationSeconds: storyboard.totalDurationSeconds,
            },
            grain: {
                applyFilmGrain: edits?.applyFilmGrain ?? true,
                grainStrength: edits?.grainStrength ?? 6,
            },
            // Campaign theme-music bed, so the preview MP4 mixes the same music
            // the production render uses. Null ⇒ no track selected yet.
            themeMusicUrl: manifest.audio.themeMusic?.url ?? null,
            beats: resolved,
            // Selectable image pool for the per-beat picker, grouped enough for UI.
            imagePool: pool.map((record) => ({
                assetId: record.assetId,
                url: record.url,
                tags: record.tags,
                assetType: record.assetType,
                dimensions: record.dimensions,
                selectionScore: record.selectionScore,
            })),
            promotionStrategySummary: promotionPackage.strategySummary,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message, status: 'error' }, { status: 500 });
    }
}
