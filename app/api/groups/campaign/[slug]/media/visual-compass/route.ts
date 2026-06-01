import { NextResponse } from 'next/server';
import { handleGetVisualCompass, handlePostVisualCompass } from './core-logic';

export const dynamic = 'force-dynamic';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const { status, data } = await handleGetVisualCompass(slug);
    return NextResponse.json(data, { status });
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const body = await request.json();
    const { status, data } = await handlePostVisualCompass(slug, body);
    return NextResponse.json(data, { status });
}
