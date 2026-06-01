// app/api/ads/flyer-lab/generate/route.ts
//
// Sandbox-only flyer generation. Builds prompts from the posted slug + tunable
// negations / anchors / axes and returns the images inline as data URLs. NOTHING
// is persisted to the manifest — this is a throwaway surface for developing the
// flyer-image negation rules (FLYER-IMAGE-REFACTOR plan, Phase 1).

import { NextResponse } from 'next/server';
import { generateFlyerRenditions } from '@/lib/campaigns/media/generators/flyer-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface Body {
    slug?: string;
    negations?: string[];
    anchors?: string[];
    axes?: string[];
    count?: number;
    steer?: string;
}

function asStringArray(v: unknown): string[] | undefined {
    if (!Array.isArray(v)) return undefined;
    return v.filter((x): x is string => typeof x === 'string');
}

export async function POST(req: Request) {
    let body: Body;
    try {
        body = await req.json() as Body;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const slug = (body.slug ?? '').trim();
    if (!slug) {
        return NextResponse.json({ error: 'slug is required' }, { status: 400 });
    }

    const axes = asStringArray(body.axes);
    const count = typeof body.count === 'number' && body.count > 0
        ? Math.min(Math.floor(body.count), 8) // hard cap — sandbox cost/time guard
        : undefined;

    try {
        const renditions = await generateFlyerRenditions(slug, {
            negations: asStringArray(body.negations),
            anchors: asStringArray(body.anchors),
            axes,
            count,
            steer: typeof body.steer === 'string' ? body.steer : undefined,
        });

        return NextResponse.json({
            slug,
            renditions: renditions.map((r) => ({
                axis: r.axis,
                prompt: r.prompt,
                dataUrl: `data:image/png;base64,${r.buffer.toString('base64')}`,
            })),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
