/**
 * POST /api/deals/[id]/assistant
 *
 * The real "Ask a question" assistant for the booking portal flow. A stateless,
 * single-call grounded Q&A: the guest asks one free-text question about this
 * cruise or how booking works, and we answer from the approved deal facts plus
 * a fixed set of operations facts — never inventing prices, itineraries, or
 * policies we weren't given.
 *
 * Runs on the cheapest capable Claude tier (Haiku) through the existing LLM
 * gateway (`ModelName.CLAUDE_HAIKU` / task `guest_qa`), so the model is
 * swappable in one registry entry. Dev-gated to match the booking portal page.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v3";

import { callLLM, ModelName } from "@/lib/ai/llm-gateway";
import {
  checkRateLimit,
  clientIpFromHeaders,
} from "@/lib/cb/deals-system/assistant-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Live wherever the booking assistant feature is enabled — matches the portal page. */
function bookingAssistantEnabled(): boolean {
  return process.env.BOOKING_ASSISTANT_ENABLED === "true";
}

/** Deal facts the flow already holds client-side; all optional and untrusted. */
const DealFactsSchema = z.object({
  line: z.string().trim().max(120).optional(),
  ship: z.string().trim().max(120).optional(),
  title: z.string().trim().max(200).optional(),
  nights: z.number().int().nonnegative().max(400).optional(),
  sailDateLabel: z.string().trim().max(120).optional(),
  departure: z.string().trim().max(200).optional(),
  itinerary: z.string().trim().max(200).optional(),
  priceBasis: z.string().trim().max(200).optional(),
});

const AssistantSchema = z.object({
  question: z.string().trim().min(1).max(500),
  deal: DealFactsSchema.optional(),
  /** Browser analytics session id, if the client has one — tightens the key. */
  sessionId: z.string().trim().max(120).optional(),
});

// Each free-text question bills real LLM tokens; cap bursts per caller.
const RATE_LIMIT = { limit: 8, windowMs: 60_000 };

// The operations facts every answer may rely on — the durable truth about how
// booking works here, independent of any single deal. Mirrors the approved
// canned answers in the flow's SIDE_QUESTIONS.
const OPERATIONS_FACTS = [
  "Prices and cabins are never charged automatically. The exact price and cabin are confirmed live with the guest before anything is paid; the price shown is the latest captured, not a locked-in quote.",
  "A real booking agent finalizes every booking by phone. Once the guest provides a phone number, they can reach a live agent, and everything they've entered travels with them.",
  "No card or payment details are collected in this flow. Payment happens only in the cruise line's official system, with the agent.",
  "The standard fare includes the cabin, meals in the main dining venues, and standard onboard entertainment. Drink packages, excursions, specialty dining, and similar are optional paid extras.",
  "Age-based rates are checked automatically, and there is one optional military/service question. A live qualifying rate is always compared against the best regular promotion before the guest chooses.",
  "For most sailings a passport is the recommended travel document, but the agent confirms the exact document requirements before payment.",
  "The guest can pause any time; confirmed answers are saved and a secure resume link is emailed. Prices and cabins are re-checked live on return rather than held.",
].join("\n- ");

function buildSystemPrompt(deal: z.infer<typeof DealFactsSchema> | undefined): string {
  const dealLines: string[] = [];
  if (deal?.title) dealLines.push(`Deal: ${deal.title}`);
  if (deal?.line) dealLines.push(`Cruise line: ${deal.line}`);
  if (deal?.ship) dealLines.push(`Ship: ${deal.ship}`);
  if (typeof deal?.nights === "number") dealLines.push(`Nights: ${deal.nights}`);
  if (deal?.sailDateLabel) dealLines.push(`Sailing date: ${deal.sailDateLabel}`);
  if (deal?.departure) dealLines.push(`Departure: ${deal.departure}`);
  if (deal?.itinerary) dealLines.push(`Itinerary / region: ${deal.itinerary}`);
  if (deal?.priceBasis) dealLines.push(`Price basis: ${deal.priceBasis}`);

  const dealBlock =
    dealLines.length > 0
      ? dealLines.map((line) => `- ${line}`).join("\n")
      : "- (No specific cruise facts were provided for this question.)";

  return [
    "You are the booking assistant for Leisure Life Interactive, a cruise booking service.",
    "A guest is partway through booking a specific cruise and has paused to ask you a question without losing their place. Answer it warmly, plainly, and briefly.",
    "",
    "THIS CRUISE (the only cruise-specific facts you may state):",
    dealBlock,
    "",
    "HOW BOOKING WORKS HERE (always true, safe to rely on):",
    `- ${OPERATIONS_FACTS}`,
    "",
    "RULES:",
    "- Answer ONLY from the two fact lists above. Never invent or estimate a price, cabin, date, itinerary detail, port, policy, discount, or inclusion that is not listed.",
    "- If you don't have the fact, say so honestly and offer that a booking agent will confirm it — e.g. 'I don't have that detail here, but your booking agent will confirm it with you.' Do not guess.",
    "- Never quote a specific dollar amount unless it appears verbatim in the facts above. If asked 'how much', point to the price basis shown and that the exact price is confirmed with the agent before paying.",
    "- Keep it to 1-3 short sentences, conversational, no markdown, no bullet lists, no headers. Reassure without overselling.",
    "- You cannot take payment, change the price, or make the booking yourself; those happen with the live agent. Never claim otherwise.",
    "- Stay on the topic of this cruise and the booking process. If asked something unrelated, gently steer back.",
  ].join("\n");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!bookingAssistantEnabled()) {
    return NextResponse.json(
      { success: false, error: "Assistant is not available." },
      { status: 404 }
    );
  }

  const { id: dealId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = AssistantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "A question is required." },
      { status: 400 }
    );
  }

  const { question, deal, sessionId } = parsed.data;

  // Rate limit per caller (IP + browser session, scoped to the deal) so a
  // single guest can't rack up token spend by hammering free-text questions.
  const ip = clientIpFromHeaders(request.headers);
  const rateKey = `assistant:${dealId}:${ip}:${sessionId ?? "nosession"}`;
  const rate = checkRateLimit(rateKey, RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        error:
          "You've asked a lot of questions in a short time — give it a moment, or a booking agent can help you right away.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    );
  }

  try {
    const result = await callLLM(ModelName.CLAUDE_HAIKU, question, {
      systemPrompt: buildSystemPrompt(deal),
      maxTokens: 320,
    });
    const answer = result.content.trim();

    if (!answer) {
      return NextResponse.json(
        {
          success: true,
          answer:
            "I'm not certain about that one — your booking agent can confirm it with you when you connect.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ success: true, answer });
  } catch (error) {
    console.error("[deal-assistant] answer failed:", error);
    // Graceful, on-brand fallback so the guest is never left with a raw error.
    return NextResponse.json(
      {
        success: false,
        error:
          "I couldn't reach the assistant just now. You can try again, or a booking agent will happily answer when you connect.",
      },
      { status: 502 }
    );
  }
}
