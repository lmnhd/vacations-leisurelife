import type {
    AssetApprovalState,
    AssetRecord,
    CampaignMediaManifest,
    ImageContext,
    MediaGovernancePolicy,
} from '@/lib/campaigns/schema';
import {
    applyCurationContract,
    getCurationTagMatchScore,
    getEffectivePriority,
    hasAllPreferredTags,
} from '@/lib/campaigns/media/curation-contract';
import { collapseAssetVariantGroups } from '@/lib/campaigns/media/image-selection';
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
import { imageContextForAdFormat } from './ad-format-context';
import { prepareRenderImageSource } from './image-uploader';

// Phase 0 (IMAGE_GEN_REVAMP_5-26): roles that must never reach an ad selector.
// Checked in isAdSourceEligible() and applied inside filterUsableAssets().
const INELIGIBLE_ROLES = new Set([
    'final.ad_artifact',
    'final.channel_deliverable',
    'reference.audit_only',
    'alternate_art',
    'review_only',
]);

/**
 * Returns false for any asset whose eligibilityRole marks it as a final
 * artifact, reference, or alternate-art. Legacy records without a role are
 * treated as source-eligible so existing manifests keep working.
 */
export function isAdSourceEligible(asset: AssetRecord): boolean {
    if (asset.eligibilityRole === undefined) return true;
    return !INELIGIBLE_ROLES.has(asset.eligibilityRole);
}

interface ManifestImagePool {
    hero: AssetRecord[];
    shipReferences: AssetRecord[];
    sceneImages: AssetRecord[];
    aestheticConcepts: AssetRecord[];
    documentaryDetails: AssetRecord[];
    // designedAdArtifacts is intentionally absent — final.ad_artifact assets are
    // never eligible source material and must not appear in any selection pool.
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
        if (!isAdSourceEligible(record)) continue;
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
            platformCrops: EMPTY_ASSET_POOL,
            merchDesigns: EMPTY_ASSET_POOL,
            merchMockups: EMPTY_ASSET_POOL,
        };
    }

    // designedAdArtifacts is deliberately excluded. Those records carry
    // eligibilityRole: 'final.ad_artifact' and must never enter a source pool.
    // filterUsableAssets would also block them via isAdSourceEligible(), but
    // structural exclusion makes the contract explicit at the pool-build level.
    //
    // MULTI_MODEL_IMAGES (Phase F): collapse the multi-model sections to the
    // operator-selected model-version BEFORE filtering, so an ad source pool
    // carries one canonical image per logical item — never both the Gemini and
    // OpenAI variant (which would double-count or let the slot resolver pick a
    // non-selected version). Non-multi-model sections pass through unchanged.
    const selections = manifest.modelVersionSelections;
    return {
        hero: filterUsableAssets(collapseAssetVariantGroups(manifest.images.hero ?? [], selections), governance),
        shipReferences: filterUsableAssets(manifest.images.shipReferences ?? [], governance),
        sceneImages: filterUsableAssets(collapseAssetVariantGroups(manifest.images.sceneImages ?? [], selections), governance),
        aestheticConcepts: filterUsableAssets(collapseAssetVariantGroups(manifest.images.aestheticConcepts ?? [], selections), governance),
        documentaryDetails: filterUsableAssets(collapseAssetVariantGroups(manifest.images.documentaryDetails ?? [], selections), governance),
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
            return [...pool.documentaryDetails, ...pool.platformCrops, ...pool.sceneImages, ...pool.hero, ...pool.aestheticConcepts];
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
    priority: number;
    createdAt: number;
}

/**
 * Phase 4 (IMAGE_GEN_REVAMP_5-26): scoring honors the full curation contract.
 *
 *   - approval rank (same as before)
 *   - hasAllPreferred: directive preferTags found in tags OR curation.suitabilityTags
 *   - tagMatches: directive preferTags found in tags + suitabilityTags, minus
 *     antiTags penalty (heavier — see getCurationTagMatchScore)
 *   - priority: contextPriorities[context] ?? globalPriority ?? 50
 *
 * The function still expects the candidate pool to have been pre-filtered
 * through applyCurationContract() — i.e., ineligible assets never reach here.
 */
function assetScoreKey(asset: AssetRecord, context: ImageContext, preferredTags: string[]): ScoreKey {
    const tagMatches = getCurationTagMatchScore(asset, preferredTags);
    const hasAllPreferred = hasAllPreferredTags(asset, preferredTags);
    const createdAt = Date.parse(asset.createdAt);
    return {
        approval: approvalRank(asset),
        hasAllPreferred: hasAllPreferred ? 1 : 0,
        tagMatches,
        priority: getEffectivePriority(asset, context),
        createdAt: Number.isNaN(createdAt) ? 0 : createdAt,
    };
}

function compareAssetScore(a: AssetRecord, b: AssetRecord, context: ImageContext, preferredTags: string[]): number {
    const aKey = assetScoreKey(a, context, preferredTags);
    const bKey = assetScoreKey(b, context, preferredTags);
    if (aKey.approval !== bKey.approval) return bKey.approval - aKey.approval;
    if (aKey.hasAllPreferred !== bKey.hasAllPreferred) return bKey.hasAllPreferred - aKey.hasAllPreferred;
    if (aKey.tagMatches !== bKey.tagMatches) return bKey.tagMatches - aKey.tagMatches;
    if (aKey.priority !== bKey.priority) return bKey.priority - aKey.priority;
    if (aKey.createdAt !== bKey.createdAt) return bKey.createdAt - aKey.createdAt;
    return a.assetId.localeCompare(b.assetId);
}

function selectAsset(
    pool: ManifestImagePool,
    assetType: string,
    context: ImageContext,
    governance: MediaGovernancePolicy,
    preferredTags: string[],
    usedAssetIds: Set<string>,
    slotName: string,
): AssetRecord {
    // Phase 4 (IMAGE_GEN_REVAMP_5-26): every selector must honor the full
    // curation contract. applyCurationContract enforces blockedContexts,
    // approvedContexts, and the approval-state governance gate. Without this
    // step the render pack could silently pick an asset the operator had
    // explicitly blocked from ad surfaces.
    const rawCandidates = poolForAssetType(pool, assetType);
    const eligible = applyCurationContract(rawCandidates, context, governance);
    const candidates = eligible.sort((a, b) => compareAssetScore(a, b, context, preferredTags));
    const candidate = candidates.find((asset) => !usedAssetIds.has(asset.assetId)) ?? candidates[0];
    if (!candidate) {
        throw new Error(`No usable manifest asset found for slot "${slotName}" with assetType "${assetType}" in context "${context}". Either no asset of that type exists in the manifest, every candidate is blocked by media governance (rejected / revision_required / hold), or every candidate has curation that blocks this context (blockedContexts / approvedContexts).`);
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
    context: ImageContext,
    governance: MediaGovernancePolicy,
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
        const asset = selectAsset(pool, directive.assetType, context, governance, preferredTags, usedAssetIds, slot.name);
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

        // Phase 4 (IMAGE_GEN_REVAMP_5-26): every format maps to an ImageContext
        // so the curation contract can be evaluated correctly per format.
        const context = imageContextForAdFormat(format);

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
            const prepared = await buildLayerOverrides(layoutSlots, slotPacks[0], pool, context, governance, args.slug, usedAssetIds, 0);
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
                const prepared = await buildLayerOverrides(layoutSlots, slotPacks[pageIndex], pool, context, governance, args.slug, usedAssetIds, pageIndex);
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
