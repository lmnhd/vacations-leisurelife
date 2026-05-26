import { buildTemplatedRenderPacks } from '@/lib/ads/render-pack';
import { generateCopySet, runQualityGate } from '@/lib/ads/copy-forge';
import { renderWithTemplated } from '@/lib/ads/providers/templated';
import type {
    AdCopySet,
    AdFormat,
    CopyForgeInput,
    CopyForgeResult,
    QualityGateResult,
} from '@/lib/ads/types';
import type {
    AssetRecord,
    CampaignAestheticBrief,
    CampaignMediaManifest,
} from '../../schema';
import type { Campaign } from '../../types';
import { buildCampaignAdInput } from '../ad-pack-adapter';
import { saveAssetRecord } from '../media-store';
import { storeAsset } from '../storage-client';

const DEFAULT_TEMPLATED_AD_FORMATS: readonly AdFormat[] = [
    'meta_feed_square',
    'meta_feed_portrait',
    'meta_story_reel',
    'meta_carousel_square',
    'google_display_landscape',
    'google_display_square',
    'google_display_vertical',
];

function mergeCopyForgeResults(results: Array<{ format: AdFormat; result: CopyForgeResult }>): CopyForgeResult {
    const first = results[0]?.result;
    if (!first) {
        throw new Error('Copy Forge did not return any format results.');
    }

    const copySet: AdCopySet = {
        creativeTerritory: first.copySet.creativeTerritory,
        compositionIntent: results
            .map(({ format, result }) => `${format}: ${result.copySet.compositionIntent}`)
            .join('\n\n'),
        formats: {},
    };

    const checks: QualityGateResult['checks'] = [];
    let blockerCount = 0;
    let warningCount = 0;
    const warnings = new Set<string>();
    let regenerated = false;

    for (const { format, result } of results) {
        const pack = result.copySet.formats[format];
        if (pack) {
            copySet.formats[format] = pack;
        }
        for (const check of result.qualityGate.checks) {
            checks.push({
                ...check,
                message: `[${format}] ${check.message}`,
            });
        }
        blockerCount += result.qualityGate.blockerCount;
        warningCount += result.qualityGate.warningCount;
        result.warnings.forEach((warning) => warnings.add(warning));
        regenerated ||= result.regenerated;
    }

    return {
        copySet,
        qualityGate: {
            passed: blockerCount === 0,
            blockerCount,
            warningCount,
            checks,
        },
        warnings: Array.from(warnings),
        modelId: first.modelId,
        regenerated,
    };
}

async function generateCopySetForFormats(input: CopyForgeInput): Promise<CopyForgeResult> {
    const supportedFormats = input.formats.filter((format) => input.templateLayouts[format]);
    if (supportedFormats.length === 0) {
        throw new Error('No Canva/Templated templates are registered for this campaign visual flavor.');
    }

    if (supportedFormats.length === 1) {
        return generateCopySet({ ...input, formats: supportedFormats });
    }

    return mergeCopyForgeResults(await Promise.all(
        supportedFormats.map(async (format) => ({
            format,
            result: await generateCopySet({
                ...input,
                formats: [format],
                templateLayouts: {
                    [format]: input.templateLayouts[format],
                },
            }),
        })),
    ));
}

function distributionTagsForFormat(format: AdFormat): string[] {
    const tags: string[] = [];
    if (format.startsWith('google_display')) tags.push('google_display');
    if (format.startsWith('meta_')) tags.push('meta');
    if (format.includes('story') || format.includes('reel')) tags.push('story', 'reel');
    if (format.includes('carousel')) tags.push('carousel');
    return tags;
}

function formatFailedGateChecks(gate: QualityGateResult): string {
    return gate.checks
        .filter((check) => !check.passed)
        .map((check) => `[${check.severity}:${check.key}] ${check.message}`)
        .join(' | ');
}

function filterCopySetByFormats(copySet: AdCopySet, formats: readonly AdFormat[]): AdCopySet {
    const filtered: AdCopySet = {
        creativeTerritory: copySet.creativeTerritory,
        compositionIntent: copySet.compositionIntent,
        formats: {},
    };

    for (const format of formats) {
        const pack = copySet.formats[format];
        if (pack) {
            filtered.formats[format] = pack;
        }
    }

    return filtered;
}

export interface TemplatedAdGenerationResult {
    designedAds: AssetRecord[];
    copySet: AdCopySet;
    qualityGate: QualityGateResult;
    warnings: string[];
}

export async function generateTemplatedAdArtifactPack(args: {
    slug: string;
    brief: CampaignAestheticBrief;
    campaign: Campaign;
    manifest: CampaignMediaManifest;
    formats?: readonly AdFormat[];
}): Promise<TemplatedAdGenerationResult> {
    const formats = [...(args.formats ?? DEFAULT_TEMPLATED_AD_FORMATS)];
    const input = buildCampaignAdInput({
        brief: args.brief,
        campaign: args.campaign,
        manifest: args.manifest,
        formats,
    });
    const supportedFormats = formats.filter((format) => input.templateLayouts[format]);
    const resolvedInput = { ...input, formats: supportedFormats };
    const copyResult = await generateCopySetForFormats(resolvedInput);
    let renderableFormats = supportedFormats;
    let renderableCopySet = copyResult.copySet;
    let qualityGate = runQualityGate(copyResult.copySet, resolvedInput);
    const warnings = [...copyResult.warnings];

    if (!qualityGate.passed) {
        const formatGateResults = supportedFormats.map((format) => {
            const formatInput = {
                ...resolvedInput,
                formats: [format],
                templateLayouts: { [format]: resolvedInput.templateLayouts[format] },
            };
            const formatCopySet = filterCopySetByFormats(copyResult.copySet, [format]);
            return {
                format,
                gate: runQualityGate(formatCopySet, formatInput),
            };
        });

        const passedFormats = formatGateResults
            .filter(({ gate }) => gate.passed)
            .map(({ format }) => format);

        const failedDetails = formatGateResults
            .filter(({ gate }) => !gate.passed)
            .map(({ format, gate }) => `${format}: ${formatFailedGateChecks(gate)}`)
            .join(' || ');

        if (passedFormats.length === 0) {
            throw new Error(
                `Copy Forge quality gate failed for all Canva/Templated ads: ${qualityGate.blockerCount} blocker(s). ${failedDetails}`,
            );
        }

        renderableFormats = passedFormats;
        renderableCopySet = filterCopySetByFormats(copyResult.copySet, renderableFormats);
        const renderableInput = { ...resolvedInput, formats: renderableFormats };
        qualityGate = runQualityGate(renderableCopySet, renderableInput);
        warnings.push(
            `Skipped ${supportedFormats.length - renderableFormats.length} Canva/Templated format(s) that failed Copy Forge gate: ${failedDetails}`,
        );
    }

    const renderPacks = await buildTemplatedRenderPacks({
        slug: args.slug,
        manifest: args.manifest,
        input: { ...resolvedInput, formats: renderableFormats },
        copySet: renderableCopySet,
        formats: renderableFormats,
    });

    const records: AssetRecord[] = [];
    for (const pack of renderPacks) {
        for (const page of pack.pages) {
            const response = await renderWithTemplated(page.request);
            const render = Array.isArray(response) ? response[0] : response;
            if (!render?.url) {
                throw new Error(`Templated returned no render URL for ${pack.format} ${page.page}.`);
            }

            const renderedResponse = await fetch(render.url);
            if (!renderedResponse.ok) {
                throw new Error(`Failed to download Templated render for ${pack.format} ${page.page}: ${renderedResponse.status}`);
            }

            const buffer = Buffer.from(await renderedResponse.arrayBuffer());
            const pageSuffix = page.page.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
            const isSinglePage = pack.pages.length === 1;
            const assetId = isSinglePage
                ? `templated_${pack.format}`
                : `templated_${pack.format}_${pageSuffix}`;
            const fileName = isSinglePage
                ? `ads/templated/${pack.format}.png`
                : `ads/templated/${pack.format}_${pageSuffix}.png`;
            const url = await storeAsset(args.slug, assetId, fileName, buffer, 'image/png');
            const record: AssetRecord = {
                assetId,
                assetType: 'designed_ad_artifact',
                url,
                generator: 'templated',
                promptUsed: JSON.stringify({
                    provider: 'templated',
                    format: pack.format,
                    page: page.page,
                    templateId: pack.templateRef.templatedId,
                    selectedImages: page.selectedImages.map((image) => ({
                        slotName: image.slotName,
                        assetId: image.assetId,
                        assetType: image.assetType,
                    })),
                }),
                fileSizeBytes: buffer.length,
                mimeType: 'image/png',
                tags: [
                    'designed_ad',
                    'canva_templated',
                    'provider:templated',
                    `format:${pack.format}`,
                    `page:${page.page}`,
                    'workflow:group_campaign',
                    ...distributionTagsForFormat(pack.format),
                ],
                createdAt: new Date().toISOString(),
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
                dimensions: {
                    width: render.width ?? pack.templateRef.dimensions.width,
                    height: render.height ?? pack.templateRef.dimensions.height,
                },
                sourceImageUrl: page.selectedImages[0]?.sourceUrl,
            };
            await saveAssetRecord(args.slug, record);
            records.push(record);
        }
    }

    return {
        designedAds: records,
        copySet: renderableCopySet,
        qualityGate,
        warnings,
    };
}
