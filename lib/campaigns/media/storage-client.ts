import { isR2Available, uploadAsset, getAssetUrl } from './r2-client';
import { storeAssetBinary } from './media-store';

// ────────────────────────────────────────────────────────────────────────────
// Smart Asset Storage Client  (Phase 2C)
//
// Routing logic:
//   R2 configured  →  upload to Cloudflare R2, return CDN URL
//   R2 absent      →  store in DynamoDB (≤ DYNAMO_MAX_BYTES)
//                     or return a `r2://pending:{assetId}` placeholder for
//                     large binaries (images, video) that can't fit in Dynamo
//
// Served via:  GET /api/groups/campaign/:slug/media/asset-data/:assetId
// ────────────────────────────────────────────────────────────────────────────

/** 350 KB — leaves headroom below DynamoDB's 400 KB per-item limit. */
const DYNAMO_MAX_BYTES = 350 * 1024;

/**
 * Store an asset binary and return its resolvable URL.
 *
 * @param slug      Campaign slug (used as R2 path prefix and DynamoDB PK)
 * @param assetId   Stable asset identifier (used as DynamoDB SK suffix)
 * @param path      File path within R2 bucket / URL path suffix
 * @param buffer    Binary bytes to store
 * @param mimeType  MIME type (e.g. "image/webp", "audio/mpeg", "application/json")
 */
export async function storeAsset(
    slug: string,
    assetId: string,
    path: string,
    buffer: Buffer,
    mimeType: string,
): Promise<string> {
    // ── Primary: R2 ────────────────────────────────────────────────────────
    if (isR2Available()) {
        return uploadAsset(slug, path, buffer, mimeType);
    }

    // ── Fallback: DynamoDB binary (small assets only) ──────────────────────
    if (buffer.length <= DYNAMO_MAX_BYTES) {
        await storeAssetBinary(slug, assetId, buffer.toString('base64'), mimeType);
        // Served by the internal asset-data API route
        return `/api/groups/campaign/${slug}/media/asset-data/${assetId}`;
    }

    // ── Too large for DynamoDB without R2 — metadata-only placeholder ──────
    // The AssetRecord is still written to DynamoDB; only the binary is absent.
    // Provision R2 credentials to enable full binary storage.
    return `r2://pending:${assetId}`;
}

/** Re-export convenience helper so callers need only this module. */
export { getAssetUrl, isR2Available };
