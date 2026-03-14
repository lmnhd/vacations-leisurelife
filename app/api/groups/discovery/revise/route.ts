import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reviseDiscoveryBlueprint } from '@/lib/campaigns/discovery-revision';

const ReviseDiscoveryBlueprintRequestSchema = z.object({
    slug: z.string().min(1),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { slug } = ReviseDiscoveryBlueprintRequestSchema.parse(body);
        const revised = await reviseDiscoveryBlueprint(slug);

        return NextResponse.json({ success: true, ...revised }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Discovery Revise Error]:', error);
        return NextResponse.json(
            { error: 'Failed to revise discovery blueprint', details: message },
            { status: 500 },
        );
    }
}