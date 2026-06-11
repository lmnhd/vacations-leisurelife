import { NextResponse } from "next/server";

import { getDealsSystemDashboardData } from "@/lib/cb/deals-system/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getDealsSystemDashboardData();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
