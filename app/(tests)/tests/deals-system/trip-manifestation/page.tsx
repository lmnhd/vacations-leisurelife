import {
  listDealTripManifests,
  loadDealDiscoveryIdeasCache,
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
  // Read from the DynamoDB store (canonical write path), not the local JSON cache,
  // so the manifest list is fresh on first render and matches what the dashboard /
  // copywriter pages see.
  let manifests: DealTripManifest[] = [];
  try {
    manifests = await listDealTripManifests();
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
