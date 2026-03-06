import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { storeAsset } from '@/lib/campaigns/media/storage-client';
import {
    getActiveAssetRecord,
    deactivateAssetRecord,
    saveAssetRecord,
} from '@/lib/campaigns/media/media-store';
import { AssetTypeEnum, GeneratorServiceEnum } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/regenerate
// Phase 2C – Asset version swap.
//
// Marks the current active AssetRecord as inactive, uploads the replacement
// binary, and writes a new AssetRecord at version + 1 with active: true.
// The old record remains in DynamoDB for audit; only `active` is toggled.
//
// Body: RegenerateAssetRequest (see schema below)
// Returns: { assetId, url, version, previousVersion, storageBackend }
// ────────────────────────────────────────────────────────────────────────────

const RegenerateAssetRequestSchema = z.object({
    assetId:        z.string().min(1),
    assetType:      AssetTypeEnum,
    fileName:       z.string().min(1),
    mimeType:       z.string().min(1),
    bufferBase64:   z.string().min(1),
    generator:      GeneratorServiceEnum,
    promptUsed:     z.string().default(''),
    tags:           z.array(z.string()).default([]),
    dimensions:     z.object({ width: z.number(), height: z.number() }).optional(),
    durationSeconds: z.number().optional(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = RegenerateAssetRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid request body', issues: parsed.error.issues },
            { status: 400 }
        );
    }

    const {
        assetId, assetType, fileName, mimeType, bufferBase64,
        generator, promptUsed, tags, dimensions, durationSeconds,
    } = parsed.data;

    try {
        // 1. Look up the existing active record for version tracking
        const existing = await getActiveAssetRecord(slug, assetId);
        const previousVersion = existing?.version ?? 0;
        const newVersion = previousVersion + 1;

        // 2. Deactivate the current record (retains it in DynamoDB for audit)
        if (existing) {
            await deactivateAssetRecord(slug, assetId);
        }

        // 3. Upload the new binary
        const buffer = Buffer.from(bufferBase64, 'base64');
        const url = await storeAsset(slug, assetId, fileName, buffer, mimeType);

        const storageBackend = url.startsWith('/api/') ? 'dynamodb'
            : url.startsWith('r2://pending') ? 'none (r2 required)'
            : 'r2';

        // 4. Write the new asset record (same SK — overwrites deactivated record)
        const record = {
            assetId,
            assetType,
            url,
            generator,
            promptUsed,
            fileSizeBytes: buffer.length,
            mimeType,
            tags,
            createdAt: new Date().toISOString(),
            reviewStatus: 'auto_approved' as const,
            version: newVersion,
            active: true,
            ...(dimensions ? { dimensions } : {}),
            ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        };

        await saveAssetRecord(slug, record);

        return NextResponse.json({
            assetId,
            url,
            version: newVersion,
            previousVersion,
            storageBackend,
            fileSizeBytes: buffer.length,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
