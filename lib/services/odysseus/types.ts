import { z } from "zod";

export interface CruiseSearchCriteria {
    vendorId?: number; // e.g. 8 for Royal Caribbean
    brandId?: number; // e.g. 73 for Oasis of the Seas
    startDate?: string; // MM/DD/YYYY
    endDate?: string;   // MM/DD/YYYY
    duration?: string;  // e.g. "4-6"
    passengers: number;
    guestStateResidence?: string; // e.g. "FL"
    guestAges: number[];
}

// Zod Schemas for Intercepted JSON Payloads
export const IterineraryPayloadSchema = z.object({
    id: z.number(),
    duration: z.number(),
    departure: z.object({
        code: z.string(),
        type: z.string(),
    }),
    arrival: z.object({
        code: z.string(),
        type: z.string(),
    }),
    portsOfCalls: z.string(),
    normalizedPortsOfCall: z.string(),
    mapPath: z.string().optional().nullable(),
});

export const CruisePriceItemSchema = z.object({
    name: z.string().optional(),
    code: z.string().optional(),
    value: z.number(),
});

export const CruisePriceSetSchema = z.object({
    items: z.array(CruisePriceItemSchema),
    currencyCode: z.string(),
    modifiedOn: z.string().optional(),
});

export const CruisePackageSchema = z.object({
    id: z.number(),
    startDateTime: z.string(),
    endDateTime: z.string(),
    prices: z.array(CruisePriceSetSchema).optional().default([]),
    voyageId: z.string(),
    maxOccupancy: z.number().optional().default(4),
    minOccupancy: z.number().optional().default(1),
    cruiseDuration: z.number(),
    gratuitiesInfo: z.record(z.string(), z.number()).optional(),
});

export const CruiseShipInfoSchema = z.object({
    id: z.number(),
    cruiseline: z.object({
        id: z.number(),
        logoPath: z.string().optional().nullable(),
    }).optional(),
});

export const CruiseResultSchema = z.object({
    code: z.string(),
    name: z.string(),
    itinerary: IterineraryPayloadSchema,
    uniqueItineraryId: z.string(),
    prices: z.array(CruisePriceSetSchema).optional().default([]),
    ship: CruiseShipInfoSchema,
    packages: z.array(CruisePackageSchema).optional().default([]),
    categoryTypes: z.array(z.string()).optional(),
    cruiseTourName: z.string().optional(),
});

// Infer TypeScript types from Zod Schemas
export type IterineraryPayload = z.infer<typeof IterineraryPayloadSchema>;
export type CruisePriceItem = z.infer<typeof CruisePriceItemSchema>;
export type CruisePriceSet = z.infer<typeof CruisePriceSetSchema>;
export type CruisePackage = z.infer<typeof CruisePackageSchema>;
export type CruiseShipInfo = z.infer<typeof CruiseShipInfoSchema>;
export type CruiseResult = z.infer<typeof CruiseResultSchema>;

export interface PackagePageCabinPricing {
    inside?: number;
    outside?: number;
    balcony?: number;
    suite?: number;
    currencyCode: string;
    leadFare?: number;
}

export interface PackagePageSummary {
    packageId: string;
    cruiseLine?: string;
    shipName?: string;
    title?: string;
    sailDateIso?: string;
    nights?: number;
    departurePortCode?: string;
    portsOfCall?: string;
    cabinPricing?: PackagePageCabinPricing;
    /**
     * Odysseus itinerary id recovered from the package page's own API payload —
     * the key to /nitroapi/v2/cruise/itinerary/{id}. Lets callers capture the
     * day-by-day schedule keyed off the STABLE packageId in the booking URL,
     * without depending on the search index re-finding the sailing.
     */
    itineraryId?: number;
}

// ── Itinerary detail (per-day schedule) ──────────────────────────────────────
// The search result's `itinerary` only carries a coarse ports-of-call STRING.
// The real day-by-day schedule (port names, arrival/departure times, sea days)
// lives at GET /nitroapi/v2/cruise/itinerary/{itineraryId}. Each node is one
// day/stop. Confirmed against the archived intercepted payload (itinerary 479966).

export const ItineraryNodePortSchema = z.object({
    code: z.string().optional(),
    type: z.string().optional(),
    internalCode: z.string().optional(),
});

export const ItineraryNodeSchema = z.object({
    port: ItineraryNodePortSchema.optional(),
    /** Day index from embarkation (0 = embarkation day). Absent on the first node. */
    dayOffSet: z.number().optional(),
    /** "Sea" for sea days; absent/Port for a port call. */
    type: z.string().optional(),
    /** "HH:MM:SS" local; absent when not applicable (e.g. embarkation has no arrival). */
    arrivalTime: z.string().optional().nullable(),
    departureTime: z.string().optional().nullable(),
    /** Human-readable port/description Odysseus renders (e.g. "San Juan, Puerto Rico"). */
    description: z.string().optional(),
});

export const ItineraryDetailSchema = z.object({
    id: z.number(),
    nodes: z.array(ItineraryNodeSchema).default([]),
    portsOfCalls: z.string().optional(),
    normalizedPortsOfCall: z.string().optional(),
    mapPath: z.string().optional().nullable(),
});

export type ItineraryNodePort = z.infer<typeof ItineraryNodePortSchema>;
export type ItineraryNode = z.infer<typeof ItineraryNodeSchema>;
export type ItineraryDetail = z.infer<typeof ItineraryDetailSchema>;

/**
 * Normalized, transport-agnostic day-by-day itinerary day. This is the shape that
 * flows through the deals pipeline onto the public deal page — derived from the
 * raw Odysseus `ItineraryNode`s, stripped of vendor internals. Times are the raw
 * "HH:MM:SS" Odysseus strings (the page may format them); null when not provided.
 */
export interface ItineraryDay {
    /** 1-based day number from embarkation. */
    day: number;
    /** Readable port/description (e.g. "San Juan, Puerto Rico" or "At Sea"). */
    portName: string;
    /** Best port code we have (internalCode preferred, then code). */
    portCode?: string;
    atSea: boolean;
    arrivalTime?: string;
    departureTime?: string;
}

/** Normalized day-by-day itinerary plus the route-map image path, when present. */
export interface DayByDayItinerary {
    days: ItineraryDay[];
    /** Readable ports-of-call string from the detail endpoint, when present. */
    portsOfCall?: string;
    mapPath?: string;
}

/**
 * Convert a raw Odysseus `ItineraryDetail` into the normalized day-by-day shape.
 * Pure. Returns null when there are no usable nodes so callers can fall back to
 * the coarse ports string rather than render an empty itinerary.
 */
export function normalizeItineraryDetail(detail: ItineraryDetail | null | undefined): DayByDayItinerary | null {
    if (!detail || detail.nodes.length === 0) return null;

    const days: ItineraryDay[] = detail.nodes.map((node, i) => {
        const atSea = (node.type ?? '').toLowerCase() === 'sea';
        const portName = (node.description ?? '').trim() || (atSea ? 'At Sea' : '');
        return {
            // dayOffSet is 0-based from embarkation and absent on the first node.
            day: typeof node.dayOffSet === 'number' ? node.dayOffSet + 1 : i + 1,
            portName,
            portCode: node.port?.internalCode || node.port?.code || undefined,
            atSea,
            arrivalTime: node.arrivalTime ?? undefined,
            departureTime: node.departureTime ?? undefined,
        };
    });

    return {
        days,
        portsOfCall: detail.portsOfCalls?.trim() || undefined,
        mapPath: detail.mapPath ?? undefined,
    };
}
