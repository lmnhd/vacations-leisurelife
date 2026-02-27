import { NextResponse } from 'next/server';
import { handleHybridSessionRequest } from './core-logic';

export async function POST(request: Request): Promise<NextResponse> {
    const body = await request.json();
    const { status, data } = await handleHybridSessionRequest(body as Record<string, unknown>);
    return NextResponse.json(data, { status });
}
