import { NextRequest, NextResponse } from 'next/server';

// DEPRECATED: Red-team review is no longer a standalone operator step.
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    return NextResponse.json(
        {
            error: 'This route is deprecated.',
            details: 'Red-team review has been removed as a standalone step. Use POST /api/groups/campaign/{slug}/brief for full brief generation with inline validation.',
            replacement: `/api/groups/campaign/${slug}/brief`,
        },
        { status: 410 },
    );
}