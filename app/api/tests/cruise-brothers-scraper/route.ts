import { NextResponse } from 'next/server';
import { handleCbScraperTestRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handleCbScraperTestRequest(body);
    return NextResponse.json(data, { status });
}
