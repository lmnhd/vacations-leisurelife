import { getOdysseusSession, releaseOdysseusSession } from '@/lib/services/odysseus/OdysseusSessionManager';
import type { CruiseResult, CruiseSearchCriteria } from '@/lib/services/odysseus/types';

export type OdysseusSearchInput = {
    vendorId?: number | null;
    startDate?: string | null;  // MM/DD/YYYY
    endDate?: string | null;    // MM/DD/YYYY
    passengers: number;
    guestAges: number[];
};

export type OdysseusSearchOutput = {
    searchSummary: string;
    results: OdysseusCruiseSummary[];
};

type OdysseusCruiseSummary = {
    id: string;
    name: string;
    shipName: string;
    duration: string;
    departurePort: string;
    arrivalPort: string;
    startingAtUSD: number | 'N/A';
};

export async function runOdysseusSearch(input: OdysseusSearchInput): Promise<OdysseusSearchOutput> {
    try {
        console.log('[odysseus-search-tool] Acquiring persistent session...');
        const engine = await getOdysseusSession();

        const criteria: CruiseSearchCriteria = {
            passengers: input.passengers,
            guestAges: input.guestAges,
        };

        if (input.vendorId) criteria.vendorId = input.vendorId;
        if (input.startDate) criteria.startDate = input.startDate;
        if (input.endDate) criteria.endDate = input.endDate;

        console.log('[odysseus-search-tool] Executing search...');
        const rawResults: CruiseResult[] = await engine.searchCruises(criteria);

        const mappedResults: OdysseusCruiseSummary[] = rawResults.map((r) => {
            const minPrice = r.prices && r.prices.length > 0 && r.prices[0].items.length > 0
                ? Math.min(...r.prices[0].items.map(i => i.value))
                : -1;

            return {
                id: r.code,
                name: r.name,
                shipName: r.ship?.cruiseline?.id ? `Vendor ${r.ship.cruiseline.id} Ship` : 'Unknown Ship',
                duration: `${r.itinerary?.duration || '?'} Nights`,
                departurePort: r.itinerary?.departure?.code || 'Unknown',
                arrivalPort: r.itinerary?.arrival?.code || 'Unknown',
                startingAtUSD: (minPrice > 0 ? minPrice : 'N/A') as number | 'N/A',
            };
        }).slice(0, 3); // Return top 3 only — voice context must stay concise

        const searchSummary = mappedResults.length > 0
            ? `Found ${rawResults.length} live cruise itineraries. Showing top ${mappedResults.length} for voice summary:`
            : 'No live cruises matched that exact criteria.';

        return { searchSummary, results: mappedResults };

    } catch (error) {
        console.error('[odysseus-search-tool] Error:', error);
        // Release the broken session so the next call cold-starts cleanly (avoids login page trap)
        void releaseOdysseusSession();
        return {
            searchSummary: 'An error occurred while connecting to the live booking engine. Please try again or refine search criteria.',
            results: [],
        };
    }
    // NOTE: No engine.close() — session stays alive for the next call
}
