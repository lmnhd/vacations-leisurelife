import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint, getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import { buildCampaignAdInput } from '@/lib/campaigns/media/ad-pack-adapter';
import { runQualityGate, AdCopySetSchema } from '@/lib/ads/copy-forge';
import { TEMPLATED_API_KEY } from '@/lib/ads/config';
import { AD_FORMATS, type AdFormat, type AdRenderResult } from '@/lib/ads/types';
import { buildTemplatedRenderPacks } from '@/lib/ads/render-pack';
import { renderWithTemplated } from '@/lib/ads/providers/templated';
import { sanitizeAdCopySetShipCopyForCampaign } from '@/lib/campaigns/ship-copy';

interface RenderRequestBody {
    slug?: string;
    formats?: AdFormat[];
    copySet?: unknown;
}

function isValidFormat(value: unknown): value is AdFormat {
    return typeof value === 'string' && (AD_FORMATS as readonly string[]).includes(value);
}

export async function POST(req: NextRequest) {
    try {
        if (!TEMPLATED_API_KEY) {
            return NextResponse.json(
                { error: 'TEMPLATED_API_KEY is not configured on the server. Add it to .env.local before rendering.' },
                { status: 503 },
            );
        }

        const body = (await req.json().catch(() => ({}))) as RenderRequestBody;
        const slug = body.slug?.trim();
        if (!slug) {
            return NextResponse.json({ error: 'Missing required field: slug' }, { status: 400 });
        }

        const requestedFormats = Array.isArray(body.formats) ? body.formats.filter(isValidFormat) : [];
        if (requestedFormats.length === 0) {
            return NextResponse.json(
                { error: `Missing required field: formats[] (at least one of ${AD_FORMATS.join(', ')})` },
                { status: 400 },
            );
        }

        const copySetResult = AdCopySetSchema.safeParse(body.copySet);
        if (!copySetResult.success) {
            return NextResponse.json({ error: 'copySet failed schema validation', issues: copySetResult.error.flatten() }, { status: 400 });
        }

        const [campaign, brief, manifest] = await Promise.all([
            getCampaignBlueprint(slug),
            getAestheticBrief(slug),
            getMediaManifest(slug),
        ]);

        if (!campaign) {
            return NextResponse.json({ error: `Campaign not found: ${slug}` }, { status: 404 });
        }
        if (!brief) {
            return NextResponse.json(
                { error: `No approved aesthetic brief for campaign "${slug}". Generate the brief first via /tests/brief-studio.` },
                { status: 404 },
            );
        }

        const input = buildCampaignAdInput({ brief, campaign, manifest, formats: requestedFormats });
        const copySet = sanitizeAdCopySetShipCopyForCampaign(copySetResult.data, campaign);
        const supportedFormats = requestedFormats.filter((format) => input.templateLayouts[format]);
        const skippedFormats = requestedFormats.filter((format) => !input.templateLayouts[format]);

        if (supportedFormats.length === 0) {
            return NextResponse.json(
                {
                    error: `No templates registered for (group_campaign, ${input.visualFlavor}). Add an entry to lib/ads/template-registry/templates.json before rendering.`,
                    visualFlavor: input.visualFlavor,
                    requestedFormats,
                },
                { status: 409 },
            );
        }

        const resolvedInput = { ...input, formats: supportedFormats };
        const qualityGate = runQualityGate(copySet, resolvedInput);
        if (!qualityGate.passed) {
            return NextResponse.json(
                { error: 'Copy set failed quality gate before render.', qualityGate },
                { status: 409 },
            );
        }

        const renderPacks = await buildTemplatedRenderPacks({
            slug,
            manifest,
            input: resolvedInput,
            copySet,
            formats: supportedFormats,
        });

        const renderedGroups: AdRenderResult[] = [];
        for (const pack of renderPacks) {
            const pages = [];
            for (const page of pack.pages) {
                // Carousel cards reuse one single-card template. Rendering each
                // card independently avoids Templated creating blank synthetic
                // pages when a `pages` array is sent to a one-page template.
                const response = await renderWithTemplated(page.request);
                const render = Array.isArray(response) ? response[0] : response;
                if (!render) {
                    throw new Error(`Templated returned no render for ${pack.format} ${page.page}.`);
                }
                pages.push({ ...page, render });
            }

            renderedGroups.push({
                format: pack.format,
                templateRef: pack.templateRef,
                request: pack.request,
                pages,
                selectedImages: pack.selectedImages,
            });
        }

        return NextResponse.json(
            {
                slug,
                visualFlavor: input.visualFlavor,
                requestedFormats,
                supportedFormats,
                skippedFormats,
                renderGroups: renderedGroups,
                qualityGate,
            },
            { status: 200 },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[ads:render]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
