"use client";

import { useEffect, useMemo, useState } from 'react';
import type { AssetRecord, CampaignAestheticBrief, CampaignMediaManifest, ProductionBuildLintIssue } from '@/lib/campaigns/schema';
import { normalizeAssetCuration } from '@/lib/campaigns/media/image-selection';
import { TAB_HISTORY_ASSET_TYPES } from '@/lib/campaigns/media/asset-manifest-section';
import { collectPhotoRealSourceAssets, lintVisualCompass } from '@/lib/campaigns/media/visual-compass-lint';
import { ReviewAssetCard, type VisualRepairInsight } from './review-asset-card';
import { Search, Image as ImageIcon, Layers, Film, Music, Shirt, Crop, Trash2, Loader2, CheckCheck, Newspaper, Clock, RotateCcw, FileText, Palette, Compass, Users, Ship, Sun, ShieldCheck, AlertTriangle, Sparkles, MoreHorizontal } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ────────────────────────────────────────────────────────────────────────────

const TABS = [
    { id: 'references', label: 'References', icon: Search },
    { id: 'designed_ads', label: 'Canva Ads', icon: Newspaper },
    { id: 'documentary_details', label: 'Documentary Details', icon: FileText },
    { id: 'alternate_art', label: 'Alternate Art', icon: Palette },
    { id: 'heroes',     label: 'Heroes & Concepts', icon: ImageIcon },
    { id: 'flyers',     label: 'Flyers', icon: Sparkles },
    { id: 'crops',      label: 'Crops', icon: Crop },
    { id: 'scenes',     label: 'Scenes', icon: Layers },
    { id: 'video',      label: 'Video', icon: Film },
    { id: 'audio',      label: 'Audio', icon: Music },
    { id: 'merch',      label: 'Merch', icon: Shirt },
] as const;

type DeletableAssetType = AssetRecord['assetType'];

const VIDEO_ASSET_TYPES = new Set<DeletableAssetType>([
    'tiktok_seed_video', 'hero_explainer_video', 'threshold_video',
    'countdown_video', 'broll_clip',
]);

const IMAGE_ARTIFACT_TYPES = new Set<DeletableAssetType>([
    'hero_image', 'flyer_image', 'aesthetic_concept', 'ship_reference_image', 'platform_crop',
    'documentary_detail_image', 'alternate_art', 'designed_ad_artifact',
]);

function getDeleteEndpoint(slug: string, assetType: DeletableAssetType): string | null {
    if (assetType === 'scene_image') return `/api/groups/campaign/${slug}/media/manifest/scene-image-artifact`;
    if (VIDEO_ASSET_TYPES.has(assetType)) return `/api/groups/campaign/${slug}/media/manifest/video-artifact`;
    if (IMAGE_ARTIFACT_TYPES.has(assetType)) return `/api/groups/campaign/${slug}/media/manifest/image-artifact`;
    return null;
}

const BATCH_REGENERABLE_IMAGE_TYPES = new Set<DeletableAssetType>([
    'hero_image',
    'flyer_image',
    'aesthetic_concept',
    'scene_image',
    'documentary_detail_image',
]);

function canBatchRegenerateImage(asset: AssetRecord): boolean {
    if (!BATCH_REGENERABLE_IMAGE_TYPES.has(asset.assetType)) return false;
    return normalizeAssetCuration(asset).generationLocked !== true;
}

function buildBatchRevisionNote(
    entry: { title: string; asset: AssetRecord },
    visualInsights: readonly VisualRepairInsight[],
    sectionLabel: string,
): string {
    const notes = visualInsights
        .map((insight) => insight.revisionNote.trim())
        .filter(Boolean);

    if (notes.length > 0) {
        return Array.from(new Set(notes)).join(' ');
    }

    return [
        `Regenerate this ${sectionLabel} image as a stronger, cleaner version of the same asset.`,
        'Keep the original campaign, ship, subject, and role intact.',
        'Improve visual variety, physical plausibility, lighting control, casting believability, and theme readability.',
        `Asset title: ${entry.title}.`,
    ].join(' ');
}

// ────────────────────────────────────────────────────────────────────────────
// Extract tab entries from manifest
// ────────────────────────────────────────────────────────────────────────────

interface TabEntry { entryKey: string; title: string; asset: AssetRecord; variants?: AssetRecord[] }

function getTabEntries(
    tabId: string,
    manifest: CampaignMediaManifest,
): TabEntry[] {
    const entries: TabEntry[] = [];

    const formatDesignedAdTitle = (asset: AssetRecord, index: number): string => {
        const tags = asset.tags.map((tag) => tag.toLowerCase());
        const has = (tag: string) => tags.includes(tag.toLowerCase());
        if (has('editorial_cover')) return 'IG Feed · Editorial Cover';
        if (has('postcard_hero')) return 'IG Feed · Postcard Hero';
        if (has('zine_cover')) return 'IG Feed · Zine Cover';
        if (has('quote')) return 'IG Square · Quote Card';
        if (has('air_mail')) return 'IG Square · Air-Mail';
        if (has('scribble')) return 'IG Square · Scribble Social';
        if (has('sticker_sheet')) return 'IG Square · Sticker Sheet';
        if (has('itinerary')) return 'Carousel · Itinerary Card';
        if (has('boarding_pass')) return 'Carousel · Boarding Pass';
        if (has('contributor')) return 'IG Square · Contributor Card';
        if (has('type_hook')) return 'Story/Reels · Type Hook';
        if (has('image_detail')) return 'FB/Google · Image Detail';
        if (has('baggage_tag')) return 'Social · Baggage Tag';
        const formatTag = tags.find((tag) => tag.startsWith('format:'))?.replace('format:', '');
        if (formatTag) return `Canva/Templated - ${formatTag.replace(/_/g, ' ')}`;
        return `Canva Ad ${index + 1}`;
    };

    const formatSourceDetailTitle = (asset: AssetRecord): string => {
        const detailKind = asset.tags.find((tag) =>
            ['trust_photo', 'artifact_still_life', 'texture_plate', 'human_glimpse', 'motion_plate'].includes(tag),
        );
        if (!detailKind) return 'Source Detail';
        return `Source · ${detailKind.replace(/_/g, ' ')}`;
    };

    switch (tabId) {
        case 'references':
            manifest.images.shipReferences.forEach((asset, i) => {
                entries.push({ entryKey: `ref::${i}::${asset.assetId}`, title: `Reference ${i + 1}`, asset });
            });
            break;

        case 'heroes':
            manifest.images.hero.forEach((asset, i) => {
                entries.push({ entryKey: `hero::${i}::${asset.assetId}`, title: `Hero ${i + 1}`, asset });
            });
            manifest.images.aestheticConcepts.forEach((asset, i) => {
                entries.push({ entryKey: `concept::${i}::${asset.assetId}`, title: `Concept ${i + 1}`, asset });
            });
            break;

        case 'flyers': {
            // MULTI_MODEL_IMAGES: group per-model renditions of one logical flyer
            // into a single card. The displayed asset is the selected model-version
            // (modelVersionSelections[groupId]) or the first-stored (primary).
            const flyerGroups = new Map<string, AssetRecord[]>();
            const flyerOrder: string[] = [];
            (manifest.images.flyerImages ?? []).forEach((asset) => {
                const gid = asset.variantGroupId ?? asset.assetId;
                if (!flyerGroups.has(gid)) { flyerGroups.set(gid, []); flyerOrder.push(gid); }
                flyerGroups.get(gid)!.push(asset);
            });
            flyerOrder.forEach((gid, i) => {
                const variants = flyerGroups.get(gid)!;
                const wanted = manifest.modelVersionSelections?.[gid];
                const selected = (wanted && variants.find((v) => v.generator === wanted)) || variants[0];
                entries.push({
                    entryKey: `flyer::${gid}`,
                    title: `Flyer ${i + 1}`,
                    asset: selected,
                    variants: variants.length > 1 ? variants : undefined,
                });
            });
            break;
        }

        case 'designed_ads':
            (manifest.images.designedAdArtifacts ?? []).forEach((asset, i) => {
                entries.push({ entryKey: `designed::${i}::${asset.assetId}`, title: formatDesignedAdTitle(asset, i), asset });
            });
            break;

        case 'documentary_details':
            (manifest.images.documentaryDetails ?? []).forEach((asset, i) => {
                entries.push({ entryKey: `detail::${i}::${asset.assetId}`, title: formatSourceDetailTitle(asset), asset });
            });
            break;

        case 'alternate_art':
            (manifest.images.alternateArt ?? []).forEach((asset, i) => {
                entries.push({ entryKey: `alternate::${i}::${asset.assetId}`, title: `Alternate Art ${i + 1}`, asset });
            });
            break;

        case 'crops':
            Object.entries(manifest.images.platformCrops).forEach(([fmt, assets]) => {
                assets.forEach((asset, i) => {
                    entries.push({ entryKey: `crop::${fmt}::${i}::${asset.assetId}`, title: `${fmt} ${i + 1}`, asset });
                });
            });
            break;

        case 'scenes':
            (manifest.images.sceneImages ?? []).forEach((asset, i) => {
                const sceneId = asset.tags.find(t => t !== 'scene') ?? `scene_${i + 1}`;
                entries.push({ entryKey: `scene::${i}::${asset.assetId}`, title: sceneId, asset });
            });
            break;

        case 'video':
            if (manifest.videos.tiktokSeed) {
                entries.push({ entryKey: `vid::tiktok::${manifest.videos.tiktokSeed.assetId}`, title: 'TikTok Seed', asset: manifest.videos.tiktokSeed });
            }
            if (manifest.videos.heroExplainer) {
                entries.push({ entryKey: `vid::explainer::${manifest.videos.heroExplainer.assetId}`, title: 'Hero Explainer', asset: manifest.videos.heroExplainer });
            }
            if (manifest.videos.thresholdAnnouncement) {
                entries.push({ entryKey: `vid::threshold::${manifest.videos.thresholdAnnouncement.assetId}`, title: 'Threshold', asset: manifest.videos.thresholdAnnouncement });
            }
            manifest.videos.countdown.forEach((asset, i) => {
                entries.push({ entryKey: `vid::countdown::${i}::${asset.assetId}`, title: `Countdown ${i + 1}`, asset });
            });
            manifest.videos.broll.forEach((asset, i) => {
                entries.push({ entryKey: `vid::broll::${i}::${asset.assetId}`, title: `B-roll ${i + 1}`, asset });
            });
            break;

        case 'audio':
            if (manifest.audio.ambientNarration) {
                entries.push({ entryKey: `aud::narration::${manifest.audio.ambientNarration.assetId}`, title: 'Ambient Narration', asset: manifest.audio.ambientNarration });
            }
            if (manifest.audio.hypeClip) {
                entries.push({ entryKey: `aud::hype::${manifest.audio.hypeClip.assetId}`, title: 'Hype Clip', asset: manifest.audio.hypeClip });
            }
            if (manifest.audio.themeMusic) {
                entries.push({ entryKey: `aud::theme::${manifest.audio.themeMusic.assetId}`, title: 'Theme Music', asset: manifest.audio.themeMusic });
            }
            break;

        case 'merch':
            manifest.merch.designs.forEach((asset, i) => {
                entries.push({ entryKey: `merch::design::${i}::${asset.assetId}`, title: `Design ${i + 1}`, asset });
            });
            manifest.merch.mockups.forEach((asset, i) => {
                entries.push({ entryKey: `merch::mockup::${i}::${asset.assetId}`, title: `Mockup ${i + 1}`, asset });
            });
            break;
    }

    return entries;
}

function sortEntriesForDisplay(
    tabId: string,
    entries: TabEntry[],
): TabEntry[] {
    return entries;
}

function countDesignedAdArtifacts(entries: Array<{ entryKey: string; title: string; asset: AssetRecord }>): number {
    return entries.filter((entry) => entry.asset.assetType === 'designed_ad_artifact').length;
}

function countDesignedAdSources(entries: Array<{ entryKey: string; title: string; asset: AssetRecord }>): number {
    return entries.filter((entry) => entry.asset.assetType === 'documentary_detail_image').length;
}

function formatPackageTimestamp(value: string | undefined): string {
    if (!value) return 'Unknown time';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

// ────────────────────────────────────────────────────────────────────────────
// Status summary helper
// ────────────────────────────────────────────────────────────────────────────

function countStatuses(entries: Array<{ asset: AssetRecord }>) {
    let approved = 0;
    let flagged = 0;
    let auto = 0;
    for (const e of entries) {
        const approvalState = normalizeAssetCuration(e.asset).approvalState;
        if (approvalState === 'human_approved') approved++;
        else if (approvalState === 'auto_approved') auto++;
        else flagged++;
    }
    return { approved, flagged, auto };
}

function isHumanApproved(asset: AssetRecord): boolean {
    return normalizeAssetCuration(asset).approvalState === 'human_approved';
}

const ROLE_LANES = [
    { id: 'source.flyer', label: 'Flyers', icon: Sparkles },
    { id: 'source.hero_clean', label: 'Hero Clean', icon: ImageIcon },
    { id: 'source.group_action', label: 'Group Action', icon: Users },
    { id: 'source.theme_detail', label: 'Theme Detail', icon: FileText },
    { id: 'source.ship_context', label: 'Ship Context', icon: Ship },
    { id: 'source.editorial_alt', label: 'Editorial Alt', icon: Layers },
    { id: 'alternate_art', label: 'Alternate Art', icon: Palette },
    { id: 'reference.audit_only', label: 'Audit References', icon: Search },
    { id: 'final.ad_artifact', label: 'Final Ads', icon: Newspaper },
    { id: 'final.channel_deliverable', label: 'Channel Deliverables', icon: Crop },
] as const;

function collectManifestAssets(manifest: CampaignMediaManifest): AssetRecord[] {
    return [
        ...(manifest.images.shipReferences ?? []),
        ...(manifest.images.hero ?? []),
        ...(manifest.images.flyerImages ?? []),
        ...(manifest.images.sceneImages ?? []),
        ...(manifest.images.aestheticConcepts ?? []),
        ...(manifest.images.documentaryDetails ?? []),
        ...(manifest.images.alternateArt ?? []),
        ...(manifest.images.designedAdArtifacts ?? []),
        ...Object.values(manifest.images.platformCrops ?? {}).flat(),
        ...(manifest.videos.tiktokSeed ? [manifest.videos.tiktokSeed] : []),
        ...(manifest.videos.heroExplainer ? [manifest.videos.heroExplainer] : []),
        ...(manifest.videos.thresholdAnnouncement ? [manifest.videos.thresholdAnnouncement] : []),
        ...(manifest.videos.countdown ?? []),
        ...(manifest.videos.broll ?? []),
        ...(manifest.audio.ambientNarration ? [manifest.audio.ambientNarration] : []),
        ...(manifest.audio.hypeClip ? [manifest.audio.hypeClip] : []),
        ...(manifest.audio.themeMusic ? [manifest.audio.themeMusic] : []),
        ...(manifest.merch.designs ?? []),
        ...(manifest.merch.mockups ?? []),
    ].filter((asset) => asset.active !== false);
}

function fallbackRoleForAsset(asset: AssetRecord): string {
    if (asset.eligibilityRole) return asset.eligibilityRole;
    if (asset.assetType === 'ship_reference_image') return 'reference.audit_only';
    if (asset.assetType === 'designed_ad_artifact') return 'final.ad_artifact';
    if (asset.assetType === 'platform_crop' || asset.assetType.includes('video') || asset.assetType === 'broll_clip' || asset.mimeType.startsWith('audio/')) {
        return 'final.channel_deliverable';
    }
    if (asset.assetType === 'alternate_art') return 'alternate_art';
    if (asset.assetType === 'flyer_image') return 'source.flyer';
    if (asset.assetType === 'hero_image') return 'source.hero_clean';
    if (asset.assetType === 'documentary_detail_image') return 'source.theme_detail';
    if (asset.assetType === 'aesthetic_concept') return 'source.editorial_alt';
    if (asset.assetType === 'scene_image') return 'source.group_action';
    return 'source.theme_detail';
}

function buildIssueCodeMap(manifest: CampaignMediaManifest): Map<string, string[]> {
    const lint = lintVisualCompass(manifest);
    const map = new Map<string, string[]>();
    for (const issue of [...lint.blockingIssues, ...lint.warnings]) {
        for (const assetId of issue.affectedStillIds ?? []) {
            const codes = map.get(assetId) ?? [];
            codes.push(issue.code);
            map.set(assetId, codes);
        }
    }
    return map;
}

function buildRepairInsight(issue: ProductionBuildLintIssue): VisualRepairInsight {
    const base = {
        code: issue.code,
        severity: issue.severity,
        details: issue.details,
    };

    switch (issue.code) {
        case 'bright_daylight_overuse':
            return {
                ...base,
                summary: 'Too much bright daylight',
                recommendedAction: 'Regenerate this asset toward dusk, blue hour, shaded interior window light, or night ambience so the source pool gains tonal range.',
                revisionNote: 'Avoid bright daylight and high-sun exposure. Regenerate as a lower-key cruise image using dusk, blue hour, night ambience, or shaded interior window light, with controlled highlights and richer shadow shape.',
            };
        case 'rail_table_window_overuse':
            return {
                ...base,
                summary: 'Repeated rail/table/window setup',
                recommendedAction: 'Move the composition into a different ship location family: atrium, promenade, theater, lounge, activity space, port threshold, or textured ship detail.',
                revisionNote: 'Do not use rail, balcony, window-seat, or table-side composition. Move the scene to a distinct cruise location family with visible ship architecture and a different camera angle.',
            };
        case 'group_action_floor_missing':
            return {
                ...base,
                summary: 'Needs stronger group action',
                recommendedAction: 'Regenerate with 4-6 visible people doing a campaign-specific shared action, not just sitting, posing, or looking out at the water.',
                revisionNote: 'Show 4-6 visible guests in a theme-specific shared action with clear body language and interaction. Avoid passive posing, solo/couple framing, and generic horizon gazing.',
            };
        case 'theme_legibility_weak':
            return {
                ...base,
                summary: 'Theme is not readable enough',
                recommendedAction: 'Add visible niche behavior, props, wardrobe, or setting cues that make the campaign understandable without reading the caption.',
                revisionNote: 'Make the campaign theme visually legible without text. Add concrete niche behavior, props, wardrobe cues, or setting details while keeping the image vacation-first and believable aboard the ship.',
            };
        case 'demographic_monotony':
            return {
                ...base,
                summary: 'Casting is too repetitive',
                recommendedAction: 'Regenerate with a visibly different age band, ethnicity, body type, or social grouping from the other flagged assets.',
                revisionNote: 'Change the casting profile: use visibly varied ages, ethnicities, body types, and social groupings. Avoid repeating the same middle-aged white couple or small friend-group archetype.',
            };
        case 'dusk_blue_hour_absent':
            return {
                ...base,
                summary: 'No moody-light coverage',
                recommendedAction: 'Use this asset as a candidate for a non-midday replacement: sunrise, golden hour, dusk, blue hour, or night.',
                revisionNote: 'Regenerate specifically as a non-midday image: sunrise, golden hour, dusk, blue hour, or night, with the ship environment still clearly visible.',
            };
        case 'reference_feature_survival_missing':
            return {
                ...base,
                summary: 'Ship-reference features did not survive',
                recommendedAction: 'Regenerate with explicit vessel architecture preserved: glazing, atrium forms, rail shape, pool deck layout, promenade, or other reference-derived features.',
                revisionNote: 'Preserve distinctive ship architecture from the reference image. Make the vessel-specific glazing, rail shapes, deck layout, public-space structure, or atrium features visible in the frame.',
            };
        case 'support_surface_impossible':
            return {
                ...base,
                summary: 'Impossible body support',
                recommendedAction: 'Regenerate so every seated, standing, kneeling, or reclining person is visibly supported by deck, chair, lounger, bench, step, pool coping, or pool ledge.',
                revisionNote: 'Fix physical support: no one may sit, stand, kneel, recline, or lie on open water. Place every person on a visible deck, chair, lounger, bench, step, pool coping, or pool ledge, with the pool edge and support surface clearly readable. Water may show swimmers only if they are clearly swimming.',
            };
        case 'source_quality_missing':
            return {
                ...base,
                summary: 'Missing visual metadata',
                recommendedAction: 'Regenerate or run visual verification so this asset can be scored before downstream selection.',
                revisionNote: 'Regenerate with explicit time of day, composition family, visible people count, demographic variety, and theme cues so source-quality scoring can classify the image.',
            };
        case 'alternate_art_leak':
            return {
                ...base,
                summary: 'Stylized art in photo source lane',
                recommendedAction: 'Move this out of photo-real source usage or regenerate as believable documentary photography.',
                revisionNote: 'Regenerate as believable documentary cruise photography, not watercolor, illustration, poster art, sketch, or stylized alternate art.',
            };
        default:
            return {
                ...base,
                summary: issue.message,
                recommendedAction: issue.details || 'Review the asset before approving it for downstream use.',
                revisionNote: `${issue.message} ${issue.details ?? ''}`.trim(),
            };
    }
}

function buildRepairInsightMap(manifest: CampaignMediaManifest): Map<string, VisualRepairInsight[]> {
    const lint = lintVisualCompass(manifest);
    const map = new Map<string, VisualRepairInsight[]>();
    for (const issue of [...lint.blockingIssues, ...lint.warnings]) {
        const insight = buildRepairInsight(issue);
        for (const assetId of issue.affectedStillIds ?? []) {
            const insights = map.get(assetId) ?? [];
            insights.push(insight);
            map.set(assetId, insights);
        }
    }
    return map;
}

function summarizeVisualCompass(manifest: CampaignMediaManifest) {
    const sourceAssets = collectPhotoRealSourceAssets(manifest);
    const qualityAssets = sourceAssets.filter((asset) => asset.sourceQuality);
    const groupActionCount = qualityAssets.filter((asset) =>
        (asset.sourceQuality?.groupActionScore ?? 0) >= 0.6 || fallbackRoleForAsset(asset) === 'source.group_action'
    ).length;
    const moodyCount = qualityAssets.filter((asset) =>
        ['sunrise', 'golden_hour', 'dusk_blue_hour', 'night'].includes(asset.sourceQuality?.timeOfDay ?? '')
    ).length;
    const daylightCount = qualityAssets.filter((asset) =>
        ['morning', 'midday'].includes(asset.sourceQuality?.timeOfDay ?? '')
    ).length;
    const visionCount = qualityAssets.filter((asset) => asset.sourceQuality?.scoringSource === 'vision_verified').length;
    const shipContextAssets = sourceAssets.filter((asset) => fallbackRoleForAsset(asset) === 'source.ship_context');
    const shipSurvivalCount = shipContextAssets.filter((asset) => (asset.preservedFeaturesReported ?? []).length > 0).length;
    const demographicKeys = new Set<string>();
    for (const asset of qualityAssets) {
        const age = asset.sourceQuality?.demographicCoverage.ageBands?.[0];
        const ethnicity = asset.sourceQuality?.demographicCoverage.ethnicityBands?.[0];
        if (age && ethnicity) demographicKeys.add(`${age}|${ethnicity}`);
    }
    const lint = lintVisualCompass(manifest);
    return {
        sourceCount: sourceAssets.length,
        qualityCount: qualityAssets.length,
        visionCount,
        groupActionCount,
        moodyCount,
        daylightCount,
        demographicCombos: demographicKeys.size,
        shipSurvivalCount,
        shipContextCount: shipContextAssets.length,
        issueCount: lint.blockingIssues.length + lint.warnings.length,
        blockingCount: lint.blockingIssues.length,
        lint,
    };
}

function AssetGovernanceStrip({ asset, issueCodes }: { asset: AssetRecord; issueCodes: string[] }) {
    const curation = normalizeAssetCuration(asset);
    const role = fallbackRoleForAsset(asset);
    const source = asset.sourceQuality?.scoringSource ?? (asset.sourceQuality ? 'deterministic' : 'unscored');
    const tagPreview = [...curation.suitabilityTags, ...asset.tags].slice(0, 3);
    const blocks = curation.blockedContexts.length;

    return (
        <div className="mb-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-[10px] text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-cyan-100">
                    {role.replace(/[._]/g, ' ')}
                </span>
                <span>priority {curation.globalPriority}</span>
                <span>{source.replace(/_/g, ' ')}</span>
                {curation.approvedContexts.length > 0 && (
                    <span className="text-emerald-200">{curation.approvedContexts.length} approved contexts</span>
                )}
                {blocks > 0 && (
                    <span className="text-amber-200">{blocks} blocked contexts</span>
                )}
                {curation.antiTags.length > 0 && (
                    <span className="text-red-200">{curation.antiTags.length} anti-tags</span>
                )}
            </div>
            {(tagPreview.length > 0 || issueCodes.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {tagPreview.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-slate-300">
                            {tag}
                        </span>
                    ))}
                    {issueCodes.map((code) => (
                        <span key={code} className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-amber-100">
                            {code}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// MediaReviewPanel — Tabbed asset review
// ────────────────────────────────────────────────────────────────────────────

export function MediaReviewPanel(
    { slug, manifest, brief, onManifestRefresh }: {
        slug: string;
        manifest: CampaignMediaManifest;
        brief?: CampaignAestheticBrief | null;
        onManifestRefresh: (targetSlug: string) => Promise<void>;
    }
) {
    const [activeTab, setActiveTab] = useState('references');
    const [bulkRemoving, setBulkRemoving] = useState(false);
    const [bulkApproving, setBulkApproving] = useState(false);
    const [bulkRegenerating, setBulkRegenerating] = useState(false);
    const [bulkError, setBulkError] = useState('');

    // ── Version History state ─────────────────────────────────────────────
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyItems, setHistoryItems] = useState<AssetRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [restoringId, setRestoringId] = useState<string | null>(null);

    const tabEntryMap = useMemo(() => {
        const map: Record<string, TabEntry[]> = {};
        for (const tab of TABS) {
            map[tab.id] = getTabEntries(tab.id, manifest);
        }
        return map;
    }, [manifest]);

    const totalEntries = useMemo(() => Object.values(tabEntryMap).reduce((sum, arr) => sum + arr.length, 0), [tabEntryMap]);
    const totalStatus = useMemo(() => {
        const all = Object.values(tabEntryMap).flat();
        return countStatuses(all);
    }, [tabEntryMap]);
    const visualCompass = useMemo(() => summarizeVisualCompass(manifest), [manifest]);
    const issueCodeMap = useMemo(() => buildIssueCodeMap(manifest), [manifest]);
    const repairInsightMap = useMemo(() => buildRepairInsightMap(manifest), [manifest]);
    const roleLaneCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const asset of collectManifestAssets(manifest)) {
            const role = fallbackRoleForAsset(asset);
            counts[role] = (counts[role] ?? 0) + 1;
        }
        return counts;
    }, [manifest]);

    const activeEntries = useMemo(
        () => sortEntriesForDisplay(activeTab, tabEntryMap[activeTab] ?? []),
        [activeTab, tabEntryMap],
    );
    const designedAdArtifactCount = useMemo(
        () => countDesignedAdArtifacts(activeEntries),
        [activeEntries],
    );
    const designedAdSourceCount = useMemo(
        () => countDesignedAdSources(activeEntries),
        [activeEntries],
    );
    const activeTabDef = TABS.find(t => t.id === activeTab) ?? TABS[0];
    const ActiveIcon = activeTabDef.icon;
    const showTikTokPromotionPackage = activeTab === 'video' && Boolean(manifest.tiktokPromotionPackage);
    const activeTabHasContent = activeEntries.length > 0 || showTikTokPromotionPackage;
    const removableEntries = activeEntries.filter((entry) => getDeleteEndpoint(slug, entry.asset.assetType) !== null);
    const removableUnapprovedEntries = removableEntries.filter((entry) => !isHumanApproved(entry.asset));
    const batchRegenerableEntries = activeEntries.filter((entry) => canBatchRegenerateImage(entry.asset));
    
    const pendingApprovalEntries = activeEntries.filter((entry) => {
        const s = normalizeAssetCuration(entry.asset).approvalState;
        return s !== 'human_approved' && s !== 'rejected' && s !== 'revision_required';
    });

    const handleRefresh = async () => {
        await onManifestRefresh(slug);
    };

    // Reset history whenever the active tab changes
    useEffect(() => {
        setHistoryOpen(false);
        setHistoryItems([]);
        setHistoryError('');
    }, [activeTab]);

    const tabHistoryAssetTypes = TAB_HISTORY_ASSET_TYPES[activeTab] ?? [];
    const tabSupportsHistory = tabHistoryAssetTypes.length > 0;

    const handleToggleHistory = async () => {
        if (historyOpen) {
            setHistoryOpen(false);
            return;
        }
        if (tabHistoryAssetTypes.length === 0) return;
        setHistoryOpen(true);
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const fetches = tabHistoryAssetTypes.map((assetType) =>
                fetch(`/api/groups/campaign/${slug}/media/history?assetType=${encodeURIComponent(assetType)}`, { cache: 'no-store' })
                    .then((r) => r.json() as Promise<{ assets?: AssetRecord[]; error?: string }>)
            );
            const results = await Promise.all(fetches);
            const combined: AssetRecord[] = results.flatMap((r) => r.assets ?? []);
            combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            setHistoryItems(combined.slice(0, 20));
        } catch {
            setHistoryError('Failed to load version history.');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleRestore = async (assetId: string) => {
        if (restoringId) return;
        setRestoringId(assetId);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/history/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetId }),
            });
            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            // Remove restored item from history list and refresh manifest
            setHistoryItems((prev) => prev.filter((a) => a.assetId !== assetId));
            await handleRefresh();
        } catch (err) {
            setHistoryError(err instanceof Error ? err.message : 'Restore failed.');
        } finally {
            setRestoringId(null);
        }
    };

    const handleBulkApprove = async () => {
        if (pendingApprovalEntries.length === 0 || bulkApproving) return;

        const confirmed = window.confirm(`Approve ${pendingApprovalEntries.length} pending assets in "${activeTabDef.label}"?`);
        if (!confirmed) return;

        setBulkApproving(true);
        setBulkError('');

        try {
            const settled: PromiseSettledResult<void>[] = [];
            for (const entry of pendingApprovalEntries) {
                try {
                    const response = await fetch(`/api/groups/campaign/${slug}/media/curation`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            assetId: entry.asset.assetId,
                            approvalState: 'human_approved',
                        }),
                    });
                    if (!response.ok) throw new Error('API Error');
                    settled.push({ status: 'fulfilled', value: undefined });
                } catch (err) {
                    settled.push({ status: 'rejected', reason: err });
                }
            }

            const failures = settled.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
            if (failures.length > 0) {
                setBulkError(`Approved ${settled.length - failures.length}/${settled.length}. Some failed.`);
            }

            await handleRefresh();
        } catch (error: unknown) {
            setBulkError(error instanceof Error ? error.message : 'Bulk approve failed');
        } finally {
            setBulkApproving(false);
        }
    };

    const handleBatchRegenerateSection = async () => {
        if (batchRegenerableEntries.length === 0 || bulkRegenerating) return;

        const confirmed = window.confirm(
            `Regenerate ${batchRegenerableEntries.length} image asset(s) in "${activeTabDef.label}"?\n\nEach asset will use its visual repair note when available. The server will rewrite the original prompt and repair note into one coherent prompt before generating, so this may take several minutes and may incur provider/image-generation cost. Locked assets are skipped.`,
        );
        if (!confirmed) return;

        setBulkRegenerating(true);
        setBulkError('');

        try {
            const settled: PromiseSettledResult<void>[] = [];
            for (const entry of batchRegenerableEntries) {
                const revisionNote = buildBatchRevisionNote(
                    entry,
                    repairInsightMap.get(entry.asset.assetId) ?? [],
                    activeTabDef.label,
                );
                try {
                    const response = await fetch(`/api/groups/campaign/${slug}/media/regenerate-with-revision`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            assetId: entry.asset.assetId,
                            applyMode: 'append_note',
                            revisionNote,
                        }),
                    });
                    if (!response.ok) {
                        const payload = await response.json().catch(() => ({})) as { error?: string };
                        throw new Error(payload.error ?? `Regeneration failed for ${entry.asset.assetId}`);
                    }
                    settled.push({ status: 'fulfilled', value: undefined });
                } catch (err) {
                    settled.push({ status: 'rejected', reason: err });
                }
            }

            const failures = settled.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
            if (failures.length > 0) {
                const firstMessage = failures[0].reason instanceof Error ? failures[0].reason.message : 'Some regenerations failed.';
                setBulkError(`Regenerated ${settled.length - failures.length}/${settled.length}. ${firstMessage}`);
            }

            await handleRefresh();
        } catch (error: unknown) {
            setBulkError(error instanceof Error ? error.message : 'Batch regeneration failed');
        } finally {
            setBulkRegenerating(false);
        }
    };

    const handleBulkRemove = async (
        entriesToRemove: Array<{ entryKey: string; title: string; asset: AssetRecord }>,
        confirmationMessage: string,
    ) => {
        if (entriesToRemove.length === 0 || bulkRemoving) return;

        const confirmed = window.confirm(confirmationMessage);
        if (!confirmed) return;

        setBulkRemoving(true);
        setBulkError('');

        try {
            const settled: PromiseSettledResult<void>[] = [];
            for (const entry of entriesToRemove) {
                const endpoint = getDeleteEndpoint(slug, entry.asset.assetType);
                if (!endpoint) continue;

                try {
                    const response = await fetch(endpoint, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ assetId: entry.asset.assetId }),
                    });

                    if (!response.ok) {
                        const payload = await response.json().catch(() => ({}));
                        const message = payload?.error ?? `Delete failed (${response.status})`;
                        throw new Error(`${entry.asset.assetId}: ${message}`);
                    }

                    settled.push({ status: 'fulfilled', value: undefined });
                } catch (error) {
                    settled.push({
                        status: 'rejected',
                        reason: error,
                    });
                }
            }

            const failures = settled.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
            if (failures.length > 0) {
                setBulkError(`Removed ${settled.length - failures.length}/${settled.length}. ${failures[0].reason instanceof Error ? failures[0].reason.message : 'Some deletions failed.'}`);
            }

            await handleRefresh();
        } catch (error: unknown) {
            setBulkError(error instanceof Error ? error.message : 'Bulk remove failed');
        } finally {
            setBulkRemoving(false);
        }
    };

    const handleRemoveAllInTab = async () => {
        await handleBulkRemove(
            removableEntries,
            `Remove all ${removableEntries.length} assets from "${activeTabDef.label}"?\n\nThis deactivates the asset records and removes them from the manifest.`
        );
    };

    const handleRemoveNotApprovedInTab = async () => {
        await handleBulkRemove(
            removableUnapprovedEntries,
            `Remove ${removableUnapprovedEntries.length} non-approved assets from "${activeTabDef.label}"?\n\nOnly human-approved assets will be kept in this tab.`
        );
    };

    // Removable entries across every tab — used by "Remove Everything" so the
    // operator can wipe a campaign's full media manifest before a regeneration.
    const removableEntriesEverywhere = useMemo(() => {
        const all: Array<{ entryKey: string; title: string; asset: AssetRecord }> = [];
        const seen = new Set<string>();
        for (const tab of TABS) {
            for (const entry of tabEntryMap[tab.id] ?? []) {
                if (seen.has(entry.asset.assetId)) continue;
                if (getDeleteEndpoint(slug, entry.asset.assetType) === null) continue;
                seen.add(entry.asset.assetId);
                all.push(entry);
            }
        }
        return all;
    }, [tabEntryMap, slug]);

    const handleRemoveAllEverywhere = async () => {
        // Per-tab breakdown so the operator can see exactly what they're wiping.
        const perTab = TABS
            .map((tab) => {
                const count = (tabEntryMap[tab.id] ?? []).filter(
                    (entry) =>
                        getDeleteEndpoint(slug, entry.asset.assetType) !== null,
                ).length;
                return count > 0 ? `  • ${tab.label}: ${count}` : null;
            })
            .filter((line): line is string => line !== null);
        const breakdown = perTab.length > 0 ? `\n\n${perTab.join('\n')}` : '';

        await handleBulkRemove(
            removableEntriesEverywhere,
            `Remove ALL ${removableEntriesEverywhere.length} assets across EVERY section?${breakdown}\n\nThis deactivates every removable asset record and clears the manifest so the campaign can be regenerated from scratch. Approved assets are NOT spared.`
        );
    };

    if (totalEntries === 0) return null;

    return (
        <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
            {/* ── Summary header ───────────────────────────────────────── */}
            <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs text-slate-400 uppercase tracking-widest">Review Assets</span>
                <div className="flex items-center gap-4 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {totalStatus.approved} approved
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        {totalStatus.auto} auto
                    </span>
                    {totalStatus.flagged > 0 && (
                        <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            {totalStatus.flagged} flagged
                        </span>
                    )}
                    <span>{totalEntries} total</span>
                </div>
            </div>

            {/* ── Visual Compass (collapsible) ─────────────────────────── */}
            <details className="border-b border-white/5 px-4 py-3">
                <summary className="flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none list-none">
                    <div className="flex items-center gap-2">
                        <Compass className="h-4 w-4 text-cyan-300" />
                        <div>
                            <div className="text-[11px] font-medium uppercase tracking-widest text-cyan-200">Visual Compass</div>
                            <div className="text-[10px] text-slate-500">
                                {visualCompass.qualityCount}/{visualCompass.sourceCount} source assets scored, {visualCompass.visionCount} vision verified
                            </div>
                        </div>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-[10px] ${
                        visualCompass.blockingCount > 0
                            ? 'border-red-500/30 bg-red-500/10 text-red-200'
                            : visualCompass.issueCount > 0
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                    }`}>
                        {visualCompass.blockingCount > 0
                            ? `${visualCompass.blockingCount} blockers`
                            : visualCompass.issueCount > 0
                                ? `${visualCompass.issueCount} warnings`
                                : 'clear'}
                    </div>
                </summary>

                <div className="grid gap-2 pt-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
                            <Users className="h-3.5 w-3.5" />
                            Group Action
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">{visualCompass.groupActionCount} assets</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
                            <Sun className="h-3.5 w-3.5" />
                            Light Range
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">{visualCompass.moodyCount} moody / {visualCompass.daylightCount} daylight</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
                            <Ship className="h-3.5 w-3.5" />
                            Ship Feature Survival
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">{visualCompass.shipSurvivalCount}/{visualCompass.shipContextCount}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Demographic Spread
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">{visualCompass.demographicCombos} combinations</div>
                    </div>
                </div>

                {(visualCompass.lint.blockingIssues.length > 0 || visualCompass.lint.warnings.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {[...visualCompass.lint.blockingIssues, ...visualCompass.lint.warnings].slice(0, 6).map((issue) => (
                            <span
                                key={`${issue.severity}:${issue.code}`}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${
                                    issue.severity === 'blocker'
                                        ? 'border-red-500/30 bg-red-500/10 text-red-100'
                                        : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                                }`}
                            >
                                <AlertTriangle className="h-3 w-3" />
                                {issue.code}
                            </span>
                        ))}
                    </div>
                )}
            </details>

            {/* ── Role Lanes (collapsible) ─────────────────────────────── */}
            <details className="border-b border-white/5 px-4 py-3">
                <summary className="cursor-pointer select-none text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-300">Role Lanes</summary>
                <div className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
                    {ROLE_LANES.map((lane) => {
                        const Icon = lane.icon;
                        const count = roleLaneCounts[lane.id] ?? 0;
                        return (
                            <div key={lane.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2">
                                <span className="flex min-w-0 items-center gap-2 text-[11px] text-slate-300">
                                    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                    <span className="truncate">{lane.label}</span>
                                </span>
                                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">{count}</span>
                            </div>
                        );
                    })}
                </div>
            </details>

            <div className="flex flex-wrap gap-0.5 border-b border-white/5 px-2">
                {TABS.map((tab) => {
                    const entries = tabEntryMap[tab.id] ?? [];
                    const count = entries.length;
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;
                    const status = countStatuses(entries);
                    const dotColor = count === 0
                        ? 'bg-slate-700'
                        : status.flagged > 0
                            ? 'bg-amber-400'
                            : status.approved === count
                                ? 'bg-emerald-400'
                                : 'bg-cyan-400';

                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                                isActive
                                    ? 'border-cyan-400 text-white'
                                    : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            <span>{tab.label}</span>
                            <span className={`min-w-[1.25rem] text-center px-1 py-0.5 rounded-full text-[9px] leading-none ${
                                isActive ? 'bg-white/10 text-white' : 'bg-white/5 text-slate-500'
                            }`}>
                                {count}
                            </span>
                            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                        </button>
                    );
                })}
            </div>

            {/* ── Tab content ──────────────────────────────────────────── */}
            {!activeTabHasContent ? (
                <div className="flex flex-col items-center gap-2 py-16 text-slate-600">
                    <ActiveIcon className="h-10 w-10 opacity-40" />
                    <span className="text-xs">No {activeTabDef.label.toLowerCase()} assets generated yet</span>
                </div>
            ) : (
                <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] text-slate-500">
                            {activeEntries.length} assets in {activeTabDef.label}
                        </div>
                        <div className="flex items-center gap-2">
                            {tabSupportsHistory && (
                                <button
                                    onClick={() => void handleToggleHistory()}
                                    disabled={historyLoading}
                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] transition disabled:opacity-40 ${
                                        historyOpen
                                            ? 'border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25'
                                            : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                                    }`}
                                >
                                    {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                                    {historyOpen ? 'Hide History' : 'History'}
                                </button>
                            )}
                            {pendingApprovalEntries.length > 0 && (
                                <button
                                    onClick={() => void handleBulkApprove()}
                                    disabled={bulkApproving}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-200 hover:bg-emerald-500/20 transition disabled:opacity-40"
                                >
                                    {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                                    {bulkApproving ? 'Approving…' : 'Approve All Pending'}
                                </button>
                            )}
                            {(batchRegenerableEntries.length > 0 || removableUnapprovedEntries.length > 0 || removableEntries.length > 0 || removableEntriesEverywhere.length > 0) && (
                                <details className="relative">
                                    <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/10 list-none">
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                        Bulk Actions
                                    </summary>
                                    <div className="absolute right-0 z-30 mt-1 flex w-60 flex-col gap-1 rounded-lg border border-white/10 bg-slate-900 p-1.5 shadow-xl shadow-black/50">
                                        {batchRegenerableEntries.length > 0 && (
                                            <button
                                                onClick={() => void handleBatchRegenerateSection()}
                                                disabled={bulkRegenerating}
                                                title="Regenerate every unlocked regenerable image in this section. Visual repair notes are rewritten into coherent prompts before generation."
                                                className="inline-flex w-full items-center gap-1.5 rounded-md border border-purple-500/25 bg-purple-500/10 px-3 py-1.5 text-[11px] text-purple-200 hover:bg-purple-500/20 transition disabled:opacity-40"
                                            >
                                                {bulkRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                                {bulkRegenerating ? 'Regenerating…' : `Regenerate Section (${batchRegenerableEntries.length})`}
                                            </button>
                                        )}
                                        {removableUnapprovedEntries.length > 0 && (
                                            <button
                                                onClick={() => void handleRemoveNotApprovedInTab()}
                                                disabled={bulkRemoving}
                                                className="inline-flex w-full items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200 hover:bg-amber-500/20 transition disabled:opacity-40"
                                            >
                                                {bulkRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                Remove Not Approved
                                            </button>
                                        )}
                                        {removableEntries.length > 0 && (
                                            <button
                                                onClick={() => void handleRemoveAllInTab()}
                                                disabled={bulkRemoving}
                                                className="inline-flex w-full items-center gap-1.5 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300 hover:bg-red-500/20 transition disabled:opacity-40"
                                            >
                                                {bulkRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                Remove All In Tab
                                            </button>
                                        )}
                                        {removableEntriesEverywhere.length > 0 && (
                                            <button
                                                onClick={() => void handleRemoveAllEverywhere()}
                                                disabled={bulkRemoving}
                                                title={`Remove every removable asset in every tab — clears the manifest so the campaign can be regenerated from scratch (${removableEntriesEverywhere.length} assets across ${TABS.length} tabs).`}
                                                className="inline-flex w-full items-center gap-1.5 rounded-md border border-red-500/60 bg-red-600/20 px-3 py-1.5 text-[11px] font-semibold text-red-200 hover:bg-red-600/30 transition disabled:opacity-40"
                                            >
                                                {bulkRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                {`Remove Everything (${removableEntriesEverywhere.length})`}
                                            </button>
                                        )}
                                    </div>
                                </details>
                            )}
                        </div>
                    </div>

                    {bulkError && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                            {bulkError}
                        </div>
                    )}

                    {/* ── Version History Panel ──────────────────────── */}
                    {showTikTokPromotionPackage && manifest.tiktokPromotionPackage && (
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-cyan-300">TikTok Promotion Package</div>
                                    <p className="mt-1 max-w-3xl text-xs text-slate-300">{manifest.tiktokPromotionPackage.strategySummary}</p>
                                </div>
                                <div className="rounded-full border border-white/10 bg-slate-950 px-3 py-1 text-[10px] text-slate-400">
                                    {manifest.tiktokPromotionPackage.beats.length} beats | {formatPackageTimestamp(manifest.tiktokPromotionPackage.synthesizedAt)}
                                </div>
                            </div>

                            {manifest.tiktokPromotionPackage.extractionNotes.length > 0 && (
                                <div className="mb-3 flex flex-wrap gap-2">
                                    {manifest.tiktokPromotionPackage.extractionNotes.slice(0, 4).map((note, index) => (
                                        <span key={`${index}:${note}`} className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-100">
                                            {note}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {manifest.tiktokPromotionPackage.beats.map((beat, index) => (
                                    <div key={`${index}:${beat.headline}`} className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
                                        <div className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Beat {index + 1}</div>
                                        <div className="text-xs font-semibold text-slate-100">{beat.headline}</div>
                                        <div className="mt-1 text-[11px] text-cyan-100">{beat.subline}</div>
                                        <p className="mt-1 text-[11px] text-slate-400">{beat.spokenText}</p>
                                        {beat.sceneHint && (
                                            <div className="mt-2 text-[10px] text-slate-500">{beat.sceneHint}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {historyOpen && (
                        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
                            <div className="flex items-center justify-between border-b border-violet-500/10 px-4 py-2.5">
                                <div className="flex items-center gap-2 text-[11px] text-violet-200">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span className="font-medium uppercase tracking-widest">Previous Versions</span>
                                    {!historyLoading && (
                                        <span className="text-violet-400">— {historyItems.length} found</span>
                                    )}
                                </div>
                                <p className="text-[10px] text-slate-500">Assets orphaned by prior generation runs. Restore adds them back to the manifest.</p>
                            </div>

                            {historyError && (
                                <div className="px-4 py-2 text-[11px] text-red-300 border-b border-red-500/10 bg-red-500/5">
                                    {historyError}
                                </div>
                            )}

                            {historyLoading ? (
                                <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-[11px]">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading history…
                                </div>
                            ) : historyItems.length === 0 ? (
                                <div className="py-8 text-center text-[11px] text-slate-500">
                                    No previous versions found for this tab.
                                </div>
                            ) : (
                                <div className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
                                    {historyItems.map((asset) => (
                                        <div
                                            key={asset.assetId}
                                            className="flex flex-col gap-2 rounded-lg border border-white/10 bg-slate-950/60 p-2"
                                        >
                                            {/* Preview */}
                                            {asset.mimeType.startsWith('image/') ? (
                                                <img
                                                    src={`${asset.assetType === 'ship_reference_image' && asset.sourceThumbnailUrl ? asset.sourceThumbnailUrl : asset.url}?v=${encodeURIComponent(asset.createdAt)}`}
                                                    alt={asset.assetId}
                                                    className="h-32 w-full rounded-md object-cover"
                                                />
                                            ) : asset.mimeType.startsWith('video/') ? (
                                                <video src={asset.url} className="h-32 w-full rounded-md bg-black object-cover" />
                                            ) : asset.mimeType.startsWith('audio/') ? (
                                                <div className="flex h-12 items-center justify-center rounded-md bg-slate-900 text-[10px] text-slate-400">
                                                    Audio — {asset.assetType.replace(/_/g, ' ')}
                                                </div>
                                            ) : (
                                                <div className="flex h-12 items-center justify-center rounded-md bg-slate-900 text-[10px] text-slate-400">
                                                    {asset.assetType.replace(/_/g, ' ')}
                                                </div>
                                            )}

                                            {/* Meta */}
                                            <div className="space-y-0.5 px-0.5">
                                                <p className="text-[10px] font-mono text-slate-400 truncate">{asset.assetId}</p>
                                                <p className="text-[10px] text-slate-500">
                                                    {new Date(asset.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                                </p>
                                            </div>

                                            {/* Restore button */}
                                            <button
                                                onClick={() => void handleRestore(asset.assetId)}
                                                disabled={restoringId !== null}
                                                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-500/25 bg-violet-500/10 py-1.5 text-[11px] text-violet-200 hover:bg-violet-500/20 transition disabled:opacity-40"
                                            >
                                                {restoringId === asset.assetId
                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    : <RotateCcw className="h-3.5 w-3.5" />}
                                                {restoringId === asset.assetId ? 'Restoring…' : 'Restore'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'designed_ads' && brief?.identityBlueprint && (
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-cyan-300">
                                <span>Identity Blueprint</span>
                                <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 normal-case tracking-normal text-[11px]">
                                    {brief.identityBlueprint.energyMode.replace(/_/g, ' ')}
                                </span>
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 normal-case tracking-normal text-[11px] text-slate-300">
                                    {brief.identityBlueprint.socialScale.replace(/_/g, ' ')}
                                </span>
                            </div>
                            <div className="text-[11px] text-slate-300">
                                {brief.identityBlueprint.summary}
                            </div>
                            <div className="text-[11px] text-slate-400">
                                Avoid defaults: {brief.identityBlueprint.forbiddenDefaults.join(', ')}
                            </div>
                        </div>
                    )}

                    {activeTab === 'designed_ads' && (
                        <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-[11px] text-slate-300">
                            <span className="font-medium text-fuchsia-200">Canva Ads review:</span>{' '}
                            {designedAdArtifactCount} final static ads. This includes Templated renders plus any preserved premium legacy display template.
                        </div>
                    )}

                    {activeTab === 'documentary_details' && (
                        <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-[11px] text-slate-300">
                            <span className="font-medium text-fuchsia-200">Documentary Details review:</span>{' '}
                            {designedAdSourceCount} optional source modules used as still/detail ingredients for legacy audit and template debugging.
                        </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {activeEntries.map((entry) => (
                            <div key={entry.entryKey}>
                                <AssetGovernanceStrip
                                    asset={entry.asset}
                                    issueCodes={issueCodeMap.get(entry.asset.assetId) ?? []}
                                />
                                <ReviewAssetCard
                                    slug={slug}
                                    asset={entry.asset}
                                    title={entry.title}
                                    entryKey={entry.entryKey}
                                    variants={entry.variants}
                                    identityBlueprint={brief?.identityBlueprint}
                                    visualInsights={repairInsightMap.get(entry.asset.assetId) ?? []}
                                    onRefresh={handleRefresh}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

