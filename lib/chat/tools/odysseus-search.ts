import { getOdysseusSession, releaseOdysseusSession } from '@/lib/services/odysseus/OdysseusSessionManager';
import type { CruiseResult, CruiseSearchCriteria } from '@/lib/services/odysseus/types';
import { resolvePortCode } from '@/lib/campaigns/landing/port-codes';
// Single source of truth for vendor-id -> line name (verified against live Odysseus).
// Previously this file kept its own hand-assumed copy that had drifted wrong.
import { CRUISE_LINE_NAMES } from '@/lib/cb/link-broker/package-lookup';

function resolvePort(code: string): string {
    return resolvePortCode(code) ?? code;
}

export type OdysseusSearchInput = {
    vendorId?: number | null;
    startDate?: string | null;  // MM/DD/YYYY
    endDate?: string | null;    // MM/DD/YYYY
    passengers: number;
    guestAges: number[];
};

export type OdysseusSearchOutput = {
    status: 'success' | 'no_matches' | 'error';
    searchSummary: string;
    results: OdysseusCruiseSummary[];
};

type OdysseusCruiseSummary = {
    id: string;
    name: string;
    cruiseLine: string;
    duration: string;
    departurePort: string;
    arrivalPort: string;
    portsOfCall: string;
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

            const cruiseLineName = r.ship?.cruiseline?.id ? (CRUISE_LINE_NAMES[r.ship.cruiseline.id] ?? `Line ${r.ship.cruiseline.id}`) : 'Unknown Line';
            return {
                id: r.code,
                name: r.name,
                cruiseLine: cruiseLineName,
                duration: `${r.itinerary?.duration || '?'} Nights`,
                departurePort: resolvePort(r.itinerary?.departure?.code || 'Unknown'),
                arrivalPort: resolvePort(r.itinerary?.arrival?.code || 'Unknown'),
                portsOfCall: r.itinerary?.normalizedPortsOfCall || r.itinerary?.portsOfCalls || '',
                startingAtUSD: (minPrice > 0 ? minPrice : 'N/A') as number | 'N/A',
            };
        }).slice(0, 5);

        const searchSummary = mappedResults.length > 0
            ? `Found ${rawResults.length} live cruise itineraries. Showing top ${mappedResults.length}:`
            : 'No live cruises matched that exact criteria.';

        return {
            status: mappedResults.length > 0 ? 'success' : 'no_matches',
            searchSummary,
            results: mappedResults,
        };

    } catch (error) {
        console.error('[odysseus-search-tool] Error:', error);
        // Release the broken session so the next call cold-starts cleanly (avoids login page trap)
        void releaseOdysseusSession();
        return {
            status: 'error',
            searchSummary: 'An error occurred while connecting to the live booking engine. Please try again or refine search criteria.',
            results: [],
        };
    }
    // NOTE: No engine.close() — session stays alive for the next call
}
