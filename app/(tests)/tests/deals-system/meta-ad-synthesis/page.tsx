import {
  loadDealFunnelSynthesisCache,
  loadDealMetaAdSynthesisCache,
  type DealFunnelSynthesis,
  type DealMetaAdSynthesis,
} from "@/lib/cb/deals-system";

import { MetaAdSynthesisView } from "./meta-ad-synthesis-view";

export const dynamic = "force-dynamic";

export default function MetaAdSynthesisPage() {
  let funnelSyntheses: DealFunnelSynthesis[] = [];
  try {
    funnelSyntheses = loadDealFunnelSynthesisCache().syntheses;
  } catch {
    funnelSyntheses = [];
  }

  let syntheses: DealMetaAdSynthesis[] = [];
  try {
    syntheses = loadDealMetaAdSynthesisCache().syntheses;
  } catch {
    syntheses = [];
  }

  return <MetaAdSynthesisView funnelSyntheses={funnelSyntheses} initialSyntheses={syntheses} />;
}
