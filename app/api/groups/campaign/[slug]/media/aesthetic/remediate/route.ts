import { NextRequest, NextResponse } from 'next/server';
import { runRemediationCore } from './core-logic';

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const { brief, summary, hasRemainingBlockers } = await runRemediationCore(slug);

        return NextResponse.json(
            {
                success: true,
                brief,
                summary,
                hasRemainingBlockers,
                message: hasRemainingBlockers
                    ? `Remediation complete. ${summary.remainingOpenIssues.length} blocker(s) remain — check summary.`
                    : 'Remediation complete. All issues resolved or verified.',
            },
            { status: 200 },
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Aesthetic Remediate Error]:', error);
        return NextResponse.json(
            { error: 'Failed to run aesthetic remediation', details: message },
            { status: 500 },
        );
    }
}
