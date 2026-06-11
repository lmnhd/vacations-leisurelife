import {
  loadDealAdCopyCache,
  loadDealTripManifestsCache,
  type DealAdCopy,
  type DealTripManifest,
} from "@/lib/cb/deals-system";

import { CopywriterView } from "./copywriter-view";

export const dynamic = "force-dynamic";

export default async function CopywriterPage({
  searchParams,
}: {
  searchParams: Promise<{ manifestId?: string }>;
}) {
  const { manifestId } = await searchParams;

  let manifests: DealTripManifest[] = [];
  try {
    manifests = loadDealTripManifestsCache().manifests;
  } catch {
    manifests = [];
  }
  let adCopies: DealAdCopy[] = [];
  try {
    adCopies = loadDealAdCopyCache().adCopies;
  } catch {
    adCopies = [];
  }

  return (
    <CopywriterView
      manifests={manifests}
      initialAdCopies={adCopies}
      preselectedManifestId={manifestId ?? null}
    />
  );
}
