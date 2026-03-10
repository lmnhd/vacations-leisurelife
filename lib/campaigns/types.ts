export interface Campaign {
    /**
     * DynamoDB Partition Key: `CAMPAIGN#${campaignId}`
     */
    PK: string;

    /**
     * DynamoDB Sort Key: `METADATA`
     */
    SK: string;

    /**
     * Unique identifier for the campaign, typically a slugified string.
     */
    id: string;

    /**
     * Display name for the Theme/Campaign (e.g. "Cat Lover's Cruise 2026")
     */
    name: string;

    /**
     * Short promotional description.
     */
    description: string;

    /**
     * The aesthetic or vibe of the campaign.
     * e.g. 'Retro-Future / Y2K'
     */
    aesthetic?: string;

    /**
     * Planned departure dates for the cruise.
     */
    targetDates: string;

    /**
     * Expected ship or destination.
     */
    targetDestination?: string;

    /**
     * Target cruise line or ship class
     */
    shipTarget?: string;

    /**
     * Highlight events or suggested activities for the group
     */
    highlightEvents?: string[];

    /**
     * Targeting keywords for programmatic contextual ads
     */
    targetingKeywords?: string[];

    /**
     * Starting price per person (cabin basis).
     * Derived from CB group rate × 1.15 (if CB_MATCHED), or LLM estimate (if AI_ESTIMATE).
     */
    startingPrice?: number;

    /**
     * Where the starting price data was sourced from.
     * e.g. 'AI Estimate' or 'CB_GROUP_INVENTORY'
     */
    priceSource?: string;

    /**
     * Tracks Phase B inventory match status.
     * - AI_ESTIMATE: price is from LLM; no CB group linked yet
     * - CB_MATCHED: cbGroupId + cbPersonalLink populated from live view_groups scrape
     * - UNMATCHED: Phase B ran but found no matching CB group inventory
     */
    pricingStatus?: 'AI_ESTIMATE' | 'CB_MATCHED' | 'UNMATCHED';

    /**
     * Number of standard double-occupancy cabins required to form an official 'Group' in CB.
     * Default for standard group is 8 cabins (16 passengers).
     */
    minCabinsRequired: number;

    /**
     * Below this total converted cabin count, OdysseusEngine books on behalf of the guest.
     * Above it, the CB personal link is dispatched for self-serve booking.
     * Default: 5. Set to 0 for always self-serve, 999 for always OdysseusEngine.
     */
    autoHandoffThreshold?: number;

    /**
     * ISO date after which the campaign auto-transitions to EXPIRED if threshold is not met.
     * Typically set 30–60 days before the sailing's deposit deadline.
     */
    expiresAt?: string;

    /**
     * Status of the campaign grouping process.
     */
    status: 'DRAFT' | 'GATHERING_INTEREST' | 'THRESHOLD_MET' | 'CONVERTED' | 'EXPIRED';

    /**
     * The CB group Personal Booking Link for dispatching to guests.
     * Format: https://bookings.cbagenttools.com/swift/cruise/package/<groupId>?siid=<agentSiid>
     * Pre-loaded during Phase B (before campaign goes live).
     */
    cbagenttoolsBookingLink?: string;

    /**
     * The unique internal CB Group ID from view_groups.
     */
    cbagenttoolsGroupId?: string;

    /**
     * Dollar amount of Price Advantage (group rate vs retail) as reported by CB view_groups.
     */
    cbPriceAdvantage?: number;

    matchedShipName?: string;

    matchedSailDate?: string;

    /**
     * Invite link to the campaign's private community channel (Discord, WhatsApp, Facebook Group).
     * Populated during pre-launch campaign config and sent in the "Trip is GO!" email.
     */
    communityChannelUrl?: string;

    /**
     * URL to the campaign's Printful/Printify print-on-demand merch store.
     * Null until THRESHOLD_MET — populated at activation.
     */
    merchandiseStoreUrl?: string;

    /**
     * Status tracking for aesthetic brief generation (Phase 2A).
     */
    aestheticBriefStatus?: 'pending' | 'approved' | 'revised';

    /**
     * ISO timestamp of when the aesthetic brief was generated.
     */
    aestheticGeneratedAt?: string;

    // ─── Phase A Research Intelligence ────────────────────────────────────────

    /**
     * Why this niche was selected: specific community signals, platform data, and
     * trend observations from the Sonar Deep Research run that identified this theme.
     */
    researchRationale?: string;

    /**
     * The commercial and psychological reasoning for why this niche + cruise pairing
     * will convert — audience spend willingness, IRL appeal, market gap analysis.
     */
    successLogic?: string;

    /**
     * 2–4 concrete data signals from the Sonar research that validated this niche.
     * e.g. 'r/solotravel 15k+ upvotes on IRL meetup threads'
     */
    audienceSignals?: string[];

    /**
     * Why this concept still feels like a cruise vacation rather than a retreat,
     * lab, residency, or workshop.
     */
    vacationFitRationale?: string;

    /**
     * Believable cruise-native moments that define how this theme feels on board.
     */
    cruiseNativeMoments?: string[];

    /**
     * How the niche should express itself lightly and socially during the cruise.
     */
    nicheExpressionMode?: string;

    /**
     * Theme expressions that should be rejected because they feel too formal,
     * technical, industrial, clinical, or unrealistic for a cruise.
     */
    implausibleLiteralizations?: string[];

    /**
     * Lightweight signals, props, rituals, or atmospherics that help the theme
     * feel cruise-compatible.
     */
    allowedThemeSignals?: string[];

    /**
     * Signals, environments, props, or programming cues that should be avoided.
     */
    discouragedThemeSignals?: string[];

    createdAt: string;
    updatedAt: string;
}

export interface CampaignWaitlistEntry {
    /**
     * DynamoDB Partition Key: `CAMPAIGN#${campaignId}`
     */
    PK: string;

    /**
     * DynamoDB Sort Key: `USER#${email}`
     */
    SK: string;

    /**
     * Email address uniquely identifying the reservation intention.
     */
    email: string;

    firstName: string;
    lastName: string;

    /**
     * Number of passengers expected in the cabin. (Usually 1-4)
     */
    passengerCount: number;

    /**
     * Requested cabin category level (e.g. 'Inside', 'Oceanview', 'Balcony', 'Suite')
     */
    preferredCabinType: string;

    /**
     * Special notes from the user like accessible room requirement or adjacent cabins.
     */
    specialRequests?: string;

    /**
     * User-proposed events, activities, or meetups they would like to see on this group cruise.
     */
    proposedEvents?: string;

    /**
     * How the guest elected to be treated:
     * - GROUP_WAIT: waits for threshold before manifest collection
     * - BOOK_NOW: manifest collection triggered immediately
     */
    bookingMode?: 'GROUP_WAIT' | 'BOOK_NOW';

    /**
     * How the post-manifest booking will be completed.
     * Defers to the campaign's autoHandoffThreshold unless overridden per-guest.
     */
    fulfillmentMode?: 'AUTO' | 'ODYSSEUS_ASSIST' | 'SELF_SERVE';

    /**
     * Tracks whether the guest has completed the Passenger Manifest.
     */
    manifestStatus?: 'PENDING' | 'SUBMITTED';

    /**
     * Indicates whether the user has been emailed the final CB Booking Link
     */
    notified: boolean;

    /**
     * Indicates whether the user actually used the booking link and completed the reservation
     */
    converted: boolean;

    createdAt: string;
    updatedAt: string;
}
