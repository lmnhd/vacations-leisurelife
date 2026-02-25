import { z } from 'zod';
import {
    CruisePackage,
    PackageLineItem,
    AppliedPerk,
    DepositTier,
    PackageBuilderInput,
    PackageBuilderOutput,
} from '../types';

// ─── Deposit Rules ─────────────────────────────────────────────────────────────
// Based on standard Cruise Brothers deposit tier rules

const DEPOSIT_RULES: Record<DepositTier, { perPersonAmount: number; label: string }> = {
    standard: { perPersonAmount: 250, label: 'Standard Deposit ($250/pp)' },
    promo:    { perPersonAmount: 98,  label: 'Reduced Promo Deposit ($98/pp)' },
    group:    { perPersonAmount: 50,  label: 'Group Block Deposit ($50/pp)' },
};

// ─── Agent Perks Registry ─────────────────────────────────────────────────────
// Static registry of known perk codes → savings logic

type PerkDefinition = {
    label: string;
    computeSavings: (baseFareTotal: number, guestCount: number) => number;
};

const AGENT_PERKS_REGISTRY: Record<string, PerkDefinition> = {
    OBC50: {
        label: 'Onboard Credit $50/pp',
        computeSavings: (_base, guestCount) => 50 * guestCount,
    },
    OBC100: {
        label: 'Onboard Credit $100/pp',
        computeSavings: (_base, guestCount) => 100 * guestCount,
    },
    FREE_GRATS: {
        label: 'Complimentary Prepaid Gratuities',
        computeSavings: (_base, guestCount) => 18 * 7 * guestCount, // ~$18/day * 7 nights avg
    },
    REDUCED_DEPOSIT: {
        label: 'Reduced Deposit Promo',
        computeSavings: (_base, guestCount) => 152 * guestCount, // standard $250 minus promo $98
    },
    UPGRADE_GUARANTEE: {
        label: 'Free Cabin Upgrade Guarantee',
        computeSavings: (baseFareTotal) => Math.round(baseFareTotal * 0.05), // ~5% upgrade value
    },
    KIDS_FREE: {
        label: 'Kids Sail Free',
        computeSavings: (baseFareTotal, guestCount) =>
            guestCount >= 3 ? Math.round(baseFareTotal / guestCount) : 0,
    },
};

// ─── Zod Validation Schemas ───────────────────────────────────────────────────

const ExcursionInputSchema = z.object({
    excursionId: z.string().min(1),
    label: z.string().min(1),
    pricePerPerson: z.number().nonnegative(),
});

const CruiseDetailsInputSchema = z.object({
    odysseusItineraryCode: z.string().min(1),
    shipName: z.string().min(1),
    sailDate: z.string().min(1),
    durationNights: z.number().int().positive(),
    departurePort: z.string().min(1),
    baseFarePerPerson: z.number().positive(),
    taxesAndFeesPerPerson: z.number().nonnegative(),
});

const GuestsInputSchema = z.object({
    count: z.number().int().min(1),
    ages: z.array(z.number().int().nonnegative()),
});

export const PackageBuilderInputSchema = z.object({
    cruiseDetails: CruiseDetailsInputSchema,
    guests: GuestsInputSchema,
    gratuityPerPerson: z.number().nonnegative().optional().default(0),
    includedExcursions: z.array(ExcursionInputSchema).optional().default([]),
    appliedPerkCodes: z.array(z.string()).optional().default([]),
    depositTier: z.enum(['standard', 'promo', 'group']).optional().default('standard'),
});

export const PackageBuilderBatchInputSchema = z.object({
    packages: z.array(PackageBuilderInputSchema).min(1).max(3),
});

// ─── ID Generator ─────────────────────────────────────────────────────────────

function generatePackageId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = 'PKG-';
    for (let i = 0; i < 5; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

// ─── Odysseus Booking URL Builder ─────────────────────────────────────────────

function buildOdysseusBookingUrl(itineraryCode: string, guestCount: number, sailDate: string): string {
    const baseUrl = 'https://bookings.cruisebrothers.com/booking';
    const params = new URLSearchParams({
        itinerary: itineraryCode,
        guests: String(guestCount),
        sail: sailDate,
        agent: 'LL',
    });
    return `${baseUrl}?${params.toString()}`;
}

// ─── Core Build Logic ─────────────────────────────────────────────────────────

function buildSinglePackage(input: PackageBuilderInput): CruisePackage {
    const {
        cruiseDetails,
        guests,
        gratuityPerPerson = 0,
        includedExcursions = [],
        appliedPerkCodes = [],
        depositTier = 'standard',
    } = input;

    const guestCount = guests.count;
    const lineItems: PackageLineItem[] = [];

    // 1. Cruise fare line
    const cruiseFareTotal = cruiseDetails.baseFarePerPerson * guestCount;
    lineItems.push({
        category: 'cruise_fare',
        label: `${cruiseDetails.shipName} — Cruise Fare`,
        unitPrice: cruiseDetails.baseFarePerPerson,
        quantity: guestCount,
        totalPrice: cruiseFareTotal,
        isSavings: false,
    });

    // 2. Taxes & fees line
    const taxesTotal = cruiseDetails.taxesAndFeesPerPerson * guestCount;
    lineItems.push({
        category: 'taxes_fees',
        label: 'Taxes, Port Fees & NCF',
        unitPrice: cruiseDetails.taxesAndFeesPerPerson,
        quantity: guestCount,
        totalPrice: taxesTotal,
        isSavings: false,
    });

    // 3. Gratuities (if any)
    let gratuitiesTotal = 0;
    if (gratuityPerPerson > 0) {
        gratuitiesTotal = gratuityPerPerson * guestCount;
        lineItems.push({
            category: 'gratuities',
            label: 'Prepaid Gratuities',
            unitPrice: gratuityPerPerson,
            quantity: guestCount,
            totalPrice: gratuitiesTotal,
            isSavings: false,
        });
    }

    // 4. Excursions
    let excursionsTotal = 0;
    for (const excursion of includedExcursions) {
        const excursionLineTotal = excursion.pricePerPerson * guestCount;
        excursionsTotal += excursionLineTotal;
        lineItems.push({
            category: 'excursion',
            label: excursion.label,
            unitPrice: excursion.pricePerPerson,
            quantity: guestCount,
            totalPrice: excursionLineTotal,
            isSavings: false,
        });
    }

    const subtotal = cruiseFareTotal + taxesTotal + gratuitiesTotal + excursionsTotal;

    // 5. Agent Perks (savings lines — negative value)
    const appliedPerks: AppliedPerk[] = [];
    let totalPerkSavings = 0;

    for (const perkCode of appliedPerkCodes) {
        const perkDef = AGENT_PERKS_REGISTRY[perkCode];
        if (!perkDef) continue;

        const savingsAmount = perkDef.computeSavings(cruiseFareTotal, guestCount);
        if (savingsAmount <= 0) continue;

        appliedPerks.push({
            perkCode,
            label: perkDef.label,
            savingsAmount,
        });

        totalPerkSavings += savingsAmount;

        lineItems.push({
            category: 'agent_perk',
            label: `Agent Perk: ${perkDef.label}`,
            unitPrice: -(savingsAmount / guestCount),
            quantity: guestCount,
            totalPrice: -savingsAmount,
            isSavings: true,
        });
    }

    const totalPackagePrice = Math.max(0, subtotal - totalPerkSavings);
    const pricePerPerson = totalPackagePrice / guestCount;

    // 6. Deposit line
    const depositRule = DEPOSIT_RULES[depositTier];
    const depositRequired = depositRule.perPersonAmount * guestCount;
    lineItems.push({
        category: 'deposit',
        label: `${depositRule.label} — Due Today`,
        unitPrice: depositRule.perPersonAmount,
        quantity: guestCount,
        totalPrice: depositRequired,
        isSavings: false,
    });

    return {
        packageId: generatePackageId(),
        odysseusItineraryCode: cruiseDetails.odysseusItineraryCode,
        shipName: cruiseDetails.shipName,
        sailDate: cruiseDetails.sailDate,
        durationNights: cruiseDetails.durationNights,
        departurePort: cruiseDetails.departurePort,
        guestCount,
        lineItems,
        subtotal,
        totalPackagePrice,
        pricePerPerson,
        depositRequired,
        depositTier,
        appliedPerks,
        totalPerkSavings,
        odysseusBookingUrl: buildOdysseusBookingUrl(
            cruiseDetails.odysseusItineraryCode,
            guestCount,
            cruiseDetails.sailDate
        ),
        presentationReady: true,
    };
}

// ─── Public Handler ───────────────────────────────────────────────────────────

export async function runPackageBuilder(
    rawInput: { packages: PackageBuilderInput[] }
): Promise<PackageBuilderOutput> {
    const validated = PackageBuilderBatchInputSchema.parse(rawInput);

    const builtPackages: CruisePackage[] = validated.packages.map((packageInput) =>
        buildSinglePackage(packageInput as PackageBuilderInput)
    );

    return {
        packages: builtPackages,
        comparisonMode: builtPackages.length > 1,
    };
}
