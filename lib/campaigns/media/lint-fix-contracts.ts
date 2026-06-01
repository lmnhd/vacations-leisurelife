/**
 * Lint Fix Contracts — per-rule definitions for targeted lint-driven brief edits.
 *
 * Each contract describes how to safely repair one lint issue *without* a full
 * brief regeneration:
 *   - mutableFields      → the only LandingStillSpec keys the LLM is allowed to touch
 *   - frozenFields        → keys that must be byte-identical before/after; otherwise reject
 *   - mutableSceneFields  → (optional) SceneSpec keys the LLM may rewrite when the rule
 *                           spans both landing stills and production bible scene specs
 *   - successPredicate   → deterministic check that the proposed patch actually
 *                          clears the originating rule
 *   - buildHint          → the natural-language prompt fragment derived from the lint issue
 */

import type { LandingStillSpec, ProductionBuildLintIssue, SceneSpec } from "../schema";
import { detectCueStrength, extractCompositionFamily } from "./production-build-lint";
import { inferCompositionFamily } from "./source-quality";

export type FixableLintCode =
    | "repeated_composition_family"
    | "rail_table_window_overuse"
    | "weak_niche_signal";

/**
 * Optional runtime context passed to the success predicate and buildHint.
 * Carries lint-evaluation inputs (niche keywords, theme name) that some
 * contracts need to verify their rule is cleared.
 */
export interface FixContractContext {
    nicheKeywords?: string[];
    themeName?: string;
}

export interface FixContract {
    ruleCode: FixableLintCode;
    /** Fields the LLM is allowed to rewrite on the affected landing stills. */
    mutableFields: ReadonlyArray<keyof LandingStillSpec>;
    /** Fields that must be byte-identical between original and patched still. */
    frozenFields: ReadonlyArray<keyof LandingStillSpec>;
    /**
     * When defined, the fixer will ALSO patch SceneSpec records from the
     * production bible. The affected scene IDs are derived by filtering
     * issue.affectedStillIds against sceneLibrary.
     */
    mutableSceneFields?: ReadonlyArray<keyof SceneSpec>;
    /**
     * Deterministic check: given the patched stills + patched scenes, does
     * the originating rule still trigger?
     *
     * Returns true when the rule is cleared.
     */
    successPredicate: (
        patchedAffected: LandingStillSpec[],
        otherStills: LandingStillSpec[],
        patchedAffectedScenes?: SceneSpec[],
        otherScenes?: SceneSpec[],
        context?: FixContractContext,
    ) => boolean;
    /** Human-readable hint fragment to embed in the LLM prompt. */
    buildHint: (
        issue: ProductionBuildLintIssue,
        affected: LandingStillSpec[],
        affectedScenes?: SceneSpec[],
        context?: FixContractContext,
    ) => string;
}

// ── Field policy: repeated_composition_family ────────────────────────────────

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

// ── Field policy: rail_table_window_overuse ──────────────────────────────────

const RAIL_TABLE_WINDOW_MUTABLE: ReadonlyArray<keyof LandingStillSpec> = [
    "location",
    "environmentDetails",
    "composition",
    "subjectAction",
    "imagePrompt",
];

const RAIL_TABLE_WINDOW_FROZEN: ReadonlyArray<keyof LandingStillSpec> = [
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

const RAIL_TABLE_WINDOW_SCENE_MUTABLE: ReadonlyArray<keyof SceneSpec> = [
    "location",
    "subjectAction",
    "environmentDetails",
    "imagePrompt",
];

const RAIL_TABLE_WINDOW_FAMILIES = new Set(["rail", "table", "window"]);
const RAIL_TABLE_WINDOW_CAP = 3;

// ── Field policy: weak_niche_signal ──────────────────────────────────────────
//
// Mutates content-bearing fields so the LLM can inject a niche keyword
// verbatim. nicheCue and nicheCarryThrough are normally frozen on the other
// two contracts, but this rule IS about niche presence — they have to move.
// Location/composition/mood/lighting/timeOfDay are frozen so the still keeps
// its venue and aesthetic identity; only the niche dressing changes.

const WEAK_NICHE_SIGNAL_MUTABLE: ReadonlyArray<keyof LandingStillSpec> = [
    "subjectAction",
    "environmentDetails",
    "imagePrompt",
    "nicheCue",
    "nicheCarryThrough",
];

const WEAK_NICHE_SIGNAL_FROZEN: ReadonlyArray<keyof LandingStillSpec> = [
    "stillId",
    "usage",
    "slotRole",
    "anchorId",
    "shotIntent",
    "mood",
    "lighting",
    "timeOfDay",
    "location",
    "composition",
    "framingMode",
    "cameraDistance",
    "heroSubject",
    "referenceCategory",
    "referencePackId",
    "antiFallbackNote",
];

// ── Contracts registry ────────────────────────────────────────────────────────

export const FIX_CONTRACTS: Readonly<Record<FixableLintCode, FixContract>> = {
    repeated_composition_family: {
        ruleCode: "repeated_composition_family",
        mutableFields: REPEATED_COMPOSITION_MUTABLE,
        frozenFields: REPEATED_COMPOSITION_FROZEN,
        successPredicate: (patchedAffected) => {
            const families = patchedAffected.map((s) => extractCompositionFamily(s));
            return new Set(families).size === families.length;
        },
        buildHint: (issue, affected) => {
            const sharedFamily =
                affected.length > 0 ? extractCompositionFamily(affected[0]!) : "(unknown)";
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

    rail_table_window_overuse: {
        ruleCode: "rail_table_window_overuse",
        mutableFields: RAIL_TABLE_WINDOW_MUTABLE,
        frozenFields: RAIL_TABLE_WINDOW_FROZEN,
        mutableSceneFields: RAIL_TABLE_WINDOW_SCENE_MUTABLE,
        successPredicate: (
            patchedAffectedStills,
            otherStills,
            patchedAffectedScenes = [],
            otherScenes = [],
        ) => {
            const allStills = [...patchedAffectedStills, ...otherStills];
            const allScenes = [...patchedAffectedScenes, ...otherScenes];
            const stillHits = allStills.filter((s) =>
                RAIL_TABLE_WINDOW_FAMILIES.has(
                    inferCompositionFamily({
                        location: s.location,
                        composition: s.composition,
                        imagePrompt: s.imagePrompt,
                    }),
                ),
            ).length;
            const sceneHits = allScenes.filter((s) =>
                RAIL_TABLE_WINDOW_FAMILIES.has(
                    inferCompositionFamily({
                        location: s.location,
                        imagePrompt: s.imagePrompt,
                    }),
                ),
            ).length;
            return stillHits + sceneHits <= RAIL_TABLE_WINDOW_CAP;
        },
        buildHint: (issue, affected, affectedScenes = []) => {
            const totalCount = affected.length + affectedScenes.length;
            return [
                `${totalCount} specs (${affected.length} landing still(s) + ${affectedScenes.length} scene spec(s)) trigger the rail/table/window composition cap.`,
                `Cap rule: no more than ${RAIL_TABLE_WINDOW_CAP} specs in the combined set may infer to the "rail", "table", or "window" composition family.`,
                ``,
                `Your task: rewrite every affected spec so its location/imagePrompt no longer contains the trigger keywords for those three families.`,
                ``,
                `TRIGGER KEYWORDS TO AVOID:`,
                `  rail family   → rail, railing, balcony, promenade`,
                `  window family → window, porthole, stateroom, cabin view, stateroom view`,
                `  table family  → table (alone), cafe table, dining table, bar top, counter`,
                ``,
                `NOTE — these are SAFE substitutions for common offenders:`,
                `  "balcony"   → "open deck terrace" or "solarium level"`,
                `  "stateroom" → "suite living room" or "sea-view suite lounge"`,
                `  "table"     → "dining room" or "restaurant" (the word "table" alone triggers the cap; "dining room" maps to dining_communal which is safe)`,
                ``,
                `TARGET FAMILIES (pick from these for replacement specs):`,
                `  open_deck           → deck, teak, sundeck, stern, bow`,
                `  pool_apron          → pool, cabana, lounger, lido`,
                `  dining_communal     → dining room, restaurant, long table, banquet`,
                `  interior_lounge     → lounge, bar, library, sitting area`,
                `  corridor_architecture → atrium, corridor, lobby`,
                `  nature_overlook     → ocean view, vista, overlook, nature`,
                `  off_ship_excursion  → port, pier, harbor, shore, excursion`,
                `  treatment_room      → spa, sauna, massage, hammam`,
                `  studio_class        → studio, workshop, fitness class`,
                ``,
                `Spread replacement specs across at least 3 distinct target families. Preserve the campaign niche cue in every rewritten imagePrompt.`,
                `Original lint message: ${issue.message}`,
            ].join("\n");
        },
    },

    weak_niche_signal: {
        ruleCode: "weak_niche_signal",
        mutableFields: WEAK_NICHE_SIGNAL_MUTABLE,
        frozenFields: WEAK_NICHE_SIGNAL_FROZEN,
        successPredicate: (patchedAffected, _otherStills, _patchedAffectedScenes, _otherScenes, context) => {
            const nicheKeywords = context?.nicheKeywords ?? [];
            if (nicheKeywords.length === 0) {
                // No keywords to verify against — fall back to "every patched still
                // has a non-empty nicheCarryThrough that appears verbatim in both
                // subjectAction and imagePrompt". This is what the schema implies.
                return patchedAffected.every((s) => {
                    const carry = (s.nicheCarryThrough ?? "").trim().toLowerCase();
                    if (carry.length === 0) return false;
                    return (
                        s.subjectAction.toLowerCase().includes(carry) &&
                        s.imagePrompt.toLowerCase().includes(carry)
                    );
                });
            }
            // Every patched still must now register as 'explicit' under the same
            // detector the lint module uses. This is the exact, byte-aligned
            // verification — if this passes, the rule cannot fire again on these
            // stills with the same keyword set.
            return patchedAffected.every((s) => detectCueStrength(s, nicheKeywords) === "explicit");
        },
        buildHint: (issue, affected, _affectedScenes, context) => {
            const nicheKeywords = context?.nicheKeywords ?? [];
            const themeName = context?.themeName ?? "(unknown)";
            const keywordList = nicheKeywords.length > 0
                ? nicheKeywords.map((k) => `"${k}"`).join(", ")
                : "(no keywords provided — use words from the theme name)";
            return [
                `${affected.length} stills currently have NO legible niche cue. The lint module compares the still's imagePrompt + subjectAction (primary fields) against the campaign's niche keywords using a verbatim substring match. None of these stills passed that check, so the campaign identity isn't visually legible across the set.`,
                ``,
                `Campaign theme name: "${themeName}"`,
                `Niche keywords (the lint expects at least one verbatim substring match in primary fields):`,
                `  ${keywordList}`,
                ``,
                `Your task for each affected still:`,
                `  1. Choose ONE niche keyword from the list above that fits the still's existing scene (location, mood, lighting are FROZEN — pick the keyword that makes sense in that venue).`,
                `  2. Set "nicheCarryThrough" to that exact keyword.`,
                `  3. Rewrite "subjectAction" so it contains the keyword verbatim (case-insensitive). Keep the action believable for the existing location and mood.`,
                `  4. Rewrite "imagePrompt" so it ALSO contains the keyword verbatim. Preserve the existing visual direction (lighting, time of day, camera framing) — only weave the niche element into the scene.`,
                `  5. Set "nicheCue" to a short noun phrase that names the visible niche object/behavior (e.g., "panoramic glass window", "watch on the horizon", "window-seat sea watching").`,
                `  6. Optionally update "environmentDetails" to reinforce the niche atmosphere.`,
                ``,
                `Constraints:`,
                `  - Do not change location, composition, mood, lighting, timeOfDay, framingMode, cameraDistance, heroSubject, slotRole, or anchorId.`,
                `  - The keyword you choose for subjectAction MUST equal the keyword in imagePrompt MUST equal nicheCarryThrough. One word, three appearances, verbatim.`,
                `  - Keep tone subtle — the niche should feel native to the existing scene, not bolted on. A guest "watching the sea through panoramic glass" reads more naturally than "guest doing observatory watcher activities".`,
                `  - Two different stills SHOULD use different keywords when possible — spread the niche evidence across the set rather than repeating one word.`,
                ``,
                `Lint detail: ${issue.details ?? issue.message}`,
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
