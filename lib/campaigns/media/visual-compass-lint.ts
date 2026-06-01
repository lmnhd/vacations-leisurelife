import type {
    AssetRecord,
    CampaignMediaManifest,
    CompositionFamily,
    ProductionBuildLintIssue,
    TimeOfDay,
} from '../schema';

export interface VisualCompassLintOptions {
    railTableWindowCapRatio?: number;
    daylightCapRatio?: number;
    groupActionFloor?: number;
}

export interface VisualCompassLintResult {
    blockingIssues: ProductionBuildLintIssue[];
    warnings: ProductionBuildLintIssue[];
}

const DEFAULT_OPTIONS: Required<VisualCompassLintOptions> = {
    railTableWindowCapRatio: 0.3,
    daylightCapRatio: 0.5,
    groupActionFloor: 4,
};

const PHOTO_REAL_SOURCE_SECTIONS = [
    'hero',
    'sceneImages',
    'aestheticConcepts',
    'documentaryDetails',
    'platformCrops',
] as const;

const RAIL_TABLE_WINDOW: CompositionFamily[] = ['rail', 'table', 'window'];
const BRIGHT_DAYLIGHT: TimeOfDay[] = ['morning', 'midday'];
const MOODY_HOURS: TimeOfDay[] = ['sunrise', 'golden_hour', 'dusk_blue_hour', 'night'];

function uniqueByAssetId(records: readonly AssetRecord[]): AssetRecord[] {
    const seen = new Set<string>();
    const out: AssetRecord[] = [];
    for (const record of records) {
        if (seen.has(record.assetId)) continue;
        seen.add(record.assetId);
        out.push(record);
    }
    return out;
}

export function collectPhotoRealSourceAssets(manifest: CampaignMediaManifest): AssetRecord[] {
    return uniqueByAssetId([
        ...(manifest.images.hero ?? []),
        ...(manifest.images.sceneImages ?? []),
        ...(manifest.images.aestheticConcepts ?? []),
        ...(manifest.images.documentaryDetails ?? []),
        ...Object.values(manifest.images.platformCrops ?? {}).flat(),
    ]).filter((asset) => asset.active !== false);
}

function countBy<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
    const counts: Partial<Record<T, number>> = {};
    for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
    return counts;
}

function issue(
    code: ProductionBuildLintIssue['code'],
    severity: ProductionBuildLintIssue['severity'],
    message: string,
    assetIds: string[],
    details: string,
): ProductionBuildLintIssue {
    return {
        code,
        severity,
        message,
        affectedStillIds: assetIds,
        details,
    };
}

function demographicKey(asset: AssetRecord): string | null {
    const coverage = asset.sourceQuality?.demographicCoverage;
    const age = coverage?.ageBands?.[0];
    const ethnicity = coverage?.ethnicityBands?.[0];
    if (!age || !ethnicity) return null;
    return `${age}|${ethnicity}`;
}

// AI-generated image types get sourceQuality.artisticTreatment inferred from prompt text,
// which is unreliable for detecting actual alternate art. Only flag watercolor_illustration
// on externally-sourced asset types (references, uploads), not generated images.
const GENERATED_IMAGE_TYPES = new Set([
    'hero_image', 'scene_image', 'aesthetic_concept', 'documentary_detail_image',
]);

function findAlternateArtLeaks(manifest: CampaignMediaManifest): AssetRecord[] {
    const leaked: AssetRecord[] = [];

    for (const section of PHOTO_REAL_SOURCE_SECTIONS) {
        const records = section === 'platformCrops'
            ? Object.values(manifest.images.platformCrops ?? {}).flat()
            : (manifest.images[section] ?? []);
        leaked.push(...records.filter((asset) =>
            asset.eligibilityRole === 'alternate_art'
            || asset.assetType === 'alternate_art'
            || (
                asset.sourceQuality?.artisticTreatment === 'watercolor_illustration'
                && !GENERATED_IMAGE_TYPES.has(asset.assetType)
            )
        ));
    }

    return uniqueByAssetId(leaked);
}

export function lintVisualCompass(
    manifest: CampaignMediaManifest | null | undefined,
    options: VisualCompassLintOptions = {},
): VisualCompassLintResult {
    if (!manifest) return { blockingIssues: [], warnings: [] };

    const opts = { ...DEFAULT_OPTIONS, ...options };
    const blockingIssues: ProductionBuildLintIssue[] = [];
    const warnings: ProductionBuildLintIssue[] = [];
    const sourceAssets = collectPhotoRealSourceAssets(manifest);

    const alternateLeaks = findAlternateArtLeaks(manifest);
    if (alternateLeaks.length > 0) {
        blockingIssues.push(issue(
            'alternate_art_leak',
            'blocker',
            `${alternateLeaks.length} alternate-art asset(s) are reachable from photo-real source selector lanes.`,
            alternateLeaks.map((asset) => asset.assetId),
            'Move watercolor, illustration, or alternate_art records into images.alternateArt or explicitly opt into them before selection.',
        ));
    }

    if (sourceAssets.length === 0) return { blockingIssues, warnings };

    const missingQuality = sourceAssets.filter((asset) => !asset.sourceQuality);
    if (missingQuality.length > 0) {
        warnings.push(issue(
            'source_quality_missing',
            'warning',
            `${missingQuality.length} source asset(s) are missing sourceQuality metadata.`,
            missingQuality.map((asset) => asset.assetId),
            'Regenerate or backfill hero, concept, scene, and documentary-detail records so visual-compass lint can evaluate the full pool.',
        ));
    }

    const qualityAssets = sourceAssets.filter((asset) => asset.sourceQuality);
    const sampleSize = qualityAssets.length;
    if (sampleSize === 0) return { blockingIssues, warnings };

    const unsupportedHumanAssets = qualityAssets.filter((asset) =>
        asset.sourceQuality?.supportSurfaceIntegrity?.supported === false
    );
    if (unsupportedHumanAssets.length > 0) {
        blockingIssues.push(issue(
            'support_surface_impossible',
            'blocker',
            `${unsupportedHumanAssets.length} source asset(s) show people without plausible physical support.`,
            unsupportedHumanAssets.map((asset) => asset.assetId),
            'Reject or regenerate: seated, standing, kneeling, and reclining people must be on visible deck, chair, lounger, bench, step, pool coping, or pool ledge. Open water may only contain swimmers, reflections, and ripples.',
        ));
    }

    const compositionHits = qualityAssets.filter((asset) =>
        RAIL_TABLE_WINDOW.includes(asset.sourceQuality!.compositionFamily)
    );
    if (compositionHits.length / sampleSize > opts.railTableWindowCapRatio) {
        warnings.push(issue(
            'rail_table_window_overuse',
            'warning',
            `${compositionHits.length}/${sampleSize} source assets lean on rail/table/window composition.`,
            compositionHits.map((asset) => asset.assetId),
            `Keep rail/table/window below ${Math.round(opts.railTableWindowCapRatio * 100)}% of the source pool.`,
        ));
    }

    const groupActionAssets = qualityAssets.filter((asset) =>
        asset.sourceQuality!.groupActionScore >= 0.6 || asset.eligibilityRole === 'source.group_action'
    );
    if (groupActionAssets.length < opts.groupActionFloor && sampleSize >= opts.groupActionFloor) {
        warnings.push(issue(
            'group_action_floor_missing',
            'warning',
            `Only ${groupActionAssets.length}/${sampleSize} source assets read as group action.`,
            sourceAssets.map((asset) => asset.assetId),
            `Need at least ${opts.groupActionFloor} source assets with 4-6 people doing theme-specific shared activity.`,
        ));
    }

    const daylightAssets = qualityAssets.filter((asset) =>
        BRIGHT_DAYLIGHT.includes(asset.sourceQuality!.timeOfDay)
    );
    if (daylightAssets.length / sampleSize > opts.daylightCapRatio) {
        warnings.push(issue(
            'bright_daylight_overuse',
            'warning',
            `${daylightAssets.length}/${sampleSize} source assets are bright daylight/midday.`,
            daylightAssets.map((asset) => asset.assetId),
            `Keep bright daylight at or below ${Math.round(opts.daylightCapRatio * 100)}% so the set has cinematic range.`,
        ));
    }

    const moodyAssets = qualityAssets.filter((asset) =>
        MOODY_HOURS.includes(asset.sourceQuality!.timeOfDay)
    );
    if (moodyAssets.length === 0 && sampleSize >= 4) {
        warnings.push(issue(
            'dusk_blue_hour_absent',
            'warning',
            'No source asset uses sunrise, golden hour, dusk/blue hour, or night.',
            qualityAssets.map((asset) => asset.assetId),
            'Add at least one non-midday beat before approving the source pool.',
        ));
    }

    const weakThemeAssets = qualityAssets.filter((asset) =>
        asset.sourceQuality!.themeLegibilityScore < 0.5
    );
    if (weakThemeAssets.length > sampleSize / 2) {
        warnings.push(issue(
            'theme_legibility_weak',
            'warning',
            `${weakThemeAssets.length}/${sampleSize} source assets score below 0.5 for caption-free theme legibility.`,
            weakThemeAssets.map((asset) => asset.assetId),
            'Strengthen visible niche activity, props, or setting cues before using this pool for ads.',
        ));
    }

    const demographicKeys = qualityAssets
        .map((asset) => ({ asset, key: demographicKey(asset) }))
        .filter((entry): entry is { asset: AssetRecord; key: string } => Boolean(entry.key));
    const demographicCounts = countBy(demographicKeys.map((entry) => entry.key));
    const dominant = Object.entries(demographicCounts)
        .sort(([, left], [, right]) => (right ?? 0) - (left ?? 0))[0];
    if (dominant && (dominant[1] ?? 0) > sampleSize / 2 && demographicKeys.length >= 4) {
        const dominantAssets = demographicKeys
            .filter((entry) => entry.key === dominant[0])
            .map((entry) => entry.asset);
        warnings.push(issue(
            'demographic_monotony',
            'warning',
            `${dominantAssets.length}/${sampleSize} source assets share the same dominant age and ethnicity band.`,
            dominantAssets.map((asset) => asset.assetId),
            'Refresh casting variety or run vision verification before treating the pool as representative.',
        ));
    }

    const shipContextAssets = sourceAssets.filter((asset) => asset.eligibilityRole === 'source.ship_context');
    const missingSurvival = shipContextAssets.filter((asset) =>
        (asset.preservedFeaturesReported ?? []).length === 0
    );
    if (missingSurvival.length > 0) {
        warnings.push(issue(
            'reference_feature_survival_missing',
            'warning',
            `${missingSurvival.length} ship-context asset(s) do not report any preserved ship features.`,
            missingSurvival.map((asset) => asset.assetId),
            'Run the vision survival check or regenerate with explicit preserved ship features before using these as vessel-proof assets.',
        ));
    }

    return { blockingIssues, warnings };
}
