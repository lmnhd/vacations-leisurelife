import { getAestheticBrief, getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';
import type { AssetRecord, CampaignAestheticBrief, CampaignMediaManifest } from '@/lib/campaigns/schema';
import { formatDeparturePort } from '@/lib/campaigns/cruise-ports';
import { getPublicGroupCabinTarget, getPublicThresholdPercent } from '@/lib/campaigns/threshold-policy';
import type { Campaign } from '@/lib/campaigns/types';
import { getCampaignWaitlistSummary, type CampaignWaitlistSummary } from '@/lib/campaigns/waitlist-store';

export interface LandingLoaderOptions {
    includeDraftPreview?: boolean;
}

export interface LandingImageAsset {
    url: string;
    alt: string;
}

export interface LandingStorySection {
    title: string;
    body: string;
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
    galleryImages: LandingImageAsset[];
    trustImages: LandingImageAsset[];
    accentColor: string;
    surfaceColor: string;
    textColor: string;
    facts: LandingFact[];
    story: {
        whatItIs: LandingStorySection;
        whyJoinNow: string[];
        whatToExpect: string[];
        howItWorks: LandingStorySection[];
    };
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
        retailBooking: string | null;
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
    DRAFT: 'Private Preview',
    GATHERING_INTEREST: 'Now Forming',
    THRESHOLD_MET: 'Ready For Booking',
    CONVERTED: 'Now Booking',
    EXPIRED: 'Closed',
};

function normalizeColorToken(value: string | undefined, fallback: string): string {
    if (!value) {
        return fallback;
    }

    const hexMatch = value.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/);
    if (hexMatch) {
        return hexMatch[0];
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

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
        ...(manifest.images.platformCrops.hero_16x9 ?? []),
        ...manifest.images.aestheticConcepts,
        ...manifest.images.sceneImages,
        ...manifest.images.shipReferences,
    ];

    const approved = candidates.find((asset) => 
        (asset.curation?.approvalState === 'human_approved' || asset.reviewStatus === 'human_approved') ||
        (asset.curation?.approvalState === 'auto_approved' || asset.reviewStatus === 'auto_approved')
    );
    return approved ?? candidates[0] ?? null;
}

function selectTrustAsset(manifest: CampaignMediaManifest | null): AssetRecord | null {
    if (!manifest) {
        return null;
    }

    const candidates = [
        ...manifest.images.shipReferences,
        ...manifest.images.documentaryDetails,
    ];

    const approved = candidates.find((asset) =>
        (asset.curation?.approvalState === 'human_approved' || asset.reviewStatus === 'human_approved') ||
        (asset.curation?.approvalState === 'auto_approved' || asset.reviewStatus === 'auto_approved')
    );
    return approved ?? candidates[0] ?? null;
}

function resolveHeroImage(
    campaign: Campaign,
    brief: CampaignAestheticBrief | null,
    manifest: CampaignMediaManifest | null,
): LandingImageAsset | null {
    const trustAsset = selectTrustAsset(manifest);
    if (trustAsset) {
        return {
            url: trustAsset.url,
            alt: brief?.messaging.heroSlogan ?? campaign.name,
        };
    }

    const asset = selectPreferredAsset(manifest);
    if (!asset) {
        return buildHeroFallback(campaign, brief);
    }

    return {
        url: asset.url,
        alt: brief?.messaging.heroSlogan ?? campaign.name,
    };
}

function buildGalleryImages(
    campaign: Campaign,
    manifest: CampaignMediaManifest | null,
    heroImage: LandingImageAsset | null,
): LandingImageAsset[] {
    const maxGalleryImages = 10;

    if (!manifest) {
        return heroImage?.url ? [heroImage] : [];
    }

    const artisticCandidates = [
        ...manifest.images.sceneImages,
        ...manifest.images.aestheticConcepts,
        ...manifest.images.hero,
    ];
    const trustCandidates = [
        ...manifest.images.shipReferences,
        ...manifest.images.documentaryDetails,
    ];

    function collectApproved(candidates: AssetRecord[]): LandingImageAsset[] {
        const seen = new Set<string>();
        const out: LandingImageAsset[] = [];
        for (const asset of candidates) {
            if (!asset.url || asset.url === heroImage?.url || seen.has(asset.url)) continue;
            if (asset.reviewStatus !== 'human_approved' && asset.reviewStatus !== 'auto_approved') continue;
            seen.add(asset.url);
            out.push({ url: asset.url, alt: `${campaign.name} campaign image` });
        }
        return out;
    }

    const artistic = collectApproved(artisticCandidates);
    const trust = collectApproved(trustCandidates);

    const mixed: LandingImageAsset[] = [];
    const maxEach = Math.ceil(maxGalleryImages / 2);
    for (let i = 0; i < maxEach; i++) {
        if (artistic[i]) mixed.push(artistic[i]);
        if (trust[i]) mixed.push(trust[i]);
        if (mixed.length >= maxGalleryImages) break;
    }

    if (mixed.length < maxGalleryImages) {
        for (let i = Math.ceil(mixed.length / 2); i < artistic.length && mixed.length < maxGalleryImages; i++) {
            if (!mixed.some((m) => m.url === artistic[i].url)) {
                mixed.push(artistic[i]);
            }
        }
    }

    if (mixed.length === 0 && heroImage?.url) {
        mixed.push(heroImage);
    }

    return mixed;
}

function buildTrustImages(
    campaign: Campaign,
    manifest: CampaignMediaManifest | null,
    heroImage: LandingImageAsset | null,
): LandingImageAsset[] {
    if (!manifest) return heroImage?.url ? [heroImage] : [];

    const candidates = [
        ...manifest.images.shipReferences,
        ...manifest.images.documentaryDetails,
    ];
    const seen = new Set<string>();
    const out: LandingImageAsset[] = [];

    for (const asset of candidates) {
        if (!asset.url || asset.url === heroImage?.url || seen.has(asset.url)) continue;
        if (asset.reviewStatus !== 'human_approved' && asset.reviewStatus !== 'auto_approved') continue;
        seen.add(asset.url);
        out.push({ url: asset.url, alt: `${campaign.name} ship reference` });
    }

    return out;
}

function getPricingDetail(campaign: Campaign): { sourceLabel: string; detail: string } {
    if (campaign.pricingStatus === 'CB_MATCHED') {
        return {
            sourceLabel: 'Confirmed group pricing',
            detail: 'This price is tied to matched Cruise Brothers inventory and reflects the strongest booking-ready number currently attached to this sailing.',
        };
    }

    if (campaign.pricingStatus === 'AI_ESTIMATE') {
        return {
            sourceLabel: 'Estimated pricing',
            detail: 'This price is directional for now. It helps you understand the sailing while live group inventory is still being finalized.',
        };
    }

    return {
        sourceLabel: 'Pricing in progress',
        detail: 'Live pricing is still being matched. You can still raise your hand now, and we will send the next step once pricing is ready.',
    };
}

function getThresholdCopy(
    campaign: Campaign,
    waitlistSummary: CampaignWaitlistSummary,
    targetCabins: number,
): { headline: string; detail: string } {
    if (campaign.status === 'THRESHOLD_MET' || campaign.status === 'CONVERTED') {
        return {
            headline: 'This sailing is ready to move into booking.',
            detail: 'Enough cabins have been claimed to open the next step. If you are ready, you can move toward traveler details and the booking handoff now.',
        };
    }

    if (campaign.status === 'EXPIRED') {
        return {
            headline: 'This sailing is no longer gathering new guests.',
            detail: 'The group did not reach its target in time, so new signups are closed for now while the team decides whether to relaunch the concept.',
        };
    }

    if (waitlistSummary.totalEntries === 0) {
        return {
            headline: 'Be among the first to join this sailing.',
            detail: 'If this trip feels like your pace, you can join the group list now and be first to hear when the next step opens.',
        };
    }

    return {
        headline: 'The group is taking shape.',
        detail: `Each cabin request moves this sailing closer to the ${targetCabins}-cabin launch target. You can either join the group list or tell us you want the earliest booking handoff.`,
    };
}

function getBookingChoices(campaign: Campaign, brief: CampaignAestheticBrief | null): LandingPathChoice[] {
    const waitlistLabel = brief?.messaging.ctaVariants.waitlist ?? 'Join the group list';
    const bookNowLabel = brief?.messaging.ctaVariants.bookNow ?? 'Start the booking path';

    const waitDescription = campaign.status === 'THRESHOLD_MET' || campaign.status === 'CONVERTED'
        ? 'Choose this if you want to stay close to the sailing, even if you are not ready to pick a cabin today.'
        : 'Choose this if you want the shared group version of the trip and are happy to hear from us when the sailing opens further.';

    const bookDescription = campaign.status === 'GATHERING_INTEREST'
        ? 'Choose this if you are already leaning yes and want the earliest booking handoff once the next step opens.'
        : 'Choose this if you are ready to move toward traveler details and booking now.';

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
                label: 'Signups closed',
                mode: 'GROUP_WAIT',
                description: 'New entries are paused for this sailing.',
                disabled: true,
            },
            secondary: {
                label: bookingChoice.label,
                mode: 'BOOK_NOW',
                description: 'Direct booking is no longer available through this sailing.',
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
    const gatherings = campaign.optionalGatheringMoments?.length
        ? campaign.optionalGatheringMoments
        : brief?.communityExpression.optionalGatherings ?? [];

    const bullets = [...source, ...gatherings].filter((value, index, array) => array.indexOf(value) === index).slice(0, 3);
    if (bullets.length > 0) {
        return bullets;
    }

    return [
        'A cruise-first rhythm shaped by the ship, the sea, and the feel of the itinerary.',
        'Optional shared moments that support the theme without turning the sailing into a scheduled retreat.',
        'A clear booking path that starts with interest and opens into the next step when the group is ready.',
    ];
}

function buildWhatToExpect(campaign: Campaign, brief: CampaignAestheticBrief | null): string[] {
    const enhancedMoments = brief?.visual.plausibilityFramework.nicheEnhancedMoments ?? [];
    const cruiseMoments = brief?.visual.plausibilityFramework.cruiseNativeMoments ?? campaign.cruiseNativeMoments ?? [];
    const communityMoments = campaign.optionalGatheringMoments?.length
        ? campaign.optionalGatheringMoments
        : brief?.communityExpression.optionalGatherings ?? [];
    const combined = [...communityMoments, ...enhancedMoments, ...cruiseMoments].filter((value, index, array) => array.indexOf(value) === index);

    if (combined.length > 0) {
        return combined.slice(0, 4);
    }

    return [
        'A real cruise rhythm with enough open time to enjoy the ship your own way.',
        'A themed mood that shows up through atmosphere, shared moments, and the people who join.',
        'Clear next steps so you know when to simply raise your hand and when booking actually opens.',
    ];
}

function buildWhyJoinNow(campaign: Campaign): string[] {
    const reasons = [
        'Early interest helps shape which version of the group experience becomes real.',
        'Joining now puts you first in line for the next booking step when the sailing opens further.',
    ];

    if (campaign.pricingStatus === 'CB_MATCHED' && campaign.startingPrice) {
        reasons.unshift(`Current matched pricing starts around ${formatCurrency(campaign.startingPrice)}, so you are not evaluating this trip blind.`);
    } else if (campaign.startingPrice) {
        reasons.unshift(`Current pricing is tracking around ${formatCurrency(campaign.startingPrice)}, which gives you a real budget signal early.`);
    }

    if (campaign.expiresAt) {
        reasons.push('This campaign window is time-bound, so joining early matters if this sailing fits your pace.');
    }

    return reasons.slice(0, 3);
}

function buildHowItWorks(campaign: Campaign, brief: CampaignAestheticBrief | null): LandingStorySection[] {
    const waitlistLabel = brief?.messaging.ctaVariants.waitlist ?? 'Join the group list';
    const bookingLabel = brief?.messaging.ctaVariants.bookNow ?? 'Start the booking path';

    return [
        {
            title: '1. Choose your pace',
            body: `You can ${waitlistLabel.toLowerCase()} if you want the shared group version of the trip, or choose ${bookingLabel.toLowerCase()} if you want the earliest booking handoff.`,
        },
        {
            title: '2. We keep your place warm',
            body: 'We save your party size, cabin preference, and contact details so you hear the right next step as the sailing develops.',
        },
        {
            title: '3. Booking opens at the right moment',
            body: campaign.cbagenttoolsBookingLink
                ? 'If direct booking is already ready for this sailing, we can move you there. Otherwise, we send the proper handoff as soon as your path opens.'
                : 'When your path is ready, we send the proper booking handoff. You are not paying on this page today.',
        },
    ];
}

function buildWhatItIs(campaign: Campaign, brief: CampaignAestheticBrief | null): LandingStorySection {
    return {
        title: `What ${campaign.name} Is`,
        body: brief?.messaging.elevatorPitch
            ?? campaign.communityFitRationale
            ?? `${campaign.name} is a themed group sailing built around the feel of the trip, the ship, and the people who want to travel that way together.`,
    };
}

function buildTrustBullets(campaign: Campaign): string[] {
    const targetCabins = getPublicGroupCabinTarget(campaign);

    return [
        'You are not paying on this page. This step only saves your interest, party size, and cabin preference.',
        `The sailing opens fully once ${targetCabins} cabins are represented, which helps support the group energy and shared perks.`,
        campaign.expiresAt
            ? `If the cabin target is not reached by ${campaign.expiresAt}, this version of the sailing can close instead of drifting without a clear answer.`
            : 'If the cabin target is not reached in time, this version of the sailing can close instead of drifting without a clear answer.',
    ];
}

function buildFaq(campaign: Campaign): LandingFaqItem[] {
    return [
        {
            question: 'What happens after I join the group list?',
            answer: 'We save your interest against the sailing target. Once the trip is ready for its next step, we email you the correct traveler-details and booking handoff.',
        },
        {
            question: 'What if I already know I want to go?',
            answer: 'Choose the early booking path. That tells the team you want the fastest handoff once booking opens, even while the full group is still forming.',
        },
        {
            question: 'How should I read the listed price?',
            answer: campaign.pricingStatus === 'CB_MATCHED'
                ? 'It reflects matched inventory and is the strongest booking-ready price currently attached to this sailing.'
                : 'It is a directional price until live inventory is matched, which means it helps frame the trip without pretending booking is already finalized.',
        },
    ];
}

function buildFacts(campaign: Campaign, waitlistSummary: CampaignWaitlistSummary): LandingFact[] {
    const targetCabins = getPublicGroupCabinTarget(campaign);

    const facts: LandingFact[] = [
        { label: 'Sailing', value: campaign.targetDates },
        { label: 'Ship', value: campaign.matchedShipName ?? campaign.shipTarget ?? campaign.targetDestination ?? campaign.name },
    ];

    if (campaign.matchedDeparturePort) {
        facts.push({ label: 'Departure Port', value: formatDeparturePort(campaign.matchedDeparturePort) });
    }

    if (campaign.targetDestination) {
        facts.push({ label: 'Destination', value: campaign.targetDestination });
    }

    if (campaign.matchedNights) {
        facts.push({ label: 'Duration', value: `${campaign.matchedNights} nights` });
    }

    facts.push(
        { label: 'Cabins needed', value: `${targetCabins}` },
        { label: 'People on the waitlist', value: `${waitlistSummary.totalPassengers}` },
    );

    return facts;
}

function buildLandingViewModel(
    campaign: Campaign,
    brief: CampaignAestheticBrief | null,
    manifest: CampaignMediaManifest | null,
    waitlistSummary: CampaignWaitlistSummary,
    preview: boolean,
): CampaignLandingViewModel {
    const targetCabins = getPublicGroupCabinTarget(campaign);
    const pricing = getPricingDetail(campaign);
    const thresholdCopy = getThresholdCopy(campaign, waitlistSummary, targetCabins);
    const ctas = getCtas(campaign, brief);
    const heroImage = resolveHeroImage(campaign, brief, manifest);
    const galleryImages = buildGalleryImages(campaign, manifest, heroImage);
    const trustImages = buildTrustImages(campaign, manifest, heroImage);
    const percentOfThreshold = getPublicThresholdPercent(targetCabins, waitlistSummary.totalEntries);

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
        galleryImages,
        trustImages,
        accentColor: normalizeColorToken(brief?.visual.colorPalette.accent, '#2962FF'),
        surfaceColor: normalizeColorToken(brief?.visual.colorPalette.background, '#0F172A'),
        textColor: normalizeColorToken(brief?.visual.colorPalette.textOnDark, '#F8FAFC'),
        facts: buildFacts(campaign, waitlistSummary),
        story: {
            whatItIs: buildWhatItIs(campaign, brief),
            whyJoinNow: buildWhyJoinNow(campaign),
            whatToExpect: buildWhatToExpect(campaign, brief),
            howItWorks: buildHowItWorks(campaign, brief),
        },
        threshold: {
            requiredCabins: targetCabins,
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
            retailBooking: campaign.odysseusRetailBookingLink ?? null,
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