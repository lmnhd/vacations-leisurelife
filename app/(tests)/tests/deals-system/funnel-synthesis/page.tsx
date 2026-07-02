import {
  assembleDealPageFacts,
  listDealFunnelSyntheses,
  listDealTripManifests,
  listPromoRecords,
  loadDealAdCopyCache,
  type CbPromoIntelligenceRecord,
  type DealAdCopy,
  type DealFunnelSynthesis,
  type DealPageFacts,
  type DealTripManifest,
} from "@/lib/cb/deals-system";

import { FunnelSynthesisView } from "./funnel-synthesis-view";

export const dynamic = "force-dynamic";

export default async function FunnelSynthesisPage({
  searchParams,
}: {
  searchParams: Promise<{ adCopyId?: string }>;
}) {
  const { adCopyId } = await searchParams;

  let adCopies: DealAdCopy[] = [];
  try {
    adCopies = loadDealAdCopyCache().adCopies;
  } catch {
    adCopies = [];
  }
  // DynamoDB store (canonical write path), not the stale local JSON cache.
  let syntheses: DealFunnelSynthesis[] = [];
  try {
    syntheses = await listDealFunnelSyntheses();
  } catch {
    syntheses = [];
  }

  let manifests: DealTripManifest[] = [];
  try {
    manifests = await listDealTripManifests();
  } catch {
    manifests = [];
  }

  // Assemble the COMPLETE public-safe cruise facts per ad copy so the lab can hand a
  // self-sufficient payload to Claude Design (ship/date/itinerary/stops/pricing/promos).
  let promoRecords: CbPromoIntelligenceRecord[] = [];
  try {
    promoRecords = await listPromoRecords();
  } catch {
    promoRecords = [];
  }
  const dealFacts: Record<string, DealPageFacts> = {};
  for (const adCopy of adCopies) {
    const manifestId = adCopy.sourceUnifiedManifestId.replace(/^unified-/, "");
    const manifest = manifests.find((m) => m.id === manifestId);
    if (manifest) {
      dealFacts[adCopy.id] = assembleDealPageFacts(manifest, promoRecords);
    }
  }

  return (
    <FunnelSynthesisView
      adCopies={adCopies}
      initialSyntheses={syntheses}
      dealFacts={dealFacts}
      preselectedAdCopyId={adCopyId ?? null}
    />
  );
}
