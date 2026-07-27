import { NextResponse } from "next/server";

import { BOOKING_FIELD_CATALOG, BOOKING_FIELD_CATALOG_VERSION } from "@/lib/booking-assistant/field-catalog";
import { getPilotFlowDefinition } from "@/lib/booking-assistant/flow-definition";
import { BOOKING_OPTION_REGISTRY, BOOKING_OPTION_REGISTRY_VERSION } from "@/lib/booking-assistant/option-registry";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (process.env.BOOKING_ASSISTANT_ENABLED !== "true") {
    return NextResponse.json({ success: false, error: "Booking Assistant is not enabled" }, { status: 503 });
  }
  return NextResponse.json({
    success: true,
    result: {
      flow: getPilotFlowDefinition(),
      fieldCatalog: {
        version: BOOKING_FIELD_CATALOG_VERSION,
        fields: BOOKING_FIELD_CATALOG,
      },
      optionRegistry: {
        version: BOOKING_OPTION_REGISTRY_VERSION,
        options: BOOKING_OPTION_REGISTRY,
      },
    },
  });
}
