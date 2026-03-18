import { NextRequest, NextResponse } from 'next/server';
import { runTrinityCoreLogic, TrinityRunRequest } from './core-logic';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
    const { slug } = await params;

    let body: TrinityRunRequest = {};
    try {
        body = await request.json();
    } catch {
        // empty body is valid — all fields optional
    }

    try {
        const result = await runTrinityCoreLogic(slug, body);
        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[trinity:route] Error for slug=${slug}:`, error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
