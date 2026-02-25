import { NextResponse } from 'next/server';
import { handleToolDispatcherTestRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handleToolDispatcherTestRequest(body);
    return NextResponse.json(data, { status });
}
