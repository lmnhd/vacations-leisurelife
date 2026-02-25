import { NextResponse } from 'next/server';
import { handleMemoryExtractorTestRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handleMemoryExtractorTestRequest(body);
    return NextResponse.json(data, { status });
}
