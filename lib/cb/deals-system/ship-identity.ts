import type { CuratedOdysseusDeal } from "./curated-deal-types";
import type { DealManifestResolvedPackage } from "./deal-trip-manifest-types";

const CRUISE_TITLE_MARKERS = [
  " cruise",
  "world cruise",
  "cruise:",
  "cruise from",
  "ending in",
  "-night",
  "-day",
  "crossing",
  "panama canal crossing",
];

export function looksLikeCruiseItineraryName(value: string | undefined): boolean {
  const lower = value?.trim().toLowerCase() ?? "";
  if (!lower) return false;
  return CRUISE_TITLE_MARKERS.some((marker) => lower.includes(marker));
}

export function resolveShipNameForPackage(
  packageId: string | undefined,
  candidateShipName: string | undefined,
  fallbackShipName?: string
): string | undefined {
  void packageId;
  const candidate = candidateShipName?.trim();
  if (candidate && !looksLikeCruiseItineraryName(candidate)) return candidate;

  const fallback = fallbackShipName?.trim();
  if (fallback && !looksLikeCruiseItineraryName(fallback)) return fallback;
  return undefined;
}

export function resolveCruiseLineForPackage(
  packageId: string | undefined,
  candidateCruiseLine: string | undefined
): string {
  void packageId;
  return candidateCruiseLine?.trim() ?? "";
}

export function resolvedPackageShipName(
  resolved: DealManifestResolvedPackage | undefined,
  fallbackShipName?: string
): string | undefined {
  return resolveShipNameForPackage(resolved?.packageId, resolved?.shipName, fallbackShipName);
}

export function publicDealShipName(deal: CuratedOdysseusDeal): string | undefined {
  return resolveShipNameForPackage(deal.packageId, deal.cruiseFacts.shipName);
}

export function publicDealCruiseLine(deal: CuratedOdysseusDeal): string {
  return resolveCruiseLineForPackage(deal.packageId, deal.cruiseFacts.cruiseLine);
}
