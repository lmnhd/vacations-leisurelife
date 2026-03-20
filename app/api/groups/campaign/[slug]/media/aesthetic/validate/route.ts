import { NextRequest, NextResponse } from 'next/server';

// DEPRECATED: Validation now runs inline inside POST /api/groups/campaign/[slug]/brief.
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    return NextResponse.json(
        {
            error: 'This route is deprecated.',
            details: 'Validation runs automatically inside POST /api/groups/campaign/{slug}/brief. Use that route instead.',
            replacement: `/api/groups/campaign/${slug}/brief`,
        },
        { status: 410 },
    );
}
