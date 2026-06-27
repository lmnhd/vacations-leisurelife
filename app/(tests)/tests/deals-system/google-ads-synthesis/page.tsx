import {
  listDealFunnelSyntheses,
  loadDealGoogleAdsSynthesisCache,
  type DealFunnelSynthesis,
  type DealGoogleAdsSynthesis,
} from "@/lib/cb/deals-system";

import { GoogleAdsSynthesisView } from "./google-ads-synthesis-view";

export const dynamic = "force-dynamic";

export default async function GoogleAdsSynthesisPage() {
  let funnelSyntheses: DealFunnelSynthesis[] = [];
  try {
    funnelSyntheses = await listDealFunnelSyntheses();
  } catch {
    funnelSyntheses = [];
  }

  let syntheses: DealGoogleAdsSynthesis[] = [];
  try {
    syntheses = loadDealGoogleAdsSynthesisCache().syntheses;
  } catch {
    syntheses = [];
  }

  return <GoogleAdsSynthesisView funnelSyntheses={funnelSyntheses} initialSyntheses={syntheses} />;
}
