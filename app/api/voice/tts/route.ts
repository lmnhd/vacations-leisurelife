import { NextRequest } from 'next/server';
import { handleTtsRequest } from './core-logic';

export async function POST(request: NextRequest): Promise<Response> {
    const body = await request.json() as Record<string, unknown>;
    return handleTtsRequest(body);
}
