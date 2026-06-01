import { NextRequest, NextResponse } from 'next/server';
import { handleRegenerateWithRevisionRequest } from './core-logic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
    const { slug } = await params;
    const body = await req.json() as unknown;
    const result = await handleRegenerateWithRevisionRequest(slug, body);
    return NextResponse.json(result.data, { status: result.status });
}
