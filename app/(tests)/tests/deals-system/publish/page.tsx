import {
  listCuratedDeals,
  listDealTripManifests,
  loadDealAdCopyCache,
} from "@/lib/cb/deals-system";

import { PublishView } from "./publish-view";

export const dynamic = "force-dynamic";

export default async function PublishPage() {
  // Manifests AND curated deals come from the DynamoDB store (the canonical write
  // path used by the publish route), not the stale local JSON cache — otherwise a
  // deal just assembled/approved is absent on reload and the picker wrongly shows
  // "NOT PUBLISHED" for it.
  const [manifests, { adCopies }, deals] = await Promise.all([
    listDealTripManifests(),
    loadDealAdCopyCache(),
    listCuratedDeals(),
  ]);

  return <PublishView manifests={manifests} adCopies={adCopies} deals={deals} />;
}
