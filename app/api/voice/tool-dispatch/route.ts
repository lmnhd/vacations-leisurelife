import { NextRequest, NextResponse } from 'next/server';
import { handleVoiceToolDispatch } from './core-logic';

export async function POST(req: NextRequest): Promise<NextResponse> {
    const body = await req.json() as unknown;
    const { status, data } = await handleVoiceToolDispatch(body);
    return NextResponse.json(data, { status });
}
