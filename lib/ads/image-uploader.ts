import { isR2Available, storeAsset } from '@/lib/campaigns/media/storage-client';
import type { AssetRecord } from '@/lib/campaigns/schema';

const IMAGE_EXTENSIONS: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/avif': '.avif',
};

function getAppBaseUrl(): string {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.VERCEL_URL?.trim();
    if (!configured) {
        return 'http://localhost:3000';
    }

    if (/^https?:\/\//i.test(configured)) {
        return configured.replace(/\/$/, '');
    }

    return `https://${configured.replace(/\/$/, '')}`;
}

function getNormalizedHost(url: string): string {
    try {
        return new URL(url).host.toLowerCase();
    } catch {
        return '';
    }
}

function toAbsoluteUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
        return url;
    }

    const baseUrl = getAppBaseUrl();
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function isProbablyInternalUrl(url: string): boolean {
    if (!url) return false;
    if (url.startsWith('/api/') || url.includes('/api/groups/campaign/') || url.startsWith('r2://pending:')) {
        return true;
    }

    if (!/^https?:\/\//i.test(url)) {
        return false;
    }

    const normalizedUrl = url.replace(/\/$/, '');
    const appBaseUrl = getAppBaseUrl().replace(/\/$/, '');
    if (normalizedUrl.startsWith(appBaseUrl)) {
        return true;
    }

    const host = getNormalizedHost(url);
    return host === 'localhost:3000' || host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
}

function inferExtension(mimeType: string | null | undefined, fallbackUrl: string): string {
    const normalizedMime = mimeType?.toLowerCase().split(';')[0]?.trim() ?? '';
    if (normalizedMime && IMAGE_EXTENSIONS[normalizedMime]) {
        return IMAGE_EXTENSIONS[normalizedMime];
    }

    const urlPath = fallbackUrl.split('?')[0] ?? '';
    const dotIndex = urlPath.lastIndexOf('.');
    if (dotIndex >= 0 && dotIndex < urlPath.length - 1) {
        const ext = urlPath.slice(dotIndex);
        if (ext.length <= 8) {
            return ext;
        }
    }

    return '.png';
}

function isPublicHttpUrl(url: string): boolean {
    return /^https?:\/\//i.test(url) && !isProbablyInternalUrl(url);
}

function resolveSourceUrl(slug: string, asset: Pick<AssetRecord, 'assetId' | 'url' | 'sourceImageUrl' | 'sourceThumbnailUrl' | 'sourcePageUrl'>): string {
    const candidates = [
        asset.url,
        asset.sourceImageUrl,
        asset.sourceThumbnailUrl,
        asset.sourcePageUrl,
        `/api/groups/campaign/${slug}/media/asset-data/${asset.assetId}`,
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        if (/^https?:\/\//i.test(candidate)) {
            return candidate;
        }
        if (candidate.startsWith('/')) {
            return toAbsoluteUrl(candidate);
        }
    }

    return toAbsoluteUrl(`/api/groups/campaign/${slug}/media/asset-data/${asset.assetId}`);
}

export interface PreparedRenderImageSource {
    assetId: string;
    sourceUrl: string;
    publicUrl: string;
    mimeType: string;
    fileName: string;
    rehosted: boolean;
}

/**
 * Resolve a manifest asset to a public image URL suitable for Templated.
 * Internal app URLs are re-hosted through the campaign asset store when R2 is
 * available. External public URLs are passed through unchanged.
 */
export async function prepareRenderImageSource(
    slug: string,
    asset: Pick<AssetRecord, 'assetId' | 'url' | 'sourceImageUrl' | 'sourceThumbnailUrl' | 'sourcePageUrl' | 'mimeType'>,
    fileNamePrefix = 'ads/templated-sources',
): Promise<PreparedRenderImageSource> {
    const sourceUrl = resolveSourceUrl(slug, asset);
    if (isPublicHttpUrl(sourceUrl)) {
        return {
            assetId: asset.assetId,
            sourceUrl,
            publicUrl: sourceUrl,
            mimeType: asset.mimeType,
            fileName: `${fileNamePrefix}/${asset.assetId}${inferExtension(asset.mimeType, sourceUrl)}`,
            rehosted: false,
        };
    }

    const fetchUrl = sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')
        ? sourceUrl
        : toAbsoluteUrl(sourceUrl);
    const response = await fetch(fetchUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch manifest asset ${asset.assetId} from ${fetchUrl}: ${response.status} ${response.statusText}`);
    }

    const mimeType = (response.headers.get('content-type') ?? asset.mimeType ?? 'image/png').split(';')[0].trim() || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = `${fileNamePrefix}/${asset.assetId}${inferExtension(mimeType, fetchUrl)}`;

    if (!isR2Available()) {
        return {
            assetId: asset.assetId,
            sourceUrl: fetchUrl,
            publicUrl: fetchUrl,
            mimeType,
            fileName,
            rehosted: false,
        };
    }

    const publicUrl = await storeAsset(slug, asset.assetId, fileName, buffer, mimeType);
    return {
        assetId: asset.assetId,
        sourceUrl: fetchUrl,
        publicUrl,
        mimeType,
        fileName,
        rehosted: true,
    };
}
