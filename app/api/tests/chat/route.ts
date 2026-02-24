/**
 * Test Chat API — Route Handler
 *
 * Thin Next.js route handler. All business logic lives in core-logic.ts.
 */

import { NextResponse } from 'next/server';
import { handleChatRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handleChatRequest(body);
    return NextResponse.json(data, { status });
}
