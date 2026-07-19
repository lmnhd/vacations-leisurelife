import type { DealTripManifest } from "./deal-trip-manifest-types";

/**
 * Stable campaign identity for a trip manifest. A Deal campaign belongs to one
 * Odysseus package; changing its angle is an update, not a second campaign.
 */
export function dealTripManifestCampaignId(manifest: DealTripManifest): string {
  const resolvedPackageId = manifest.resolvedPackage?.packageId.trim();
  if (resolvedPackageId) return resolvedPackageId;

  const suggestedDealId = manifest.assembleDraft.suggestedDealId.trim();
  if (suggestedDealId) return suggestedDealId;

  return manifest.id;
}

export function manifestsBelongToSameDealCampaign(
  left: DealTripManifest,
  right: DealTripManifest
): boolean {
  return dealTripManifestCampaignId(left) === dealTripManifestCampaignId(right);
}
