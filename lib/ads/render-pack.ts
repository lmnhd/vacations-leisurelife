import type {
    AssetApprovalState,
    AssetRecord,
    CampaignMediaManifest,
    MediaGovernancePolicy,
} from '@/lib/campaigns/schema';
import { lookupTemplate } from './template-registry';
import type {
    AdCopySet,
    AdFormat,
    AdRenderImageSelection,
    AdRenderPack,
    AdRenderPageArtifact,
    CopyForgeInput,
    SlotPack,
    TemplatedLayerOverride,
} from './types';
import { prepareRenderImageSource } from './image-uploader';

interface ManifestImagePool {
    hero: AssetRecord[];
    shipReferences: AssetRecord[];
    sceneImages: AssetRecord[];
    aestheticConcepts: AssetRecord[];
    documentaryDetails: AssetRecord[];
    designedAdArtifacts: AssetRecord[];
    platformCrops: AssetRecord[];
    merchDesigns: AssetRecord[];
    merchMockups: AssetRecord[];
}

const EMPTY_ASSET_POOL: AssetRecord[] = [];

const DEFAULT_GOVERNANCE: MediaGovernancePolicy = {
    imageSelectionMode: 'approved_if_any_else_fallback',
    revisionRequiredBlocksUsage: true,
    rejectedBlocksUsage: true,
    holdBlocksUsage: true,
    pendingReviewBlocksWhenLocked: true,
};

function cleanTags(tags: string[] | undefined): string[] {
    return (tags ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0);
}

function approvalState(asset: AssetRecord): AssetApprovalState {
    if (asset.curation?.approvalState) {
        return asset.curation.approvalState;
    }
    // Records without curation metadata fall back to their reviewStatus.
    switch (asset.reviewStatus) {
        case 'human_approved':
        case 'auto_approved':
            return asset.reviewStatus;
        default:
            return 'pending_review';
    }
}

function curationBlocks(asset: AssetRecord, governance: MediaGovernancePolicy): boolean {
    const state = approvalState(asset);
    if (governance.rejectedBlocksUsage && state === 'rejected') return true;
    if (governance.revisionRequiredBlocksUsage && state === 'revision_required') return true;
    if (governance.holdBlocksUsage && state === 'hold') return true;
    return false;
}

function approvalRank(asset: AssetRecord): number {
    switch (approvalState(asset)) {
        case 'human_approved': return 3;
        case 'auto_approved': return 2;
        case 'pending_review': return 1;
        default: return 0;
    }
}

function filterUsableAssets(records: AssetRecord[], governance: MediaGovernancePolicy): AssetRecord[] {
    const seen = new Set<string>();
    const out: AssetRecord[] = [];
    for (const record of records) {
        if (!record.active || !record.url) continue;
        if (seen.has(record.assetId)) continue;
        if (curationBlocks(record, governance)) continue;
        seen.add(record.assetId);
        out.push(record);
    }
    return out;
}

function flattenManifestImages(manifest: CampaignMediaManifest | null, governance: MediaGovernancePolicy): ManifestImagePool {
    if (!manifest) {
        return {
            hero: EMPTY_ASSET_POOL,
            shipReferences: EMPTY_ASSET_POOL,
            sceneImages: EMPTY_ASSET_POOL,
            aestheticConcepts: EMPTY_ASSET_POOL,
            documentaryDetails: EMPTY_ASSET_POOL,
            designedAdArtifacts: EMPTY_ASSET_POOL,
            platformCrops: EMPTY_ASSET_POOL,
            merchDesigns: EMPTY_ASSET_POOL,
            merchMockups: EMPTY_ASSET_POOL,
        };
    }

    return {
        hero: filterUsableAssets(manifest.images.hero ?? [], governance),
        shipReferences: filterUsableAssets(manifest.images.shipReferences ?? [], governance),
        sceneImages: filterUsableAssets(manifest.images.sceneImages ?? [], governance),
        aestheticConcepts: filterUsableAssets(manifest.images.aestheticConcepts ?? [], governance),
        documentaryDetails: filterUsableAssets(manifest.images.documentaryDetails ?? [], governance),
        designedAdArtifacts: filterUsableAssets(manifest.images.designedAdArtifacts ?? [], governance),
        platformCrops: filterUsableAssets(Object.values(manifest.images.platformCrops ?? {}).flat(), governance),
        merchDesigns: filterUsableAssets(manifest.merch?.designs ?? [], governance),
        merchMockups: filterUsableAssets(manifest.merch?.mockups ?? [], governance),
    };
}

function poolForAssetType(pool: ManifestImagePool, assetType: string): AssetRecord[] {
    switch (assetType) {
        case 'hero':
            return [...pool.hero, ...pool.platformCrops, ...pool.sceneImages, ...pool.aestheticConcepts, ...pool.documentaryDetails, ...pool.shipReferences];
        case 'ship_reference':
            return [...pool.shipReferences, ...pool.hero, ...pool.sceneImages, ...pool.aestheticConcepts];
        case 'scene_image':
            return [...pool.sceneImages, ...pool.documentaryDetails, ...pool.platformCrops, ...pool.hero, ...pool.aestheticConcepts];
        case 'aesthetic_concept':
            return [...pool.aestheticConcepts, ...pool.documentaryDetails, ...pool.platformCrops, ...pool.hero, ...pool.sceneImages];
        case 'still':
            return [...pool.documentaryDetails, ...pool.platformCrops, ...pool.sceneImages, ...pool.hero, ...pool.aestheticConcepts, ...pool.designedAdArtifacts];
        case 'merch':
            return [...pool.merchDesigns, ...pool.merchMockups];
        default:
            return [];
    }
}

interface ScoreKey {
    approval: number;
    hasAllPreferred: number;
    tagMatches: number;
    globalPriority: number;
    createdAt: number;
}

function assetScoreKey(asset: AssetRecord, preferredTags: string[]): ScoreKey {
    const tags = cleanTags(asset.tags);
    const tagMatches = preferredTags.reduce((count, tag) => count + (tags.includes(tag) ? 1 : 0), 0);
    const hasAllPreferred = preferredTags.length > 0 && preferredTags.every((tag) => tags.includes(tag));
    const createdAt = Date.parse(asset.createdAt);
    return {
        approval: approvalRank(asset),
        hasAllPreferred: hasAllPreferred ? 1 : 0,
        tagMatches,
        globalPriority: asset.curation?.globalPriority ?? 50,
        createdAt: Number.isNaN(createdAt) ? 0 : createdAt,
    };
}

function compareAssetScore(a: AssetRecord, b: AssetRecord, preferredTags: string[]): number {
    const aKey = assetScoreKey(a, preferredTags);
    const bKey = assetScoreKey(b, preferredTags);
    if (aKey.approval !== bKey.approval) return bKey.approval - aKey.approval;
    if (aKey.hasAllPreferred !== bKey.hasAllPreferred) return bKey.hasAllPreferred - aKey.hasAllPreferred;
    if (aKey.tagMatches !== bKey.tagMatches) return bKey.tagMatches - aKey.tagMatches;
    if (aKey.globalPriority !== bKey.globalPriority) return bKey.globalPriority - aKey.globalPriority;
    if (aKey.createdAt !== bKey.createdAt) return bKey.createdAt - aKey.createdAt;
    return a.assetId.localeCompare(b.assetId);
}

function selectAsset(
    pool: ManifestImagePool,
    assetType: string,
    preferredTags: string[],
    usedAssetIds: Set<string>,
    slotName: string,
): AssetRecord {
    const candidates = poolForAssetType(pool, assetType).sort((a, b) => compareAssetScore(a, b, preferredTags));
    const candidate = candidates.find((asset) => !usedAssetIds.has(asset.assetId)) ?? candidates[0];
    if (!candidate) {
        throw new Error(`No usable manifest asset found for slot "${slotName}" with assetType "${assetType}". Either no asset of that type exists in the manifest, or every candidate is blocked by media governance (rejected / revision_required / hold).`);
    }

    usedAssetIds.add(candidate.assetId);
    return candidate;
}

type SlotPackValue = SlotPack;

function textForSlot(pack: SlotPackValue, slotName: string): string {
    switch (slotName) {
        case 'headline':
            return pack.headline;
        case 'subhead':
            return pack.subhead ?? '';
        case 'microcopy':
            return pack.microcopy ?? '';
        case 'cta':
            return pack.cta;
        default:
            return '';
    }
}

async function buildLayerOverrides(
    layoutSlots: Array<{ name: string; type: 'text' | 'image' | 'color'; visualOrder: number }>,
    pack: SlotPackValue,
    pool: ManifestImagePool,
    slug: string,
    usedAssetIds: Set<string>,
    pageIndex = 0,
): Promise<{ layers: Record<string, TemplatedLayerOverride>; selectedImages: AdRenderImageSelection[] }> {
    const layers: Record<string, TemplatedLayerOverride> = {};
    const selectedImages: AdRenderImageSelection[] = [];

    const imageSlots = layoutSlots
        .filter((slot) => slot.type === 'image')
        .sort((a, b) => a.visualOrder - b.visualOrder);

    const imageSelections = imageSlots.map(async (slot) => {
        const directive = pack.imageSlotDirectives[slot.name];
        if (!directive) {
            throw new Error(`Missing image directive for slot "${slot.name}" on page ${pageIndex + 1}.`);
        }

        const preferredTags = cleanTags(directive.preferTags);
        const asset = selectAsset(pool, directive.assetType, preferredTags, usedAssetIds, slot.name);
        const prepared = await prepareRenderImageSource(slug, asset);

        layers[slot.name] = {
            image_url: prepared.publicUrl,
        };

        return {
            slotName: slot.name,
            assetId: asset.assetId,
            assetType: directive.assetType,
            sourceUrl: prepared.sourceUrl,
            publicUrl: prepared.publicUrl,
            tags: asset.tags,
            rehosted: prepared.rehosted,
        } satisfies AdRenderImageSelection;
    });

    const textSlots = layoutSlots
        .filter((slot) => slot.type === 'text')
        .sort((a, b) => a.visualOrder - b.visualOrder);

    for (const slot of textSlots) {
        const text = textForSlot(pack, slot.name);
        layers[slot.name] = { text };
    }

    selectedImages.push(...await Promise.all(imageSelections));
    return { layers, selectedImages };
}

export interface BuildTemplatedRenderPacksArgs {
    slug: string;
    manifest: CampaignMediaManifest | null;
    input: CopyForgeInput;
    copySet: AdCopySet;
    formats: AdFormat[];
}

/**
 * Build Templated render requests from the approved copy set and the live
 * manifest asset pool. Image slots are resolved against real manifest assets
 * before any render call is made.
 */
export async function buildTemplatedRenderPacks(
    args: BuildTemplatedRenderPacksArgs,
): Promise<AdRenderPack[]> {
    const governance = args.manifest?.governance ?? DEFAULT_GOVERNANCE;
    const pool = flattenManifestImages(args.manifest, governance);
    const usedAssetIds = new Set<string>();
    const packs: AdRenderPack[] = [];

    for (const format of args.formats) {
        const templateRef = lookupTemplate(args.input.workflow, args.input.visualFlavor, format);
        if (!templateRef) {
            continue;
        }

        const packValue = args.copySet.formats[format];
        if (!packValue) {
            throw new Error(`Copy set does not include a slot pack for format "${format}".`);
        }

        const slotPacks: SlotPack[] = Array.isArray(packValue) ? packValue : [packValue];
        const layoutSlots = templateRef.layout.slotDescriptors;
        const pageArtifacts: AdRenderPageArtifact[] = [];

        const baseRequest = {
            template: templateRef.templatedId,
            format: 'png' as const,
            async: false,
            transparent: false,
            name: `${args.input.campaign.name} - ${format}`,
            external_id: `${args.slug}:${format}`,
        };

        if (slotPacks.length === 1) {
            const prepared = await buildLayerOverrides(layoutSlots, slotPacks[0], pool, args.slug, usedAssetIds, 0);
            pageArtifacts.push({
                page: 'page-1',
                request: {
                    ...baseRequest,
                    layers: prepared.layers,
                },
                layers: prepared.layers,
                selectedImages: prepared.selectedImages,
            });
        } else {
            for (let pageIndex = 0; pageIndex < slotPacks.length; pageIndex += 1) {
                const prepared = await buildLayerOverrides(layoutSlots, slotPacks[pageIndex], pool, args.slug, usedAssetIds, pageIndex);
                const pageName = `page-${pageIndex + 1}`;
                pageArtifacts.push({
                    page: pageName,
                    request: {
                        ...baseRequest,
                        name: `${args.input.campaign.name} - ${format} - ${pageName}`,
                        external_id: `${args.slug}:${format}:${pageName}`,
                        layers: prepared.layers,
                    },
                    layers: prepared.layers,
                    selectedImages: prepared.selectedImages,
                });
            }
        }

        packs.push({
            format,
            templateRef,
            request: baseRequest,
            pages: pageArtifacts,
            selectedImages: pageArtifacts.flatMap((page) => page.selectedImages),
        });
    }

    return packs;
}
