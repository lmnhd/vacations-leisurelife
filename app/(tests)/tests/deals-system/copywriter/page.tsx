import {
  listDealTripManifests,
  loadDealAdCopyCache,
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

  // Read manifests from the DynamoDB store (the canonical write path used by the
  // manifestation/copywriter API routes), NOT the local JSON cache — otherwise a
  // manifest just created on another page is absent here and the preselected
  // manifestId silently falls back to the first cached manifest.
  let manifests: DealTripManifest[] = [];
  try {
    manifests = await listDealTripManifests();
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
