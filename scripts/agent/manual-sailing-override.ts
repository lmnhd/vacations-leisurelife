/**
 * Agent-safe manual sailing override.
 * Updates the stored campaign metadata and its media manifest in one pass,
 * then optionally exports a local JSON copy for review.
 *
 * Usage:
 *   npx tsx scripts/agent/manual-sailing-override.ts <slug> <specPath>
 */

import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';
import { getCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getMediaManifest, saveMediaManifest } from '@/lib/campaigns/media/media-store';
import type { Campaign, CampaignInventoryMode, InventoryHealthStatus } from '@/lib/campaigns/types';

loadEnvConfig(process.cwd());

type SailingOverrideSpec = {
    shipName: string;
    sailDate: string;
    departurePort: string;
    nights: string;
    startingPrice: number;
    targetDestination?: string;
    itinerarySummary: string;
    portsOfCall: string;
    itineraryDetails?: string[];
    priceSource: string;
    pricingStatus: Campaign['pricingStatus'];
    activeBookingMode: CampaignInventoryMode;
    inventoryHealth: InventoryHealthStatus;
    replaceStrings?: Record<string, string>;
    exportPath?: string;
};

const SKIP_REWRITE_KEYS = new Set([
    'url',
    'sourceImageUrl',
    'sourcePageUrl',
    'sourceThumbnailUrl',
    'assetId',
    'mimeType',
    'generator',
    'eligibilityRole',
    'createdAt',
    'updatedAt',
    'generatedAt',
]);

function applyStringReplacements(value: string, replacements: Record<string, string>): string {
    let next = value;
    for (const [from, to] of Object.entries(replacements)) {
        if (!from) continue;
        next = next.split(from).join(to);
    }
    return next;
}

function rewriteManifestValue(value: unknown, replacements: Record<string, string>, parentKey?: string): unknown {
    if (typeof value === 'string') {
        if (parentKey && SKIP_REWRITE_KEYS.has(parentKey)) {
            return value;
        }
        return applyStringReplacements(value, replacements);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => rewriteManifestValue(entry, replacements, parentKey));
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
            key,
            rewriteManifestValue(entry, replacements, key),
        ]);
        return Object.fromEntries(entries);
    }

    return value;
}

function applyCampaignOverride(campaign: Campaign, spec: SailingOverrideSpec): Campaign {
    return {
        ...campaign,
        shipTarget: spec.shipName,
        matchedShipName: spec.shipName,
        targetDates: spec.sailDate,
        targetDatesSource: 'inventory',
        matchedSailDate: spec.sailDate,
        matchedDeparturePort: spec.departurePort,
        matchedNights: spec.nights,
        startingPrice: spec.startingPrice,
        priceSource: spec.priceSource,
        pricingStatus: spec.pricingStatus,
        activeBookingMode: spec.activeBookingMode,
        inventoryHealth: spec.inventoryHealth,
        inventoryLastCheckedAt: new Date().toISOString(),
        odysseusItinerarySummary: spec.itinerarySummary,
        odysseusPortsOfCall: spec.portsOfCall,
        ...(spec.itineraryDetails?.length ? { manualItineraryTimeline: spec.itineraryDetails } : {}),
        ...(spec.targetDestination ? { targetDestination: spec.targetDestination } : {}),
        updatedAt: new Date().toISOString(),
    };
}

function applyManifestOverride(manifest: Record<string, unknown>, spec: SailingOverrideSpec): Record<string, unknown> {
    const replacements = spec.replaceStrings ?? {};
    const rewritten = rewriteManifestValue(manifest, replacements) as Record<string, unknown>;

    const copy = (rewritten.copy ?? {}) as Record<string, unknown>;
    const carouselSlides = Array.isArray(copy.carouselSlides) ? [...copy.carouselSlides] : [];
    if (typeof carouselSlides[0] === 'string') {
        carouselSlides[0] = 'Promenade in Full Dress. A 5-night Western Caribbean sailing on Explorer of the Seas for guests who love to wear the work beautifully.';
    }
    if (typeof carouselSlides[6] === 'string') {
        carouselSlides[6] = 'The Grand Costumed Promenade aboard Explorer of the Seas. Join the list now for the January 13, 2027 sailing while this version comes together.';
    }

    const adVariants = Array.isArray(copy.adVariants)
        ? copy.adVariants.map((entry) => ({ ...(entry as Record<string, unknown>) }))
        : [];
    if (adVariants[0]) {
        adVariants[0].description = 'A 5-night Western Caribbean sailing for guests who love to wear the work beautifully. Aboard Explorer of the Seas.';
    }
    if (adVariants[2]) {
        adVariants[2].description = '5-night Western Caribbean sailing. Explorer of the Seas. For guests who love the clothes and want to actually live in them.';
    }

    const captions = { ...((copy.captions ?? {}) as Record<string, unknown>) };
    const discord = typeof captions.discord === 'string'
        ? captions.discord.replace(
            'The Grand Costumed Promenade — Explorer of the Seas, Caribbean',
            'The Grand Costumed Promenade — Explorer of the Seas, Western Caribbean',
        )
        : captions.discord;
    captions.discord = discord;

    const promotion = rewritten.tiktokPromotionPackage && typeof rewritten.tiktokPromotionPackage === 'object'
        ? { ...(rewritten.tiktokPromotionPackage as Record<string, unknown>) }
        : null;
    if (promotion && Array.isArray(promotion.beats)) {
        const beats = promotion.beats.map((beat) => ({ ...(beat as Record<string, unknown>) }));
        if (beats[2] && typeof beats[2].subline === 'string') {
            beats[2].subline = 'One outfit or a full trunk—Explorer of the Seas, with people who notice trim.';
        }
        promotion.beats = beats;
    }

    return {
        ...rewritten,
        copy: {
            ...copy,
            carouselSlides,
            adVariants,
            captions,
        },
        ...(promotion ? { tiktokPromotionPackage: promotion } : {}),
    };
}

async function main(): Promise<void> {
    const [slug, specPathArg] = process.argv.slice(2);
    if (!slug || !specPathArg) {
        console.error('Usage: npx tsx scripts/agent/manual-sailing-override.ts <slug> <specPath>');
        process.exit(1);
    }

    const specPath = path.resolve(process.cwd(), specPathArg);
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as SailingOverrideSpec;

    const [campaign, manifest] = await Promise.all([
        getCampaignBlueprint(slug),
        getMediaManifest(slug),
    ]);

    if (!campaign) {
        console.error(`No campaign found for slug "${slug}".`);
        process.exit(1);
    }
    if (!manifest) {
        console.error(`No media manifest found for slug "${slug}".`);
        process.exit(1);
    }

    const updatedCampaign = applyCampaignOverride(campaign, spec);
    const updatedManifest = applyManifestOverride(manifest as unknown as Record<string, unknown>, spec);

    await saveCampaignBlueprint(updatedCampaign);
    await saveMediaManifest(updatedManifest as Parameters<typeof saveMediaManifest>[0]);

    let exportPath: string | null = null;
    if (spec.exportPath) {
        exportPath = path.resolve(process.cwd(), spec.exportPath);
        fs.mkdirSync(path.dirname(exportPath), { recursive: true });
        fs.writeFileSync(exportPath, JSON.stringify(updatedManifest, null, 2), 'utf-8');
    }

    console.log(JSON.stringify({
        slug,
        shipName: updatedCampaign.matchedShipName,
        sailDate: updatedCampaign.matchedSailDate,
        departurePort: updatedCampaign.matchedDeparturePort,
        nights: updatedCampaign.matchedNights,
        startingPrice: updatedCampaign.startingPrice,
        pricingStatus: updatedCampaign.pricingStatus,
        activeBookingMode: updatedCampaign.activeBookingMode,
        exportPath,
        updatedAt: updatedCampaign.updatedAt,
    }, null, 2));
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
