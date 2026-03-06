import { NextResponse } from 'next/server';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/groups/media/env-check
// Returns which Phase 2B API keys are present in the environment.
// Used by the test page to render accurate key status badges.
// NEVER returns key values — only boolean presence.
// ────────────────────────────────────────────────────────────────────────────

export interface EnvCheckResponse {
    OPENAI: boolean;
    ELEVENLABS: boolean;
    REPLICATE: boolean;
    SERPAPI: boolean;
    GOOGLE: boolean;
    HEYGEN: boolean;
    RUNWAYML: boolean;
    R2: boolean;
}

export async function GET() {
    const result: EnvCheckResponse = {
        OPENAI: !!process.env.OPENAI_API_KEY,
        ELEVENLABS: !!process.env.ELEVENLABS_API_KEY,
        REPLICATE: !!process.env.REPLICATE_API_TOKEN,
        SERPAPI: !!process.env.SERPAPI_KEY,
        GOOGLE: !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
        HEYGEN: !!process.env.HEYGEN_API_KEY,
        RUNWAYML: !!process.env.RUNWAYML_API_KEY,
        R2: !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY),
    };
    return NextResponse.json(result);
}
