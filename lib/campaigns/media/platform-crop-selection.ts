import type { AssetRecord, CampaignMediaManifest, ImageFormat } from '../schema';
import { selectPreferredAssetForContext } from './image-selection';

export const PLATFORM_CROP_FORMATS: readonly ImageFormat[] = [
    'hero_16x9',
    'hero_4x5',
    'story_9x16',
    'square_1x1',
    'banner_3x1',
    'email_header',
    'og_image',
    'thumbnail',
];

export function getPlatformCropSelectionContext(format: ImageFormat) {
    switch (format) {
        case 'hero_4x5':
        case 'og_image':
            return 'meta_ad_creative' as const;
        case 'story_9x16':
        case 'square_1x1':
        case 'thumbnail':
            return 'instagram_cover' as const;
        case 'banner_3x1':
        case 'email_header':
            return 'email_header' as const;
        case 'hero_16x9':
        default:
            return 'landing_hero_alt' as const;
    }
}

function uniqueActiveAssetPool(records: readonly AssetRecord[]): AssetRecord[] {
    const seen = new Set<string>();
    const pool: AssetRecord[] = [];

    for (const record of records) {
        if (!record.active || !record.url || seen.has(record.assetId)) {
            continue;
        }
        seen.add(record.assetId);
        pool.push(record);
    }

    return pool;
}

function isPlatformCropSourceEligible(record: AssetRecord): boolean {
    if (!record.eligibilityRole) return true;
    return ![
        'alternate_art',
        'reference.audit_only',
        'final.ad_artifact',
        'final.channel_deliverable',
        'review_only',
    ].includes(record.eligibilityRole);
}

function selectPreferredUnusedAsset(
    records: readonly AssetRecord[],
    format: ImageFormat,
    manifest: CampaignMediaManifest | null | undefined,
    usedAssetIds: ReadonlySet<string>,
): AssetRecord | null {
    const eligibleRecords = records.filter(isPlatformCropSourceEligible);
    const unusedPool = eligibleRecords.filter((record) => !usedAssetIds.has(record.assetId));
    const context = getPlatformCropSelectionContext(format);

    return selectPreferredAssetForContext([...unusedPool], context, manifest)
        ?? selectPreferredAssetForContext([...eligibleRecords], context, manifest)
        ?? unusedPool[0]
        ?? eligibleRecords[0]
        ?? null;
}

function findSelectionOverride(
    manifest: CampaignMediaManifest | null | undefined,
    key: string,
): AssetRecord | null {
    const selectedAssetId = manifest?.imageSelections?.[key];
    if (!selectedAssetId || !manifest?.images) return null;

    const candidates = [
        ...manifest.images.hero,
        ...(manifest.images.flyerImages ?? []),
        ...manifest.images.sceneImages,
        ...manifest.images.aestheticConcepts,
        ...(manifest.images.documentaryDetails ?? []),
        ...manifest.images.shipReferences,
        ...Object.values(manifest.images.platformCrops ?? {}).flat(),
    ];
    const selected = candidates.find((record) => record.assetId === selectedAssetId);
    if (!selected || !selected.active || !isPlatformCropSourceEligible(selected)) return null;
    return selected;
}

export function selectPlatformCropSourceRecord(
    format: ImageFormat,
    sceneImages: readonly AssetRecord[],
    heroImages: readonly AssetRecord[],
    aestheticConcepts: readonly AssetRecord[],
    manifest?: CampaignMediaManifest | null,
    preferHeroFirst: boolean = true,
    usedAssetIds: ReadonlySet<string> = new Set<string>(),
): AssetRecord | null {
    const override = findSelectionOverride(manifest, `crop:${format}`);
    if (override) return override;

    const activeHeroes = uniqueActiveAssetPool(heroImages);
    const activeScenes = uniqueActiveAssetPool(sceneImages);
    const activeConcepts = uniqueActiveAssetPool(aestheticConcepts);

    const primaryPool = preferHeroFirst ? activeHeroes : activeScenes;
    const secondaryPool = preferHeroFirst ? activeScenes : activeHeroes;
    const combinedPool = uniqueActiveAssetPool([...activeHeroes, ...activeScenes, ...activeConcepts]);

    return selectPreferredUnusedAsset(primaryPool, format, manifest, usedAssetIds)
        ?? selectPreferredUnusedAsset(secondaryPool, format, manifest, usedAssetIds)
        ?? selectPreferredUnusedAsset(activeConcepts, format, manifest, usedAssetIds)
        ?? selectPreferredUnusedAsset(combinedPool, format, manifest, usedAssetIds)
        ?? null;
}

export function planPlatformCropSources(
    sceneImages: readonly AssetRecord[],
    heroImages: readonly AssetRecord[],
    aestheticConcepts: readonly AssetRecord[],
    manifest?: CampaignMediaManifest | null,
    formats: readonly ImageFormat[] = PLATFORM_CROP_FORMATS,
): Map<ImageFormat, AssetRecord> {
    const plan = new Map<ImageFormat, AssetRecord>();
    const usedAssetIds = new Set<string>();

    for (const [formatIndex, format] of formats.entries()) {
        const source = selectPlatformCropSourceRecord(
            format,
            sceneImages,
            heroImages,
            aestheticConcepts,
            manifest,
            formatIndex % 2 === 0,
            usedAssetIds,
        );
        if (!source) {
            continue;
        }

        plan.set(format, source);
        usedAssetIds.add(source.assetId);
    }

    return plan;
}
