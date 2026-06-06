// app/ads/render/[slug]/[format]/page.tsx
//
// Server-rendered page used by the HTML screenshot provider.
// Playwright navigates here and screenshots the viewport at native template
// dimensions — no scaling, no page chrome.
//
// Query params:
//   none required — slug and format come from the route segments.

import { notFound } from 'next/navigation';
import { getAestheticBrief, getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import { sanitizeAestheticBriefShipCopyForCampaign } from '@/lib/campaigns/ship-copy';
import { getAuthoritativeShipName } from '@/lib/campaigns/ship-context';
import {
    resolveTemplateData,
    buildImagePool,
    buildImageAssetIndex,
    resolveSlotImages,
    resolveAdOverride,
    TEMPLATE_DIMENSIONS,
    type HtmlTemplateBrief,
    type HtmlTemplateManifest,
} from '@/lib/ads/html-templates/core';
import { FORMAT_COMPONENTS, SingleImageAd } from '@/lib/ads/html-templates/components';

export const dynamic = 'force-dynamic';

interface Props {
    params: Promise<{ slug: string; format: string }>;
}

export default async function AdRenderPage({ params }: Props) {
    const { slug, format } = await params;

    const Component = FORMAT_COMPONENTS[format];
    if (!Component) notFound();

    const dims = TEMPLATE_DIMENSIONS[format];
    if (!dims) notFound();

    // Fetch brief and manifest in parallel — manifest may legitimately be absent.
    const [campaign, brief, manifest] = await Promise.all([
        getCampaignBlueprint(slug).catch(() => null),
        getAestheticBrief(slug).catch(() => null),
        getMediaManifest(slug).catch(() => null),
    ]);
    const displayBrief = brief && campaign
        ? {
            ...sanitizeAestheticBriefShipCopyForCampaign(brief, campaign),
            shipName: getAuthoritativeShipName(campaign) ?? undefined,
        }
        : brief;

    const typedManifest = manifest as HtmlTemplateManifest | null;
    const d = resolveTemplateData(displayBrief as HtmlTemplateBrief | null, {
        formatKey: format,
        copySelections: typedManifest?.copySelections ?? {},
    });
    const pool = typedManifest ? buildImagePool(typedManifest) : null;
    const assetById = typedManifest ? buildImageAssetIndex(typedManifest) : undefined;
    const imgs = pool ? resolveSlotImages(format, pool, {
        selections: typedManifest?.imageSelections ?? {},
        slotControls: typedManifest?.imageSlotControls ?? {},
        assetById,
    }) : {};

    // Single Image Override wins over the whole template — the flyer (with its own
    // baked-in text) becomes the entire ad and all template chrome is muted.
    const override = resolveAdOverride(format, {
        selections: typedManifest?.imageSelections ?? {},
        slotControls: typedManifest?.imageSlotControls ?? {},
        assetById,
    });

    return (
        <>
            {/*
                Reset so the screenshot captures only the template.
                — kills body margins/padding from Tailwind base + browser default
                — pins .ad-render-root to viewport corner with a high z-index
                  so providers/portals can co-exist but stay BEHIND the template
                — hides Next.js dev overlay portals
                — NOTE: do not use `body > *:not(.ad-render-root) { display: none }` —
                  it can collapse Next.js's hydration containers and break layout.
            */}
            <style dangerouslySetInnerHTML={{ __html: `
                html, body { margin: 0 !important; padding: 0 !important; background: #000 !important; overflow: hidden !important; }
                .ad-render-root {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    z-index: 2147483647 !important;
                    background: #000;
                }
                nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
                [data-nextjs-dev-tools-button], [data-nextjs-dialog-overlay],
                [data-nextjs-dialog] { display: none !important; }
            `}} />
            <div
                className="ad-render-root"
                style={{ width: dims.width, height: dims.height, overflow: 'hidden' }}
            >
                {override ? (
                    <SingleImageAd
                        width={dims.width}
                        height={dims.height}
                        url={override.url}
                        fit={override.fit}
                        position={override.position}
                        flipX={override.flipX}
                    />
                ) : (
                    <Component d={d} imgs={imgs} slotControls={typedManifest?.imageSlotControls ?? {}} />
                )}
            </div>
        </>
    );
}
