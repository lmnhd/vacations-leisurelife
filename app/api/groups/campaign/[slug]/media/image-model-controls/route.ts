import { NextRequest, NextResponse } from 'next/server';
import { getMediaManifest, updateManifestImageModelControls } from '@/lib/campaigns/media/media-store';
import { PRIMARY_IMAGE_BACKEND_ID } from '@/lib/campaigns/media/generators/image-backend-meta';
import { IMAGE_BACKENDS } from '@/lib/campaigns/media/generators/image-backends';

export const dynamic = 'force-dynamic';

// MULTI_MODEL_IMAGES (Phase F): shared active-image-backends control governing the
// non-flyer generated sections — hero/concepts, documentary details, and scenes.
// GET returns the saved models (or the primary backend only when unset, i.e.
// single-model). PATCH persists the operator's selection.

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const manifest = await getMediaManifest(slug);
    const controls = manifest?.imageModelControls;
    return NextResponse.json({
        // Default to the primary backend only (single-model) when unset.
        models: controls?.models?.length ? controls.models : [PRIMARY_IMAGE_BACKEND_ID],
        backendAvailability: IMAGE_BACKENDS.map((backend) => ({
            id: backend.id,
            label: backend.label,
            available: backend.isAvailable(),
        })),
        usingDefaults: !controls?.models?.length,
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
        const models = Array.isArray(body.models)
            ? body.models.filter((x: unknown): x is string => typeof x === 'string')
            : undefined;
        const manifest = await updateManifestImageModelControls(slug, { models });
        return NextResponse.json({ imageModelControls: manifest.imageModelControls });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes('No media manifest') ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
