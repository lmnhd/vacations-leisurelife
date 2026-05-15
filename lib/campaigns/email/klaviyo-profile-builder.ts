/**
 * Klaviyo profile builder
 *
 * Builds the full set of profile properties Phase 1 templates need.
 *
 * Inputs are the canonical campaign + waitlist records (and optionally a
 * resolved landing view model so we can pull a hero image URL without
 * re-running design-system inference). We deliberately do NOT inline
 * campaign content into the Klaviyo template; instead we push enough
 * properties so template authors can personalize copy without touching app
 * code.
 *
 * See `.github/DOCS/Implementation/GROUP_STRATEGY/POST_BOOKING_FLOW/KLAVIYO_EMAIL_FLOW_PLAN.md`
 * §3 for the property contract.
 */

import type { Campaign, CampaignWaitlistEntry } from '@/lib/campaigns/types';
import type { CampaignLandingViewModel } from '@/lib/campaigns/landing/view-model';
import type { KlaviyoProfileProperties } from '@/lib/integrations/klaviyo';

export interface BuildKlaviyoProfileInput {
    campaign: Pick<
        Campaign,
        | 'id'
        | 'name'
        | 'status'
        | 'matchedShipName'
        | 'matchedSailDate'
        | 'matchedDeparturePort'
        | 'cbagenttoolsBookingLink'
        | 'odysseusRetailBookingLink'
        | 'communityChannelUrl'
        | 'merchandiseStoreUrl'
        | 'finalItineraryUrl'
        | 'tourConductorName'
    >;
    lead: Pick<
        CampaignWaitlistEntry,
        | 'email'
        | 'firstName'
        | 'lastName'
        | 'phoneNumber'
        | 'bookingMode'
        | 'passengerCount'
        | 'preferredCabinType'
    >;
    /** Optional — when provided, we use it to set hero_image_url and campaign_stage_label. */
    landing?: Pick<CampaignLandingViewModel, 'heroImage' | 'stateLabel'> | null;
}

const STATUS_LABELS: Record<Campaign['status'], string> = {
    DRAFT: 'Private Preview',
    GATHERING_INTEREST: 'Now Forming',
    THRESHOLD_MET: 'Ready For Booking',
    CONVERTED: 'Now Booking',
    EXPIRED: 'Closed',
};

function getPublicSiteBaseUrl(): string {
    return (
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        process.env.APP_URL?.trim() ||
        'https://www.leisurelifeinteractive.com'
    ).replace(/\/$/, '');
}

export function getCampaignLandingUrl(campaignSlug: string): string {
    return `${getPublicSiteBaseUrl()}/groups/${campaignSlug}`;
}

/** Drop undefined-valued keys so Klaviyo doesn't blow away existing profile fields with nulls. */
function compact(props: Record<string, string | number | boolean | undefined>): KlaviyoProfileProperties {
    const out: KlaviyoProfileProperties = { email: String(props.email ?? '') };
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && value.trim() === '') continue;
        out[key] = value;
    }
    return out;
}

/**
 * Build a Klaviyo profile upsert payload for a given lead + campaign.
 *
 * Property naming follows the plan §3 (snake_case). The shape is stable and
 * additive — never rename keys without coordinating with the Klaviyo
 * template authors.
 */
export function buildKlaviyoProfile(input: BuildKlaviyoProfileInput): KlaviyoProfileProperties {
    const { campaign, lead, landing } = input;

    return compact({
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        phoneNumber: lead.phoneNumber,

        // Campaign identity
        campaign_slug: campaign.id,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        campaign_stage_label: landing?.stateLabel ?? STATUS_LABELS[campaign.status],

        // Lead preferences (used for personalization + flow branching)
        first_name: lead.firstName,
        booking_mode: lead.bookingMode ?? 'GROUP_WAIT',
        passenger_count: lead.passengerCount,
        preferred_cabin_type: lead.preferredCabinType,

        // Visual + CTA URLs
        hero_image_url: landing?.heroImage?.url,
        landing_page_url: getCampaignLandingUrl(campaign.id),
        booking_link_url:
            campaign.cbagenttoolsBookingLink ?? campaign.odysseusRetailBookingLink,
        community_channel_url: campaign.communityChannelUrl,
        merchandise_store_url: campaign.merchandiseStoreUrl,

        // Travel details (populated once matched in Phase B)
        ship_name: campaign.matchedShipName,
        sail_date: campaign.matchedSailDate,
        departure_port: campaign.matchedDeparturePort,

        // Phase 3 — post-booking enrichment
        final_itinerary_url: campaign.finalItineraryUrl,
        tour_conductor_name: campaign.tourConductorName,
    });
}
