import { NextResponse } from 'next/server';
import { handleOnboardingGuidanceRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handleOnboardingGuidanceRequest(body);
    return NextResponse.json(data, { status });
}
