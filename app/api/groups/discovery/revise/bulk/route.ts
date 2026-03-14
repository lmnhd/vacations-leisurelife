import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reviseDiscoveryBlueprint } from '@/lib/campaigns/discovery-revision';
import type { Campaign } from '@/lib/campaigns/types';

const BulkReviseDiscoveryBlueprintRequestSchema = z.object({
    slugs: z.array(z.string().min(1)).min(1),
});

type BulkReviseResult = {
    slug: string;
    outcome: 'revised' | 'failed';
    message: string;
    campaign?: Campaign;
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { slugs } = BulkReviseDiscoveryBlueprintRequestSchema.parse(body);

        const results: BulkReviseResult[] = [];

        for (const slug of slugs) {
            try {
                const revised = await reviseDiscoveryBlueprint(slug);
                results.push({
                    slug,
                    outcome: 'revised',
                    message: revised.message,
                    campaign: revised.campaign,
                });
            } catch (error: unknown) {
                results.push({
                    slug,
                    outcome: 'failed',
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        const summary = {
            total: results.length,
            revised: results.filter((result) => result.outcome === 'revised').length,
            failed: results.filter((result) => result.outcome === 'failed').length,
        };

        return NextResponse.json({ success: true, summary, results }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Bulk Discovery Revise Error]:', error);
        return NextResponse.json(
            { error: 'Failed to revise selected discovery blueprints', details: message },
            { status: 500 },
        );
    }
}