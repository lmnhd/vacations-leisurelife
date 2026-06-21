import type { CuratedOdysseusDeal } from "./curated-deal-types";
import type { DealManifestResolvedPackage } from "./deal-trip-manifest-types";

interface KnownPackageShipIdentity {
  shipName: string;
  cruiseLine?: string;
}

const KNOWN_PACKAGE_SHIP_IDENTITIES: Record<string, KnownPackageShipIdentity> = {
  // CB package 1582993 is the Jan 5, 2027 Seabourn world-cruise segment.
  // Odysseus returns the itinerary title in the ship slot, so keep the verified
  // vessel here until the upstream lookup captures a true ship field.
  "1582993": {
    shipName: "Seabourn Quest",
    cruiseLine: "Seabourn Cruise Line",
  },
  "1578937": {
    shipName: "Queen Mary 2",
    cruiseLine: "Cunard",
  },
};

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

export function getKnownPackageShipIdentity(packageId: string | undefined): KnownPackageShipIdentity | undefined {
  const trimmed = packageId?.trim();
  return trimmed ? KNOWN_PACKAGE_SHIP_IDENTITIES[trimmed] : undefined;
}

export function resolveShipNameForPackage(
  packageId: string | undefined,
  candidateShipName: string | undefined,
  fallbackShipName?: string
): string | undefined {
  const candidate = candidateShipName?.trim();
  if (candidate && !looksLikeCruiseItineraryName(candidate)) return candidate;

  const known = getKnownPackageShipIdentity(packageId)?.shipName;
  if (known) return known;

  const fallback = fallbackShipName?.trim();
  if (fallback && !looksLikeCruiseItineraryName(fallback)) return fallback;
  return undefined;
}

export function resolveCruiseLineForPackage(
  packageId: string | undefined,
  candidateCruiseLine: string | undefined
): string {
  return getKnownPackageShipIdentity(packageId)?.cruiseLine ?? candidateCruiseLine?.trim() ?? "";
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
