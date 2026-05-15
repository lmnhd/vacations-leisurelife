import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { voteOnIdea } from '@/lib/campaigns/guest-ideas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ slug: string; ideaId: string }> };

const VoteBodySchema = z.object({
    voteType: z.enum(['like', 'dislike']),
    voterToken: z.string().min(1),
});

export async function POST(req: NextRequest, context: RouteContext) {
    const { slug, ideaId } = await context.params;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON.' }, { status: 400 });
    }

    const parsed = VoteBodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'voteType and voterToken are required.' }, { status: 400 });
    }

    const idea = await voteOnIdea(slug, ideaId, parsed.data.voterToken, parsed.data.voteType);
    if (!idea) {
        return NextResponse.json({ success: false, error: 'Idea not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, idea });
}
