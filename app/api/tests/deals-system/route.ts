import { NextResponse } from "next/server";

import { getDealsSystemDashboardData } from "@/lib/cb/deals-system/dashboard-data";
import { blockInProduction } from "@/lib/cb/deals-system/operator-only-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const blocked = blockInProduction();
  if (blocked) return blocked;

  const data = await getDealsSystemDashboardData();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
