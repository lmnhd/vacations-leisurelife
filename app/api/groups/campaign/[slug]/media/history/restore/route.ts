import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRawAssetRecord, saveAssetRecord, upsertManifestAssetSection } from '@/lib/campaigns/media/media-store';
import { assetTypeToManifestSection } from '@/lib/campaigns/media/asset-manifest-section';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/history/restore
//
// Restores a previously orphaned AssetRecord into the active manifest.
// The record is re-activated (active: true) if needed, then upserted into
// the correct manifest section based on its assetType.
//
// Body: { assetId: string }
// Returns: { success, assetId, manifestSection, manifest }
// ────────────────────────────────────────────────────────────────────────────

const RestoreRequestSchema = z.object({
    assetId: z.string().min(1),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = RestoreRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid request body', issues: parsed.error.issues },
            { status: 400 },
        );
    }

    const { assetId } = parsed.data;

    try {
        const record = await getRawAssetRecord(slug, assetId);
        if (!record) {
            return NextResponse.json(
                { error: `Asset not found: ${assetId}` },
                { status: 404 },
            );
        }

        const section = assetTypeToManifestSection(record.assetType);
        if (!section) {
            return NextResponse.json(
                { error: `Asset type "${record.assetType}" is not restorable (no manifest section mapping).` },
                { status: 400 },
            );
        }

        // Re-activate the record if it was deactivated
        const activeRecord = record.active ? record : { ...record, active: true };
        if (!record.active) {
            await saveAssetRecord(slug, activeRecord);
        }

        // Upsert into the manifest. Single-slot sections (tiktokSeed, etc.) receive
        // the record directly; array sections receive it wrapped in an array.
        const isSingleSlot = (
            section === 'tiktokSeed'
            || section === 'heroExplainer'
            || section === 'thresholdAnnouncement'
            || section === 'ambientNarration'
            || section === 'hypeClip'
            || section === 'themeMusic'
        );

        const updatedManifest = await upsertManifestAssetSection(
            slug,
            section,
            isSingleSlot ? activeRecord : [activeRecord],
        );

        return NextResponse.json({
            success: true,
            assetId,
            manifestSection: section,
            manifest: updatedManifest,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[media:history:restore:POST]', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
