import { getOdysseusSession, releaseOdysseusSession } from '@/lib/services/odysseus/OdysseusSessionManager';
import type { CruiseResult, CruiseSearchCriteria } from '@/lib/services/odysseus/types';

const PORT_CODES: Record<string, string> = {
    MIA: 'Miami, FL',
    FLL: 'Fort Lauderdale, FL',
    MCO: 'Orlando (Port Canaveral), FL',
    XPC: 'Port Canaveral, FL',
    TPA: 'Tampa, FL',
    JAX: 'Jacksonville, FL',
    NOR: 'New Orleans, LA',
    NYC: 'New York, NY',
    BAL: 'Baltimore, MD',
    BOS: 'Boston, MA',
    SEA: 'Seattle, WA',
    SFO: 'San Francisco, CA',
    LAX: 'Los Angeles, CA',
    SOU: 'Southampton, UK',
    BCN: 'Barcelona, Spain',
    ROM: 'Rome (Civitavecchia), Italy',
    VEN: 'Venice, Italy',
    ATH: 'Athens (Piraeus), Greece',
};

function resolvePort(code: string): string {
    return PORT_CODES[code] ?? code;
}

const CRUISE_LINE_NAMES: Record<number, string> = {
    1: 'Carnival',
    2: 'Norwegian',
    3: 'Princess',
    4: 'Celebrity',
    5: 'Holland America',
    6: 'Costa',
    7: 'MSC',
    8: 'Royal Caribbean',
    9: 'Disney',
    10: 'Cunard',
    11: 'Regent',
    12: 'Silversea',
    13: 'Oceania',
    14: 'Azamara',
    982: 'MSC',
};

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
