/**
 * Targeted Lint Fix — narrow, contract-bound brief edits driven by a single
 * production-build-lint issue.
 *
 * Pipeline:
 *   1. Look up the contract for the issue's rule code.
 *   2. Build a constrained LLM prompt: contract, frozen fields, optional
 *      operator guidance.
 *   3. Parse and shape-check the patch via Zod.
 *   4. Frozen-field gate — reject any patch that mutates a frozen field.
 *   5. Apply patch to a trial copy of the bible's stillLibrary.
 *   6. Contract success predicate — reject if the originating rule still fires.
 *   7. Re-run the full lint suite — reject if total issue count regressed.
 *
 * Steps 4–7 all run server-side before the user sees the diff. By the time
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

/**
 * Flat shape — stillId plus any mutable LandingStillSpec fields the model
 * decided to rewrite. Nested-`fields` shapes confuse small models and trigger
 * Zod retries in the gateway; keeping everything at one level matches what
 * structured-output endpoints emit naturally.
 */
export interface StillPatch {
    stillId: string;
    [field: string]: string | undefined;
}

function extractPatchFields(patch: StillPatch): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) {
        if (k === "stillId") continue;
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
    rationale?: string;
    /** Lint verdict + counts before applying the patch. */
    beforeLint?: LintSnapshot;
    /** Lint verdict + counts after applying the patch (only when status='ok'). */
    afterLint?: LintSnapshot;
    /** Affected still ids in original + patched form, for UI diffing. */
    diffs?: Array<{
        stillId: string;
        before: LandingStillSpec;
        after: LandingStillSpec;
        mutatedFields: Array<keyof LandingStillSpec>;
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
    const affectedStills = library.filter((s) =>
        issue.affectedStillIds.includes(s.stillId),
    );
    if (affectedStills.length === 0 || affectedStills.length !== issue.affectedStillIds.length) {
        return {
            status: "rejected",
            rejectReason: "affected_stills_not_found",
            rejectDetail: `Issue references stillIds [${issue.affectedStillIds.join(", ")}] but only ${affectedStills.length} were found in the bible. The brief may have been regenerated since this issue was reported.`,
        };
    }

    // 2. Snapshot the "before" lint state
    const beforeLint = snapshotLint(
        lintProductionBuild({
            landingStillBible: brief.landingStillBible,
            productionBible: brief.productionBible,
            themeName: campaign.name,
            nicheKeywords: getExpandedNicheKeywords(campaign),
        }),
    );

    // 3. LLM call
    const responseSchema = buildPatchResponseSchema(contract);
    const system = buildSystemPrompt(contract, issue, affectedStills, operatorGuidance);
    const prompt = buildUserPrompt(campaign, brief, affectedStills);

    console.log(
        `[targeted-lint-fix] trial ${issue.code} for ${campaign.id} on [${issue.affectedStillIds.join(", ")}]${operatorGuidance ? " with operator guidance" : ""}`,
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
    // Cast through unknown — the per-contract schema yields a shape Zod can't
    // narrow precisely, but every patch is guaranteed to have `stillId: string`
    // plus optional string fields from contract.mutableFields.
    const response = object as unknown as {
        patches: StillPatch[];
        rationale: string;
    };

    if (response.patches.length === 0) {
        const rationaleEcho = response.rationale?.trim().length
            ? ` Model rationale: "${response.rationale.trim()}"`
            : ` (Model returned no rationale.)`;
        return {
            status: "rejected",
            rejectReason: "model_returned_no_patches",
            rejectDetail:
                `Model returned an empty patches array.${rationaleEcho}` +
                ` Try again with more specific guidance (e.g. tell it which still should move to which location), or use Regenerate Brief.`,
            rationale: response.rationale,
            beforeLint,
        };
    }

    // 4. Patch ↔ affected-still id check
    const affectedById = new Map(affectedStills.map((s) => [s.stillId, s]));
    for (const patch of response.patches) {
        if (!affectedById.has(patch.stillId)) {
            return {
                status: "rejected",
                rejectReason: "model_returned_unknown_still_id",
                rejectDetail: `Patch targets stillId="${patch.stillId}" which is not in the affected set. Affected: ${issue.affectedStillIds.join(", ")}.`,
                beforeLint,
            };
        }
    }

    // 5. Apply patches to a TRIAL copy of the library
    const trialLibrary = applyPatchesPure(library, response.patches);

    // 6. Frozen-field gate — every frozen field must equal its original value
    const frozenViolations: string[] = [];
    for (const stillId of issue.affectedStillIds) {
        const before = affectedById.get(stillId)!;
        const after = trialLibrary.find((s) => s.stillId === stillId);
        if (!after) continue; // shouldn't happen, but defensive
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

    // 7. Contract success predicate — did the rule actually clear?
    const patchedAffected = issue.affectedStillIds.map(
        (id) => trialLibrary.find((s) => s.stillId === id)!,
    );
    const otherStills = trialLibrary.filter(
        (s) => !issue.affectedStillIds.includes(s.stillId),
    );
    if (!contract.successPredicate(patchedAffected, otherStills)) {
        return {
            status: "rejected",
            rejectReason: "rule_not_cleared",
            rejectDetail: `Patch did not clear "${issue.code}". The affected stills are still in the same composition family. Try again with stronger guidance, or use Regenerate Brief.`,
            beforeLint,
        };
    }

    // 8. Re-run the full lint suite — block if it regressed
    const trialBible: LandingStillBible = {
        ...brief.landingStillBible,
        stillLibrary: trialLibrary,
    };
    const afterReport = lintProductionBuild({
        landingStillBible: trialBible,
        productionBible: brief.productionBible,
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

    // 9. Build diffs for the preview UI
    const diffs = response.patches.map((patch) => {
        const before = affectedById.get(patch.stillId)!;
        const after = trialLibrary.find((s) => s.stillId === patch.stillId)!;
        const patchFields = extractPatchFields(patch);
        const mutatedFields = (Object.keys(patchFields) as Array<keyof LandingStillSpec>).filter(
            (field) => !shallowEqualField(before[field], after[field]),
        );
        return { stillId: patch.stillId, before, after, mutatedFields };
    });

    return {
        status: "ok",
        patches: response.patches,
        rationale: response.rationale,
        beforeLint,
        afterLint,
        diffs,
    };
}

// ── Apply ────────────────────────────────────────────────────────────────────

export function applyTargetedLintFixPatches(
    brief: CampaignAestheticBrief,
    patches: StillPatch[],
): CampaignAestheticBrief {
    if (!brief.landingStillBible) {
        throw new Error(
            "Cannot apply targeted lint fix: brief has no landingStillBible.",
        );
    }
    const newLibrary = applyPatchesPure(brief.landingStillBible.stillLibrary, patches);
    return {
        ...brief,
        landingStillBible: {
            ...brief.landingStillBible,
            stillLibrary: newLibrary,
        },
    };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function applyPatchesPure(
    library: LandingStillSpec[],
    patches: StillPatch[],
): LandingStillSpec[] {
    const patchById = new Map(patches.map((p) => [p.stillId, p]));
    return library.map((still) => {
        const patch = patchById.get(still.stillId);
        if (!patch) return still;
        // Spread only mutable fields the patch actually carries — never overwrite with undefined.
        const overrides = extractPatchFields(patch);
        return { ...still, ...overrides };
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

function buildPatchResponseSchema(contract: FixContract) {
    // Flat patch shape — stillId + each mutable field as an optional top-level
    // string. Small models routinely flatten nested `fields: {}` objects in
    // structured output, so matching the shape they want to emit eliminates a
    // major source of Zod-retry churn.
    const patchShape: Record<string, z.ZodTypeAny> = {
        stillId: z.string(),
    };
    for (const field of contract.mutableFields) {
        patchShape[field] = z.string().optional();
    }
    return z.object({
        patches: z.array(z.object(patchShape)).default([]),
        rationale: z.string().default(""),
    });
}

function buildSystemPrompt(
    contract: FixContract,
    issue: ProductionBuildLintIssue,
    affected: LandingStillSpec[],
    operatorGuidance?: string,
): string {
    const hint = contract.buildHint(issue, affected);
    const mutableList = contract.mutableFields.map((f) => `"${String(f)}"`).join(", ");
    const frozenList = contract.frozenFields.map((f) => `"${String(f)}"`).join(", ");

    return [
        `You are repairing one specific lint issue on a campaign's landing still bible.`,
        `The fix is targeted: you may only rewrite the affected stills, and only the listed mutable fields. Frozen fields must be byte-identical to the input.`,
        ``,
        `RULE: ${issue.code} (${issue.severity})`,
        hint,
        ``,
        `MUTABLE FIELDS (you may rewrite these on the affected stills): ${mutableList}.`,
        `FROZEN FIELDS (must NOT change): ${frozenList}.`,
        ``,
        `OUTPUT REQUIREMENTS (hard requirements, not preferences):`,
        `  1. Return exactly ${affected.length} patch entries — one per affected stillId: ${affected.map((s) => s.stillId).join(", ")}.`,
        `  2. An empty patches array is NEVER acceptable. The operator has explicitly asked for a fix.`,
        `  3. If you believe the current state is acceptable (e.g. the lint flagged this as "thematic consistency"), STILL return patches. The operator's request overrides aesthetic judgment.`,
        `  4. Each patch must be a FLAT object: { "stillId": "...", "location": "...", "subjectAction": "...", ... }. Do NOT nest the field changes under a "fields" key — put them at the top level next to stillId.`,
        `  5. Include only the mutable fields you actually changed. Omit fields you did not touch.`,
        `EXAMPLE patch object (shape only — your content will differ):`,
        `  { "stillId": "still-02", "location": "dining room with brass-trimmed banquettes", "subjectAction": "two passengers sipping cocktails over a hardback novel", "composition": "medium two-shot, foreground glassware bokeh", "imagePrompt": "..." }`,
        `Provide a one-sentence rationale describing the structural change (e.g. "Moved still-02 from deck to dining-lounge so all four land in distinct composition buckets").`,
        ``,
        operatorGuidance && operatorGuidance.trim().length > 0
            ? [
                  `OPERATOR GUIDANCE (creative direction from the operator):`,
                  operatorGuidance.trim(),
                  ``,
                  `Treat operator guidance as creative direction. If it conflicts with the contract constraints above (mutable/frozen fields, success criteria), treat it as an aspiration, not a license to violate them. Note any conflict in your rationale.`,
              ].join("\n")
            : ``,
    ]
        .filter((line) => line !== ``)
        .join("\n");
}

function buildUserPrompt(
    campaign: Campaign,
    brief: CampaignAestheticBrief,
    affected: LandingStillSpec[],
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

    return [
        `Campaign: ${campaign.name}`,
        `Aesthetic: ${campaign.aesthetic ?? "(unset)"}`,
        ``,
        `OTHER STILLS IN THE SET (do not repeat their location families):`,
        otherStillsSummary || "  (none)",
        ``,
        `AFFECTED STILLS (rewrite each into a distinct location family from the others, preserving frozen fields):`,
        affectedDump,
    ].join("\n");
}
