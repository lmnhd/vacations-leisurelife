import { z } from 'zod';
import type { Campaign } from './types';

export const DiscoveryBlueprintSchema = z.object({
    id: z.string().describe("A url-friendly slug for the campaign, e.g. 'retro-gaming-2026'"),
    name: z.string().describe('Display name for the Theme/Campaign'),
    description: z.string().describe('Short promotional description'),
    aesthetic: z.string().describe('The aesthetic or vibe of the campaign'),
    targetDates: z.string().describe("Planned departure date in a parseable format, preferably an exact sail date copied from viable inventory; acceptable examples: '2026-11-07' or 'November 2026'"),
    targetDestination: z.string().describe("Primary route or destination region, e.g. 'Greek Isles' or 'Western Caribbean'"),
    shipTarget: z.string().describe('Target cruise line or ship class'),
    highlightEvents: z.array(z.string()).describe('List of suggested activities or meetups (3-5 items)'),
    targetingKeywords: z.array(z.string()).describe('List of targeting keywords for ads (3-5 items)'),
    minCabinsRequired: z.number().describe('Default to 8'),
    startingPrice: z.number().describe('Estimated starting price (use 1000 if unknown)'),
    priceSource: z.string().describe("Source of the price, e.g. 'AI Estimate'"),
    researchRationale: z.string().describe(
        'Why this niche was selected: reference the specific community data, platform signals, or trend observations from the research that identified this theme as viable. Be specific — name subreddits, hashtag metrics, Discord server sizes, etc.'
    ),
    successLogic: z.string().describe(
        'The commercial and psychological reasoning this niche+cruise pairing will convert: explain audience spending willingness, the IRL meetup pull factor, what market gap this fills, and why a relaxed cruise vacation is uniquely suited to this community.'
    ),
    audienceSignals: z.array(z.string()).min(2).max(4).describe(
        "2-4 concrete, specific data signals from the research that validate this niche. Each should be a single-sentence fact, e.g. 'r/solotravel recorded 15k+ upvotes on an IRL meetup thread in Jan 2026', or 'TikTok #darkacademia has 3.2B views with >60% Gen-Z engagement'."
    ),
    vacationFitRationale: z.string().describe(
        'Explain why this theme feels like a great cruise vacation rather than a retreat, workshop, residency, lab, or conference.'
    ),
    cruiseNativeMoments: z.array(z.string()).min(3).max(5).describe(
        '3-5 believable cruise-native moments that make this theme feel enjoyable on a ship, such as deck conversations, listening sessions, scenic hobby practice, sunset mixers, or relaxed themed rituals.'
    ),
    nicheExpressionMode: z.string().describe(
        'Describe how the niche should show up lightly and pleasantly during the cruise, as a social flavor layer rather than the operational center of the trip.'
    ),
    implausibleLiteralizations: z.array(z.string()).min(3).max(5).describe(
        '3-5 examples of how this theme should NOT be expressed because they would feel too industrial, clinical, workshop-like, academic, or operationally awkward on a cruise.'
    ),
    allowedThemeSignals: z.array(z.string()).min(3).max(6).describe(
        'Lightweight aesthetic or behavioral cues that are good to use when expressing the theme on a cruise, such as clothing, props, rituals, music, decor, or conversational energy.'
    ),
    discouragedThemeSignals: z.array(z.string()).min(3).max(6).describe(
        'Signals, props, environments, or programming cues that would make the theme feel too formal, technical, or unrealistic for a cruise vacation.'
    ),
    communityFitRationale: z.string().describe(
        'Explain why the group version of this trip matters socially: what makes strangers with this shared interest naturally enjoy being around one another on a ship.'
    ),
    optionalGatheringMoments: z.array(z.string()).min(3).max(5).describe(
        '3-5 low-pressure, drop-in/drop-out gatherings, rhythms, or rituals that make the group feel real without turning the trip into a workshop or event program.'
    ),
    optionalityStyle: z.string().describe(
        'Describe how participation should be framed so introverts and casual participants still feel welcome: optional, ambient, easy to join, and easy to step away from.'
    ),
    solitudeRisks: z.array(z.string()).min(3).max(5).describe(
        '3-5 failure modes that would make this campaign feel too solitary, socially hollow, exclusive, or emotionally empty even if the visuals remain attractive.'
    ),
});

export const DiscoveryBlueprintBatchSchema = z.object({
    blueprints: z.array(DiscoveryBlueprintSchema).length(5, 'Must provide exactly 5 blueprints'),
});

export type DiscoveryBlueprint = z.infer<typeof DiscoveryBlueprintSchema>;

export function mapDiscoveryBlueprintToCampaign(
    blueprint: DiscoveryBlueprint,
    existingCampaign?: Campaign,
): Campaign {
    const now = new Date().toISOString();

    return {
        PK: existingCampaign?.PK ?? `CAMPAIGN#${blueprint.id}`,
        SK: existingCampaign?.SK ?? 'METADATA',
        id: existingCampaign?.id ?? blueprint.id,
        name: blueprint.name,
        description: blueprint.description,
        aesthetic: blueprint.aesthetic,
        targetDates: blueprint.targetDates,
        targetDestination: blueprint.targetDestination,
        shipTarget: blueprint.shipTarget,
        highlightEvents: blueprint.highlightEvents,
        targetingKeywords: blueprint.targetingKeywords,
        minCabinsRequired: blueprint.minCabinsRequired,
        startingPrice: blueprint.startingPrice,
        priceSource: blueprint.priceSource,
        researchRationale: blueprint.researchRationale,
        successLogic: blueprint.successLogic,
        audienceSignals: blueprint.audienceSignals,
        vacationFitRationale: blueprint.vacationFitRationale,
        cruiseNativeMoments: blueprint.cruiseNativeMoments,
        nicheExpressionMode: blueprint.nicheExpressionMode,
        implausibleLiteralizations: blueprint.implausibleLiteralizations,
        allowedThemeSignals: blueprint.allowedThemeSignals,
        discouragedThemeSignals: blueprint.discouragedThemeSignals,
        communityFitRationale: blueprint.communityFitRationale,
        optionalGatheringMoments: blueprint.optionalGatheringMoments,
        optionalityStyle: blueprint.optionalityStyle,
        solitudeRisks: blueprint.solitudeRisks,
        status: existingCampaign?.status ?? 'DRAFT',
        createdAt: existingCampaign?.createdAt ?? now,
        updatedAt: now,
    };
}