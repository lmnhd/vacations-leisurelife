import {
  loadCuratedDealsCache,
  loadDealAdCopyCache,
  loadDealTripManifestsCache,
} from "@/lib/cb/deals-system";

import { PublishView } from "./publish-view";

export const dynamic = "force-dynamic";

export default async function PublishPage() {
  const [{ manifests }, { adCopies }, { deals }] = await Promise.all([
    loadDealTripManifestsCache(),
    loadDealAdCopyCache(),
    loadCuratedDealsCache(),
  ]);

  return <PublishView manifests={manifests} adCopies={adCopies} deals={deals} />;
}
