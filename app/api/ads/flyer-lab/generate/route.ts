// app/api/ads/flyer-lab/generate/route.ts
//
// Sandbox-only flyer generation. Builds prompts from the posted slug + tunable
// negations / anchors / axes and returns the images inline as data URLs. NOTHING
// is persisted to the manifest.

import { NextResponse } from 'next/server';
import { generateFlyerRenditions } from '@/lib/campaigns/media/generators/flyer-generator';
import { IMAGE_BACKEND_META, PRIMARY_IMAGE_BACKEND_ID } from '@/lib/campaigns/media/generators/image-backend-meta';
import type { GeneratorService } from '@/lib/campaigns/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface Body {
    slug?: string;
    basePromptTemplate?: string;
    negations?: string[];
    anchors?: string[];
    talkingPoints?: string[];
    nicheHint?: string;
    axes?: string[];
    count?: number;
    steer?: string;
    models?: string[];
}

function asStringArray(v: unknown): string[] | undefined {
    if (!Array.isArray(v)) return undefined;
    return v.filter((x): x is string => typeof x === 'string');
}

function asModelArray(v: unknown): GeneratorService[] | undefined {
    const valid = new Set<GeneratorService>(IMAGE_BACKEND_META.map((b) => b.id));
    const models = asStringArray(v)?.filter((x): x is GeneratorService => valid.has(x as GeneratorService));
    return models && models.length > 0 ? models : undefined;
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
    const models = asModelArray(body.models) ?? [PRIMARY_IMAGE_BACKEND_ID];
    const count = typeof body.count === 'number' && body.count > 0
        ? Math.min(Math.floor(body.count), 8)
        : undefined;

    try {
        const { renditions, warnings } = await generateFlyerRenditions(slug, {
            basePromptTemplate: typeof body.basePromptTemplate === 'string' ? body.basePromptTemplate : undefined,
            negations: asStringArray(body.negations),
            anchors: asStringArray(body.anchors),
            talkingPoints: asStringArray(body.talkingPoints),
            nicheHint: typeof body.nicheHint === 'string' ? body.nicheHint : undefined,
            axes,
            count,
            steer: typeof body.steer === 'string' ? body.steer : undefined,
            models,
        });

        return NextResponse.json({
            slug,
            models,
            warnings,
            renditions: renditions.map((r) => ({
                axis: r.axis,
                prompt: r.prompt,
                variants: r.variants.map((v) => ({
                    generator: v.generator,
                    dataUrl: `data:image/png;base64,${v.buffer.toString('base64')}`,
                })),
            })),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
