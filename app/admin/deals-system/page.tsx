import { getDealsSystemDashboardData } from "@/lib/cb/deals-system/dashboard-data";

import { DealsSystemDashboardView } from "../../(tests)/tests/deals-system/dashboard-view";

export const dynamic = "force-dynamic";

export default async function AdminDealsSystemPage() {
  const data = await getDealsSystemDashboardData();

  return (
    <DealsSystemDashboardView
      data={data}
      eyebrow="Deals Operator Dashboard"
      heading="Manage the Home Page Deals campaign lifecycle"
      description="Production operator dashboard for the Home Page Deals pipeline: review promo intelligence, develop and approve Curated Deals, manage homepage pin/hide visibility, refresh booking links, and work callback requests."
      refreshHref="/admin/deals-system"
      refreshLabel="Refresh"
    />
  );
}
