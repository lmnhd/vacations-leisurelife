/**
 * Dev Prompt Preview API — Route Handler
 */

import { NextResponse } from 'next/server';
import { handlePromptPreviewRequest } from './core-logic';

export async function GET(request: Request) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const channel = url.searchParams.get('channel');

    const { status, data } = await handlePromptPreviewRequest({ sessionId, channel });
    return NextResponse.json(data, { status });
}
