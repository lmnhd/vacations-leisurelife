/**
 * Guarded tool execution.
 *
 * Every dispatch is bound to a resolved conversation: its skill, mode,
 * authorization, and persisted tool allowlist. A client can name a tool, but
 * it cannot widen the surface, reach another conversation's state, or pass
 * arbitrary fields into Booking Assistant records - each tool has its own
 * strict payload schema and its own handler.
 */

import { z } from "zod/v3";

import { getToolCache, setToolCache } from "@/lib/chat/tool-cache";
import { runPerplexityCruiseResearch } from "@/lib/chat/tools/perplexity-research";
import { runCruiseBrothersKnowledgeLookup } from "@/lib/chat/tools/cruise-brothers-knowledge";
import { runExcursionFinder } from "@/lib/chat/tools/excursion-finder";
import { runCruiseBrothersScraper } from "@/lib/chat/tools/cruise-brothers-scraper";
import {
  runSocialMediaInsights,
  runCruiseTrendAnalysis,
  type TravelerPerspective,
  type TrendCategory,
} from "@/lib/chat/tools/social-media-insights";
import { runOdysseusSearch } from "@/lib/chat/tools/odysseus-search";
import { runPricingComparator } from "@/lib/chat/tools/pricing-comparator";

import {
  getConversation,
  recordToolCall,
  updateConversation,
  type ConversationRecord,
} from "./conversation-registry";
import { isToolDispatchAllowed } from "./tool-policy";
import { emitTraceEvent } from "./trace-events";
import { getDisplayToolLabel } from "./tool-definitions";

/** Session cost control: hard cap on tool calls per conversation. */
const MAX_TOOL_CALLS_PER_CONVERSATION = 40;
/** Wall-clock ceiling for one tool, after which we return a typed timeout. */
const TOOL_TIMEOUT_MS = 90_000;

export interface ToolExecutionRequest {
  conversationId: string;
  toolId: string;
  payload: Record<string, unknown>;
}

export interface ToolExecutionResult {
  status: number;
  /** Serialized back to the model as the function_call_output. */
  data: Record<string, unknown>;
  /** Presentation hints for the UI; never sent to the model. */
  ui?: {
    kind: "preference_confirmation" | "booking_confirmation" | "payment_simulation" | "handoff";
    field?: string;
    value?: string;
    message?: string;
  };
}

export async function executeConversationTool(
  request: ToolExecutionRequest
): Promise<ToolExecutionResult> {
  const conversation = getConversation(request.conversationId);
  if (!conversation) {
    return { status: 404, data: { error: "conversation_not_found" } };
  }

  if (!isToolDispatchAllowed(request.toolId, conversation.allowedToolIds)) {
    emitTraceEvent(conversation.conversationId, {
      severity: "warning",
      category: "safety",
      event: "tool.policy_denied",
      correlationId: conversation.conversationId,
      channel: conversation.envelope.channel,
      skillId: conversation.skillId,
      skillVersion: conversation.skillVersion,
      detail: { toolId: request.toolId, allowed: false, reason: "not_in_allowlist" },
    });
    return { status: 403, data: { error: "tool_not_allowed_for_this_conversation" } };
  }

  const callCount = recordToolCall(conversation.conversationId);
  if (callCount > MAX_TOOL_CALLS_PER_CONVERSATION) {
    emitTraceEvent(conversation.conversationId, {
      severity: "warning",
      category: "safety",
      event: "tool.rate_limited",
      correlationId: conversation.conversationId,
      channel: conversation.envelope.channel,
      detail: { toolId: request.toolId, reason: "session_tool_budget_exhausted" },
    });
    return {
      status: 429,
      data: {
        error: "session_tool_budget_exhausted",
        guidance: "Tell the guest this demo session has reached its research limit and offer to continue by other means.",
      },
    };
  }

  const startedMs = Date.now();
  emitTraceEvent(conversation.conversationId, {
    severity: "info",
    category: "tools",
    event: "tool.started",
    correlationId: conversation.conversationId,
    channel: conversation.envelope.channel,
    skillId: conversation.skillId,
    skillVersion: conversation.skillVersion,
    detail: { toolId: request.toolId, toolLabel: getDisplayToolLabel(request.toolId) },
  });

  try {
    const result = await withTimeout(
      runTool(conversation, request.toolId, request.payload),
      TOOL_TIMEOUT_MS
    );

    emitTraceEvent(conversation.conversationId, {
      severity: result.status === 200 ? "info" : "warning",
      category: "tools",
      event: result.status === 200 ? "tool.completed" : "tool.failed",
      correlationId: conversation.conversationId,
      channel: conversation.envelope.channel,
      skillId: conversation.skillId,
      skillVersion: conversation.skillVersion,
      detail: {
        toolId: request.toolId,
        durationMs: Date.now() - startedMs,
        resultStatus: result.status,
      },
    });

    return result;
  } catch (error) {
    const timedOut = error instanceof ToolTimeoutError;
    emitTraceEvent(conversation.conversationId, {
      severity: "error",
      category: "errors",
      event: timedOut ? "tool.timeout" : "tool.error",
      correlationId: conversation.conversationId,
      channel: conversation.envelope.channel,
      detail: { toolId: request.toolId, durationMs: Date.now() - startedMs },
    });
    return {
      status: timedOut ? 504 : 500,
      data: {
        error: timedOut ? "tool_timeout" : "tool_failed",
        guidance:
          "Tell the guest plainly that this lookup did not come back, and offer the next safe step. Do not invent a result.",
      },
    };
  }
}

// ── Per-tool payload schemas and handlers ───────────────────────────────────

const PerplexityPayload = z.object({
  query: z.string().min(1),
  destination: z.string().nullish(),
  departure_month: z.string().nullish(),
});
const KnowledgePayload = z.object({ query: z.string().min(1) });
const ExcursionPayload = z.object({
  port: z.string().min(1),
  interests: z.string().nullish(),
  cruise_line: z.string().nullish(),
});
const ScraperPayload = z.object({
  query: z.string().min(1),
  cruise_line: z.string().nullish(),
  destination: z.string().nullish(),
});
const SocialPayload = z.object({
  cruise_line: z.string().min(1),
  ship_name: z.string().nullish(),
  destination: z.string().nullish(),
});
const TrendPayload = z.object({
  category: z.enum([
    "overall_industry",
    "dining_and_food",
    "onboard_entertainment",
    "shore_excursions",
    "value_and_pricing",
    "sustainability",
    "technology_and_connectivity",
    "health_and_wellness",
  ]),
  perspective: z
    .enum(["gen_z", "millennial", "gen_x", "boomer", "family", "solo", "luxury", "budget"])
    .nullish(),
  cruise_line: z.string().nullish(),
  timeframe: z.string().nullish(),
});
const DEFAULT_ODYSSEUS_ADULT_AGE = 40;
const ODYSSEUS_SEARCH_CACHE_SECONDS = 15 * 60;

const OdysseusPayload = z.object({
  passengers: z.number().int().positive().max(12).optional(),
  guestAges: z.array(z.number().int().positive().max(120)).max(12).optional(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  vendorId: z.number().int().positive().nullish(),
});
const PricingPayload = z.object({
  baseFare: z.number(),
  taxesFeesPortExpenses: z.number(),
  gratuities: z.number(),
  numberOfGuests: z.number().int().positive(),
  numberOfNights: z.number().int().positive(),
  clientTotalBudget: z.number(),
});
const PreferenceSavePayload = z.object({
  key: z.enum([
    "cabin",
    "ship_style",
    "entertainment",
    "dining",
    "trip_length",
    "destination",
    "budget",
    "accessibility_style",
    "other",
  ]),
  value: z.string().min(1).max(300),
});
const ShowcaseDraftPayload = z.object({
  field: z.enum(["sailing", "party_size", "cabin_category", "first_name", "trip_dates", "notes"]),
  value: z.string().min(1).max(300),
});
const BookingFieldPayload = z.object({
  field: z.enum(["first_name", "email", "phone", "party_size", "traveler_ages"]),
  value: z.string().min(1).max(300),
});
const HelpPayload = z.object({ reason: z.string().min(1).max(400) });

async function runTool(
  conversation: ConversationRecord,
  toolId: string,
  payload: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const normalizedPayload = normalizeToolPayload(toolId, payload);
  // Research tools share the existing cache and handlers.
  const cached = await getToolCache<Record<string, unknown>>(toolId, normalizedPayload);
  if (cached && isCacheableTool(toolId)) {
    return { status: 200, data: cached };
  }

  if (toolId === "perplexity_cruise_research") {
    const p = PerplexityPayload.parse(payload);
    const result = await runPerplexityCruiseResearch({
      query: p.query,
      destination: p.destination ?? null,
      departureMonth: p.departure_month ?? null,
    });
    await setToolCache(toolId, payload, result, 86_400);
    return { status: 200, data: result as unknown as Record<string, unknown> };
  }

  if (toolId === "cruise_brothers_knowledge") {
    const p = KnowledgePayload.parse(payload);
    const result = await runCruiseBrothersKnowledgeLookup({ query: p.query });
    await setToolCache(toolId, payload, result, 86_400 * 7);
    return { status: 200, data: result as unknown as Record<string, unknown> };
  }

  if (toolId === "excursion_finder") {
    const p = ExcursionPayload.parse(payload);
    const result = await runExcursionFinder({
      port: p.port,
      interests: p.interests ?? null,
      cruiseLine: p.cruise_line ?? null,
    });
    await setToolCache(toolId, payload, result, 86_400 * 7);
    return { status: 200, data: result as unknown as Record<string, unknown> };
  }

  if (toolId === "cruise_brothers_scraper") {
    const p = ScraperPayload.parse(payload);
    const result = await runCruiseBrothersScraper({
      query: p.query,
      cruiseLine: p.cruise_line ?? null,
      destination: p.destination ?? null,
    });
    await setToolCache(toolId, payload, result, 3_600 * 6);
    return { status: 200, data: result as unknown as Record<string, unknown> };
  }

  if (toolId === "social_media_insights") {
    const p = SocialPayload.parse(payload);
    const result = await runSocialMediaInsights({
      cruiseLine: p.cruise_line,
      shipName: p.ship_name ?? null,
      destination: p.destination ?? null,
    });
    await setToolCache(toolId, payload, result, 86_400 * 30);
    return { status: 200, data: result as unknown as Record<string, unknown> };
  }

  if (toolId === "cruise_trend_analysis") {
    const p = TrendPayload.parse(payload);
    const result = await runCruiseTrendAnalysis({
      perspective: (p.perspective ?? null) as TravelerPerspective | null,
      category: p.category as TrendCategory,
      cruiseLine: p.cruise_line ?? null,
      timeframe: p.timeframe ?? null,
    });
    await setToolCache(toolId, payload, result, 86_400 * 7);
    return { status: 200, data: result as unknown as Record<string, unknown> };
  }

  if (toolId === "odysseus_search") {
    const p = OdysseusPayload.parse(normalizedPayload);
    const passengers = p.passengers ?? 2;
    const guestAges =
      p.guestAges ?? Array.from({ length: passengers }, () => DEFAULT_ODYSSEUS_ADULT_AGE);
    const result = await runOdysseusSearch({
      passengers,
      guestAges,
      startDate: p.startDate ?? null,
      endDate: p.endDate ?? null,
      vendorId: p.vendorId ?? null,
    });
    const capturedAtIso = new Date().toISOString();
    const data: Record<string, unknown> = {
      ...(result as unknown as Record<string, unknown>),
      capturedAtIso,
      freshness: "Live Odysseus result; revalidate before booking because fares and availability change.",
      assumedParty:
        payload["guestAges"] === undefined
          ? `${passengers} adults, age ${DEFAULT_ODYSSEUS_ADULT_AGE} each`
          : null,
      priceBasis:
        "Starting-from fares captured live just now. Quote them as a starting point and say they are confirmed at booking.",
    };
    if (result.results.length > 0) {
      await setToolCache(
        toolId,
        normalizedPayload,
        data,
        ODYSSEUS_SEARCH_CACHE_SECONDS
      );
    }
    return {
      status: 200,
      data,
    };
  }

  if (toolId === "pricing_comparator") {
    const p = PricingPayload.parse(payload);
    const result = await runPricingComparator(p);
    return { status: 200, data: result as unknown as Record<string, unknown> };
  }

  // ── Showcase synthetic memory ────────────────────────────────────────────

  if (toolId === "showcase_preferences_read") {
    const profile = conversation.showcaseProfile;
    return {
      status: 200,
      data: {
        synthetic: true,
        preferences: profile ? profile.preferences : [],
      },
    };
  }

  if (toolId === "showcase_trip_history") {
    const profile = conversation.showcaseProfile;
    return {
      status: 200,
      data: { synthetic: true, trips: profile ? profile.trips : [] },
    };
  }

  if (toolId === "showcase_preferences_save") {
    const p = PreferenceSavePayload.parse(payload);
    const profile = conversation.showcaseProfile;
    if (profile) {
      const existing = profile.preferences.find((pref) => pref.key === p.key);
      if (existing) {
        existing.value = p.value;
        existing.origin = "session";
      } else {
        profile.preferences.push({ key: p.key, value: p.value, origin: "session" });
      }
      updateConversation(conversation.conversationId, { showcaseProfile: profile });
    }
    return {
      status: 200,
      data: {
        synthetic: true,
        saved: true,
        key: p.key,
        note: "Saved to the demo profile for this session only. Tell the traveler you have noted it.",
      },
      ui: { kind: "preference_confirmation", field: p.key, value: p.value },
    };
  }

  if (toolId === "showcase_booking_draft_prepare") {
    const p = ShowcaseDraftPayload.parse(payload);
    return {
      status: 200,
      data: {
        synthetic: true,
        recorded: true,
        field: p.field,
        note: "Recorded on the simulated draft. No reservation, cabin hold, or payment exists.",
      },
      ui: { kind: "booking_confirmation", field: p.field, value: p.value },
    };
  }

  if (toolId === "showcase_payment_handoff_simulated") {
    return {
      status: 200,
      data: {
        synthetic: true,
        handoffStatus: "simulated_ready",
        handoffToken: "demo-handoff-000000",
        note: "Tell the traveler this is a simulated secure supplier checkout: in production the guest completes payment on an approved Cruise Brothers or cruise line surface. Never request card details.",
      },
      ui: {
        kind: "payment_simulation",
        message: "Secure supplier checkout - simulated",
      },
    };
  }

  // ── Booking Assistant (authorized guest) ─────────────────────────────────

  if (toolId === "booking_field_propose") {
    const p = BookingFieldPayload.parse(payload);
    return {
      status: 200,
      data: {
        proposed: true,
        field: p.field,
        note: "A confirmation card is now on screen. The value is NOT saved until the guest confirms it. Ask them to check it.",
      },
      ui: { kind: "booking_confirmation", field: p.field, value: p.value },
    };
  }

  if (toolId === "booking_progress_read") {
    return {
      status: 200,
      data: {
        bound: Boolean(conversation.bookingDraftId),
        note: "Booking progress is rendered on screen beside you; summarize only what the context snapshot states.",
      },
    };
  }

  // ── Escalation ───────────────────────────────────────────────────────────

  if (toolId === "request_human_help") {
    const p = HelpPayload.parse(payload);
    if (conversation.mode === "showcase") {
      return {
        status: 200,
        data: {
          requested: false,
          demo: true,
          note: "This is a demo, so no live request was sent. Say so plainly and describe how the real handoff works.",
        },
        ui: { kind: "handoff", message: "Human help (demo - no request sent)" },
      };
    }
    return {
      status: 200,
      data: {
        requested: true,
        reasonRecorded: p.reason.length > 0,
        note: "The request is recorded. Tell the guest a person will follow up and stop collecting information.",
      },
      ui: { kind: "handoff", message: "Human help requested" },
    };
  }

  if (toolId === "transfer_phone_call") {
    // The telephony service performs the actual refer; on any other channel
    // this tool is not in the allowlist and never reaches here.
    return {
      status: 200,
      data: {
        transferRequested: true,
        note: "The transfer request is being placed. Do not say the transfer succeeded until the system confirms it.",
      },
      ui: { kind: "handoff", message: "Call transfer requested" },
    };
  }

  return { status: 400, data: { error: "unsupported_tool" } };
}

function normalizeToolPayload(
  toolId: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (toolId !== "odysseus_search") return payload;
  const parsed = OdysseusPayload.parse(payload);
  const passengers = parsed.passengers ?? parsed.guestAges?.length ?? 2;
  const guestAges =
    parsed.guestAges ?? Array.from({ length: passengers }, () => DEFAULT_ODYSSEUS_ADULT_AGE);
  return {
    passengers,
    guestAges,
    startDate: parsed.startDate ?? null,
    endDate: parsed.endDate ?? null,
    vendorId: parsed.vendorId ?? null,
  };
}

function isCacheableTool(toolId: string): boolean {
  return (
    toolId === "perplexity_cruise_research" ||
    toolId === "cruise_brothers_knowledge" ||
    toolId === "excursion_finder" ||
    toolId === "cruise_brothers_scraper" ||
    toolId === "social_media_insights" ||
    toolId === "cruise_trend_analysis" ||
    toolId === "odysseus_search"
  );
}

class ToolTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ToolTimeoutError("tool_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
