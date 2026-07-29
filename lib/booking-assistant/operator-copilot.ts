import { z } from "zod";

import {
  modelForTask,
  runToolAgent,
  type ToolAgentSource,
} from "@/lib/ai/llm-gateway";
import { runCruiseBrothersKnowledgeLookup } from "@/lib/chat/tools/cruise-brothers-knowledge";
import { runOdysseusSearch } from "@/lib/chat/tools/odysseus-search";
import { runPricingComparator } from "@/lib/chat/tools/pricing-comparator";

import { inspectCurrentBookingLink } from "./current-booking-link-research";
import { getDraft, type DraftStoreClients } from "./store";
import type { OperatorServiceConfig } from "./operator-service";
import type { BookingDraft } from "./types";

const KnowledgeArgumentsSchema = z.object({
  query: z.string().min(2).max(500),
});

const CruiseSearchArgumentsSchema = z.object({
  vendorId: z.number().int().positive().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  passengers: z.number().int().min(1).max(12),
  guestAges: z.array(z.number().int().min(0).max(120)).max(12),
});

const PricingArgumentsSchema = z.object({
  baseFare: z.number().nonnegative(),
  taxesFeesPortExpenses: z.number().nonnegative(),
  gratuities: z.number().nonnegative(),
  numberOfGuests: z.number().int().positive(),
  numberOfNights: z.number().int().positive(),
  clientTotalBudget: z.number().nonnegative(),
});

export interface OperatorCopilotInput {
  question: string;
  draftId?: string;
  history?: Array<{
    role: "operator" | "assistant";
    content: string;
  }>;
}

export interface OperatorCopilotResult {
  answer: string;
  model: string;
  sources: ToolAgentSource[];
  toolsUsed: string[];
  sailingContext?: {
    dealId: string;
    cruiseLine: string;
    ship: string;
    sailingDateIso: string;
    nights: number;
    itineraryLabel: string;
  };
}

export function buildOperatorCopilotContext(draft: BookingDraft): Record<string, unknown> {
  const travelers = draft.travelers.map((traveler) => ({
    classification: traveler.classification,
    ageAtSailing: traveler.ageAtSailing,
    nationality: traveler.nationality,
    residencyCountry: traveler.residencyCountry,
    residencyStateProvince: traveler.residencyStateProvince,
    rateQualifications: traveler.rateQualificationClaims.map((claim) => ({
      type: claim.type,
      broadCategory: claim.broadCategory,
      claimStatus: claim.claimStatus,
    })),
  }));

  const cabins = draft.cabins.map((cabin) => ({
    categoryPreference: cabin.categoryPreference,
    farePreference: cabin.farePreference,
    cabinPreference: cabin.cabinPreference,
    acceptableTradeoffs: cabin.acceptableTradeoffs,
    selectedCategory: cabin.selectedCategory,
    selectedRate: cabin.selectedRate,
    ordinaryRateBaseline: cabin.ordinaryRateBaseline,
    savingsValueSummary: cabin.savingsValueSummary,
  }));

  return {
    draftStatus: draft.metadata.status,
    deal: {
      dealId: draft.dealSnapshot.dealId,
      packageId: draft.dealSnapshot.packageId,
      cruiseLine: draft.dealSnapshot.cruiseLine,
      ship: draft.dealSnapshot.ship,
      sailingDateIso: draft.dealSnapshot.sailingDateIso,
      nights: draft.dealSnapshot.nights,
      departurePort: draft.dealSnapshot.departurePort,
      itineraryLabel: draft.dealSnapshot.itineraryLabel,
      dealAngle: draft.dealSnapshot.dealAngle,
      advertisedPrice: draft.dealSnapshot.priceDisplay,
      currency: draft.dealSnapshot.currency,
      taxFeeBasis: draft.dealSnapshot.taxFeeBasis,
      priceCapturedAtIso: draft.dealSnapshot.priceCapturedAtIso,
      observedTotal: draft.dealSnapshot.observedTotal,
      paymentSchedule: draft.dealSnapshot.paymentSchedule,
    },
    party: {
      travelerCount: travelers.length,
      travelers,
      cabins,
    },
    decisions: {
      travelInsuranceDecision: draft.decisions.travelInsuranceDecision,
      servicesDecisionSet: draft.decisions.servicesDecisionSet,
      addOnDecisionSet: draft.decisions.addOnDecisionSet,
    },
  };
}

const SYSTEM_PROMPT = [
  "You are the Leisure Life Booking Call Copilot for a human cruise agent.",
  "Give a fast, direct answer the operator can say to the caller, followed by concise supporting detail.",
  "You may use the redacted current-sailing context, Cruise Brothers internal knowledge, live Odysseus cruise search, cost calculation, and web search.",
  "For questions about the selected cruise itself — itinerary, cabins, displayed price, inclusions, availability — first inspect the current supplier booking page when that tool is available because it is generally the freshest source for that exact sailing.",
  "The supplier booking page contains cruise details only. It never contains flights, airports, airline schedules, insurance products, or visa rules. Do not spend a tool call on it for those questions; use web search instead.",
  "Use other authoritative sources when the booking page does not contain the answer or needs corroboration.",
  "For speed during a live call, stop after one source tool when it directly answers the question. Use a second source only when the first source is incomplete or conflicting.",
  "For current policies, insurance, state-specific rules, deposits, refunds, flight details, prices, schedules, or availability, use an appropriate tool and cite the source. Never guess.",
  // The operator's complaint that prompted these rules: the copilot was told
  // "never guess", read that as "never reason", and returned "we can't
  // determine that yet" for questions its own context could answer.
  "Use the redacted context proactively. It is real caller data, not decoration. Traveler residency, party size, ages, departure port, and sailing dates are known facts — apply them without asking the operator to repeat them.",
  "Answer the question that was actually asked, using the context to fill in what the caller did not state. If a caller in California asks about connections to a Miami departure, research the realistic routings from that caller's likely airports rather than replying that no airport was specified.",
  "\"Never guess\" forbids inventing specifics such as prices, policy terms, or schedules. It does not forbid reasoning. Typical routings, common connection counts, and general planning guidance are useful and expected — give them, labelled as general guidance rather than a confirmed booking.",
  "Never answer only that information is missing. Give the best answer the context and your tools support, then state precisely what must be confirmed and with whom.",
  "Treat internal cache material as operational guidance that may be stale; say when the source date or authority is unclear.",
  "Distinguish confirmed facts from estimates and general guidance. State what must be verified with the cruise line, insurer, airline, or supplier.",
  "Never expose or request names, email addresses, phone numbers, birth dates, street addresses, loyalty numbers, payment data, or other sensitive identifiers.",
  "You may research and compare. You may not place a hold, create or alter a reservation, submit payment, cancel, or complete a booking.",
  "If an action would cross that boundary, explain the operator approval and supplier verification required.",
  "Use plain language and short sections. Do not mention internal draft IDs.",
].join(" ");

export async function answerOperatorCopilotQuestion(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: OperatorCopilotInput
): Promise<OperatorCopilotResult> {
  const question = input.question.trim();
  if (question.length < 2 || question.length > 2_000) {
    throw new Error("Question must be between 2 and 2,000 characters.");
  }

  const draft = input.draftId
    ? await getDraft(clients, config, input.draftId)
    : null;
  if (input.draftId && !draft) {
    throw new Error("The selected booking draft was not found.");
  }

  const context = draft ? buildOperatorCopilotContext(draft) : null;
  const internalSources: ToolAgentSource[] = [];
  const recentHistory = (input.history ?? []).slice(-8);

  const result = await runToolAgent(
    modelForTask("operator_copilot"),
    [
      recentHistory.length > 0
        ? `\nRecent call-copilot conversation:\n${recentHistory
            .map((message) => `${message.role}: ${message.content}`)
            .join("\n")}`
        : "",
      `Operator question:\n${question}`,
      context
        ? `\nRedacted current-sailing context:\n${JSON.stringify(context, null, 2)}`
        : "\nNo booking draft is currently selected. Ask for only the non-sensitive trip facts needed to answer.",
      `\nCurrent date: ${new Date().toISOString().slice(0, 10)}`,
    ].join("\n"),
    {
      systemPrompt: SYSTEM_PROMPT,
      enableWebSearch: true,
      // "low"/2 rounds was tuned for live-call speed, but it left no recovery
      // when the first tool call was the wrong one, and suppressed the
      // context-to-answer inference the operator actually wants (e.g. caller
      // residency + departure port -> realistic flight routings).
      reasoningEffort: "medium",
      maxOutputTokens: 1_800,
      maxToolRounds: 3,
      functions: [
        ...(draft?.dealSnapshot.sourceBookingUrl
          ? [{
              name: "inspect_current_booking_link",
              description: "Inspect and sanitize the selected cruise's current supplier booking page. Use this first for questions about this exact sailing, including current itinerary, displayed pricing, cabin categories, inclusions, and availability-related page facts.",
              parameters: {
                type: "object",
                properties: {},
                required: [],
                additionalProperties: false,
              },
            }]
          : []),
        {
          name: "search_cruise_brothers_knowledge",
          description: "Search the locally ingested Cruise Brothers/CB Agent Tools knowledge cache for agency procedures, vendor contacts, commissions, and promotions.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Specific internal agency knowledge question." },
            },
            required: ["query"],
            additionalProperties: false,
          },
        },
        {
          name: "search_live_cruises",
          description: "Search live Odysseus cruise inventory for replacement or comparison sailings. Search only; never holds or books.",
          parameters: {
            type: "object",
            properties: {
              vendorId: { type: ["integer", "null"], description: "Cruise line vendor ID, or null." },
              startDate: { type: ["string", "null"], description: "Start date in MM/DD/YYYY, or null." },
              endDate: { type: ["string", "null"], description: "End date in MM/DD/YYYY, or null." },
              passengers: { type: "integer", minimum: 1, maximum: 12 },
              guestAges: {
                type: "array",
                items: { type: "integer", minimum: 0, maximum: 120 },
                maxItems: 12,
              },
            },
            required: ["vendorId", "startDate", "endDate", "passengers", "guestAges"],
            additionalProperties: false,
          },
        },
        {
          name: "calculate_cruise_cost",
          description: "Calculate total, per-person, per-night, and budget variance from amounts already known to the operator.",
          parameters: {
            type: "object",
            properties: {
              baseFare: { type: "number", minimum: 0 },
              taxesFeesPortExpenses: { type: "number", minimum: 0 },
              gratuities: { type: "number", minimum: 0 },
              numberOfGuests: { type: "integer", minimum: 1 },
              numberOfNights: { type: "integer", minimum: 1 },
              clientTotalBudget: { type: "number", minimum: 0 },
            },
            required: [
              "baseFare",
              "taxesFeesPortExpenses",
              "gratuities",
              "numberOfGuests",
              "numberOfNights",
              "clientTotalBudget",
            ],
            additionalProperties: false,
          },
        },
      ],
      executeFunction: async (name, argumentsValue) => {
        if (name === "inspect_current_booking_link") {
          if (!draft) throw new Error("No current booking is selected.");
          const bookingPage = await inspectCurrentBookingLink(draft);
          internalSources.push({
            title: bookingPage.pageTitle,
            url: bookingPage.sourceUrl,
          });
          return {
            pageTitle: bookingPage.pageTitle,
            pageExcerpt: bookingPage.pageExcerpt,
            checkedAtIso: bookingPage.checkedAtIso,
            sourceLabel: bookingPage.sourceLabel,
            sourceUrl: bookingPage.sourceUrl,
          };
        }
        if (name === "search_cruise_brothers_knowledge") {
          const args = KnowledgeArgumentsSchema.parse(argumentsValue);
          const knowledge = await runCruiseBrothersKnowledgeLookup(args);
          for (const match of knowledge.matches) {
            if (match.url) {
              internalSources.push({ title: match.title, url: match.url });
            }
          }
          return knowledge;
        }
        if (name === "search_live_cruises") {
          return runOdysseusSearch(CruiseSearchArgumentsSchema.parse(argumentsValue));
        }
        if (name === "calculate_cruise_cost") {
          return runPricingComparator(PricingArgumentsSchema.parse(argumentsValue));
        }
        throw new Error(`Unknown operator copilot tool: ${name}`);
      },
    }
  );

  const sourceMap = new Map<string, ToolAgentSource>();
  for (const source of [...result.sources, ...internalSources]) {
    if (source.url.startsWith("https://") || source.url.startsWith("http://")) {
      sourceMap.set(source.url, source);
    }
  }

  return {
    answer: result.content,
    model: result.model,
    sources: Array.from(sourceMap.values()),
    toolsUsed: Array.from(new Set(result.executions.map((execution) => execution.name))),
    sailingContext: draft
      ? {
          dealId: draft.dealSnapshot.dealId,
          cruiseLine: draft.dealSnapshot.cruiseLine,
          ship: draft.dealSnapshot.ship,
          sailingDateIso: draft.dealSnapshot.sailingDateIso,
          nights: draft.dealSnapshot.nights,
          itineraryLabel: draft.dealSnapshot.itineraryLabel,
        }
      : undefined,
  };
}
