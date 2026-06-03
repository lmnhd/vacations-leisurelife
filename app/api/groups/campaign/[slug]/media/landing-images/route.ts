import { NextRequest, NextResponse } from 'next/server';
import { getMediaManifest, updateManifestLandingImageSets } from '@/lib/campaigns/media/media-store';

export const dynamic = 'force-dynamic';

// LANDING_IMAGE_STUDIO — operator-curated landing collections (gallery/trust).
// Each is an ordered list of assetIds; full-replace when present (see view-model).
//
//   GET   → { gallery: string[], trust: string[] } (saved, or [])
//   PATCH { gallery?: string[]|null, trust?: string[]|null } → set (or clear with
//          null / empty array). Omitted keys are left untouched.

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const manifest = await getMediaManifest(slug);
    const sets = manifest?.landingImageSets;
    return NextResponse.json({
        gallery: sets?.gallery ?? [],
        trust: sets?.trust ?? [],
        placements: sets?.placements ?? {},
        hasManifest: Boolean(manifest),
    });
}

function asIdArrayOrNull(value: unknown): string[] | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (!Array.isArray(value)) return undefined;
    return value.filter((x): x is string => typeof x === 'string');
}

function asPlacementsOrNull(value: unknown): Record<string, string | string[] | null> | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const out: Record<string, string | string[] | null> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (entry === null) out[key] = null;
        else if (typeof entry === 'string') out[key] = entry;
        else if (Array.isArray(entry)) out[key] = entry.filter((x): x is string => typeof x === 'string');
    }
    return out;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    try {
        const body = await request.json().catch(() => ({}));
        const gallery = asIdArrayOrNull(body.gallery);
        const trust = asIdArrayOrNull(body.trust);
        const placements = asPlacementsOrNull(body.placements);
        if (gallery === undefined && trust === undefined && placements === undefined) {
            return NextResponse.json({ error: 'No gallery/trust/placements provided' }, { status: 400 });
        }
        const manifest = await updateManifestLandingImageSets(slug, {
            ...(gallery !== undefined ? { gallery } : {}),
            ...(trust !== undefined ? { trust } : {}),
            ...(placements !== undefined ? { placements } : {}),
        });
        return NextResponse.json({ landingImageSets: manifest.landingImageSets ?? {} });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes('No media manifest') ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
