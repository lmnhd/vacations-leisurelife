// POST /api/ads/copy-forge
//
// Test-page audition endpoint. Generates an AdCopySet for a campaign +
// requested formats, runs the deterministic quality gate, and returns
// everything needed to populate the /tests/canva-ads creative audition UI.
//
// This endpoint does NOT render anything (that lands in P3) and does NOT
// write to the manifest. It is read-only on the campaign side.

import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint, getAestheticBrief } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import { buildCampaignAdInput } from '@/lib/campaigns/media/ad-pack-adapter';
import { generateCopySet, runQualityGate } from '@/lib/ads/copy-forge';
import { AD_FORMATS, type AdFormat } from '@/lib/ads/types';
import { lookupTemplate } from '@/lib/ads/template-registry';

interface CopyForgeRequestBody {
    slug?: string;
    formats?: AdFormat[];
}

function isValidFormat(value: unknown): value is AdFormat {
    return typeof value === 'string' && (AD_FORMATS as readonly string[]).includes(value);
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json().catch(() => ({}))) as CopyForgeRequestBody;
        const slug = body.slug?.trim();
        if (!slug) {
            return NextResponse.json({ error: 'Missing required field: slug' }, { status: 400 });
        }

        const requestedFormats = Array.isArray(body.formats) ? body.formats.filter(isValidFormat) : [];
        if (requestedFormats.length === 0) {
            return NextResponse.json(
                { error: 'Missing required field: formats[] (at least one of ig_square, fb_google_display, story_reel, carousel)' },
                { status: 400 },
            );
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

        const missingTemplates = requestedFormats.filter((f) => !input.templateLayouts[f]);
        if (missingTemplates.length === requestedFormats.length) {
            return NextResponse.json(
                {
                    error: `No templates registered for (group_campaign, ${input.visualFlavor}). Add an entry to lib/ads/template-registry/templates.json before running Copy Forge.`,
                    visualFlavor: input.visualFlavor,
                    requestedFormats,
                },
                { status: 409 },
            );
        }

        const supportedFormats = requestedFormats.filter((f) => input.templateLayouts[f]);
        const resolvedInput = { ...input, formats: supportedFormats };

        const result = await generateCopySet(resolvedInput);

        const templateRefs = Object.fromEntries(
            supportedFormats.map((format) => {
                const ref = lookupTemplate('group_campaign', input.visualFlavor, format);
                return [format, ref ? { templatedId: ref.templatedId, dimensions: ref.dimensions } : null];
            }),
        );

        return NextResponse.json(
            {
                slug,
                visualFlavor: input.visualFlavor,
                requestedFormats,
                supportedFormats,
                skippedFormats: requestedFormats.filter((f) => !input.templateLayouts[f]),
                availableImages: input.availableImages,
                templateLayouts: Object.fromEntries(
                    supportedFormats.map((f) => [f, input.templateLayouts[f]]),
                ),
                templateRefs,
                copySet: result.copySet,
                qualityGate: result.qualityGate,
                warnings: result.warnings,
                modelId: result.modelId,
                regenerated: result.regenerated,
                briefInputs: {
                    avoidDirectives: input.brief.avoidDirectives,
                    nicheSignals: input.brief.nicheSignals,
                    propFamilies: input.brief.propFamilies,
                    cruiseNativeMoments: input.brief.cruiseNativeMoments,
                },
            },
            { status: 200 },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[ads:copy-forge]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// GET /api/ads/copy-forge — convenience: re-run the deterministic gate
// against a previously-saved AdCopySet (useful for the page's "Re-check
// without regenerating" affordance).
export async function PUT(req: NextRequest) {
    try {
        const body = (await req.json()) as {
            slug?: string;
            formats?: AdFormat[];
            copySet?: unknown;
        };
        if (!body.slug || !Array.isArray(body.formats) || !body.copySet) {
            return NextResponse.json({ error: 'Required fields: slug, formats[], copySet' }, { status: 400 });
        }
        const formats = body.formats.filter(isValidFormat);

        const [campaign, brief, manifest] = await Promise.all([
            getCampaignBlueprint(body.slug),
            getAestheticBrief(body.slug),
            getMediaManifest(body.slug),
        ]);
        if (!campaign || !brief) {
            return NextResponse.json({ error: 'Campaign or brief not found' }, { status: 404 });
        }
        const input = buildCampaignAdInput({ brief, campaign, manifest, formats });
        const gate = runQualityGate(body.copySet as Parameters<typeof runQualityGate>[0], input);
        return NextResponse.json({ qualityGate: gate }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[ads:copy-forge:recheck]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
