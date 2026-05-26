/**
 * POST /api/groups/campaign/[slug]/brief/fix-issue
 *
 * Trial-runs a targeted lint fix for one ProductionBuildLintIssue. Returns the
 * proposed patch + diffs without writing to storage. The client then calls
 * /apply with the same patches to commit.
 *
 * Body:
 *   {
 *     ruleCode: string,           // e.g. "repeated_composition_family"
 *     affectedStillIds: string[], // matches the issue's affectedStillIds
 *     issueMessage: string,       // verbatim from the lint card (for prompt hint)
 *     issueSeverity: "blocker" | "warning",
 *     issueDetails?: string,
 *     operatorGuidance?: string,  // optional free-form steering
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCampaignBlueprint } from "@/lib/campaigns/campaign-store";
import { getAestheticBrief } from "@/lib/campaigns/campaign-store";
import { runTargetedLintFixTrial } from "@/lib/campaigns/media/targeted-lint-fix";
import type { ProductionBuildLintIssue } from "@/lib/campaigns/schema";

export const maxDuration = 60;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const body = (await req.json().catch(() => ({}))) as {
            ruleCode?: string;
            affectedStillIds?: string[];
            issueMessage?: string;
            issueSeverity?: "blocker" | "warning";
            issueDetails?: string;
            operatorGuidance?: string;
        };

        if (!body.ruleCode || !Array.isArray(body.affectedStillIds) || body.affectedStillIds.length === 0) {
            return NextResponse.json(
                { error: "ruleCode and non-empty affectedStillIds are required." },
                { status: 400 },
            );
        }
        if (body.issueSeverity !== "blocker" && body.issueSeverity !== "warning") {
            return NextResponse.json(
                { error: "issueSeverity must be 'blocker' or 'warning'." },
                { status: 400 },
            );
        }

        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            return NextResponse.json({ error: `Campaign not found: ${slug}` }, { status: 404 });
        }
        const brief = await getAestheticBrief(slug);
        if (!brief) {
            return NextResponse.json({ error: `No brief exists for ${slug}.` }, { status: 404 });
        }

        const issue: ProductionBuildLintIssue = {
            code: body.ruleCode as ProductionBuildLintIssue["code"],
            severity: body.issueSeverity,
            message: body.issueMessage ?? "",
            affectedStillIds: body.affectedStillIds,
            details: body.issueDetails,
        };

        const result = await runTargetedLintFixTrial({
            campaign,
            brief,
            issue,
            operatorGuidance: body.operatorGuidance,
        });

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[brief:fix-issue]", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
