import { NextRequest, NextResponse } from 'next/server';

// DEPRECATED: LLM revision is no longer a standalone step. The one-strike correction
// is handled automatically inside POST /api/groups/campaign/[slug]/brief.
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    return NextResponse.json(
        {
            error: 'This route is deprecated.',
            details: 'Revision is now handled automatically inside POST /api/groups/campaign/{slug}/brief.',
            replacement: `/api/groups/campaign/${slug}/brief`,
        },
        { status: 410 },
    );
}
