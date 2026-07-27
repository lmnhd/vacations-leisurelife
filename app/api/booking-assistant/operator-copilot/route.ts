import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { answerOperatorCopilotQuestion } from "@/lib/booking-assistant/operator-copilot";
import { readBookingAssistantEnvConfig } from "@/lib/booking-assistant/operator-config";
import { createOperatorRouteContext } from "@/lib/booking-assistant/operator-route-context";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  question: z.string().min(2).max(2_000),
  draftId: z.string().min(1).max(200).optional(),
  history: z.array(z.object({
    role: z.enum(["operator", "assistant"]),
    content: z.string().min(1).max(4_000),
  })).max(8).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const hostname = request.headers.get("host") ?? undefined;
    const context = await createOperatorRouteContext(hostname);
    const { operatorService } = readBookingAssistantEnvConfig(hostname);
    const input = RequestSchema.parse(await request.json());
    const result = await answerOperatorCopilotQuestion(
      context.clients,
      operatorService,
      input
    );
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Operator copilot request failed.";
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ success: false, error: detail }, { status });
  }
}
