// lib/campaigns/media/curation-contract.ts
//
// Phase 4 (IMAGE_GEN_REVAMP_5-26): single canonical entry point for honoring
// the full curation contract across every image selector.
//
// The contract spans six AssetCuration fields:
//   - approvalState (gated by governance)
//   - approvedContexts  (allowlist)
//   - blockedContexts   (blocklist)
//   - contextPriorities (per-context priority override)
//   - globalPriority    (fallback priority)
//   - suitabilityTags + antiTags (positive/negative cues per context)
//
// Before Phase 4, image-selection.ts already implemented this contract for
// landing and platform-crop selectors. The ad render pack did not — it only
// honored approvalState + globalPriority + directive preferTags. This module
// gives the ad render pack (and any future selector) the same contract.
//
// Every selector that picks images for an operator-visible surface must call
// applyCurationContract() before scoring or picking.

import type { AssetCuration, AssetRecord, ImageContext, MediaGovernancePolicy } from '../schema';
import { normalizeAssetCuration } from './image-selection';

const DEFAULT_GOVERNANCE: MediaGovernancePolicy = {
    imageSelectionMode: 'approved_if_any_else_fallback',
    revisionRequiredBlocksUsage: true,
    rejectedBlocksUsage: true,
    holdBlocksUsage: true,
    pendingReviewBlocksWhenLocked: true,
};

function isBlockedByApprovalState(curation: AssetCuration, governance: MediaGovernancePolicy): boolean {
    if (governance.rejectedBlocksUsage && curation.approvalState === 'rejected') return true;
    if (governance.revisionRequiredBlocksUsage && curation.approvalState === 'revision_required') return true;
    if (governance.holdBlocksUsage && curation.approvalState === 'hold') return true;
    if (governance.pendingReviewBlocksWhenLocked && curation.downstreamLocked && curation.approvalState === 'pending_review') return true;
    return false;
}

/**
 * Returns true when this asset is eligible to be selected for the given
 * ImageContext under the governance policy. Honors:
 *   - record.active
 *   - approvalState block (rejected / revision_required / hold / locked pending)
 *   - blockedContexts (blocklist)
 *   - approvedContexts (allowlist when non-empty)
 *
 * This is the single source of truth for "is this asset usable here?".
 */
export function isAssetEligibleForContext(
    asset: AssetRecord,
    context: ImageContext,
    governance: MediaGovernancePolicy = DEFAULT_GOVERNANCE,
): boolean {
    if (!asset.active) return false;
    const curation = normalizeAssetCuration(asset);
    if (isBlockedByApprovalState(curation, governance)) return false;
    if (curation.blockedContexts.includes(context)) return false;
    if (curation.approvedContexts.length > 0 && !curation.approvedContexts.includes(context)) return false;
    return true;
}

/**
 * Filter a candidate pool down to the assets eligible for this context under
 * the governance policy. Use this BEFORE any selector-specific scoring.
 *
 * This is the function every selector must call. The audit named it
 * `applyCurationContract` (06_WORKFLOW_DRIFT_AUDIT_REPORT.md § Finding 11).
 */
export function applyCurationContract(
    candidates: readonly AssetRecord[],
    context: ImageContext,
    governance: MediaGovernancePolicy = DEFAULT_GOVERNANCE,
): AssetRecord[] {
    return candidates.filter((c) => isAssetEligibleForContext(c, context, governance));
}

/**
 * The per-context effective priority for an asset.
 *   contextPriorities[context] overrides globalPriority when set.
 *   globalPriority is the fallback. Default is 50 when curation is absent.
 *
 * Selectors should use this instead of reading globalPriority directly so
 * operator-set context overrides actually take effect.
 */
export function getEffectivePriority(asset: AssetRecord, context: ImageContext): number {
    const curation = asset.curation;
    if (!curation) return 50;
    const ctxPriority = curation.contextPriorities?.[context];
    if (typeof ctxPriority === 'number') return ctxPriority;
    return curation.globalPriority ?? 50;
}

function lowercase(tags: readonly string[] | undefined): string[] {
    return (tags ?? []).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
}

/**
 * Score how well an asset matches a directive's preferTags, treating
 * `record.tags` and `curation.suitabilityTags` as a unified positive tag
 * space, and `curation.antiTags` as the negative space.
 *
 * Each preferTag match adds +1 if found in tags or suitabilityTags.
 * Each preferTag found in antiTags subtracts 2 (penalty is heavier than match).
 *
 * Returns a signed integer; higher is better.
 */
export function getCurationTagMatchScore(asset: AssetRecord, preferTags: readonly string[]): number {
    if (preferTags.length === 0) return 0;
    const wanted = lowercase(preferTags);
    const tags = new Set([
        ...lowercase(asset.tags),
        ...lowercase(asset.curation?.suitabilityTags),
    ]);
    const antis = new Set(lowercase(asset.curation?.antiTags));
    let score = 0;
    for (const want of wanted) {
        if (tags.has(want)) score += 1;
        if (antis.has(want)) score -= 2;
    }
    return score;
}

/** Convenience: do all wanted preferTags appear in tags or suitabilityTags? */
export function hasAllPreferredTags(asset: AssetRecord, preferTags: readonly string[]): boolean {
    if (preferTags.length === 0) return false;
    const wanted = lowercase(preferTags);
    const tags = new Set([
        ...lowercase(asset.tags),
        ...lowercase(asset.curation?.suitabilityTags),
    ]);
    return wanted.every((w) => tags.has(w));
}
