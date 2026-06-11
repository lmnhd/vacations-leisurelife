import { getDealsSystemDashboardData } from "@/lib/cb/deals-system/dashboard-data";

import { DealsSystemDashboardView } from "./dashboard-view";

export default async function DealsSystemDashboardPage() {
  const data = await getDealsSystemDashboardData();

  return (
    <DealsSystemDashboardView
      data={data}
      eyebrow="Deals Operator Workbench"
      heading="Run Deals scripts, look up packages, and inspect publish readiness"
      description="Operator-facing tools for the Home Page Deals pipeline: safe validation tests, promo intelligence refresh, promo extraction, Odysseus package lookup, Link Broker cache inspection, and the gate that decides whether a Deal can appear publicly."
      refreshHref="/tests/deals-system"
      refreshLabel="Refresh cache view"
    />
  );
}
