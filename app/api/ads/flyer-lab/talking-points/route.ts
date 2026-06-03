// app/api/ads/flyer-lab/talking-points/route.ts
//
// Lab-only helper: generate short in-image callout candidates from the campaign
// brief and media manifest. These are not persisted server-side; the lab stores
// the chosen chips per campaign in localStorage.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateStructuredObject, modelForTask } from '@/lib/ai/llm-gateway';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const TalkingPointSchema = z.object({
    talkingPoints: z.array(z.string().min(3).max(90)).min(12).max(36),
});

interface Body {
    slug?: string;
    existing?: string[];
}

function safeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function summarizeManifest(manifest: Awaited<ReturnType<typeof getMediaManifest>>) {
    if (!manifest) return null;
    return {
        generatedAt: manifest.generatedAt,
        flyerCount: manifest.images.flyerImages?.length ?? 0,
        heroCount: manifest.images.hero?.length ?? 0,
        sceneCount: manifest.images.sceneImages?.length ?? 0,
        documentaryDetailCount: manifest.images.documentaryDetails?.length ?? 0,
        adCopyVariants: (manifest.copy?.adVariants ?? []).map((variant) => ({
            headline: variant.headline,
            primaryText: variant.primaryText,
            description: variant.description,
            cta: variant.cta,
        })).slice(0, 3),
        flyerPrompts: (manifest.images.flyerImages ?? [])
            .map((asset) => asset.promptUsed)
            .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim().length > 0)
            .slice(0, 4),
    };
}

function uniqueTalkingPoints(points: string[], existing: string[]): string[] {
    const seen = new Set(existing.map((point) => point.trim().toLowerCase()).filter(Boolean));
    const out: string[] = [];
    for (const point of points) {
        const clean = point.replace(/\s+/g, ' ').trim();
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
    }
    return out;
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

    const existing = safeStringArray(body.existing);

    try {
        const [brief, manifest] = await Promise.all([
            getAestheticBrief(slug).catch(() => null),
            getMediaManifest(slug).catch(() => null),
        ]);

        if (!brief && !manifest) {
            return NextResponse.json({ error: `No brief or media manifest found for campaign ${slug}` }, { status: 404 });
        }

        const prompt = [
            'Generate short callout/talking-point candidates for a designed flyer ad image.',
            'These phrases may appear as small labels, badges, handwritten notes, ribbon copy, or feature boxes inside a generated image.',
            'Return a wide menu of options. The image model may use many, few, or none depending on composition.',
            'Avoid generic travel filler. Prioritize concrete campaign-specific hooks, sensory details, niche vocabulary, social proof, and concise benefit phrases.',
            'Keep each point punchy: usually 2 to 8 words, max 90 characters. No hashtags. No pricing. No booking CTA. No markdown.',
            '',
            `Campaign slug: ${slug}`,
            `Existing talking points to avoid duplicating: ${JSON.stringify(existing)}`,
            '',
            'Aesthetic brief JSON:',
            JSON.stringify(brief ?? {}, null, 2).slice(0, 14000),
            '',
            'Media manifest summary JSON:',
            JSON.stringify(summarizeManifest(manifest), null, 2),
        ].join('\n');

        const result = await generateStructuredObject({
            model: modelForTask('creative'),
            schema: TalkingPointSchema,
            system: 'You are a senior ad art director designing compact in-image flyer callouts for niche cruise campaigns.',
            prompt,
            timeoutMs: 90_000,
            strictJsonSchema: false,
        });

        return NextResponse.json({
            slug,
            model: result.modelId,
            warnings: result.warnings,
            talkingPoints: uniqueTalkingPoints(result.object.talkingPoints, existing),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
