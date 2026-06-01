import { NextRequest, NextResponse } from 'next/server';
import { getMediaManifest, updateManifestFlyerControls } from '@/lib/campaigns/media/media-store';
import { DEFAULT_FLYER_NEGATIONS, DEFAULT_FLYER_VARIATION_AXES } from '@/lib/campaigns/media/generators/flyer-prompt';
import { PRIMARY_IMAGE_BACKEND_ID } from '@/lib/campaigns/media/generators/image-backend-meta';

export const dynamic = 'force-dynamic';

// Per-campaign flyer generation controls (negation rules + variation axes).
// GET returns the saved controls, or the code defaults when none are saved yet
// (so the editor always has something to show, even before first generation).

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const manifest = await getMediaManifest(slug);
    const controls = manifest?.flyerControls;
    return NextResponse.json({
        negations: controls?.negations?.length ? controls.negations : DEFAULT_FLYER_NEGATIONS,
        axes: controls?.axes?.length ? controls.axes : DEFAULT_FLYER_VARIATION_AXES,
        // Default to the primary backend only (single-model) when unset.
        models: controls?.models?.length ? controls.models : [PRIMARY_IMAGE_BACKEND_ID],
        usingDefaults: !controls,
        hasManifest: Boolean(manifest),
    });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    try {
        const body = await request.json().catch(() => ({}));
        const negations = Array.isArray(body.negations) ? body.negations.filter((x: unknown): x is string => typeof x === 'string') : [];
        const axes = Array.isArray(body.axes) ? body.axes.filter((x: unknown): x is string => typeof x === 'string') : [];
        const models = Array.isArray(body.models) ? body.models.filter((x: unknown): x is string => typeof x === 'string') : undefined;
        const manifest = await updateManifestFlyerControls(slug, { negations, axes, models });
        return NextResponse.json({ flyerControls: manifest.flyerControls });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes('No media manifest') ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
