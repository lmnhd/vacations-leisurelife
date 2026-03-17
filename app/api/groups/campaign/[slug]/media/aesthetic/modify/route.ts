import { NextRequest, NextResponse } from 'next/server';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { runAestheticModification } from '@/lib/campaigns/aesthetic-modification';
import { AestheticModificationRequestSchema, AestheticIssueCodeEnum, AestheticOperationKindEnum } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/aesthetic/modify
// Deterministic brief modification — preview or apply.
// Used by both human operators and agents.
// ────────────────────────────────────────────────────────────────────────────

export const maxDuration = 30;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const body = await req.json() as unknown;

        // Validate request schema
        const parseResult = AestheticModificationRequestSchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json(
                {
                    error: 'Invalid modification request body.',
                    details: parseResult.error.flatten(),
                    validIssueCodes: AestheticIssueCodeEnum.options,
                    validOperationKinds: AestheticOperationKindEnum.options,
                },
                { status: 400 },
            );
        }

        const request = parseResult.data;

        // Validate issue codes are known
        for (const code of request.issueCodes ?? []) {
            if (!AestheticIssueCodeEnum.options.includes(code)) {
                return NextResponse.json(
                    { error: `Unknown issue code: "${code}". See validIssueCodes for supported values.`, validIssueCodes: AestheticIssueCodeEnum.options },
                    { status: 400 },
                );
            }
        }

        // Validate operation kinds are known
        for (const op of request.operations ?? []) {
            if (!AestheticOperationKindEnum.options.includes(op.kind)) {
                return NextResponse.json(
                    { error: `Unknown operation kind: "${op.kind}". See validOperationKinds for supported values.`, validOperationKinds: AestheticOperationKindEnum.options },
                    { status: 400 },
                );
            }
        }

        // Require at least one issue code or operation
        if (!request.issueCodes?.length && !request.operations?.length) {
            return NextResponse.json(
                { error: 'Request must include at least one issueCode or operation.' },
                { status: 400 },
            );
        }

        // Verify brief exists
        const brief = await getAestheticBrief(slug);
        if (!brief) {
            return NextResponse.json(
                { error: `No aesthetic brief found for campaign: ${slug}` },
                { status: 404 },
            );
        }

        // Run the modification
        const result = await runAestheticModification(slug, request);

        return NextResponse.json(
            {
                success: result.success,
                mode: result.mode,
                brief: result.brief,
                appliedIssueCodes: result.appliedIssueCodes,
                appliedOperations: result.appliedOperations,
                touchedPaths: result.touchedPaths,
                invalidation: result.invalidation,
                followUpActions: result.followUpActions,
                historyEntry: result.historyEntry,
            },
            { status: 200 },
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Aesthetic Modify Error]:', error);

        if (message.includes('No aesthetic brief')) {
            return NextResponse.json({ error: message }, { status: 404 });
        }
        if (message.includes('Invalid modification request')) {
            return NextResponse.json({ error: message }, { status: 422 });
        }
        if (message.includes('No operations could be resolved')) {
            return NextResponse.json({ error: message }, { status: 409 });
        }

        return NextResponse.json(
            { error: 'Failed to run aesthetic modification', details: message },
            { status: 500 },
        );
    }
}
