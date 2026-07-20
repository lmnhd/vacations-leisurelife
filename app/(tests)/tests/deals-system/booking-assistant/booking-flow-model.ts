/**
 * Mocked flow model for the Booking Assistant Interaction Flow Lab (Phase 1 of
 * BOOKING_ASSISTANT_IMPLEMENTATION_PLAN.md). Pure client-side state: no Dynamo,
 * no PII persistence beyond sessionStorage (cleared by the lab's Reset), no
 * Odysseus, no LLM. The task list mirrors the Section 6A / 7.3 dependency
 * order for the guest-side stages (1-4); everything after review is simulated
 * operator handoff.
 *
 * Per AI_POLICY.md, no regex anywhere in this module - validation uses plain
 * string/character checks only.
 */

export type MockDraftStatus =
  | "started"
  | "collecting"
  | "paused_by_guest"
  | "human_requested"
  | "review_ready"
  // Section 29 call-agent-to-finalize completion states.
  | "ready_to_call_agent"
  | "call_signal_pending"
  | "calling_now"
  | "agent_processing"
  | "booking_confirmed";

export interface MockTraveler {
  title: string;
  gender: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dob: string;
  age: string;
}

export function emptyTraveler(): MockTraveler {
  return { title: "", gender: "", firstName: "", middleName: "", lastName: "", dob: "", age: "" };
}

export interface MockDraft {
  status: MockDraftStatus;
  firstName: string;
  email: string;
  phone: string;
  travelerCount: number;
  travelers: MockTraveler[];
  citizenship: string;
  residencyState: string;
  serviceRateInterest: "" | "yes" | "no" | "not_sure";
  serviceRateTravelerIndex: string;
  serviceRateCategory: string;
  serviceRateProofReadiness: string;
  addressLine1: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  accessibility: string;
  cabinPreference: string;
  celebration: string;
  celebrationDeferred: boolean;
  insuranceInterest: string;
  accuracyAcknowledged: boolean;
  preparationAuthorized: boolean;
  /** Task ids the guest has confirmed, in confirmation order. */
  confirmedTasks: string[];
  /** Exact next-task pointer captured by Continue later. */
  resumeTaskId: string | null;
}

export function emptyDraft(): MockDraft {
  return {
    status: "started",
    firstName: "",
    email: "",
    phone: "",
    travelerCount: 0,
    travelers: [],
    citizenship: "",
    residencyState: "",
    serviceRateInterest: "",
    serviceRateTravelerIndex: "",
    serviceRateCategory: "",
    serviceRateProofReadiness: "",
    addressLine1: "",
    addressCity: "",
    addressState: "",
    addressZip: "",
    accessibility: "",
    cabinPreference: "",
    celebration: "",
    celebrationDeferred: false,
    insuranceInterest: "",
    accuracyAcknowledged: false,
    preparationAuthorized: false,
    confirmedTasks: [],
    resumeTaskId: null,
  };
}

// The mock Deal summary card. Clearly fictional data - Phase 1 forbids real
// Tier B/C PII and this deal snapshot is a stand-in, not a live manifest read.
export const MOCK_DEAL = {
  dealId: "mock-msc-summer",
  line: "MSC Cruises",
  ship: "MSC Seaview",
  title: "Last Ten Nights of Summer",
  nights: 7,
  sailDate: "August 22, 2026",
  departure: "Departs Genoa, Italy",
  itinerary: "Western Mediterranean",
  priceBasis: "From $649 per person + taxes & fees",
  capturedAt: "Price captured 2 hours ago",
} as const;

export interface TaskDef {
  id: string;
  /** Progress-group label, e.g. "Contact" or "Passenger details". */
  section: string;
  title: string;
  helper?: string;
  /** Voice simulation transcript used when the guest taps the mic. */
  voiceSample?: string;
  /** Optional tasks can be deferred with "I don't have this yet". */
  deferrable?: boolean;
}

/**
 * Deterministic task order (plan Section 7.3). Traveler identity tasks are
 * expanded from the confirmed traveler count, so the list is a function of the
 * draft - the code decides what is required, never the conversation.
 */
export function buildTaskList(draft: MockDraft): TaskDef[] {
  const tasks: TaskDef[] = [
    {
      id: "first_name",
      section: "Contact",
      title: "What should we call you?",
      helper: "Just your first name is fine.",
      voiceSample: "My name is Margaret",
    },
    {
      id: "email",
      section: "Contact",
      title: "Where should we email your saved progress?",
      helper: "We save your answers as you go and email you a secure link so you can finish anytime.",
      voiceSample: "margaret at example dot com",
    },
    {
      id: "phone",
      section: "Contact",
      title: "What's the best mobile number for you?",
      helper: "Only used for this booking. We won't call or text without asking first.",
      voiceSample: "five five five, two zero one, seven seven four four",
    },
    {
      id: "party_size",
      section: "Passenger details",
      title: "How many people are sailing?",
      helper: "This pilot covers 1 to 4 adults in one cabin.",
    },
  ];

  const count = draft.travelerCount;
  if (count > 0) {
    tasks.push({
      id: "ages",
      section: "Passenger details",
      title: count === 1 ? "How old will you be on sailing day?" : "How old will each traveler be on sailing day?",
      helper: "Cruise lines price by age at sailing, so we ask now to avoid surprises later.",
    });
    for (let i = 0; i < count; i += 1) {
      tasks.push({
        id: `legal_identity_${i}`,
        section: "Passenger details",
        title: i === 0 ? "Your legal name, exactly as it appears on your ID" : `Traveler ${i + 1}'s legal name, exactly as on their ID`,
        helper: "The cruise line requires the legal name, birth date, and the title and gender values on their form.",
      });
    }
  }

  tasks.push(
    {
      id: "citizenship_residency",
      section: "Passenger details",
      title: "Citizenship and home state",
      helper: "The cruise line uses residency for pricing and required documents.",
    },
    {
      id: "savings_eligibility",
      section: "Savings check",
      title: "Could anyone qualify for a military or service-related cruise rate?",
      helper: "We check age-based rates automatically. Service rules vary by cruise line, so tell us if your agent should check one too.",
    },
    {
      id: "address",
      section: "Passenger details",
      title: "Primary traveler's mailing address",
    },
    {
      id: "accessibility",
      section: "Preferences",
      title: "Any accessibility or special requests?",
      helper: "Mobility, dietary, medical equipment - anything that helps us set the cabin up right.",
    },
    {
      id: "cabin_preference",
      section: "Preferences",
      title: "What kind of cabin sounds right?",
      helper: "This is a preference, not a final selection. Exact cabins and prices are confirmed with you before anything is charged.",
    },
    {
      id: "celebration",
      section: "Preferences",
      title: "Celebrating anything on board?",
      helper: "Optional - birthdays and anniversaries can come with a little extra.",
      deferrable: true,
    },
    {
      id: "insurance_interest",
      section: "Preferences",
      title: "Want to hear about travel insurance?",
      helper: "No decision needed now. Your booking agent reviews exact options and prices with you.",
    },
    {
      id: "review",
      section: "Review",
      title: "Review everything we have",
    }
  );

  return tasks;
}

/** First task in list order the guest has not confirmed yet. */
export function nextTaskId(draft: MockDraft): string {
  const tasks = buildTaskList(draft);
  for (const task of tasks) {
    if (!draft.confirmedTasks.includes(task.id)) return task.id;
  }
  return "review";
}

// --- Validation (string checks only; no regex per AI_POLICY.md) -------------

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 5 || trimmed.includes(" ")) return false;
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return false;
  const domain = trimmed.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

export function digitCount(value: string): number {
  let count = 0;
  for (const ch of value) {
    if (ch >= "0" && ch <= "9") count += 1;
  }
  return count;
}

export function isValidPhone(value: string): boolean {
  const digits = digitCount(value);
  return digits >= 10 && digits <= 15;
}

export function isValidDob(value: string): boolean {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

export function isValidAge(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 18 && n <= 110;
}

/** MSC-specific Phase 1 mock. Production derives age from DOB and uses the versioned supplier rule registry. */
export function mockMscSeniorCandidate(draft: MockDraft): boolean {
  if (draft.travelerCount < 1 || draft.travelers.length < draft.travelerCount) return false;
  return draft.travelers.slice(0, draft.travelerCount).every((traveler) => Number(traveler.age) >= 65);
}

export function serviceRateSummary(draft: MockDraft): string {
  if (draft.serviceRateInterest === "no") return "No military/service claim";
  if (draft.serviceRateInterest === "not_sure") return "Agent should check military/service eligibility";
  if (draft.serviceRateInterest !== "yes") return "Not answered";
  const travelerIndex = Number(draft.serviceRateTravelerIndex);
  const traveler = draft.travelers[travelerIndex];
  const travelerLabel = traveler?.firstName || `Traveler ${travelerIndex + 1}`;
  return `${travelerLabel}: ${draft.serviceRateCategory || "service-related claim"} - verification needed`;
}

// --- Mock journal ------------------------------------------------------------

/** Event names follow the plan's Section 20.2 registry so the lab exercises the taxonomy from day one. */
export interface MockJournalEvent {
  seq: number;
  atIso: string;
  actor: "guest" | "assistant" | "system" | "operator";
  eventType: string;
  detail: string;
  taskId?: string;
}

export const SIDE_QUESTIONS: Array<{ q: string; a: string }> = [
  {
    q: "Is my price locked in?",
    a: "Not yet - your exact price and cabin are confirmed with you before anything is charged. The price shown is the latest we captured.",
  },
  {
    q: "Do I need my passport?",
    a: "For this sailing, a passport is the recommended document. Your booking agent will confirm exactly what's required before you pay.",
  },
  {
    q: "Can I talk to a person?",
    a: "Absolutely. Once we have your phone number, 'Get help now' connects you to a real agent - and everything you've entered goes with you.",
  },
  {
    q: "What's included in the fare?",
    a: "Your cabin, meals in the main dining venues, and standard onboard entertainment. Drink packages, excursions, and specialty dining are optional extras.",
  },
  {
    q: "Do you check senior or military discounts?",
    a: "Yes. We check age-based rates automatically and ask one optional military/service question. Your agent compares any live qualifying rate with the best regular promotion before you choose.",
  },
];

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY",
] as const;
