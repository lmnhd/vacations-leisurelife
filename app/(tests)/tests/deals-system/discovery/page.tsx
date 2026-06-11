import {
  getSavedDiscoveryResearchStatus,
  loadDealDiscoveryIdeasCache,
  type DealDiscoveryIdea,
} from "@/lib/cb/deals-system";

import { DealDiscoveryView } from "./discovery-view";

export const dynamic = "force-dynamic";

export default function DealDiscoveryPage() {
  const researchStatus = getSavedDiscoveryResearchStatus();
  let ideas: DealDiscoveryIdea[] = [];
  try {
    ideas = loadDealDiscoveryIdeasCache().ideas;
  } catch {
    ideas = [];
  }

  return <DealDiscoveryView researchStatus={researchStatus} initialIdeas={ideas} />;
}
