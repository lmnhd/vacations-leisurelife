/**
 * Lint Fix Contracts — per-rule definitions for targeted lint-driven brief edits.
 *
 * Each contract describes how to safely repair one lint issue *without* a full
 * brief regeneration:
 *   - mutableFields  → the only LandingStillSpec keys the LLM is allowed to touch
 *   - frozenFields   → keys that must be byte-identical before/after; otherwise reject
 *   - successPredicate → deterministic check that the proposed patch actually
 *                        clears the originating rule
 *   - buildHint      → the natural-language prompt fragment derived from the lint issue
 *
 * Today only `repeated_composition_family` is implemented. Once that loop is
 * proven end-to-end, add the next contracts (`generic_fallback_overuse`,
 * `weak_niche_signal`) by appending entries to FIX_CONTRACTS.
 */

import type { LandingStillSpec, ProductionBuildLintIssue } from "../schema";
import { extractCompositionFamily } from "./production-build-lint";

export type FixableLintCode = "repeated_composition_family";

export interface FixContract {
    ruleCode: FixableLintCode;
    /** Fields the LLM is allowed to rewrite on the affected stills. */
    mutableFields: ReadonlyArray<keyof LandingStillSpec>;
    /** Fields that must be byte-identical between original and patched still. */
    frozenFields: ReadonlyArray<keyof LandingStillSpec>;
    /**
     * Deterministic check: given the patched affected stills + the rest of the
     * library, does the originating rule still trigger?
     *
     * Returns true when the rule is cleared on the affected stills.
     */
    successPredicate: (
        patchedAffected: LandingStillSpec[],
        otherStills: LandingStillSpec[],
    ) => boolean;
    /** Human-readable hint fragment to embed in the LLM prompt. */
    buildHint: (
        issue: ProductionBuildLintIssue,
        affected: LandingStillSpec[],
    ) => string;
}

// ── Field policy used by `repeated_composition_family` ───────────────────────
// The lint hint says "vary location family, subject action, and framing." So
// the LLM may rewrite the location/framing-side fields plus imagePrompt. mood,
// nicheCue, slotRole, anchorId stay frozen so we don't accidentally drift the
// campaign identity or the role mix while fixing a composition collision.

const REPEATED_COMPOSITION_MUTABLE: ReadonlyArray<keyof LandingStillSpec> = [
    "location",
    "environmentDetails",
    "composition",
    "subjectAction",
    "framingMode",
    "cameraDistance",
    "imagePrompt",
];

const REPEATED_COMPOSITION_FROZEN: ReadonlyArray<keyof LandingStillSpec> = [
    "stillId",
    "usage",
    "slotRole",
    "anchorId",
    "shotIntent",
    "mood",
    "lighting",
    "timeOfDay",
    "heroSubject",
    "nicheCue",
    "nicheCarryThrough",
    "referenceCategory",
    "referencePackId",
    "antiFallbackNote",
];

export const FIX_CONTRACTS: Readonly<Record<FixableLintCode, FixContract>> = {
    repeated_composition_family: {
        ruleCode: "repeated_composition_family",
        mutableFields: REPEATED_COMPOSITION_MUTABLE,
        frozenFields: REPEATED_COMPOSITION_FROZEN,
        successPredicate: (patchedAffected) => {
            // Every affected still must end up in a distinct composition family.
            // composition family = location-keyword × action-keyword combo (see
            // production-build-lint.extractCompositionFamily). Rule fires when
            // ≥2 share a family; we want size-1 buckets.
            const families = patchedAffected.map((s) => extractCompositionFamily(s));
            return new Set(families).size === families.length;
        },
        buildHint: (issue, affected) => {
            const sharedFamily =
                affected.length > 0 ? extractCompositionFamily(affected[0]!) : "(unknown)";
            // Composition family is a *combo* of location keyword + action keyword.
            // Give the model the menu of both axes so it knows where to push.
            return [
                `These ${affected.length} stills currently classify into the SAME composition family ("${sharedFamily}").`,
                `Composition family = a (location keyword) × (action keyword) bucket. To break the collision, each affected still must rewrite at least one axis enough to land in a DIFFERENT bucket. Changing both axes is safer.`,
                ``,
                `Location-keyword buckets (pick one different keyword per still and put it in BOTH the location field and the imagePrompt):`,
                `  - rail / railing / balcony`,
                `  - deck / outdoor / lido / pool / solarium / bow / stern`,
                `  - cabin / window / porthole / stateroom / round window`,
                `  - dining / restaurant / dinner / table / meal`,
                `  - lounge / bar / lobby / atrium`,
                `  - promenade`,
                `  - port / shore / dock / pier / harbor`,
                ``,
                `Action-keyword examples to vary the subjectAction/composition axis:`,
                `  - laugh / smile / joy / giggle`,
                `  - chat / talk / converse / whisper`,
                `  - contemplate / gaze / watch / observe / stare`,
                `  - read / book / page / novel`,
                `  - dine / eat / sip / taste`,
                `  - walk / stroll / wander`,
                `  - sit / lounge / lean / rest`,
                `  - dance / move / sway`,
                ``,
                `CRITICAL: This rule fires here as a "warning — thematic consistency" message, but the operator HAS still asked for a fix. Do not skip the patch. Return one patch per affected still, each with at least the location and subjectAction fields rewritten so the four stills land in four distinct composition families.`,
                ``,
                `Preserve the campaign niche cue in the rewritten imagePrompt — only change the staging, not the niche.`,
                `Original lint detail: ${issue.details ?? issue.message}`,
            ].join("\n");
        },
    },
};

export function getFixContract(code: string): FixContract | null {
    return code in FIX_CONTRACTS
        ? FIX_CONTRACTS[code as FixableLintCode]
        : null;
}

export function isFixableLintCode(code: string): code is FixableLintCode {
    return code in FIX_CONTRACTS;
}
