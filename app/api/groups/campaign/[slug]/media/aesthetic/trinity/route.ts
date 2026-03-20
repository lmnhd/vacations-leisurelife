import { NextRequest, NextResponse } from 'next/server';

// DEPRECATED: Trinity pipeline is no longer part of the primary brief-generation path.
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
    const { slug } = await params;
    return NextResponse.json(
        {
            error: 'This route is deprecated.',
            details: 'The Trinity pipeline has been removed from the brief-generation path. Use POST /api/groups/campaign/{slug}/brief instead.',
            replacement: `/api/groups/campaign/${slug}/brief`,
        },
        { status: 410 },
    );
}
