/**
 * Test Image Search API — Route Handler
 */

import { NextResponse } from 'next/server';
import { handleImageSearch } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handleImageSearch(body);
    return NextResponse.json(data, { status });
}
