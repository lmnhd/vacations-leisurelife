/**
 * ConversationContextProvider implementations.
 *
 * A provider loads the COMPLETE authorized source records on the server and
 * then projects a bounded, guest-safe snapshot. The projection is where the
 * safety boundary lives: operator notes, credentials, commissions, ad
 * controls, Tier B/C values, payment data, and unrelated records never enter
 * the returned snapshot.
 */

import { randomUUID } from "node:crypto";

import { getPublicDealPageById } from "@/lib/cb/deals-system/public-deals";
import { getPilotFlowDefinition } from "@/lib/booking-assistant/flow-definition";
import type { BookingDraft } from "@/lib/booking-assistant/types";

import type { ConversationLaunchEnvelope } from "./launch-envelope";
import {
  STANDARD_EXCLUDED_CATEGORIES,
  type ConversationContextSnapshot,
  type SnapshotSection,
} from "./context-snapshot";
import { createShowcaseProfile, type ShowcaseProfile } from "./showcase-fixtures";

export interface ContextBuildInput {
  envelope: ConversationLaunchEnvelope;
  /** Previous snapshot version, when refreshing an existing conversation. */
  previousVersion?: number;
  /** Authorized draft, already loaded and authorization-checked by the caller. */
  bookingDraft?: BookingDraft | null;
  /** Session-captured synthetic preferences for the showcase. */
  showcaseProfile?: ShowcaseProfile;
}

export async function buildContextSnapshot(
  input: ContextBuildInput
): Promise<ConversationContextSnapshot> {
  const version = (input.previousVersion ?? 0) + 1;

  if (input.envelope.mode === "deal_booking") {
    return buildDealBookingSnapshot(input, version);
  }
  if (input.envelope.mode === "campaign_landing") {
    return buildCampaignLandingSnapshot(input, version);
  }
  return buildShowcaseSnapshot(input, version);
}

// ── Showcase ────────────────────────────────────────────────────────────────

function buildShowcaseSnapshot(
  input: ContextBuildInput,
  version: number
): ConversationContextSnapshot {
  const profile = input.showcaseProfile ?? createShowcaseProfile();

  const sections: SnapshotSection[] = [
    {
      key: "demo_disclosure",
      priority: 1,
      lines: [
        "This is a public demonstration. The traveler profile, trip history, and any booking draft are synthetic.",
        "No reservation, cabin hold, or payment can be created in this mode.",
      ],
    },
    {
      key: "synthetic_traveler",
      priority: 2,
      lines: [
        `Name: ${profile.displayName}`,
        `Home port: ${profile.homePort}`,
        `Party: ${profile.partySummary}`,
      ],
    },
    {
      key: "synthetic_preferences",
      priority: 2,
      lines: profile.preferences.map((pref) => `- ${pref.key}: ${pref.value}`),
    },
    {
      key: "synthetic_trip_history",
      priority: 3,
      lines: profile.trips.map(
        (trip) =>
          `- ${trip.sailedLabel}: ${trip.nights} nights on ${trip.shipName} (${trip.cruiseLine}), ${trip.destination}. ${trip.note}`
      ),
    },
  ];

  return {
    snapshotId: randomUUID(),
    version,
    mode: "showcase",
    subjectType: "synthetic_showcase",
    builtAtIso: new Date().toISOString(),
    sections,
    provenance: [{ source: "synthetic_fixture", recordId: "showcase_profile_v1" }],
    freshness: [
      {
        subject: "live_search_results",
        label: "Search and pricing tools return live or cached agency data; always state when a figure was captured.",
      },
    ],
    evidenceGaps: [
      "No authenticated guest record exists in this mode.",
      "Cabin-level availability is not reserved or held by anything in this demo.",
    ],
    excludedCategories: STANDARD_EXCLUDED_CATEGORIES,
    renderedChars: 0,
  };
}

// ── Deal booking ────────────────────────────────────────────────────────────

async function buildDealBookingSnapshot(
  input: ContextBuildInput,
  version: number
): Promise<ConversationContextSnapshot> {
  const dealId = input.envelope.subjectRefs.dealId ?? "";
  const deal = await getPublicDealPageById(dealId);
  const draft = input.bookingDraft ?? null;
  const flow = getPilotFlowDefinition();

  const sections: SnapshotSection[] = [];
  const provenance: ConversationContextSnapshot["provenance"] = [];
  const freshness: ConversationContextSnapshot["freshness"] = [];
  const evidenceGaps: string[] = [];

  if (deal) {
    provenance.push({ source: "public_deal_page", recordId: deal.id });
    sections.push({
      key: "deal_identity",
      priority: 1,
      lines: [
        `Deal: ${deal.title}`,
        `Ship: ${deal.facts.shipName} (${deal.facts.cruiseLine})`,
        `Destination: ${deal.facts.destination}`,
        `Length: ${deal.facts.nights} nights`,
        `Sailing: ${deal.facts.sailDateLabel}`,
        ...(deal.facts.departurePort ? [`Departure port: ${deal.facts.departurePort}`] : []),
      ],
    });

    if (deal.facts.priceFromLabel) {
      sections.push({
        key: "price_basis",
        priority: 2,
        lines: [
          `Advertised starting price: ${deal.facts.priceFromLabel}`,
          "This is a starting-from figure for the lowest available category, per person, and is re-verified live before any booking is completed.",
        ],
      });
      freshness.push({
        subject: "price_basis",
        label: "Published Deal price basis; live pricing is confirmed at completion.",
      });
    } else {
      evidenceGaps.push("No published starting price for this Deal; do not quote a fare.");
    }

    if (deal.offerLines.length > 0) {
      sections.push({
        key: "approved_offer_terms",
        priority: 2,
        lines: deal.offerLines.map((line) => `- ${line}`),
      });
    }
    if (deal.highlights.length > 0) {
      sections.push({
        key: "approved_highlights",
        priority: 3,
        lines: deal.highlights.slice(0, 6).map((line) => `- ${line}`),
      });
    }
    if (deal.whyThisTrip.length > 0) {
      sections.push({
        key: "positioning",
        priority: 4,
        lines: deal.whyThisTrip.slice(0, 4).map((line) => `- ${line}`),
      });
    }
  } else {
    evidenceGaps.push(
      "The authoritative Deal record could not be loaded; do not state Deal facts, and offer human help."
    );
  }

  if (draft) {
    provenance.push({
      source: "booking_draft",
      recordId: draft.metadata.bookingDraftId,
      version: String(draft.metadata.version),
    });

    const activeTaskId = draft.metadata.nextTaskId ?? flow.tasks[0]?.taskId ?? "first_name";
    const activeTask = flow.tasks.find((task) => task.taskId === activeTaskId);

    sections.push({
      key: "booking_progress",
      priority: 1,
      lines: [
        `Active task: ${activeTask ? activeTask.title : activeTaskId} (id: ${activeTaskId})`,
        `Draft status: ${draft.metadata.status}`,
        `Flow version: ${flow.version}, field catalog version: ${flow.fieldCatalogVersion}`,
      ],
    });

    // Only Tier A confirmed values are projected, and only as presence
    // statements plus the guest's chosen first name. Nothing else about the
    // guest enters model context.
    const confirmedTierA: string[] = [];
    if (draft.contact.firstName) confirmedTierA.push(`First name: ${draft.contact.firstName}`);
    if (draft.contact.email) confirmedTierA.push("Email: on file (do not read it aloud)");
    if (draft.contact.phoneE164) confirmedTierA.push("Mobile number: on file (do not read it aloud)");
    if (draft.travelers.length > 0) {
      confirmedTierA.push(`Party size: ${draft.travelers.length}`);
    }
    if (confirmedTierA.length > 0) {
      sections.push({
        key: "confirmed_tier_a",
        priority: 2,
        lines: confirmedTierA,
      });
    }
  } else {
    evidenceGaps.push(
      "No booking draft is bound to this conversation yet; the first confirmed answer creates it."
    );
  }

  sections.push({
    key: "task_boundaries",
    priority: 1,
    lines: [
      "You may propose Tier A values only (first name, email, phone, guest count, broad ages), and only the guest's confirmation saves them.",
      "Legal names, dates of birth, addresses, citizenship, accessibility and medical details, and documents belong to the secure form steps.",
      "Payment never happens in this conversation; it happens on the official supplier surface.",
    ],
  });

  return {
    snapshotId: randomUUID(),
    version,
    mode: "deal_booking",
    subjectType: "deal_booking",
    builtAtIso: new Date().toISOString(),
    sections,
    provenance,
    freshness,
    evidenceGaps,
    excludedCategories: STANDARD_EXCLUDED_CATEGORIES,
    renderedChars: 0,
  };
}

// ── Campaign landing ────────────────────────────────────────────────────────

async function buildCampaignLandingSnapshot(
  input: ContextBuildInput,
  version: number
): Promise<ConversationContextSnapshot> {
  const campaignSlug = input.envelope.subjectRefs.campaignSlug ?? "";

  return {
    snapshotId: randomUUID(),
    version,
    mode: "campaign_landing",
    subjectType: "campaign_landing",
    builtAtIso: new Date().toISOString(),
    sections: [
      {
        key: "campaign_identity",
        priority: 1,
        lines: [`Campaign: ${campaignSlug}`],
      },
      {
        key: "waitlist_mechanics",
        priority: 1,
        lines: [
          "Joining the waitlist is free and takes no payment and no commitment.",
          "The group activates only when enough travelers signal interest; guests are told before anything is booked.",
        ],
      },
    ],
    provenance: [{ source: "campaign_record", recordId: campaignSlug }],
    freshness: [],
    evidenceGaps: [
      "Campaign detail projection is provided by the campaign route; state uncertainty rather than guessing specifics.",
    ],
    excludedCategories: STANDARD_EXCLUDED_CATEGORIES,
    renderedChars: 0,
  };
}
