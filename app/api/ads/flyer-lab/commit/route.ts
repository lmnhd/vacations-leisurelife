// app/api/ads/flyer-lab/commit/route.ts
//
// Persist a flyer image generated in /tests/flyer-lab into the REAL campaign
// manifest. Two modes:
//   • add     — store the image as a NEW flyer_image asset in manifest.images.flyerImages
//   • replace — overwrite an EXISTING flyer in place (same assetId, new image +
//               cache-busting fileName) so any landing/ad selections that point at
//               it keep working and simply show the new picture.
//
// The lab sends the exact bytes it rendered (base64 data URL) so the committed
// image is the one the operator approved — never a fresh re-generation.

import { NextResponse } from 'next/server';
import { storeAsset } from '@/lib/campaigns/media/storage-client';
import {
    saveAssetRecord,
    getActiveAssetRecord,
    upsertManifestAssetSection,
} from '@/lib/campaigns/media/media-store';
import type { AssetRecord, GeneratorService } from '@/lib/campaigns/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface Body {
    slug?: string;
    dataUrl?: string;
    prompt?: string;
    mode?: 'add' | 'assign';
    targetAssetId?: string;
    generator?: string;
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
    if (!match) return null;
    return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function resolveGenerator(value: unknown): GeneratorService {
    return value === 'gpt_image_2' ? 'gpt_image_2' : 'gemini3_flash';
}

export async function POST(req: Request) {
    let body: Body;
    try {
        body = await req.json() as Body;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const slug = (body.slug ?? '').trim();
    if (!slug || typeof body.dataUrl !== 'string') {
        return NextResponse.json({ error: 'slug and dataUrl are required' }, { status: 400 });
    }
    const decoded = decodeDataUrl(body.dataUrl);
    if (!decoded) {
        return NextResponse.json({ error: 'dataUrl must be a base64 data URL' }, { status: 400 });
    }

    // 'assign' replaces 'replace' — it places the image into a flyer's variant
    // group as the chosen model-version slot (so it surfaces under the source
    // toggle in media-generation). 'add' creates a brand-new flyer.
    const mode = body.mode === 'assign' ? 'assign' : 'add';
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const generator = resolveGenerator(body.generator);
    const now = new Date().toISOString();
    const stamp = Date.now().toString(36);

    const buildFlyerRecord = (assetId: string, url: string, variantGroupId: string): AssetRecord => ({
        assetId,
        assetType: 'flyer_image',
        url,
        generator,
        promptUsed: prompt,
        fileSizeBytes: decoded.buffer.length,
        mimeType: decoded.mimeType,
        tags: ['flyer', 'single_image', 'flyer_lab'],
        createdAt: now,
        reviewStatus: 'auto_approved',
        version: 1,
        active: true,
        dimensions: { width: 1024, height: 1024 },
        eligibilityRole: 'source.flyer',
        variantGroupId,
    });

    try {
        const toUpsert: AssetRecord[] = [];
        let record: AssetRecord;

        if (mode === 'assign') {
            const targetAssetId = (body.targetAssetId ?? '').trim();
            if (!targetAssetId) {
                return NextResponse.json({ error: 'targetAssetId is required for assign' }, { status: 400 });
            }
            const existing = await getActiveAssetRecord(slug, targetAssetId);
            if (!existing) {
                return NextResponse.json({ error: `Flyer not found: ${targetAssetId}` }, { status: 404 });
            }
            const groupId = existing.variantGroupId ?? existing.assetId;
            // Same-model legacy target (no group) → overwrite it in place. Otherwise
            // write/replace the group's `<groupId>__<generator>` model-version member.
            const replaceInPlace = !existing.variantGroupId && existing.generator === generator;
            const memberAssetId = replaceInPlace ? existing.assetId : `${groupId}__${generator}`;

            // Adding a sibling to a legacy (ungrouped) target → stamp the target into
            // the group so both the review grouping and the collapse logic pair them.
            if (!existing.variantGroupId && !replaceInPlace) {
                const stamped: AssetRecord = { ...existing, variantGroupId: groupId };
                await saveAssetRecord(slug, stamped);
                toUpsert.push(stamped);
            }

            const fileName = `flyers/${memberAssetId}__lab${stamp}.png`;
            const url = await storeAsset(slug, `${memberAssetId}__lab${stamp}`, fileName, decoded.buffer, decoded.mimeType);
            const existingMember = replaceInPlace ? existing : await getActiveAssetRecord(slug, memberAssetId);
            record = existingMember
                ? {
                    ...existingMember,
                    url,
                    promptUsed: prompt || existingMember.promptUsed,
                    generator,
                    fileSizeBytes: decoded.buffer.length,
                    mimeType: decoded.mimeType,
                    createdAt: now,
                    version: (existingMember.version ?? 1) + 1,
                    active: true,
                    variantGroupId: groupId,
                }
                : buildFlyerRecord(memberAssetId, url, groupId);
        } else {
            const groupId = `flyer_lab_${stamp}`;
            const assetId = `${groupId}__${generator}`;
            const fileName = `flyers/${assetId}.png`;
            const url = await storeAsset(slug, assetId, fileName, decoded.buffer, decoded.mimeType);
            record = buildFlyerRecord(assetId, url, groupId);
        }

        await saveAssetRecord(slug, record);
        toUpsert.push(record);
        const manifest = await upsertManifestAssetSection(slug, 'flyerImages', toUpsert);

        return NextResponse.json({
            asset: { assetId: record.assetId, url: record.url, variantGroupId: record.variantGroupId, generator: record.generator },
            mode,
            flyerCount: manifest.images.flyerImages?.length ?? 0,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
