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
     * Planned departure dates for the cruise.
     */
    targetDates: string;

    /**
     * Expected ship or destination.
     */
    targetDestination: string;

    /**
     * Number of standard double-occupancy cabins required to form an official 'Group' in CB.
     * Default for standard group is 8 cabins (16 passengers).
     */
    minCabinsRequired: number;

    /**
     * Status of the campaign grouping process.
     */
    status: 'DRAFT' | 'GATHERING_INTEREST' | 'CONVERTED';

    /**
     * The actual CBS Booking Link acquired from scraping CB Agent Tools.
     * Starts null, populated when threshold meets and CB Group is constructed.
     */
    cbagenttoolsBookingLink?: string;

    /**
     * The unique internal CB "Group ID" from the build flow. 
     */
    cbagenttoolsGroupId?: string;

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
     * Gathered to build hype and organically shape the campaign's itinerary.
     */
    proposedEvents?: string;

    /**
     * Indicates whether the user has been emailed the final CB Booking Link
     */
    notified: boolean;

    /**
     * Indicates whether the user actually used the booking link and completed the reservation
     * in the actual CB system.
     */
    converted: boolean;

    createdAt: string;
    updatedAt: string;
}
