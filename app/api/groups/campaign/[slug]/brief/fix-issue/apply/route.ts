/**
 * POST /api/groups/campaign/[slug]/brief/fix-issue/apply
 *
 * Commits a previously trialed targeted lint fix. Re-validates the patches
 * against the contract one more time (defense against stale clients), writes
 * the patched brief back to storage, and re-runs lint so the saved
 * productionBuildLint/productionBuildStatus reflect the new state.
 *
 * Body:
 *   {
 *     ruleCode: string,
 *     patches: StillPatch[],
 *     operatorGuidance?: string,
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import {
    getCampaignBlueprint,
    getAestheticBrief,
    saveAestheticBrief,
} from "@/lib/campaigns/campaign-store";
import {
    applyTargetedLintFixPatches,
    type StillPatch,
} from "@/lib/campaigns/media/targeted-lint-fix";
import { lintProductionBuild } from "@/lib/campaigns/media/production-build-lint";
import { getExpandedNicheKeywords } from "@/lib/campaigns/reference-packs";
import { getFixContract } from "@/lib/campaigns/media/lint-fix-contracts";

export const maxDuration = 30;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const body = (await req.json().catch(() => ({}))) as {
            ruleCode?: string;
            patches?: StillPatch[];
            operatorGuidance?: string;
        };

        if (!body.ruleCode || !Array.isArray(body.patches) || body.patches.length === 0) {
            return NextResponse.json(
                { error: "ruleCode and non-empty patches are required." },
                { status: 400 },
            );
        }
        const contract = getFixContract(body.ruleCode);
        if (!contract) {
            return NextResponse.json(
                { error: `No targeted-fix contract for rule "${body.ruleCode}".` },
                { status: 400 },
            );
        }

        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            return NextResponse.json({ error: `Campaign not found: ${slug}` }, { status: 404 });
        }
        const brief = await getAestheticBrief(slug);
        if (!brief || !brief.landingStillBible) {
            return NextResponse.json(
                { error: `No brief or landing still bible exists for ${slug}.` },
                { status: 404 },
            );
        }

        // ── Defense-in-depth: re-run the frozen-field gate against the current
        //    brief state. Trial→apply is two requests, so the brief could have
        //    been regenerated in between. If frozen fields no longer match,
        //    refuse to apply.
        const originalById = new Map(
            brief.landingStillBible.stillLibrary.map((s) => [s.stillId, s]),
        );
        for (const patch of body.patches) {
            const original = originalById.get(patch.stillId);
            if (!original) {
                return NextResponse.json(
                    {
                        error: `Patch targets stillId="${patch.stillId}" but it is no longer in the brief. The brief may have been regenerated — re-open the issue and try again.`,
                    },
                    { status: 409 },
                );
            }
            // Patch keys are constrained to mutableFields by the trial schema;
            // re-verify here in case the client tampered. The patch is a flat
            // shape `{ stillId, ...mutableFields }` — everything except stillId
            // must be in the contract's mutable set.
            for (const key of Object.keys(patch)) {
                if (key === "stillId") continue;
                if (!contract.mutableFields.includes(key as keyof typeof original)) {
                    return NextResponse.json(
                        {
                            error: `Patch attempted to mutate field "${key}" on ${patch.stillId}, which is not in the contract's mutable set.`,
                        },
                        { status: 400 },
                    );
                }
            }
        }

        // ── Snapshot lint BEFORE applying so we can report the transition
        const beforeLint = lintProductionBuild({
            landingStillBible: brief.landingStillBible,
            productionBible: brief.productionBible,
            themeName: campaign.name,
            nicheKeywords: getExpandedNicheKeywords(campaign),
        });

        // ── Apply
        const patched = applyTargetedLintFixPatches(brief, body.patches);

        // ── Re-run lint so the persisted productionBuildLint reflects the new state
        const freshLint = lintProductionBuild({
            landingStillBible: patched.landingStillBible!,
            productionBible: patched.productionBible,
            themeName: campaign.name,
            nicheKeywords: getExpandedNicheKeywords(campaign),
        });

        const resynced = {
            ...patched,
            productionBuildLint: freshLint,
            productionBuildStatus: freshLint.verdict,
            productionBuildEvaluatedAt: freshLint.evaluatedAt,
        };

        await saveAestheticBrief(resynced);

        // ── Diagnostic: log the composition-family transition for patched
        //    stills so we can verify in the dev console that the rewrite
        //    actually moved each still out of the originating bucket.
        const beforeFamilyById = new Map(
            beforeLint.stillDiagnostics.map((d) => [d.stillId, d.compositionFamily]),
        );
        const afterFamilyById = new Map(
            freshLint.stillDiagnostics.map((d) => [d.stillId, d.compositionFamily]),
        );
        const familyTransitions = body.patches.map((p) => ({
            stillId: p.stillId,
            before: beforeFamilyById.get(p.stillId) ?? "(unknown)",
            after: afterFamilyById.get(p.stillId) ?? "(unknown)",
        }));
        console.log(
            `[brief:fix-issue:apply] ${slug} — applied ${body.patches.length} patch(es) for ${body.ruleCode}: ` +
                familyTransitions
                    .map((t) => `${t.stillId} ${t.before}→${t.after}`)
                    .join(", "),
        );
        console.log(
            `[brief:fix-issue:apply] ${slug} — lint verdict ${beforeLint.verdict} (${beforeLint.blockingIssues.length}b/${beforeLint.warnings.length}w) → ${freshLint.verdict} (${freshLint.blockingIssues.length}b/${freshLint.warnings.length}w)`,
        );

        return NextResponse.json(
            {
                success: true,
                ruleCode: body.ruleCode,
                appliedStillIds: body.patches.map((p) => p.stillId),
                familyTransitions,
                beforeVerdict: beforeLint.verdict,
                beforeBlockerCount: beforeLint.blockingIssues.length,
                beforeWarningCount: beforeLint.warnings.length,
                newVerdict: freshLint.verdict,
                newBlockerCount: freshLint.blockingIssues.length,
                newWarningCount: freshLint.warnings.length,
            },
            { status: 200 },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[brief:fix-issue:apply]", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
