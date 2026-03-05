import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// ────────────────────────────────────────────────────────────────────────────
// Cloudflare R2 Asset Storage Client
// Uses S3-compatible SDK with R2 endpoint override.
// Bucket: lll-campaign-media
// CDN pattern: https://cdn.leisurelifeinteractive.com/campaigns/{slug}/...
// ────────────────────────────────────────────────────────────────────────────

const R2_BUCKET = 'lll-campaign-media';

function getR2Client(): S3Client {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error(
            'Missing R2 credentials. Set CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY in .env.local'
        );
    }

    return new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
}

/**
 * Constructs the deterministic CDN URL for an asset.
 * Pattern: {R2_PUBLIC_BUCKET_URL}/campaigns/{slug}/{path}
 */
export function getAssetUrl(slug: string, path: string): string {
    const baseUrl = process.env.R2_PUBLIC_BUCKET_URL || 'https://cdn.leisurelifeinteractive.com';
    return `${baseUrl}/campaigns/${slug}/${path}`;
}

/**
 * Uploads a binary asset to R2 and returns its CDN URL.
 */
export async function uploadAsset(
    slug: string,
    path: string,
    buffer: Buffer,
    mimeType: string
): Promise<string> {
    const r2 = getR2Client();
    const key = `campaigns/${slug}/${path}`;

    await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000', // 1 year — assets are immutable by version
    }));

    return getAssetUrl(slug, path);
}

/**
 * Deletes an asset from R2.
 */
export async function deleteAsset(slug: string, path: string): Promise<void> {
    const r2 = getR2Client();
    const key = `campaigns/${slug}/${path}`;

    await r2.send(new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
    }));
}
