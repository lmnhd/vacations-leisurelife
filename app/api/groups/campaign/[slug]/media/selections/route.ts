import { NextRequest, NextResponse } from 'next/server';
import {
    getMediaManifest,
    updateManifestCopySelections,
    updateManifestImageSlotControls,
    updateManifestImageSelections,
} from '@/lib/campaigns/media/media-store';
import {
    buildImageAssetIndex,
    collectSelectableImageAssets,
    type HtmlTemplateManifest,
} from '@/lib/ads/html-templates/core';

export const dynamic = 'force-dynamic';

type SelectionPatchBody = {
    selections?: Record<string, string | null>;
    slotControls?: Record<string, {
        hidden?: boolean;
        flipX?: boolean;
        position?: 'left' | 'center' | 'right';
    } | null>;
    copySelections?: Record<string, string | null>;
    clear?: string[];
};

function parseBody(value: unknown): SelectionPatchBody {
    if (!value || typeof value !== 'object') return {};
    const body = value as SelectionPatchBody;
    return {
        selections: body.selections && typeof body.selections === 'object' ? body.selections : {},
        slotControls: body.slotControls && typeof body.slotControls === 'object' ? body.slotControls : {},
        copySelections: body.copySelections && typeof body.copySelections === 'object' ? body.copySelections : {},
        clear: Array.isArray(body.clear) ? body.clear.filter((key): key is string => typeof key === 'string') : [],
    };
}

function isSupportedImageKey(key: string): boolean {
    return key.startsWith('ad:') || key.startsWith('crop:') || key.startsWith('section:');
}

function isSupportedCopyKey(key: string): boolean {
    return key.startsWith('copy:');
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;

    try {
        const manifest = await getMediaManifest(slug);
        if (!manifest) {
            return NextResponse.json(
                { error: `No media manifest found for campaign ${slug}` },
                { status: 404 },
            );
        }

        const body = parseBody(await request.json().catch(() => ({})));
        const changes: Record<string, string | null> = { ...(body.selections ?? {}) };
        const copyChanges: Record<string, string | null> = { ...(body.copySelections ?? {}) };
        for (const key of body.clear ?? []) {
            changes[key] = null;
        }
        const controlChanges = body.slotControls ?? {};

        const selectable = collectSelectableImageAssets(manifest as HtmlTemplateManifest);
        const assetById = buildImageAssetIndex(manifest as HtmlTemplateManifest);
        const selectableIds = new Set(selectable.map((asset) => asset.assetId));

        for (const [key, assetId] of Object.entries(changes)) {
            if (!isSupportedImageKey(key)) {
                return NextResponse.json(
                    { error: `Unsupported image selection key: ${key}` },
                    { status: 400 },
                );
            }

            if (assetId && (!selectableIds.has(assetId) || !assetById.has(assetId))) {
                return NextResponse.json(
                    { error: `Asset ${assetId} is not selectable for image overrides` },
                    { status: 400 },
                );
            }
        }

        for (const [key, source] of Object.entries(copyChanges)) {
            if (!isSupportedCopyKey(key)) {
                return NextResponse.json(
                    { error: `Unsupported copy selection key: ${key}` },
                    { status: 400 },
                );
            }
            if (source && !['heroSlogan', 'subSlogan', 'themeName', 'elevatorPitch'].includes(source)) {
                return NextResponse.json(
                    { error: `Unsupported copy headline source: ${source}` },
                    { status: 400 },
                );
            }
        }

        for (const [key, control] of Object.entries(controlChanges)) {
            if (!isSupportedImageKey(key)) {
                return NextResponse.json(
                    { error: `Unsupported image slot control key: ${key}` },
                    { status: 400 },
                );
            }
            if (control?.position && !['left', 'center', 'right'].includes(control.position)) {
                return NextResponse.json(
                    { error: `Unsupported image slot position: ${control.position}` },
                    { status: 400 },
                );
            }
        }

        let updatedManifest = await updateManifestImageSelections(slug, changes);
        if (Object.keys(copyChanges).length > 0) {
            updatedManifest = await updateManifestCopySelections(slug, copyChanges);
        }
        if (Object.keys(controlChanges).length > 0) {
            updatedManifest = await updateManifestImageSlotControls(slug, controlChanges);
        }
        return NextResponse.json({
            imageSelections: updatedManifest.imageSelections ?? {},
            imageSlotControls: updatedManifest.imageSlotControls ?? {},
            copySelections: updatedManifest.copySelections ?? {},
            manifest: updatedManifest,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
