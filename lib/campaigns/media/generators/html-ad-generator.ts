// lib/campaigns/media/generators/html-ad-generator.ts
//
// HTML screenshot-based ad generator. Mirrors the shape of
// templated-ad-generator.ts but replaces the Templated.io API call with a
// local Playwright screenshot of /ads/render/[slug]/[format].
//
// Copy is drawn directly from the campaign brief (heroSlogan, ctaVariants, etc.)
// so no Copy Forge call is needed — the HTML templates drive their own copy.

import {
    screenshotAllHtmlTemplates,
    HTML_SCREENSHOT_SUPPORTED_FORMATS,
} from '@/lib/ads/providers/html-screenshot';
import type { AdFormat } from '@/lib/ads/types';
import type { AssetRecord } from '../../schema';
import { saveAssetRecord } from '../media-store';
import { storeAsset } from '../storage-client';

const DEFAULT_HTML_AD_FORMATS: readonly AdFormat[] = HTML_SCREENSHOT_SUPPORTED_FORMATS;

function distributionTagsForFormat(format: AdFormat): string[] {
    const tags: string[] = [];
    if (format.startsWith('google_display')) tags.push('google_display');
    if (format.startsWith('meta_'))          tags.push('meta');
    if (format.includes('story') || format.includes('reel')) tags.push('story', 'reel');
    if (format.includes('carousel'))         tags.push('carousel');
    if (format.includes('ig_'))              tags.push('instagram');
    return tags;
}

export interface HtmlAdGenerationResult {
    designedAds: AssetRecord[];
    warnings: string[];
    skippedFormats: AdFormat[];
}

export async function generateHtmlAdArtifacts(args: {
    slug: string;
    formats?: readonly AdFormat[];
    onProgress?: (format: AdFormat, index: number, total: number) => void;
}): Promise<HtmlAdGenerationResult> {
    const formats = args.formats ?? DEFAULT_HTML_AD_FORMATS;
    const warnings: string[] = [];
    const skippedFormats: AdFormat[] = [];
    const records: AssetRecord[] = [];

    let screenshots;
    try {
        screenshots = await screenshotAllHtmlTemplates(
            args.slug,
            formats,
            args.onProgress,
        );
    } catch (err) {
        throw new Error(
            `HTML screenshot provider failed: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    for (const shot of screenshots) {
        if (!shot.buffer || shot.buffer.length === 0) {
            warnings.push(`Empty screenshot for ${shot.format} — skipped`);
            skippedFormats.push(shot.format);
            continue;
        }

        const assetId = `html_screenshot_${shot.format}`;
        const fileName = `ads/html/${shot.format}.png`;

        let url: string;
        try {
            url = await storeAsset(args.slug, assetId, fileName, shot.buffer, 'image/png');
        } catch (err) {
            warnings.push(`R2 upload failed for ${shot.format}: ${err instanceof Error ? err.message : String(err)}`);
            skippedFormats.push(shot.format);
            continue;
        }

        const record: AssetRecord = {
            assetId,
            assetType: 'designed_ad_artifact',
            url,
            generator: 'html_screenshot',
            promptUsed: JSON.stringify({
                provider: 'html_screenshot',
                format: shot.format,
                renderUrl: shot.renderUrl,
                dimensions: { width: shot.width, height: shot.height },
            }),
            fileSizeBytes: shot.buffer.length,
            mimeType: 'image/png',
            tags: [
                'designed_ad',
                'html_screenshot',
                'provider:html_screenshot',
                `format:${shot.format}`,
                'workflow:group_campaign',
                ...distributionTagsForFormat(shot.format),
            ],
            createdAt: new Date().toISOString(),
            reviewStatus: 'needs_review',
            version: 1,
            active: true,
            dimensions: { width: shot.width, height: shot.height },
        };

        await saveAssetRecord(args.slug, record);
        records.push(record);
    }

    return { designedAds: records, warnings, skippedFormats };
}
