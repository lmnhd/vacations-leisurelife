import { getAestheticBrief, getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import type { AssetRecord, CampaignAestheticBrief, CampaignMediaManifest } from '@/lib/campaigns/schema';
import type { Campaign } from '@/lib/campaigns/types';
import { getCampaignWaitlistSummary, type CampaignWaitlistSummary } from '@/lib/campaigns/waitlist-store';

export interface LandingLoaderOptions {
    includeDraftPreview?: boolean;
}

export interface LandingImageAsset {
    url: string;
    alt: string;
}

export interface LandingFact {
    label: string;
    value: string;
}

export interface LandingCta {
    label: string;
    mode: 'GROUP_WAIT' | 'BOOK_NOW';
    description: string;
    disabled: boolean;
}

export interface LandingPathChoice {
    mode: 'GROUP_WAIT' | 'BOOK_NOW';
    label: string;
    description: string;
    highlighted: boolean;
}

export interface LandingFaqItem {
    question: string;
    answer: string;
}

export interface CampaignLandingViewModel {
    slug: string;
    preview: boolean;
    state: Campaign['status'];
    stateLabel: string;
    title: string;
    heroSlogan: string;
    subSlogan: string;
    elevatorPitch: string;
    heroImage: LandingImageAsset | null;
    accentColor: string;
    surfaceColor: string;
    textColor: string;
    facts: LandingFact[];
    threshold: {
        requiredCabins: number;
        joinedEntries: number;
        joinedPassengers: number;
        convertedEntries: number;
        percentOfThreshold: number;
        headline: string;
        detail: string;
    };
    pricing: {
        startingPriceLabel: string;
        sourceLabel: string;
        detail: string;
    };
    experienceBullets: string[];
    trustBullets: string[];
    bookingPathChoices: LandingPathChoice[];
    faq: LandingFaqItem[];
    ctas: {
        primary: LandingCta;
        secondary: LandingCta;
    };
    links: {
        booking: string | null;
        community: string | null;
        merch: string | null;
    };
    form: {
        enabled: boolean;
        endpoint: string;
        defaultMode: 'GROUP_WAIT' | 'BOOK_NOW';
    };
}

export interface CampaignLandingLoadResult {
    campaign: Campaign;
    brief: CampaignAestheticBrief | null;
    manifest: CampaignMediaManifest | null;
    waitlistSummary: CampaignWaitlistSummary;
    landing: CampaignLandingViewModel;
}

const STATE_LABELS: Record<Campaign['status'], string> = {
    DRAFT: 'Preview',
    GATHERING_INTEREST: 'Gathering Interest',
    THRESHOLD_MET: 'Threshold Met',
    CONVERTED: 'Booking Active',
    EXPIRED: 'Expired',
};

function formatCurrency(value?: number): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return 'Pricing pending';
    }

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(value);
}

function buildHeroFallback(campaign: Campaign, brief: CampaignAestheticBrief | null): LandingImageAsset | null {
    const target = campaign.targetDestination ?? campaign.shipTarget ?? campaign.name;
    if (!target) {
        return null;
    }

    return {
        url: '',
        alt: brief?.messaging.heroSlogan ?? campaign.name,
    };
}

function selectPreferredAsset(manifest: CampaignMediaManifest | null): AssetRecord | null {
    if (!manifest) {
        return null;
    }

    const candidates = [
        ...manifest.images.hero,
        ...manifest.images.platformCrops.hero_16x9,
        ...manifest.images.aestheticConcepts,
        ...manifest.images.sceneImages,
        ...manifest.images.shipReferences,
    ];

    const approved = candidates.find((asset) => asset.reviewStatus === 'human_approved' || asset.reviewStatus === 'auto_approved');
    return approved ?? candidates[0] ?? null;
}

function resolveHeroImage(
    campaign: Campaign,
    brief: CampaignAestheticBrief | null,
    manifest: CampaignMediaManifest | null,
): LandingImageAsset | null {
    const asset = selectPreferredAsset(manifest);
    if (!asset) {
        return buildHeroFallback(campaign, brief);
    }

    return {
        url: asset.url,
        alt: brief?.messaging.heroSlogan ?? campaign.name,
    };
}

function getPercentOfThreshold(requiredCabins: number, joinedEntries: number): number {
    if (requiredCabins <= 0) {
        return 100;
    }

    return Math.max(0, Math.min(100, Math.round((joinedEntries / requiredCabins) * 100)));
}

function getPricingDetail(campaign: Campaign): { sourceLabel: string; detail: string } {
    if (campaign.pricingStatus === 'CB_MATCHED') {
        return {
            sourceLabel: 'Confirmed group pricing',
            detail: 'Pricing reflects a matched Cruise Brothers group record and can convert directly to a booking link when the trip is open.',
        };
    }

    if (campaign.pricingStatus === 'AI_ESTIMATE') {
        return {
            sourceLabel: 'Estimated pricing',
            detail: 'The current price is an estimate used to explain the trip while live group inventory is still being finalized.',
        };
    }

    return {
        sourceLabel: 'Pricing in progress',
        detail: 'Live pricing is still being matched. Join the list and we will confirm the booking path as soon as inventory is ready.',
    };
}

function getThresholdCopy(
    campaign: Campaign,
    waitlistSummary: CampaignWaitlistSummary,
): { headline: string; detail: string } {
    if (campaign.status === 'THRESHOLD_MET' || campaign.status === 'CONVERTED') {
        return {
            headline: 'This sailing has enough interest to move forward.',
            detail: 'Booking can move from interest into cabin selection and final payment flow. The page keeps both paths visible so guests still understand how the group formed.',
        };
    }

    if (campaign.status === 'EXPIRED') {
        return {
            headline: 'This campaign window has closed.',
            detail: 'The threshold was not met before the expiry date, so the public booking flow is paused while the team decides whether to relaunch or retire the concept.',
        };
    }

    if (waitlistSummary.totalEntries === 0) {
        return {
            headline: 'The first group is forming now.',
            detail: 'Guests can either join the group waitlist or signal immediate booking intent so the team can track both demand paths honestly from day one.',
        };
    }

    return {
        headline: 'Interest is building toward the group threshold.',
        detail: 'Each entry counts toward the cabin threshold that unlocks the next booking stage. The group path stays explicit so guests know exactly what has to happen before the trip is considered live.',
    };
}

function getBookingChoices(campaign: Campaign, brief: CampaignAestheticBrief | null): LandingPathChoice[] {
    const waitlistLabel = brief?.messaging.ctaVariants.waitlist ?? 'Join the waitlist';
    const bookNowLabel = brief?.messaging.ctaVariants.bookNow ?? 'Book now';

    const waitDescription = campaign.status === 'THRESHOLD_MET' || campaign.status === 'CONVERTED'
        ? 'Stay close to the trip even if you are not ready to pick a cabin today.'
        : 'Register interest and let the campaign reach its group threshold before cabin handoff begins.';

    const bookDescription = campaign.status === 'GATHERING_INTEREST'
        ? 'Signal stronger intent now. This keeps the immediate-booking path visible even while the group threshold is still forming.'
        : 'Move directly into the booking-ready path for this sailing.';

    return [
        {
            mode: 'GROUP_WAIT',
            label: waitlistLabel,
            description: waitDescription,
            highlighted: campaign.status === 'GATHERING_INTEREST',
        },
        {
            mode: 'BOOK_NOW',
            label: bookNowLabel,
            description: bookDescription,
            highlighted: campaign.status === 'THRESHOLD_MET' || campaign.status === 'CONVERTED',
        },
    ];
}

function getCtas(campaign: Campaign, brief: CampaignAestheticBrief | null): { primary: LandingCta; secondary: LandingCta } {
    const [waitlistChoice, bookingChoice] = getBookingChoices(campaign, brief);

    if (campaign.status === 'THRESHOLD_MET' || campaign.status === 'CONVERTED') {
        return {
            primary: {
                label: bookingChoice.label,
                mode: 'BOOK_NOW',
                description: bookingChoice.description,
                disabled: false,
            },
            secondary: {
                label: waitlistChoice.label,
                mode: 'GROUP_WAIT',
                description: waitlistChoice.description,
                disabled: false,
            },
        };
    }

    if (campaign.status === 'EXPIRED') {
        return {
            primary: {
                label: 'Campaign closed',
                mode: 'GROUP_WAIT',
                description: 'New entries are paused for this campaign.',
                disabled: true,
            },
            secondary: {
                label: bookingChoice.label,
                mode: 'BOOK_NOW',
                description: 'Immediate booking is no longer available through this campaign.',
                disabled: true,
            },
        };
    }

    return {
        primary: {
            label: waitlistChoice.label,
            mode: 'GROUP_WAIT',
            description: waitlistChoice.description,
            disabled: false,
        },
        secondary: {
            label: bookingChoice.label,
            mode: 'BOOK_NOW',
            description: bookingChoice.description,
            disabled: false,
        },
    };
}

function buildExperienceBullets(campaign: Campaign, brief: CampaignAestheticBrief | null): string[] {
    const source = campaign.cruiseNativeMoments?.length
        ? campaign.cruiseNativeMoments
        : brief?.visual.plausibilityFramework.cruiseNativeMoments ?? [];

    const bullets = source.slice(0, 3);
    if (bullets.length > 0) {
        return bullets;
    }

    return [
        'Cruise-first pacing with the theme expressed as atmosphere, not as a retreat or workshop.',
        'A stable public product surface that explains the trip, the threshold, and what happens next.',
        'Campaign identity applied through approved media, tone, and accents while the page architecture stays consistent.',
    ];
}

function buildTrustBullets(campaign: Campaign): string[] {
    return [
        `No local payment is implied by this page. Booking moves through the proper handoff once the campaign status allows it.`,
        `The group threshold is explicit: ${campaign.minCabinsRequired} cabins are required before the trip is considered fully live.`,
        campaign.expiresAt
            ? `If the threshold is not met by ${campaign.expiresAt}, the campaign can expire instead of silently drifting into an unclear state.`
            : 'The campaign can expire if the threshold is not reached in time, rather than leaving guests in an ambiguous state.',
    ];
}

function buildFaq(campaign: Campaign): LandingFaqItem[] {
    return [
        {
            question: 'What happens when I choose the group wait path?',
            answer: 'Your interest is saved against the campaign threshold. Once the group is ready, the follow-up flow can move into manifest collection and the correct booking handoff.',
        },
        {
            question: 'What does book now mean before the threshold is met?',
            answer: 'It signals stronger purchase intent early. The team can track immediate demand separately from the standard waitlist while the campaign is still forming.',
        },
        {
            question: 'How should I read the displayed price?',
            answer: campaign.pricingStatus === 'CB_MATCHED'
                ? 'The displayed price is tied to matched inventory and is the strongest booking-ready price currently available.'
                : 'The displayed price is directional until live inventory is matched. It explains the trip without pretending that booking is already finalized.',
        },
    ];
}

function buildFacts(campaign: Campaign, waitlistSummary: CampaignWaitlistSummary): LandingFact[] {
    return [
        { label: 'Sailing', value: campaign.targetDates },
        { label: 'Ship or focus', value: campaign.shipTarget ?? campaign.targetDestination ?? campaign.name },
        { label: 'Threshold', value: `${campaign.minCabinsRequired} cabins` },
        { label: 'Interest logged', value: `${waitlistSummary.totalEntries} entries` },
    ];
}

function buildLandingViewModel(
    campaign: Campaign,
    brief: CampaignAestheticBrief | null,
    manifest: CampaignMediaManifest | null,
    waitlistSummary: CampaignWaitlistSummary,
    preview: boolean,
): CampaignLandingViewModel {
    const pricing = getPricingDetail(campaign);
    const thresholdCopy = getThresholdCopy(campaign, waitlistSummary);
    const ctas = getCtas(campaign, brief);
    const heroImage = resolveHeroImage(campaign, brief, manifest);
    const percentOfThreshold = getPercentOfThreshold(campaign.minCabinsRequired, waitlistSummary.totalEntries);

    return {
        slug: campaign.id,
        preview,
        state: campaign.status,
        stateLabel: STATE_LABELS[campaign.status],
        title: campaign.name,
        heroSlogan: brief?.messaging.heroSlogan ?? campaign.name,
        subSlogan: brief?.messaging.subSlogan ?? campaign.description,
        elevatorPitch: brief?.messaging.elevatorPitch ?? campaign.description,
        heroImage,
        accentColor: brief?.visual.colorPalette.accent ?? '#2962FF',
        surfaceColor: brief?.visual.colorPalette.background ?? '#0F172A',
        textColor: brief?.visual.colorPalette.textOnDark ?? '#F8FAFC',
        facts: buildFacts(campaign, waitlistSummary),
        threshold: {
            requiredCabins: campaign.minCabinsRequired,
            joinedEntries: waitlistSummary.totalEntries,
            joinedPassengers: waitlistSummary.totalPassengers,
            convertedEntries: waitlistSummary.convertedEntries,
            percentOfThreshold: percentOfThreshold,
            headline: thresholdCopy.headline,
            detail: thresholdCopy.detail,
        },
        pricing: {
            startingPriceLabel: formatCurrency(campaign.startingPrice),
            sourceLabel: pricing.sourceLabel,
            detail: pricing.detail,
        },
        experienceBullets: buildExperienceBullets(campaign, brief),
        trustBullets: buildTrustBullets(campaign),
        bookingPathChoices: getBookingChoices(campaign, brief),
        faq: buildFaq(campaign),
        ctas,
        links: {
            booking: campaign.cbagenttoolsBookingLink ?? null,
            community: campaign.communityChannelUrl ?? null,
            merch: campaign.merchandiseStoreUrl ?? null,
        },
        form: {
            enabled: campaign.status !== 'EXPIRED' && campaign.status !== 'DRAFT',
            endpoint: `/api/groups/campaign/${campaign.id}/waitlist`,
            defaultMode: ctas.primary.mode,
        },
    };
}

export async function getCampaignLandingBySlug(
    slug: string,
    options: LandingLoaderOptions = {},
): Promise<CampaignLandingLoadResult | null> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        return null;
    }

    const preview = options.includeDraftPreview === true;
    if (campaign.status === 'DRAFT' && !preview) {
        return null;
    }

    const [brief, manifest, waitlistSummary] = await Promise.all([
        getAestheticBrief(slug),
        getMediaManifest(slug),
        getCampaignWaitlistSummary(slug),
    ]);

    return {
        campaign,
        brief,
        manifest,
        waitlistSummary,
        landing: buildLandingViewModel(campaign, brief, manifest, waitlistSummary, preview),
    };
}