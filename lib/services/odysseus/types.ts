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
