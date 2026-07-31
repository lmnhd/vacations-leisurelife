import { getDealsSystemDashboardData } from "@/lib/cb/deals-system/dashboard-data";

import { DealsSystemDashboardView } from "./dashboard-view";

// The dashboard reads `?tab=` and `?dealId=` via useSearchParams() in client
// components (dashboard-view, campaign-workbench). Under static prerendering
// those hooks return an EMPTY param set during the static pass, so deep links
// like the review queue's "Review Deal" button silently fell back to the first
// deal in the list. Every sibling step page already opts out the same way.
export const dynamic = "force-dynamic";

export default async function DealsSystemDashboardPage() {
  const data = await getDealsSystemDashboardData();

  return (
    <DealsSystemDashboardView
      data={data}
      eyebrow="Deals Operator Workbench"
      heading="Build a homepage Deal from discovery to launch"
      description="The operator console for the Home Page Deals pipeline. Pipeline walks a Deal from discovery research to launch-ready Meta creative; Operator Tools runs scripts and lookups; Inventory shows assembled Deals, promos, and links; Ops & Health covers homepage readiness, callbacks, and cache state."
      refreshHref="/tests/deals-system"
      refreshLabel="Refresh data"
    />
  );
}
