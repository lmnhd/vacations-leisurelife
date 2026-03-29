import { NextResponse } from "next/server";
import { cbPicks } from "@/app/(dashboard)/(routes)/destinationdeal/[id]/index.js";
import { generateDealContent } from "@/lib/deals-utils";
import { CBPickData } from "@/lib/cb/cb-deal-types";
import { buildStoredCbDealsPayload } from "@/lib/cb/cb-deals-refresh";
import { getStoredCbDeals, storeCbDeals } from "@/lib/cb/cb-deals-store";

export async function GET(req: Request) {
  try {
    // Basic security check - can be configured in environment variables
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    
    if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    console.log("Starting background deal update...");
    const picks = (await cbPicks({ source: "live" })) as CBPickData[];
    console.log(`Found ${picks.length} deals to process.`);

    const storedPayload = await buildStoredCbDealsPayload(picks);
    await storeCbDeals(storedPayload);
    const persistedPayload = await getStoredCbDeals({ skipLocalCache: true });

    if (
      !persistedPayload ||
      persistedPayload.generatedAtIso !== storedPayload.generatedAtIso ||
      persistedPayload.homepageDeals.length !== storedPayload.homepageDeals.length
    ) {
      throw new Error(
        "CB deals payload was not persisted to Dynamo. Check APP_CACHE_TABLE_NAME, AWS region, and Dynamo permissions."
      );
    }

    console.log(`Stored ${storedPayload.homepageDeals.length} homepage deals in Dynamo.`);

    const results = [];

    for (const pick of picks) {
      console.log(`Processing deal: ${pick.id} - ${pick.what}`);
      try {
        const result = await generateDealContent(pick.id, pick);
        results.push({
          id: pick.id,
          status: result ? "success" : "failed",
          title: result?.data?.title || "N/A"
        });
      } catch (error: any) {
        console.error(`Error processing deal ${pick.id}:`, error.message);
        results.push({
          id: pick.id,
          status: "error",
          error: error.message
        });
      }
    }

    return NextResponse.json({
      message: "Deals updated successfully",
      processed: picks.length,
      homepageDealsStored: storedPayload.homepageDeals.length,
      generatedAtIso: storedPayload.generatedAtIso,
      details: results
    });
  } catch (error: any) {
    console.error("[DEALS_UPDATE_ERROR]", error);
    return NextResponse.json(
      {
        message: "Deals update failed",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
