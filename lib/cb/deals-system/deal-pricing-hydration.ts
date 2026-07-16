import type { DealResolvedCabinPricing } from "./deal-trip-manifest-types";

const CABIN_TIERS = ["inside", "outside", "balcony", "suite"] as const;

export interface BookingPagePricingReadResult {
  ok: boolean;
  prices?: DealResolvedCabinPricing;
  failureReason?: string;
}

export interface DealPricingHydrationResult {
  status: "already_present" | "hydrated" | "unavailable";
  pricing?: DealResolvedCabinPricing;
  note: string;
}

export function hasCabinTierPricing(
  pricing: Pick<DealResolvedCabinPricing, (typeof CABIN_TIERS)[number]> | undefined
): boolean {
  return CABIN_TIERS.some((tier) => {
    const value = pricing?.[tier];
    return typeof value === "number" && value > 0;
  });
}

/**
 * Resolve initial cabin pricing from the already-acquired booking URL.
 *
 * This is deliberately side-effect free. Operator-run pipeline routes supply
 * the existing booking-page scraper, then decide whether to persist the result
 * or block the handoff. Price-drift corrections remain a separate reviewed
 * workflow and are never applied here.
 */
export async function resolveInitialCabinPricing(
  existing: DealResolvedCabinPricing | undefined,
  bookingUrl: string | undefined,
  readBookingPage: (url: string) => Promise<BookingPagePricingReadResult>
): Promise<DealPricingHydrationResult> {
  if (hasCabinTierPricing(existing)) {
    return {
      status: "already_present",
      pricing: existing,
      note: "Cabin-tier pricing was already present on the resolved package.",
    };
  }

  if (!bookingUrl) {
    return {
      status: "unavailable",
      note: "No booking URL is available for cabin-pricing hydration.",
    };
  }

  const outcome = await readBookingPage(bookingUrl);
  if (!outcome.ok || !hasCabinTierPricing(outcome.prices)) {
    return {
      status: "unavailable",
      note: outcome.failureReason ?? "The booking page exposed no numeric cabin-tier fares.",
    };
  }

  return {
    status: "hydrated",
    pricing: outcome.prices,
    note: "Cabin-tier pricing was hydrated from the acquired booking URL.",
  };
}
