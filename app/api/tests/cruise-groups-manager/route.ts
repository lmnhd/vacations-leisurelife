import { NextResponse } from 'next/server';
import { handleCruiseGroupsManagerTestRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handleCruiseGroupsManagerTestRequest(body);
    return NextResponse.json(data, { status });
}
