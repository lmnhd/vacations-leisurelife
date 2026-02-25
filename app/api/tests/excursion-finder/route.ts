import { NextResponse } from 'next/server';
import { handleExcursionFinderTestRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handleExcursionFinderTestRequest(body);
    return NextResponse.json(data, { status });
}
