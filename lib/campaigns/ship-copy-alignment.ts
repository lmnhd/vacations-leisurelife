import type { RedTeamIssue } from './schema';
import type { Campaign } from './types';

type ShipBrand = 'virgin' | 'royal_caribbean' | 'unknown';
type ShipClass = 'oasis' | 'radiance' | 'vision' | 'unknown';

type ShipContext = {
    authoritativeShip: string | null;
    brand: ShipBrand;
    shipClass: ShipClass;
    specificShipConflict: boolean;
    targetBrandConflict: boolean;
};

export type ShipCopyAlignmentReview = {
    issues: RedTeamIssue[];
    requiredFixes: string[];
    optionalImprovements: string[];
};

const ROYAL_SHIP_CLASS_BY_NAME = new Map<string, ShipClass>([
    ['brilliance of the seas', 'radiance'],
    ['jewel of the seas', 'radiance'],
    ['radiance of the seas', 'radiance'],
    ['serenade of the seas', 'radiance'],
    ['enchantment of the seas', 'vision'],
    ['grandeur of the seas', 'vision'],
    ['rhapsody of the seas', 'vision'],
    ['vision of the seas', 'vision'],
    ['oasis of the seas', 'oasis'],
    ['allure of the seas', 'oasis'],
    ['harmony of the seas', 'oasis'],
    ['symphony of the seas', 'oasis'],
    ['wonder of the seas', 'oasis'],
    ['utopia of the seas', 'oasis'],
]);

const VIRGIN_SHIP_NAMES = new Set<string>([
    'scarlet lady',
    'valiant lady',
    'resilient lady',
    'brilliant lady',
]);

function normalizeComparableText(value: string): string {
    return value
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripCruiseLinePrefixes(value: string): string {
    return value
        .replace(/^(virgin voyages)\s+/i, '')
        .replace(/^(royal caribbean(?: international)?)\s+/i, '')
        .trim();
}

function getSpecificShipName(value?: string): string | null {
    if (!value) {
        return null;
    }

    const normalized = normalizeComparableText(stripCruiseLinePrefixes(value));
    if (!normalized || normalized.includes(' class')) {
        return null;
    }

    return normalized;
}

function inferShipContext(campaign: Campaign): ShipContext {
    const authoritativeShip = getSpecificShipName(campaign.matchedShipName) ?? getSpecificShipName(campaign.shipTarget);
    const normalizedShipTarget = getSpecificShipName(campaign.shipTarget);
    const normalizedMatchedShip = getSpecificShipName(campaign.matchedShipName);

    const inferBrandFromShipName = (shipName?: string | null): ShipBrand => {
        if (!shipName) return 'unknown';
        if (VIRGIN_SHIP_NAMES.has(shipName)) return 'virgin';
        if (ROYAL_SHIP_CLASS_BY_NAME.has(shipName)) return 'royal_caribbean';
        return 'unknown';
    };

    const matchedBrand = inferBrandFromShipName(normalizedMatchedShip);
    const targetBrand = inferBrandFromShipName(normalizedShipTarget);
    const authoritativeBrand = inferBrandFromShipName(authoritativeShip);
    const brand = matchedBrand !== 'unknown'
        ? matchedBrand
        : targetBrand !== 'unknown'
            ? targetBrand
            : authoritativeBrand;

    const shipClass = authoritativeShip ? (ROYAL_SHIP_CLASS_BY_NAME.get(authoritativeShip) ?? 'unknown') : 'unknown';

    return {
        authoritativeShip,
        brand,
        shipClass,
        specificShipConflict: !!normalizedShipTarget && !!normalizedMatchedShip && normalizedShipTarget !== normalizedMatchedShip,
        targetBrandConflict: matchedBrand !== 'unknown' && targetBrand !== 'unknown' && matchedBrand !== targetBrand,
    };
}

function collectCampaignText(campaign: Campaign): string {
    return [
        campaign.name,
        campaign.description,
        campaign.aesthetic,
        campaign.shipTarget,
        campaign.targetDestination,
        campaign.researchRationale,
        campaign.successLogic,
        campaign.vacationFitRationale,
        campaign.nicheExpressionMode,
        campaign.communityFitRationale,
        campaign.optionalityStyle,
        ...(campaign.highlightEvents ?? []),
        ...(campaign.audienceSignals ?? []),
        ...(campaign.cruiseNativeMoments ?? []),
        ...(campaign.implausibleLiteralizations ?? []),
        ...(campaign.allowedThemeSignals ?? []),
        ...(campaign.discouragedThemeSignals ?? []),
        ...(campaign.optionalGatheringMoments ?? []),
        ...(campaign.solitudeRisks ?? []),
    ]
        .filter((value): value is string => !!value?.trim())
        .map((value) => normalizeComparableText(value))
        .join(' | ');
}

function collectMatchedPhrases(text: string, phrases: string[]): string[] {
    return phrases.filter((phrase) => text.includes(phrase));
}

export function buildShipCopyAlignmentReview(campaign: Campaign): ShipCopyAlignmentReview {
    const context = inferShipContext(campaign);
    const normalizedText = collectCampaignText(campaign);
    const issues: RedTeamIssue[] = [];
    const requiredFixes: string[] = [];

    if (context.specificShipConflict && context.authoritativeShip) {
        issues.push({
            category: 'copy_alignment',
            severity: 'warning',
            title: 'Matched ship and blueprint ship target conflict',
            evidence: `The blueprint still targets \"${campaign.shipTarget}\" while inventory metadata is matched to \"${campaign.matchedShipName}\".`,
            recommendation: `Rewrite ship-specific copy around ${campaign.matchedShipName} or broaden the blueprint to ship-class/line-safe language before Phase 2.`,
        });
        requiredFixes.push(`Resolve the ship-target conflict between ${campaign.shipTarget} and ${campaign.matchedShipName} before Phase 2.`);
    }

    if (context.targetBrandConflict) {
        issues.push({
            category: 'copy_alignment',
            severity: 'warning',
            title: 'Blueprint cruise line conflicts with the matched ship line',
            evidence: `The blueprint still frames the trip around \"${campaign.shipTarget}\" while inventory metadata is matched to \"${campaign.matchedShipName}\".`,
            recommendation: `Rewrite ship and line assumptions around ${campaign.matchedShipName} or intentionally broaden the blueprint to line-agnostic language before Phase 2.`,
        });
        requiredFixes.push(`Resolve the cruise-line conflict between ${campaign.shipTarget} and ${campaign.matchedShipName} before Phase 2.`);
    }

    if (context.brand !== 'virgin') {
        const virginMarkers = collectMatchedPhrases(normalizedText, [
            'virgin venues',
            'small virgin venues',
            'adults only setting',
            'dock house',
            'sip swap',
            'at sip',
        ]);

        if (virginMarkers.length > 0) {
            issues.push({
                category: 'copy_alignment',
                severity: 'warning',
                title: 'Virgin-specific venue language conflicts with the matched ship',
                evidence: `The blueprint references Virgin-only framing or spaces (${virginMarkers.join(', ')}) but the authoritative ship is ${context.authoritativeShip ?? campaign.matchedShipName ?? campaign.shipTarget ?? 'not Virgin'}.`,
                recommendation: 'Replace Virgin-only venue and audience framing with ship-accurate or line-agnostic language before Phase 2.',
            });
            requiredFixes.push('Remove Virgin-only venue and adults-only framing unless the matched ship is actually a Virgin vessel.');
        }
    }

    if (context.shipClass !== 'oasis') {
        const oasisMarkers = collectMatchedPhrases(normalizedText, [
            'central park',
            'boardwalk',
            'zip line',
            'trellis bar',
            'aqua theater',
            'ultimate abyss',
        ]);

        if (oasisMarkers.length > 0) {
            issues.push({
                category: 'copy_alignment',
                severity: 'warning',
                title: 'Oasis-class venue references do not fit the matched ship',
                evidence: `The blueprint references Oasis-class spaces (${oasisMarkers.join(', ')}) but the authoritative ship is ${context.authoritativeShip ?? campaign.matchedShipName ?? campaign.shipTarget ?? 'not Oasis-class'}.`,
                recommendation: 'Replace Oasis-only venue references with spaces that actually exist on the matched ship before Phase 2.',
            });
            requiredFixes.push('Remove Oasis-only venue references unless the matched ship is actually Oasis-class.');
        }
    }

    if (context.shipClass === 'radiance') {
        const radianceMismatchMarkers = collectMatchedPhrases(normalizedText, ['wraparound track', 'deck 5 wraparound track']);

        if (radianceMismatchMarkers.length > 0) {
            issues.push({
                category: 'cruise_implausibility',
                severity: 'warning',
                title: 'Track-layout assumptions do not fit the matched ship',
                evidence: `The blueprint depends on ${radianceMismatchMarkers.join(', ')} language, which does not fit ${context.authoritativeShip}.`,
                recommendation: `Rewrite circulation and gathering mechanics around spaces that actually exist on ${context.authoritativeShip}.`,
            });
            requiredFixes.push(`Remove wraparound-track assumptions and rebuild the flow around real spaces on ${context.authoritativeShip}.`);
        }
    }

    return {
        issues,
        requiredFixes: Array.from(new Set(requiredFixes)),
        optionalImprovements: [],
    };
}
