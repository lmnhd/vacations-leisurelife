import { NextResponse } from 'next/server';
import { handleOdysseusSearchTestRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handleOdysseusSearchTestRequest(body);
    return NextResponse.json(data, { status });
}
