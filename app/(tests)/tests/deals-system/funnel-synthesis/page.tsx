import { readFileSync } from "fs";

import {
  assembleDealPageFacts,
  DEALS_CACHE_PATHS,
  listDealFunnelSyntheses,
  listDealTripManifests,
  loadDealAdCopyCache,
  validatePromoIntelligenceCache,
  type CbPromoIntelligenceRecord,
  type DealAdCopy,
  type DealFunnelSynthesis,
  type DealPageFacts,
  type DealTripManifest,
} from "@/lib/cb/deals-system";

import { FunnelSynthesisView } from "./funnel-synthesis-view";

export const dynamic = "force-dynamic";

function loadPromoRecords(): CbPromoIntelligenceRecord[] {
  try {
    const raw = readFileSync(DEALS_CACHE_PATHS.promoIntelligence, "utf8");
    const result = validatePromoIntelligenceCache(JSON.parse(raw) as unknown);
    return result.ok && result.value ? result.value.records : [];
  } catch {
    return [];
  }
}

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
  const promoRecords = loadPromoRecords();
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
