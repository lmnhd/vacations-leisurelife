import {
  loadDealDiscoveryIdeasCache,
  loadDealTripManifestsCache,
  type DealDiscoveryIdea,
  type DealTripManifest,
} from "@/lib/cb/deals-system";

import { TripManifestationView } from "./manifestation-view";

export const dynamic = "force-dynamic";

export default async function TripManifestationPage({
  searchParams,
}: {
  searchParams: Promise<{ angleId?: string }>;
}) {
  const { angleId } = await searchParams;

  let angles: DealDiscoveryIdea[] = [];
  try {
    angles = loadDealDiscoveryIdeasCache().ideas;
  } catch {
    angles = [];
  }
  let manifests: DealTripManifest[] = [];
  try {
    manifests = loadDealTripManifestsCache().manifests;
  } catch {
    manifests = [];
  }

  return (
    <TripManifestationView
      angles={angles}
      initialManifests={manifests}
      preselectedAngleId={angleId ?? null}
    />
  );
}
