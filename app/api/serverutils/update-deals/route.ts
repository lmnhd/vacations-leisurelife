import { NextResponse } from "next/server";
import { cbPicks } from "@/app/(dashboard)/(routes)/destinationdeal/[id]/index.js";
import { generateDealContent } from "@/lib/deals-utils";
import { CBPickData } from "@/components/cb/cbdestinationpickstile";

export async function GET(req: Request) {
  try {
    // Basic security check - can be configured in environment variables
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    
    if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    console.log("Starting background deal update...");
    const picks = (await cbPicks()) as CBPickData[];
    console.log(`Found ${picks.length} deals to process.`);

    const results = [];

    for (const pick of picks) {
      console.log(`Processing deal: ${pick.id} - ${pick.what}`);
      try {
        const result = await generateDealContent(pick.id);
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
      details: results
    });
  } catch (error: any) {
    console.error("[DEALS_UPDATE_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
