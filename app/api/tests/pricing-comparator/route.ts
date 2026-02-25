import { NextResponse } from 'next/server';
import { handlePricingComparatorTestRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handlePricingComparatorTestRequest(body);
    return NextResponse.json(data, { status });
}
