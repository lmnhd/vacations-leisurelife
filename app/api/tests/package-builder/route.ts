import { NextResponse } from 'next/server';
import { handlePackageBuilderTestRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handlePackageBuilderTestRequest(body);
    return NextResponse.json(data, { status });
}
