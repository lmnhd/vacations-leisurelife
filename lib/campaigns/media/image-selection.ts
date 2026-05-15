import {
    AssetApprovalState,
    AssetRecord,
    AssetCuration,
    CampaignMediaManifest,
    ImageContext,
    MediaGovernancePolicy,
} from '../schema';

const DEFAULT_GOVERNANCE: MediaGovernancePolicy = {
    imageSelectionMode: 'approved_if_any_else_fallback',
    revisionRequiredBlocksUsage: true,
    rejectedBlocksUsage: true,
    holdBlocksUsage: true,
    pendingReviewBlocksWhenLocked: true,
};

const CONTEXT_PREFERENCES: Record<ImageContext, { preferTags: string[]; avoidTags: string[] }> = {
    landing_hero_primary: {
        preferTags: ['minimal', 'headline-safe', 'travel-first', 'ocean-forward', 'quiet', 'iconic'],
        avoidTags: ['busy', 'interior-heavy', 'workshop-like', 'literal-activity', 'crowded'],
    },
    landing_hero_alt: {
        preferTags: ['travel-first', 'ocean-forward', 'calm', 'cinematic'],
        avoidTags: ['busy', 'crowded', 'workshop-like'],
    },
    waitlist_page_hero: {
        preferTags: ['travel-first', 'welcoming', 'hopeful', 'clean'],
        avoidTags: ['busy', 'dark', 'crowded'],
    },
    email_header: {
        preferTags: ['wide', 'clean', 'headline-safe', 'brandable'],
        avoidTags: ['busy', 'tiny-subject', 'cluttered'],
    },
    meta_ad_creative: {
        preferTags: ['eye-catching', 'travel-first', 'clear-subject'],
        avoidTags: ['busy', 'muddy', 'overloaded'],
    },
    instagram_cover: {
        preferTags: ['graphic', 'clear-subject', 'bright', 'social-ready'],
        avoidTags: ['busy', 'flat'],
    },
    storyboard_fallback: {
        preferTags: ['readable', 'ship-identity', 'contextual'],
        avoidTags: ['headline-safe'],
    },
    explainer_backplate: {
        preferTags: ['clean', 'background-friendly', 'wide'],
        avoidTags: ['busy', 'high-detail-clutter'],
    },
    general_moodboard: {
        preferTags: ['aesthetic', 'theme-true', 'expressive'],
        avoidTags: ['off-brief'],
    },
};

function deriveApprovalState(asset: AssetRecord): AssetApprovalState {
    if (asset.reviewStatus === 'human_approved') return 'human_approved';
    if (asset.reviewStatus === 'auto_approved') return 'auto_approved';
    return 'pending_review';
}

export function normalizeAssetCuration(asset: AssetRecord): AssetCuration {
    const existing = asset.curation;
    return {
        approvalState: existing?.approvalState ?? deriveApprovalState(asset),
        globalPriority: existing?.globalPriority ?? 50,
        contextPriorities: existing?.contextPriorities ?? {},
        approvedContexts: existing?.approvedContexts ?? [],
        blockedContexts: existing?.blockedContexts ?? [],
        suitabilityTags: existing?.suitabilityTags ?? [],
        antiTags: existing?.antiTags ?? [],
        downstreamLocked: existing?.downstreamLocked ?? false,
        generationLocked: existing?.generationLocked ?? false,
        curatorNotes: existing?.curatorNotes,
        updatedAt: existing?.updatedAt ?? asset.reviewedAt ?? asset.createdAt,
    };
}

function getGovernance(manifest?: CampaignMediaManifest | null): MediaGovernancePolicy {
    return {
        ...DEFAULT_GOVERNANCE,
        ...(manifest?.governance ?? {}),
    };
}

function isBlockedByApprovalState(curation: AssetCuration, governance: MediaGovernancePolicy): boolean {
    if (governance.rejectedBlocksUsage && curation.approvalState === 'rejected') return true;
    if (governance.revisionRequiredBlocksUsage && curation.approvalState === 'revision_required') return true;
    if (governance.holdBlocksUsage && curation.approvalState === 'hold') return true;
    if (governance.pendingReviewBlocksWhenLocked && curation.downstreamLocked && curation.approvalState === 'pending_review') return true;
    return false;
}

function isEligibleForContext(asset: AssetRecord, context: ImageContext, governance: MediaGovernancePolicy): boolean {
    if (!asset.active) return false;
    const curation = normalizeAssetCuration(asset);
    if (isBlockedByApprovalState(curation, governance)) return false;
    if (curation.blockedContexts.includes(context)) return false;
    if (curation.approvedContexts.length > 0 && !curation.approvedContexts.includes(context)) return false;
    return true;
}

function countTagMatches(tags: string[], wanted: string[]): number {
    const normalizedTags = tags.map((tag) => tag.toLowerCase());
    return wanted.filter((tag) => normalizedTags.includes(tag.toLowerCase())).length;
}

export function scoreAssetForContext(asset: AssetRecord, context: ImageContext): number {
    const curation = normalizeAssetCuration(asset);
    const prefs = CONTEXT_PREFERENCES[context];
    const priorityForContext = curation.contextPriorities[context] ?? curation.globalPriority;
    const suitabilityMatches = countTagMatches(curation.suitabilityTags, prefs.preferTags);
    const antiMatches = countTagMatches(curation.antiTags, prefs.avoidTags);

    let approvalWeight = 0;
    if (curation.approvalState === 'human_approved') approvalWeight = 3;
    else if (curation.approvalState === 'auto_approved') approvalWeight = 2;
    else if (curation.approvalState === 'pending_review') approvalWeight = 1;

    return (approvalWeight * 1000)
        + (priorityForContext * 10)
        + (curation.globalPriority)
        + (suitabilityMatches * 25)
        - (antiMatches * 30);
}

export function selectAssetsForContext(
    records: AssetRecord[],
    context: ImageContext,
    manifest?: CampaignMediaManifest | null,
    maxCount: number = 1,
): AssetRecord[] {
    const governance = getGovernance(manifest);
    const eligible = records.filter((record) => isEligibleForContext(record, context, governance));
    if (eligible.length === 0) return [];

    let pool = eligible;
    const humanApproved = eligible.filter((record) => normalizeAssetCuration(record).approvalState === 'human_approved');

    if (governance.imageSelectionMode === 'approved_only') {
        pool = humanApproved;
    } else if (governance.imageSelectionMode === 'approved_if_any_else_fallback' && humanApproved.length > 0) {
        pool = humanApproved;
    }

    return [...pool]
        .sort((left, right) => scoreAssetForContext(right, context) - scoreAssetForContext(left, context))
        .slice(0, maxCount);
}

export function selectPreferredAssetForContext(
    records: AssetRecord[],
    context: ImageContext,
    manifest?: CampaignMediaManifest | null,
): AssetRecord | null {
    return selectAssetsForContext(records, context, manifest, 1)[0] ?? null;
}
