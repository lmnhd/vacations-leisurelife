import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { storeAsset } from '@/lib/campaigns/media/storage-client';
import { saveAssetRecord } from '@/lib/campaigns/media/media-store';
import { AssetTypeEnum, GeneratorServiceEnum, ReviewStatusEnum } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/store
// Phase 2C – External asset ingestion endpoint.
//
// Accepts a base64-encoded binary from an external agent (or another service),
// routes it through the smart storage client (R2 when available, DynamoDB
// fallback for small assets), and writes an AssetRecord to DynamoDB.
//
// Body: StoreAssetRequest (see schema below)
// Returns: { assetId, url, storageBackend }
// ────────────────────────────────────────────────────────────────────────────

const StoreAssetRequestSchema = z.object({
    assetId:       z.string().min(1),
    assetType:     AssetTypeEnum,
    fileName:      z.string().min(1),            // relative path within bucket / URL suffix
    mimeType:      z.string().min(1),
    bufferBase64:  z.string().min(1),            // base64-encoded binary
    generator:     GeneratorServiceEnum,
    promptUsed:    z.string().default(''),
    tags:          z.array(z.string()).default([]),
    dimensions:    z.object({ width: z.number(), height: z.number() }).optional(),
    durationSeconds: z.number().optional(),
    version:       z.number().int().min(1).default(1),
    reviewStatus:  ReviewStatusEnum.default('needs_review'),
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

    const parsed = StoreAssetRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid request body', issues: parsed.error.issues },
            { status: 400 }
        );
    }

    const {
        assetId, assetType, fileName, mimeType, bufferBase64,
        generator, promptUsed, tags, dimensions, durationSeconds,
        version, reviewStatus,
    } = parsed.data;

    try {
        const buffer = Buffer.from(bufferBase64, 'base64');

        // Route to R2 or DynamoDB fallback
        const url = await storeAsset(slug, assetId, fileName, buffer, mimeType);

        const storageBackend = url.startsWith('/api/') ? 'dynamodb'
            : url.startsWith('r2://pending') ? 'none (r2 required)'
            : 'r2';

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
            reviewStatus,
            version,
            active: true,
            ...(dimensions ? { dimensions } : {}),
            ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        };

        await saveAssetRecord(slug, record);

        return NextResponse.json({
            assetId,
            url,
            storageBackend,
            fileSizeBytes: buffer.length,
            version,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
