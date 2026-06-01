/**
 * Targeted Lint Fix — narrow, contract-bound brief edits driven by a single
 * production-build-lint issue.
 *
 * Pipeline:
 *   1. Look up the contract for the issue's rule code.
 *   2. Partition affectedStillIds into landing stills vs. scene specs (when the
 *      contract declares mutableSceneFields the rule spans both libraries).
 *   3. Build a constrained LLM prompt: contract, frozen fields, optional
 *      operator guidance.
 *   4. Parse and shape-check the patch via Zod.
 *   5. Frozen-field gate — reject any patch that mutates a frozen still field.
 *   6. Apply patches to trial copies of both libraries.
 *   7. Contract success predicate — reject if the originating rule still fires.
 *   8. Re-run the full lint suite — reject if total issue count regressed.
 *
 * Steps 5–8 all run server-side before the user sees the diff. By the time
 * the API returns, the patch is provably valid against the contract.
 *
 * Use `runTargetedLintFixTrial` for the dry-run; `applyTargetedLintFixPatches`
 * to merge an approved patch into the brief.
 */

import { z } from "zod";
import { ModelName } from "@/lib/ai/llm-gateway";
import { callGlobalGenerateObject } from "@/lib/chat/llm-call";
import type { Campaign } from "../types";
import type {
    CampaignAestheticBrief,
    LandingStillBible,
    LandingStillSpec,
    ProductionBuildLintIssue,
    ProductionBuildLintReport,
    SceneSpec,
} from "../schema";
import { lintProductionBuild } from "./production-build-lint";
import { getExpandedNicheKeywords } from "../reference-packs";
import {
    FIX_CONTRACTS,
    getFixContract,
    isFixableLintCode,
    type FixContract,
    type FixableLintCode,
} from "./lint-fix-contracts";

// ── Public API ──────────────────────────────────────────────────────────────

export interface StillPatch {
    stillId: string;
    [field: string]: string | undefined;
}

export interface ScenePatch {
    sceneId: string;
    [field: string]: string | undefined;
}

function extractPatchFields(patch: StillPatch | ScenePatch, idKey: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) {
        if (k === idKey) continue;
        if (typeof v === "string" && v.length > 0) out[k] = v;
    }
    return out;
}

export type TrialRejectReason =
    | "no_contract"
    | "no_landing_still_bible"
    | "affected_stills_not_found"
    | "model_returned_no_patches"
    | "model_returned_unknown_still_id"
    | "frozen_field_mutated"
    | "rule_not_cleared"
    | "lint_regressed";

export interface TargetedFixTrialResult {
    status: "ok" | "rejected";
    rejectReason?: TrialRejectReason;
    rejectDetail?: string;
    patches?: StillPatch[];
    scenePatches?: ScenePatch[];
    rationale?: string;
    /** Lint verdict + counts before applying the patch. */
    beforeLint?: LintSnapshot;
    /** Lint verdict + counts after applying the patch (only when status='ok'). */
    afterLint?: LintSnapshot;
    /** Landing still diffs for UI preview. */
    diffs?: Array<{
        stillId: string;
        before: LandingStillSpec;
        after: LandingStillSpec;
        mutatedFields: Array<keyof LandingStillSpec>;
    }>;
    /** Scene spec diffs for UI preview. */
    sceneDiffs?: Array<{
        sceneId: string;
        before: SceneSpec;
        after: SceneSpec;
        mutatedFields: Array<keyof SceneSpec>;
    }>;
}

export interface LintSnapshot {
    verdict: ProductionBuildLintReport["verdict"];
    blockerCount: number;
    warningCount: number;
}

// ── Trial ────────────────────────────────────────────────────────────────────

export async function runTargetedLintFixTrial(args: {
    campaign: Campaign;
    brief: CampaignAestheticBrief;
    issue: ProductionBuildLintIssue;
    operatorGuidance?: string;
}): Promise<TargetedFixTrialResult> {
    const { campaign, brief, issue, operatorGuidance } = args;

    // 1. Contract lookup
    if (!isFixableLintCode(issue.code)) {
        return {
            status: "rejected",
            rejectReason: "no_contract",
            rejectDetail: `No targeted-fix contract for rule "${issue.code}". Use Regenerate Brief instead.`,
        };
    }
    const contract = FIX_CONTRACTS[issue.code];

    if (!brief.landingStillBible) {
        return {
            status: "rejected",
            rejectReason: "no_landing_still_bible",
            rejectDetail:
                "Brief has no landingStillBible to patch. Generate the brief first.",
        };
    }

    const library = brief.landingStillBible.stillLibrary;
    const sceneLibrary: SceneSpec[] = brief.productionBible?.sceneLibrary ?? [];

    // 2. Partition affected IDs into stills vs. scene specs
    const affectedStills = library.filter((s) =>
        issue.affectedStillIds.includes(s.stillId),
    );
    const affectedScenes = contract.mutableSceneFields
        ? sceneLibrary.filter((s) => issue.affectedStillIds.includes(s.sceneId))
        : [];

    if (contract.mutableSceneFields) {
        // Mixed contract (stills + scenes) — require at least one ID found in either library
        if (affectedStills.length === 0 && affectedScenes.length === 0) {
            return {
                status: "rejected",
                rejectReason: "affected_stills_not_found",
                rejectDetail: `Issue references IDs [${issue.affectedStillIds.join(", ")}] but none were found in the still library or scene library. The brief may have been regenerated since this issue was reported.`,
            };
        }
    } else {
        // Still-only contract — require all affected IDs to exist in stillLibrary
        if (affectedStills.length === 0 || affectedStills.length !== issue.affectedStillIds.length) {
            return {
                status: "rejected",
                rejectReason: "affected_stills_not_found",
                rejectDetail: `Issue references stillIds [${issue.affectedStillIds.join(", ")}] but only ${affectedStills.length} were found in the bible. The brief may have been regenerated since this issue was reported.`,
            };
        }
    }

    // 3. Snapshot the "before" lint state
    const beforeLint = snapshotLint(
        lintProductionBuild({
            landingStillBible: brief.landingStillBible,
            productionBible: brief.productionBible,
            themeName: campaign.name,
            nicheKeywords: getExpandedNicheKeywords(campaign),
        }),
    );

    // 4. LLM call
    const isMixed = contract.mutableSceneFields != null && affectedScenes.length > 0;
    const responseSchema = buildPatchResponseSchema(contract, isMixed);
    const system = buildSystemPrompt(contract, issue, affectedStills, affectedScenes, operatorGuidance, {
        nicheKeywords: getExpandedNicheKeywords(campaign),
        themeName: campaign.name,
    });
    const prompt = buildUserPrompt(campaign, brief, affectedStills, affectedScenes);

    console.log(
        `[targeted-lint-fix] trial ${issue.code} for ${campaign.id} on stills:[${affectedStills.map(s => s.stillId).join(", ")}] scenes:[${affectedScenes.map(s => s.sceneId).join(", ")}]${operatorGuidance ? " with operator guidance" : ""}`,
    );

    const { object } = await callGlobalGenerateObject({
        modelName: ModelName.GPT_5_MEDIUM,
        schema: responseSchema,
        system,
        prompt,
        maxOutputTokens: 4000,
        skipRepair: true,
        operationName: `targeted-lint-fix:${issue.code}:${campaign.id}`,
    });
    const response = object as unknown as {
        patches: StillPatch[];
        scenePatches?: ScenePatch[];
        rationale: string;
    };

    if (response.patches.length === 0 && (!response.scenePatches || response.scenePatches.length === 0)) {
        const rationaleEcho = response.rationale?.trim().length
            ? ` Model rationale: "${response.rationale.trim()}"`
            : ` (Model returned no rationale.)`;
        return {
            status: "rejected",
            rejectReason: "model_returned_no_patches",
            rejectDetail:
                `Model returned no patches.${rationaleEcho}` +
                ` Try again with more specific guidance, or use Regenerate Brief.`,
            rationale: response.rationale,
            beforeLint,
        };
    }

    // 5. Still patch ↔ affected-still id check
    const affectedById = new Map(affectedStills.map((s) => [s.stillId, s]));
    for (const patch of response.patches) {
        if (!affectedById.has(patch.stillId)) {
            return {
                status: "rejected",
                rejectReason: "model_returned_unknown_still_id",
                rejectDetail: `Patch targets stillId="${patch.stillId}" which is not in the affected set. Affected stills: ${affectedStills.map(s => s.stillId).join(", ")}.`,
                beforeLint,
            };
        }
    }

    // 6. Apply patches to TRIAL copies of both libraries
    const trialLibrary = applyStillPatchesPure(library, response.patches);
    const trialSceneLibrary = isMixed && response.scenePatches
        ? applyScenePatchesPure(sceneLibrary, response.scenePatches)
        : sceneLibrary;

    // 7. Frozen-field gate for stills
    const frozenViolations: string[] = [];
    for (const stillId of affectedStills.map(s => s.stillId)) {
        const before = affectedById.get(stillId)!;
        const after = trialLibrary.find((s) => s.stillId === stillId);
        if (!after) continue;
        for (const field of contract.frozenFields) {
            if (!shallowEqualField(before[field], after[field])) {
                frozenViolations.push(`${stillId}.${String(field)}`);
            }
        }
    }
    if (frozenViolations.length > 0) {
        return {
            status: "rejected",
            rejectReason: "frozen_field_mutated",
            rejectDetail: `Model attempted to change frozen fields: ${frozenViolations.join(", ")}. Try again or regenerate.`,
            beforeLint,
        };
    }

    // 8. Contract success predicate
    const patchedAffectedStills = affectedStills.map(s => trialLibrary.find(t => t.stillId === s.stillId)!);
    const otherStills = trialLibrary.filter(s => !affectedStills.some(a => a.stillId === s.stillId));
    const patchedAffectedScenes = affectedScenes.map(s => trialSceneLibrary.find(t => t.sceneId === s.sceneId)!);
    const otherScenes = trialSceneLibrary.filter(s => !affectedScenes.some(a => a.sceneId === s.sceneId));

    const fixContext = {
        nicheKeywords: getExpandedNicheKeywords(campaign),
        themeName: campaign.name,
    };
    if (!contract.successPredicate(patchedAffectedStills, otherStills, patchedAffectedScenes, otherScenes, fixContext)) {
        return {
            status: "rejected",
            rejectReason: "rule_not_cleared",
            rejectDetail: `Patch did not clear "${issue.code}". The affected specs are still in the same composition family. Try again with stronger guidance, or use Regenerate Brief.`,
            beforeLint,
        };
    }

    // 9. Re-run the full lint suite — block if it regressed
    const trialBible: LandingStillBible = {
        ...brief.landingStillBible,
        stillLibrary: trialLibrary,
    };
    const trialProductionBible = isMixed && brief.productionBible
        ? { ...brief.productionBible, sceneLibrary: trialSceneLibrary }
        : brief.productionBible;

    const afterReport = lintProductionBuild({
        landingStillBible: trialBible,
        productionBible: trialProductionBible,
        themeName: campaign.name,
        nicheKeywords: getExpandedNicheKeywords(campaign),
    });
    const afterLint = snapshotLint(afterReport);

    const beforeTotal = beforeLint.blockerCount + beforeLint.warningCount;
    const afterTotal = afterLint.blockerCount + afterLint.warningCount;
    if (afterTotal > beforeTotal) {
        const newIssues = [...afterReport.blockingIssues, ...afterReport.warnings]
            .map((i) => `[${i.severity}] ${i.code}: ${i.message}`)
            .join(" | ");
        return {
            status: "rejected",
            rejectReason: "lint_regressed",
            rejectDetail: `Applying the patch would add ${afterTotal - beforeTotal} new lint issue(s): ${newIssues}`,
            beforeLint,
            afterLint,
        };
    }

    // 10. Build diffs for the preview UI
    const diffs = response.patches.map((patch) => {
        const before = affectedById.get(patch.stillId)!;
        const after = trialLibrary.find((s) => s.stillId === patch.stillId)!;
        const patchFields = extractPatchFields(patch, "stillId");
        const mutatedFields = (Object.keys(patchFields) as Array<keyof LandingStillSpec>).filter(
            (field) => !shallowEqualField(before[field], after[field]),
        );
        return { stillId: patch.stillId, before, after, mutatedFields };
    });

    const affectedScenesById = new Map(affectedScenes.map(s => [s.sceneId, s]));
    const sceneDiffs = (response.scenePatches ?? []).map((patch) => {
        const before = affectedScenesById.get(patch.sceneId)!;
        const after = trialSceneLibrary.find((s) => s.sceneId === patch.sceneId)!;
        if (!before || !after) return null;
        const patchFields = extractPatchFields(patch, "sceneId");
        const mutatedFields = (Object.keys(patchFields) as Array<keyof SceneSpec>).filter(
            (field) => !shallowEqualField(before[field], after[field]),
        );
        return { sceneId: patch.sceneId, before, after, mutatedFields };
    }).filter((d): d is NonNullable<typeof d> => d !== null);

    return {
        status: "ok",
        patches: response.patches,
        scenePatches: response.scenePatches,
        rationale: response.rationale,
        beforeLint,
        afterLint,
        diffs,
        sceneDiffs,
    };
}

// ── Apply ────────────────────────────────────────────────────────────────────

export function applyTargetedLintFixPatches(
    brief: CampaignAestheticBrief,
    patches: StillPatch[],
    scenePatches?: ScenePatch[],
): CampaignAestheticBrief {
    if (!brief.landingStillBible) {
        throw new Error(
            "Cannot apply targeted lint fix: brief has no landingStillBible.",
        );
    }
    const newLibrary = applyStillPatchesPure(brief.landingStillBible.stillLibrary, patches);
    const withStills: CampaignAestheticBrief = {
        ...brief,
        landingStillBible: {
            ...brief.landingStillBible,
            stillLibrary: newLibrary,
        },
    };

    if (scenePatches && scenePatches.length > 0 && withStills.productionBible) {
        return {
            ...withStills,
            productionBible: {
                ...withStills.productionBible,
                sceneLibrary: applyScenePatchesPure(
                    withStills.productionBible.sceneLibrary,
                    scenePatches,
                ),
            },
        };
    }
    return withStills;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function applyStillPatchesPure(
    library: LandingStillSpec[],
    patches: StillPatch[],
): LandingStillSpec[] {
    const patchById = new Map(patches.map((p) => [p.stillId, p]));
    return library.map((still) => {
        const patch = patchById.get(still.stillId);
        if (!patch) return still;
        const overrides = extractPatchFields(patch, "stillId");
        return { ...still, ...overrides };
    });
}

function applyScenePatchesPure(
    library: SceneSpec[],
    patches: ScenePatch[],
): SceneSpec[] {
    const patchById = new Map(patches.map((p) => [p.sceneId, p]));
    return library.map((scene) => {
        const patch = patchById.get(scene.sceneId);
        if (!patch) return scene;
        const overrides = extractPatchFields(patch, "sceneId");
        return { ...scene, ...overrides };
    });
}

function snapshotLint(report: ProductionBuildLintReport): LintSnapshot {
    return {
        verdict: report.verdict,
        blockerCount: report.blockingIssues.length,
        warningCount: report.warnings.length,
    };
}

function shallowEqualField(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (typeof a !== typeof b) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    return false;
}

function buildPatchResponseSchema(contract: FixContract, isMixed: boolean) {
    const patchShape: Record<string, z.ZodTypeAny> = { stillId: z.string() };
    for (const field of contract.mutableFields) {
        patchShape[field] = z.string().optional();
    }
    const base = z.object({
        patches: z.array(z.object(patchShape)).default([]),
        rationale: z.string().default(""),
    });

    if (!isMixed || !contract.mutableSceneFields) return base;

    const sceneShape: Record<string, z.ZodTypeAny> = { sceneId: z.string() };
    for (const field of contract.mutableSceneFields) {
        sceneShape[field] = z.string().optional();
    }
    return base.extend({
        scenePatches: z.array(z.object(sceneShape)).default([]),
    });
}

function buildSystemPrompt(
    contract: FixContract,
    issue: ProductionBuildLintIssue,
    affected: LandingStillSpec[],
    affectedScenes: SceneSpec[],
    operatorGuidance?: string,
    context?: { nicheKeywords?: string[]; themeName?: string },
): string {
    const hint = contract.buildHint(issue, affected, affectedScenes, context);
    const mutableList = contract.mutableFields.map((f) => `"${String(f)}"`).join(", ");
    const frozenList = contract.frozenFields.map((f) => `"${String(f)}"`).join(", ");
    const isMixed = affectedScenes.length > 0 && contract.mutableSceneFields != null;

    const lines = [
        `You are repairing one specific lint issue on a campaign brief.`,
        `The fix is targeted: you may only rewrite the affected specs, and only the listed mutable fields.`,
        ``,
        `RULE: ${issue.code} (${issue.severity})`,
        hint,
        ``,
        `LANDING STILL MUTABLE FIELDS (you may rewrite these): ${mutableList}.`,
        `LANDING STILL FROZEN FIELDS (must NOT change): ${frozenList}.`,
    ];

    if (isMixed && contract.mutableSceneFields) {
        const sceneMutableList = contract.mutableSceneFields.map((f) => `"${String(f)}"`).join(", ");
        lines.push(`SCENE SPEC MUTABLE FIELDS (you may rewrite these): ${sceneMutableList}.`);
        lines.push(`SCENE SPEC FROZEN FIELDS (must NOT change): sceneId, timeOfDay, lighting, cameraAngle, mood, referenceCategory, referenceAssetIds, mustPreserveShipFeatures.`);
    }

    lines.push(
        ``,
        `OUTPUT REQUIREMENTS:`,
        `  1. Return one "patches" entry per affected landing still: ${affected.map(s => s.stillId).join(", ") || "(none)"}.`,
    );

    if (isMixed) {
        lines.push(`  2. Return one "scenePatches" entry per affected scene spec: ${affectedScenes.map(s => s.sceneId).join(", ")}.`);
        lines.push(`  3. An empty patches AND scenePatches is NEVER acceptable — the operator has asked for a fix.`);
    } else {
        lines.push(`  2. An empty patches array is NEVER acceptable.`);
    }

    lines.push(
        `  Each patch must be a FLAT object: { "stillId": "...", "location": "...", ... } — do NOT nest fields.`,
        `  Each scenePatch must be: { "sceneId": "...", "location": "...", ... } — same flat shape.`,
        `  Include only fields you actually changed. Omit unchanged fields.`,
        `Provide a one-sentence rationale describing the structural change.`,
    );

    if (operatorGuidance && operatorGuidance.trim().length > 0) {
        lines.push(
            ``,
            `OPERATOR GUIDANCE (creative direction):`,
            operatorGuidance.trim(),
            `Treat operator guidance as creative direction. If it conflicts with mutable/frozen constraints, note the conflict in your rationale.`,
        );
    }

    return lines.filter((line) => line !== undefined).join("\n");
}

function buildUserPrompt(
    campaign: Campaign,
    brief: CampaignAestheticBrief,
    affected: LandingStillSpec[],
    affectedScenes: SceneSpec[],
): string {
    const allStills = brief.landingStillBible?.stillLibrary ?? [];
    const otherStillsSummary = allStills
        .filter((s) => !affected.find((a) => a.stillId === s.stillId))
        .map(
            (s) =>
                `  ${s.stillId} (${s.slotRole ?? s.usage}) — location: ${s.location} — subjectAction: ${s.subjectAction}`,
        )
        .join("\n");

    const affectedDump = affected
        .map((s) =>
            [
                `stillId: ${s.stillId}`,
                `  slotRole: ${s.slotRole ?? s.usage}`,
                `  location: ${s.location}`,
                `  environmentDetails: ${s.environmentDetails}`,
                `  composition: ${s.composition}`,
                `  subjectAction: ${s.subjectAction}`,
                `  framingMode: ${s.framingMode ?? "(unset)"}`,
                `  cameraDistance: ${s.cameraDistance ?? "(unset)"}`,
                `  mood: ${s.mood}`,
                `  nicheCue: ${s.nicheCue ?? "(unset)"} — must stay unchanged`,
                `  imagePrompt: ${s.imagePrompt}`,
            ].join("\n"),
        )
        .join("\n\n");

    const parts = [
        `Campaign: ${campaign.name}`,
        `Aesthetic: ${campaign.aesthetic ?? "(unset)"}`,
        ``,
        `OTHER STILLS IN THE SET (do not repeat their location families):`,
        otherStillsSummary || "  (none)",
        ``,
        `AFFECTED LANDING STILLS (rewrite each into a distinct location family):`,
        affectedDump || "  (none)",
    ];

    if (affectedScenes.length > 0) {
        const allScenes = brief.productionBible?.sceneLibrary ?? [];
        const otherScenesSummary = allScenes
            .filter((s) => !affectedScenes.find((a) => a.sceneId === s.sceneId))
            .map((s) => `  ${s.sceneId} — location: ${s.location}`)
            .join("\n");

        const affectedScenesDump = affectedScenes
            .map((s) =>
                [
                    `sceneId: ${s.sceneId}`,
                    `  location: ${s.location}`,
                    `  environmentDetails: ${s.environmentDetails}`,
                    `  subjectAction: ${s.subjectAction}`,
                    `  mood: ${s.mood} — must stay unchanged`,
                    `  timeOfDay: ${s.timeOfDay} — must stay unchanged`,
                    `  imagePrompt: ${s.imagePrompt}`,
                ].join("\n"),
            )
            .join("\n\n");

        parts.push(
            ``,
            `OTHER SCENES (do not repeat their location families):`,
            otherScenesSummary || "  (none)",
            ``,
            `AFFECTED SCENE SPECS (rewrite each so location/imagePrompt avoids rail/table/window keywords):`,
            affectedScenesDump,
        );
    }

    return parts.join("\n");
}
