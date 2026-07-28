"use client";

/**
 * The guest-facing Booking Assistant experience - the component that graduates
 * to the production /deals/[id]/book route. It owns the entire guest UI and
 * flow state machine and renders edge-to-edge in whatever container it is
 * given; it knows nothing about the lab chrome that wraps it during Phase 1.
 *
 * What changes between this prototype and production is the data layer only:
 * sessionStorage persistence becomes the server draft API, the MOCK_DEAL
 * snapshot becomes the real Deal manifest read, and the mock journal emit
 * becomes the server-side Booking Activity Journal write. The interaction
 * surface - tasks, sheets, Continue later, review, handoff - is the contract
 * being approved here and should not change shape on the way to production.
 *
 * Lab hooks: `onDebug` streams a read-only snapshot (draft + journal + screen)
 * to the wrapper's operator-preview panels, and the imperative handle exposes
 * reset / simulated email resume for lab controls. Both are optional and
 * unused in production.
 *
 * Per AI_POLICY.md: no regex anywhere in this file.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CALL_OUTCOME_LABELS,
  COMPLETION_MODE,
  MOCK_AGENT_PHONE,
  MOCK_DEAL,
  SIDE_QUESTIONS,
  US_STATES,
  buildTaskList,
  digitCount,
  emptyDraft,
  emptyTraveler,
  fallbackCallKey,
  isValidAge,
  isValidDob,
  isValidEmail,
  isValidPhone,
  mockMscSeniorCandidate,
  nextTaskId,
  rateQualificationClaimsForTraveler,
  serviceRateSummary,
  type CallOutcome,
  type CallSignal,
  type CallerIdState,
  type MockDraft,
  type MockJournalEvent,
  type TaskDef,
} from "./booking-flow-model";
import {
  saveDraft as apiSaveDraft,
  signalCallIntent as apiSignalCallIntent,
  requestBookingCallback as apiRequestBookingCallback,
  requestHumanHelp as apiRequestHumanHelp,
  chooseNoAgentsTryLater as apiChooseNoAgentsTryLater,
  cancelCallIntentSignal as apiCancelCallIntentSignal,
  markReviewReady as apiMarkReviewReady,
  confirmDraftField as apiConfirmDraftField,
  continueDraftLater as apiContinueDraftLater,
  resumeCurrentDraft as apiResumeCurrentDraft,
  resumeDraft as apiResumeDraft,
  type GuestSaveResponse,
  type GuestTravelerPayload,
  type GuestCabinPayload,
} from "./guest-api-client";
import { postBookingContactCaptured } from "@/components/cb/deal-analytics";
import { askBookingQuestion } from "./guest-api-client";

const STORAGE_KEY = "lll-booking-assistant-lab-v1";

// Statuses a guest can safely resume into the intake/finalize flow. Anything
// else — terminal, cancelled, or agent-side (claimed/processing/calling/etc.) —
// would either dead-end the guest (e.g. "Invalid status transition:
// agent_processing → review_ready") or silently continue a booking the guest no
// longer owns, so we start this deal fresh instead of hydrating it.
const GUEST_RESUMABLE_STATUSES: readonly string[] = [
  "started",
  "collecting",
  "paused_by_guest",
  "needs_guest",
  "review_ready",
  "ready_to_call_agent",
];

// Coarse "is this a mobile OS" check on the UA string, done with plain substring
// matching (no regex, per this file's policy). Only a fallback: the UA-Client-
// Hints `mobile` flag is preferred where available. Lowercased once so the
// tokens can be simple lowercase includes.
const MOBILE_UA_TOKENS = [
  "android",
  "iphone",
  "ipad",
  "ipod",
  "iemobile",
  "blackberry",
  "windows phone",
] as const;

function userAgentLooksMobile(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return MOBILE_UA_TOKENS.some((token) => ua.includes(token));
}

export interface BookingAssistantDealContext {
  dealId: string;
  packageId: string;
  siid: string;
  line: string;
  ship: string;
  title: string;
  nights: number;
  sailDateIso: string;
  sailDateLabel: string;
  departure: string;
  itinerary: string;
  priceBasis: string;
  sourceBookingUrl: string;
  /**
   * Operator-selected hero image for this campaign, laid very faintly behind the
   * whole flow so a returning guest is reminded which trip this is. Optional:
   * legacy deals and the prototype have none, and the flow renders plain CREAM.
   */
  heroImageUrl?: string;
}

const DEFAULT_DEAL_CONTEXT: BookingAssistantDealContext = {
  dealId: MOCK_DEAL.dealId,
  packageId: "pkg-mock-001",
  siid: "SI-MOCK-001",
  line: MOCK_DEAL.line,
  ship: MOCK_DEAL.ship,
  title: MOCK_DEAL.title,
  nights: MOCK_DEAL.nights,
  sailDateIso: "2026-08-22",
  sailDateLabel: MOCK_DEAL.sailDate,
  departure: MOCK_DEAL.departure,
  itinerary: MOCK_DEAL.itinerary,
  priceBasis: MOCK_DEAL.priceBasis,
  sourceBookingUrl: "https://example.com/deal/mock-msc-summer",
};

// Public deal palette (matches components/cb/deal-cta-actions.tsx).
export const NAVY = "#0F3042";
export const CREAM = "#F5EFE6";
const MUTED = "#5B6873";
const BORDER = "#E8E1D5";
const GOLD = "#8C6A3C";

export type Screen = "landing" | "task" | "paused" | "help" | "call_finalize";

type Sheet = "none" | "options" | "question" | "progress" | "privacy" | "pause_confirm";

interface WorkingState {
  [key: string]: string;
}

interface PersistedLab {
  draft: MockDraft;
  currentTaskId: string;
  journal: MockJournalEvent[];
  seq: number;
  screen: Screen;
  voiceMode: boolean;
  callSignal: CallSignal | null;
  serverDraftId: string | null;
  serverDraftVersion: number;
  serverFallbackKey: string | null;
}

function buildTravelerPayloads(draft: MockDraft): GuestTravelerPayload[] {
  return draft.travelers.slice(0, draft.travelerCount).map((t, i) => ({
    travelerId: `traveler-${i + 1}`,
    isPrimary: i === 0,
    classification: "adult" as const,
    title: t.title || undefined,
    supplierGender: t.gender || undefined,
    legalFirstName: t.firstName || undefined,
    legalMiddleName: t.middleName || undefined,
    legalLastName: t.lastName || undefined,
    dateOfBirth: t.dob || undefined,
    ageAtSailing: t.age ? Number(t.age) : undefined,
    nationality: draft.citizenship || undefined,
    residencyCountry: "US",
    residencyStateProvince: draft.residencyState || undefined,
    addressLine1: draft.addressLine1 || undefined,
    addressCity: draft.addressCity || undefined,
    addressState: draft.addressState || undefined,
    addressPostalCode: draft.addressZip || undefined,
    addressCountry: "US",
    accessibilityNeeds: i === 0 ? (draft.accessibility || undefined) : undefined,
    rateQualificationClaims: rateQualificationClaimsForTraveler(draft, i),
    fieldStatuses: {},
  }));
}

function buildCabinPayload(draft: MockDraft): GuestCabinPayload {
  const travelerIds = draft.travelers.slice(0, draft.travelerCount).map((_, i) => `traveler-${i + 1}`);
  return {
    cabinId: "cabin-1",
    assignedTravelerIds: travelerIds,
    categoryPreference: draft.cabinPreference || undefined,
    accessibilityRequirement: draft.accessibility || undefined,
    qualifyingTravelerIds: travelerIds,
    rateCandidates: [],
  };
}

/** Read-only view of flow state streamed to the lab's observer panels. */
export interface BookingFlowSnapshot {
  draft: MockDraft;
  journal: MockJournalEvent[];
  screen: Screen;
  tasks: TaskDef[];
  completionPct: number;
  /** The live call-intent signal, if any (Section 29 operator handoff). */
  callSignal: CallSignal | null;
  /** Stable fallback key for the current draft (redacted from event payloads). */
  fallbackKey: string;
}

export interface BookingFlowHandle {
  reset: () => void;
  /** Only meaningful while paused: replays the email token-exchange resume. */
  simulateEmailResume: () => void;
  /** Operator: pin + acknowledge the pending call attempt (Section 29.1.7). */
  operatorAcknowledgeSignal: () => void;
  /** Operator: exact fallback-key lookup with privacy-safe journal events. */
  operatorLookupFallbackKey: (candidate: string) => boolean;
  /** Operator: record how the incoming caller ID compared (never auth). */
  operatorSetCallerId: (state: CallerIdState) => void;
  /** Operator: mark caller verified; gates full-packet reveal (29.2.7). */
  operatorRecordVerification: () => void;
  /** Operator: begin the manual processing checklist (29.2.8). */
  operatorStartProcessing: () => void;
  /** Operator: record a call outcome; `confirmed` runs reconciliation. */
  operatorRecordOutcome: (outcome: CallOutcome) => void;
  /** Operator: expire an unacknowledged/stale signal (29.1.9 / 29.2.4). */
  operatorExpireSignal: () => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function reminderDateLabel(): string {
  const date = new Date(Date.now() + 3 * 86_400_000);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** Initialize the working inputs for a task from already-confirmed draft data. */
function workingForTask(taskId: string, draft: MockDraft): WorkingState {
  if (taskId === "first_name") return { firstName: draft.firstName };
  if (taskId === "email") return { email: draft.email };
  if (taskId === "phone") return { phone: draft.phone };
  if (taskId === "party_size") return { travelerCount: draft.travelerCount ? String(draft.travelerCount) : "" };
  if (taskId === "ages") {
    const out: WorkingState = {};
    draft.travelers.forEach((traveler, i) => {
      out[`age${i}`] = traveler.age;
    });
    return out;
  }
  if (taskId.startsWith("legal_identity_")) {
    const index = Number(taskId.slice("legal_identity_".length));
    const traveler = draft.travelers[index] ?? emptyTraveler();
    return {
      title: traveler.title,
      gender: traveler.gender,
      first: traveler.firstName,
      middle: traveler.middleName,
      last: traveler.lastName,
      dob: traveler.dob,
    };
  }
  if (taskId === "citizenship_residency")
    return { citizenship: draft.citizenship || "United States", residencyState: draft.residencyState };
  if (taskId === "savings_eligibility")
    return draft.serviceRateClaims.reduce<WorkingState>(
      (values, claim) => ({
        ...values,
        [`claimEnabled${claim.travelerIndex}`]: "yes",
        [`claimCategory${claim.travelerIndex}`]: claim.category,
        [`claimProof${claim.travelerIndex}`]: claim.proofReadiness,
      }),
      { interest: draft.serviceRateInterest }
    );
  if (taskId === "address")
    return {
      line1: draft.addressLine1,
      city: draft.addressCity,
      state: draft.addressState,
      zip: draft.addressZip,
    };
  if (taskId === "accessibility")
    return { mode: draft.accessibility === "" ? "" : draft.accessibility === "none" ? "none" : "some", text: draft.accessibility === "none" ? "" : draft.accessibility };
  if (taskId === "cabin_preference") return { pref: draft.cabinPreference };
  if (taskId === "celebration") return { text: draft.celebration };
  if (taskId === "insurance_interest") return { choice: draft.insuranceInterest };
  return {};
}

/** Voice-simulation value the mock "transcription" produces per task. */
function voiceValueForTask(taskId: string): { field: string; value: string } | null {
  if (taskId === "first_name") return { field: "firstName", value: "Margaret" };
  if (taskId === "email") return { field: "email", value: "margaret@example.com" };
  if (taskId === "phone") return { field: "phone", value: "(555) 201-7744" };
  return null;
}

function persistedFieldForTask(
  taskId: string,
  draft: MockDraft
): { fieldId: string; value: unknown } | null {
  if (taskId === "first_name") return { fieldId: "contact.first_name", value: draft.firstName };
  if (taskId === "email") return { fieldId: "contact.email", value: draft.email };
  if (taskId === "phone") return { fieldId: "contact.phone", value: draft.phone };
  if (taskId === "party_size") return { fieldId: "party.size", value: draft.travelerCount };
  if (taskId === "ages") {
    return { fieldId: "travelers.ages", value: { ages: draft.travelers.map((traveler) => traveler.age) } };
  }
  if (taskId.startsWith("legal_identity_")) {
    const index = Number(taskId.slice("legal_identity_".length));
    return {
      fieldId: `travelers.legal_identity.${index}`,
      value: { travelerIndex: index, ...draft.travelers[index] },
    };
  }
  if (taskId === "citizenship_residency") {
    return {
      fieldId: "travelers.citizenship_residency",
      value: { citizenship: draft.citizenship, residencyState: draft.residencyState },
    };
  }
  if (taskId === "savings_eligibility") {
    return {
      fieldId: "savings.qualification_claims",
      value: {
        interest: draft.serviceRateInterest,
        claims: draft.serviceRateClaims,
      },
    };
  }
  if (taskId === "address") {
    return {
      fieldId: "contact.address",
      value: {
        line1: draft.addressLine1,
        city: draft.addressCity,
        state: draft.addressState,
        postalCode: draft.addressZip,
      },
    };
  }
  if (taskId === "accessibility") return { fieldId: "preferences.accessibility", value: draft.accessibility };
  if (taskId === "cabin_preference") return { fieldId: "preferences.cabin", value: draft.cabinPreference };
  if (taskId === "celebration") return { fieldId: "preferences.celebration", value: draft.celebration };
  if (taskId === "insurance_interest") return { fieldId: "preferences.insurance", value: draft.insuranceInterest };
  return null;
}

function draftFromConfirmedFields(
  fields: Record<string, { value: unknown }>
): MockDraft {
  const restored = emptyDraft();
  restored.status = "collecting";
  const confirm = (taskId: string) => {
    if (!restored.confirmedTasks.includes(taskId)) restored.confirmedTasks.push(taskId);
  };
  const text = (fieldId: string): string =>
    typeof fields[fieldId]?.value === "string" ? fields[fieldId].value as string : "";

  restored.firstName = text("contact.first_name");
  if (restored.firstName) confirm("first_name");
  restored.email = text("contact.email");
  if (restored.email) confirm("email");
  restored.phone = text("contact.phone");
  if (restored.phone) confirm("phone");
  const partySize = fields["party.size"]?.value;
  if (Number.isInteger(partySize) && Number(partySize) >= 1) {
    restored.travelerCount = Number(partySize);
    restored.travelers = Array.from({ length: restored.travelerCount }, () => emptyTraveler());
    confirm("party_size");
  }
  const ages = fields["travelers.ages"]?.value as { ages?: unknown[] } | undefined;
  if (Array.isArray(ages?.ages)) {
    for (let index = 0; index < restored.travelers.length; index += 1) {
      restored.travelers[index].age = String(ages.ages[index] ?? "");
    }
    confirm("ages");
  }
  for (const [fieldId, record] of Object.entries(fields)) {
    if (!fieldId.startsWith("travelers.legal_identity.")) continue;
    const value = record.value as Partial<{
      travelerIndex: number;
      title: string;
      gender: string;
      firstName: string;
      middleName: string;
      lastName: string;
      dob: string;
      age: string;
    }>;
    const index = Number(value.travelerIndex);
    if (!Number.isInteger(index) || index < 0 || index >= restored.travelers.length) continue;
    restored.travelers[index] = { ...restored.travelers[index], ...value };
    confirm(`legal_identity_${index}`);
  }
  const residency = fields["travelers.citizenship_residency"]?.value as { citizenship?: string; residencyState?: string } | undefined;
  if (residency) {
    restored.citizenship = residency.citizenship ?? "";
    restored.residencyState = residency.residencyState ?? "";
    confirm("citizenship_residency");
  }
  const savings = fields["savings.qualification_claims"]?.value as {
    interest?: MockDraft["serviceRateInterest"];
    claims?: MockDraft["serviceRateClaims"];
  } | undefined;
  if (savings) {
    restored.serviceRateInterest = savings.interest ?? "";
    restored.serviceRateClaims = savings.claims ?? [];
    confirm("savings_eligibility");
  }
  const address = fields["contact.address"]?.value as { line1?: string; city?: string; state?: string; postalCode?: string } | undefined;
  if (address) {
    restored.addressLine1 = address.line1 ?? "";
    restored.addressCity = address.city ?? "";
    restored.addressState = address.state ?? "";
    restored.addressZip = address.postalCode ?? "";
    confirm("address");
  }
  restored.accessibility = text("preferences.accessibility");
  if (fields["preferences.accessibility"]) confirm("accessibility");
  restored.cabinPreference = text("preferences.cabin");
  if (restored.cabinPreference) confirm("cabin_preference");
  restored.celebration = text("preferences.celebration");
  if (fields["preferences.celebration"]) confirm("celebration");
  restored.insuranceInterest = text("preferences.insurance");
  if (restored.insuranceInterest) confirm("insurance_interest");
  return restored;
}

export const BookingFlowExperience = forwardRef<
  BookingFlowHandle,
  { onDebug?: (snapshot: BookingFlowSnapshot) => void; deal?: BookingAssistantDealContext }
>(function BookingFlowExperience({ onDebug, deal }, ref) {
  const activeDeal = deal ?? DEFAULT_DEAL_CONTEXT;
  const isPrototype = !deal;
  const configuredAgentPhone = process.env.NEXT_PUBLIC_BOOKING_ASSISTANT_AGENCY_PHONE?.trim() ?? "";
  const storageKey = `${STORAGE_KEY}-${activeDeal.dealId}`;
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState<MockDraft>(emptyDraft);
  const [screen, setScreen] = useState<Screen>("landing");
  const [currentTaskId, setCurrentTaskId] = useState<string>("first_name");
  const [returnToReview, setReturnToReview] = useState(false);
  const [working, setWorking] = useState<WorkingState>({});
  const [taskError, setTaskError] = useState("");
  const [journal, setJournal] = useState<MockJournalEvent[]>([]);
  const seqRef = useRef(0);
  const [sheet, setSheet] = useState<Sheet>("none");
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "heard">("idle");
  const [heardText, setHeardText] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [questionAnswer, setQuestionAnswer] = useState<{ q: string; a: string } | null>(null);
  const [questionPending, setQuestionPending] = useState(false);
  const [callSignal, setCallSignal] = useState<CallSignal | null>(null);
  const [noAgentsMode, setNoAgentsMode] = useState(false);
  const [callLaterNotice, setCallLaterNotice] = useState(false);
  // Desktop guests can't place a tel: call. On the real (non-prototype) path we
  // still run the full signal/pin/agent-mode flow, then - instead of dialing -
  // surface the number and ask them to call it. Default false (assume dialable)
  // so SSR + first paint match; corrected on mount. Holds the number to show.
  const [isDialableDevice, setIsDialableDevice] = useState(true);
  const [desktopCallPrompt, setDesktopCallPrompt] = useState<string | null>(null);

  // Server-side draft state (real DynamoDB persistence via guest API).
  const [serverDraftId, setServerDraftId] = useState<string | null>(null);
  const [serverDraftVersion, setServerDraftVersion] = useState<number>(0);
  const [serverFallbackKey, setServerFallbackKey] = useState<string | null>(null);
  const [serverSavePending, setServerSavePending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Set when we skip a resumable server draft because it belongs to a different
  // deal or is stuck in a non-resumable status, and start this deal fresh. Drives
  // a small dismissable reassurance notice; the old draft is untouched server-side.
  const [staleDraftSkipped, setStaleDraftSkipped] = useState(false);
  const serverDraftVersionRef = useRef(0);
  const fieldSaveChainRef = useRef<Promise<void>>(Promise.resolve());

  const draftId = serverDraftId ?? activeDeal.dealId;
  const fallbackKey = serverFallbackKey ?? fallbackCallKey(activeDeal.dealId);

  const tasks = useMemo(() => buildTaskList(draft), [draft]);
  const currentTask: TaskDef | undefined = tasks.find((task) => task.id === currentTaskId);
  const confirmedCount = tasks.filter((task) => draft.confirmedTasks.includes(task.id)).length;
  const completionPct = tasks.length > 0 ? Math.round((confirmedCount / tasks.length) * 100) : 0;

  useEffect(() => {
    serverDraftVersionRef.current = serverDraftVersion;
  }, [serverDraftVersion]);

  const emit = useCallback(
    (actor: MockJournalEvent["actor"], eventType: string, detail: string, taskId?: string) => {
      seqRef.current += 1;
      const event: MockJournalEvent = { seq: seqRef.current, atIso: nowIso(), actor, eventType, detail, taskId };
      setJournal((prev) => [...prev, event]);
    },
    []
  );

  // --- Persistence (sessionStorage; survives refresh, cleared by Reset) -----

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      let restoredLocally = false;
      try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        restoredLocally = true;
        const saved = JSON.parse(raw) as PersistedLab;
        const restoredDraft: MockDraft = {
          ...emptyDraft(),
          ...saved.draft,
          serviceRateClaims: saved.draft.serviceRateClaims ?? [],
        };
        setDraft(restoredDraft);
        setCurrentTaskId(saved.currentTaskId);
        setJournal(saved.journal);
        seqRef.current = saved.seq;
        const restoredScreen = saved.screen === "help"
          ? "task"
          : saved.screen === "call_finalize" && !saved.serverDraftId
            ? "landing"
            : saved.screen;
        setScreen(restoredScreen);
        setVoiceMode(saved.voiceMode);
        setCallSignal(saved.callSignal ?? null);
        setServerDraftId(saved.serverDraftId ?? null);
        setServerDraftVersion(saved.serverDraftVersion ?? 0);
        setServerFallbackKey(saved.serverFallbackKey ?? null);
        setWorking(workingForTask(saved.currentTaskId, restoredDraft));
      }
      } catch {
        // Corrupt lab state: try the protected server session.
      }
      if (!restoredLocally) {
        const current = await apiResumeCurrentDraft();
        if (!cancelled && current.success) {
          const metadata = current.result.draft.metadata;
          // The guest-session cookie points at ONE draft (the last deal started).
          // Only adopt it if it belongs to THIS deal and is in a status the guest
          // can still work. Otherwise it's leftover from another deal or already
          // in an agent-side/terminal state — starting fresh avoids resurfacing
          // the wrong trip's answers and the dead-end invalid-transition error.
          const belongsToThisDeal = metadata.dealId === activeDeal.dealId;
          const isResumable = GUEST_RESUMABLE_STATUSES.includes(metadata.status);
          if (!belongsToThisDeal || !isResumable) {
            setStaleDraftSkipped(true);
            if (!cancelled) setHydrated(true);
            return;
          }
          const restoredDraft = draftFromConfirmedFields(current.result.fields);
          restoredDraft.status = metadata.status as MockDraft["status"];
          restoredDraft.resumeTaskId = metadata.resumeTaskId ?? null;
          const target = metadata.resumeTaskId ?? metadata.nextTaskId ?? nextTaskId(restoredDraft);
          setDraft(restoredDraft);
          setCurrentTaskId(target);
          setWorking(workingForTask(target, restoredDraft));
          setServerDraftId(metadata.bookingDraftId);
          setServerDraftVersion(metadata.version);
          serverDraftVersionRef.current = metadata.version;
          setServerFallbackKey(current.result.fallbackCallKey);
          setScreen(metadata.status === "ready_to_call_agent" ? "call_finalize" : "task");
        }
      }
      if (!cancelled) setHydrated(true);
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Detect whether this device can place a phone call, on mount only (window is
  // unavailable during SSR). Signals, most to least reliable:
  //   1. UA-Client-Hints `mobile` flag (Chromium) - authoritative when present.
  //   2. UA-string match for a known mobile OS.
  //   3. Coarse-pointer (touch-primary) device on a phone-sized viewport - this
  //      catches real touch phones whose UA we didn't match. It does NOT fire in
  //      Chrome DevTools "Responsive" mode, which resizes the viewport but keeps
  //      the desktop UA *and* a fine pointer; that emulation intentionally still
  //      shows the manual-dial prompt (a real phone at that URL would dial).
  // A desktop guest gets the "call this number" prompt instead of a tel: dial -
  // the signal/agent-mode flow is identical either way.
  useEffect(() => {
    const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
    let dialable: boolean;
    if (typeof uaData?.mobile === "boolean") {
      dialable = uaData.mobile;
    } else if (userAgentLooksMobile(navigator.userAgent)) {
      dialable = true;
    } else {
      const coarsePointer =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;
      const phoneSized = window.innerWidth <= 820;
      dialable = coarsePointer && phoneSized;
    }
    setIsDialableDevice(dialable);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const persisted: PersistedLab = {
      draft,
      currentTaskId,
      journal,
      seq: seqRef.current,
      screen,
      voiceMode,
      callSignal,
      serverDraftId,
      serverDraftVersion,
      serverFallbackKey,
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(persisted));
    } catch {
      // Storage full/unavailable: the lab keeps working in-memory.
    }
  }, [hydrated, draft, currentTaskId, journal, screen, voiceMode, callSignal, serverDraftId, serverDraftVersion, serverFallbackKey, storageKey]);

  // Stream the observable state to the lab wrapper (no-op in production).
  useEffect(() => {
    if (!hydrated) return;
    onDebug?.({ draft, journal, screen, tasks, completionPct, callSignal, fallbackKey });
  }, [hydrated, draft, journal, screen, tasks, completionPct, callSignal, fallbackKey, onDebug]);

  // Auto-expire a stale call signal (mirrors the server's 120s call-intent TTL
  // in guest-service.ts). Without this, a guest who leaves the tab open on
  // "Alerting your agent..."/"Calling now..." mid-attempt - because the call
  // never connected, or they just navigated away - would return to a screen
  // frozen on a dead signal with the primary button disabled and no way out.
  // Checked on mount/hydration and every 15s while pending/calling so it
  // self-heals even if the guest never touches the tab again.
  //
  // Also persists to the server (same call as the guest's manual "Cancel and
  // go back") - a client-only reset would leave the server's draft version
  // stranded, 500ing the guest's next real signal attempt on a version
  // conflict. This is exactly the bug the manual cancel button had until it
  // was wired to apiCancelCallIntentSignal; the auto-expiry path needs the
  // same fix since it does the identical local reset.
  useEffect(() => {
    if (!hydrated) return;
    if (draft.status !== "call_signal_pending" && draft.status !== "calling_now") return;
    const CALL_SIGNAL_TTL_MS = 120_000;

    function expireIfStale() {
      const publishedAt = callSignal ? Date.parse(callSignal.publishedAtIso) : NaN;
      const isStale = Number.isNaN(publishedAt) || Date.now() - publishedAt > CALL_SIGNAL_TTL_MS;
      if (!isStale) return;

      setCallSignal(null);
      setDesktopCallPrompt(null);
      setDraft((prev) =>
        prev.status === "call_signal_pending" || prev.status === "calling_now"
          ? { ...prev, status: "ready_to_call_agent" as const }
          : prev
      );
      emit(
        "system",
        "call_intent_signal_expired",
        "Signal auto-expired client-side (stale on return); returned to ready-to-call"
      );

      if (serverDraftId && serverDraftVersion > 0) {
        apiCancelCallIntentSignal(serverDraftId, serverDraftVersion).then((result) => {
          if (result.success) {
            setServerDraftVersion(result.result.newVersion);
            emit("system", "call_signal_cancel_persisted", "Server: stale call intent signal auto-expired");
          } else {
            setServerError(result.error);
            emit("system", "call_signal_cancel_failed", `Server auto-expire cancel failed: ${result.error}`);
          }
        });
      }
    }

    expireIfStale();
    const interval = window.setInterval(expireIfStale, 15_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, draft.status, callSignal, serverDraftId, serverDraftVersion, emit]);

  useEffect(() => {
    if (!serverDraftId || draft.status !== "call_signal_pending") return;
    let stopped = false;
    async function checkAcknowledgement() {
      const result = await apiResumeDraft(serverDraftId as string);
      if (stopped || !result.success) return;
      const metadata = (result.result.draft as {
        metadata?: { status?: string; version?: number };
      }).metadata;
      if (metadata?.status !== "calling_now") return;
      const acknowledgedVersion = metadata.version ?? serverDraftVersionRef.current;
      serverDraftVersionRef.current = acknowledgedVersion;
      setServerDraftVersion(acknowledgedVersion);
      setDraft((current) => ({ ...current, status: "calling_now" }));
      setCallSignal((current) => current ? { ...current, acknowledged: true } : current);
      emit("system", "call_signal_acknowledged", "Operator dashboard acknowledged this call attempt");
    }
    void checkAcknowledgement();
    const interval = window.setInterval(() => {
      void checkAcknowledgement();
    }, 2000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [draft.status, emit, serverDraftId]);

  // --- Task navigation ------------------------------------------------------

  const goToTask = useCallback(
    (taskId: string, opts?: { fromReview?: boolean }) => {
      setCurrentTaskId(taskId);
      setWorking(workingForTask(taskId, draft));
      setTaskError("");
      setVoiceState("idle");
      setReturnToReview(Boolean(opts?.fromReview));
      setScreen("task");
      const def = buildTaskList(draft).find((task) => task.id === taskId);
      emit("assistant", "task_presented", def ? def.title : taskId, taskId);
    },
    [draft, emit]
  );

  const goBackOneTask = useCallback(() => {
    const orderedTasks = buildTaskList(draft);
    const currentIndex = orderedTasks.findIndex((task) => task.id === currentTaskId);
    if (currentIndex <= 0) return;

    const previousTask = orderedTasks[currentIndex - 1];
    setCurrentTaskId(previousTask.id);
    setWorking(workingForTask(previousTask.id, draft));
    setTaskError("");
    setVoiceState("idle");
    setReturnToReview(false);
    setScreen("task");
    emit("guest", "navigation_performed", `Back to ${previousTask.title}`, previousTask.id);
    emit("assistant", "task_presented", previousTask.title, previousTask.id);
  }, [currentTaskId, draft, emit]);

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  }, []);

  const persistConfirmedTask = useCallback(
    (taskId: string, confirmedDraft: MockDraft) => {
      if (!serverDraftId || taskId === "review") return;
      const field = persistedFieldForTask(taskId, confirmedDraft);
      if (!field) return;
      const upcoming = nextTaskId(confirmedDraft);
      const confirmed = buildTaskList(confirmedDraft).filter((task) =>
        confirmedDraft.confirmedTasks.includes(task.id)
      ).length;
      const pct = Math.round((confirmed / Math.max(buildTaskList(confirmedDraft).length, 1)) * 100);
      setServerSavePending(true);
      fieldSaveChainRef.current = fieldSaveChainRef.current
        .then(async () => {
          const result = await apiConfirmDraftField(
            serverDraftId,
            serverDraftVersionRef.current,
            field.fieldId,
            field.value,
            upcoming,
            pct,
            `${taskId}:${Date.now()}`
          );
          if (!result.success) throw new Error(result.error);
          serverDraftVersionRef.current = result.result.newVersion;
          setServerDraftVersion(result.result.newVersion);
          emit("system", "task_completed", `Confirmed answer saved securely: ${taskId}`, taskId);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Answer save failed";
          setServerError(message);
          emit("system", "draft_persist_failed", message, taskId);
        })
        .finally(() => setServerSavePending(false));
    },
    [emit, serverDraftId]
  );

  function startBooking() {
    emit("guest", "booking_assistant_opened", `Start booking tapped for ${activeDeal.title}`);
    emit("system", "booking_draft_started", "Anonymous draft created with deal attribution (mock)");
    goToTask("first_name");
  }

  /** Validate + commit the current task's working values into the draft. */
  function confirmCurrentTask(): boolean {
    if (!currentTask) return false;
    const id = currentTask.id;
    const next = { ...draft, travelers: draft.travelers.map((traveler) => ({ ...traveler })) };
    let detail = "";

    if (id === "first_name") {
      const value = (working.firstName ?? "").trim();
      if (value.length < 2) {
        setTaskError("Please enter your first name.");
        return false;
      }
      next.firstName = value;
      next.status = "collecting";
      detail = "First name confirmed";
    } else if (id === "email") {
      const value = (working.email ?? "").trim();
      if (!isValidEmail(value)) {
        setTaskError("That email doesn't look complete. Example: name@email.com");
        return false;
      }
      next.email = value;
      detail = "Email confirmed";
    } else if (id === "phone") {
      const value = (working.phone ?? "").trim();
      if (!isValidPhone(value)) {
        setTaskError("Please enter a phone number with at least 10 digits.");
        return false;
      }
      next.phone = value;
      detail = "Mobile phone confirmed (no call/text consent implied)";
    } else if (id === "party_size") {
      const count = Number(working.travelerCount);
      if (!(count >= 1 && count <= 4)) {
        setTaskError("Choose how many adults are sailing (1 to 4).");
        return false;
      }
      next.travelerCount = count;
      while (next.travelers.length < count) next.travelers.push(emptyTraveler());
      next.travelers = next.travelers.slice(0, count);
      // Party-size change invalidates downstream confirmations that depend on it.
      next.confirmedTasks = next.confirmedTasks.filter(
        (taskId) => !taskId.startsWith("legal_identity_") && taskId !== "ages" && taskId !== "savings_eligibility"
      );
      next.serviceRateInterest = "";
      next.serviceRateClaims = [];
      detail = `${count} traveler(s) confirmed`;
    } else if (id === "ages") {
      for (let i = 0; i < next.travelerCount; i += 1) {
        const age = (working[`age${i}`] ?? "").trim();
        if (!isValidAge(age)) {
          setTaskError("Every traveler in this pilot must be 18 or older. Enter each age as a number.");
          return false;
        }
        next.travelers[i].age = age;
      }
      detail = "Traveler ages confirmed";
    } else if (id.startsWith("legal_identity_")) {
      const index = Number(id.slice("legal_identity_".length));
      const title = (working.title ?? "").trim();
      const gender = (working.gender ?? "").trim();
      const first = (working.first ?? "").trim();
      const last = (working.last ?? "").trim();
      const dob = (working.dob ?? "").trim();
      if (!title || !gender) {
        setTaskError("Please choose a title and the gender value used on this traveler's ID.");
        return false;
      }
      if (first.length < 2 || last.length < 2) {
        setTaskError("Legal first and last name are required, exactly as on the ID.");
        return false;
      }
      if (!isValidDob(dob)) {
        setTaskError("Please enter a valid date of birth.");
        return false;
      }
      next.travelers[index] = {
        ...next.travelers[index],
        title,
        gender,
        firstName: first,
        middleName: (working.middle ?? "").trim(),
        lastName: last,
        dob,
      };
      detail = `Traveler ${index + 1} legal identity confirmed`;
    } else if (id === "citizenship_residency") {
      const citizenship = (working.citizenship ?? "").trim();
      const state = (working.residencyState ?? "").trim();
      if (!citizenship || !state) {
        setTaskError("Please confirm citizenship and select a home state.");
        return false;
      }
      next.citizenship = citizenship;
      next.residencyState = state;
      detail = "Citizenship and residency confirmed";
    } else if (id === "savings_eligibility") {
      const interest = working.interest ?? "";
      if (interest !== "yes" && interest !== "no" && interest !== "not_sure") {
        setTaskError("Choose Yes, No, or Not sure - your agent can verify it.");
        return false;
      }
      next.serviceRateInterest = interest;
      if (interest === "yes") {
        const selectedClaims = next.travelers
          .slice(0, next.travelerCount)
          .map((_, travelerIndex) => ({
            travelerIndex,
            enabled: working[`claimEnabled${travelerIndex}`] === "yes",
            category: (working[`claimCategory${travelerIndex}`] ?? "").trim(),
            proofReadiness: working[`claimProof${travelerIndex}`] ?? "",
          }))
          .filter((claim) => claim.enabled);
        if (selectedClaims.length === 0) {
          setTaskError("Choose each traveler who may qualify.");
          return false;
        }
        for (const claim of selectedClaims) {
          if (!claim.category) {
            setTaskError(`Choose the closest service category for traveler ${claim.travelerIndex + 1}.`);
            return false;
          }
          if (
            claim.proofReadiness !== "available_later" &&
            claim.proofReadiness !== "need_help" &&
            claim.proofReadiness !== "not_sure"
          ) {
            setTaskError(`Tell us about proof readiness for traveler ${claim.travelerIndex + 1}.`);
            return false;
          }
        }
        next.serviceRateClaims = selectedClaims.map((claim) => ({
          travelerIndex: claim.travelerIndex,
          category: claim.category,
          proofReadiness: claim.proofReadiness as "available_later" | "need_help" | "not_sure",
        }));
        detail = `${next.serviceRateClaims.length} military/service rate claim(s) recorded - operator verification required`;
      } else {
        next.serviceRateClaims = [];
        detail = interest === "no" ? "No military/service rate claimed" : "Military/service eligibility needs operator review";
      }
    } else if (id === "address") {
      const line1 = (working.line1 ?? "").trim();
      const city = (working.city ?? "").trim();
      const state = (working.state ?? "").trim();
      const zip = (working.zip ?? "").trim();
      if (!line1 || !city || !state) {
        setTaskError("Street address, city, and state are required.");
        return false;
      }
      if (digitCount(zip) < 5) {
        setTaskError("Please enter a 5-digit ZIP code.");
        return false;
      }
      next.addressLine1 = line1;
      next.addressCity = city;
      next.addressState = state;
      next.addressZip = zip;
      detail = "Mailing address confirmed";
    } else if (id === "accessibility") {
      if (working.mode !== "none" && working.mode !== "some") {
        setTaskError("Choose one option - it's fine to say none.");
        return false;
      }
      if (working.mode === "some" && !(working.text ?? "").trim()) {
        setTaskError("Tell us briefly what would help, or choose 'No special requests'.");
        return false;
      }
      next.accessibility = working.mode === "none" ? "none" : (working.text ?? "").trim();
      detail = "Accessibility needs confirmed";
    } else if (id === "cabin_preference") {
      if (!(working.pref ?? "").trim()) {
        setTaskError("Pick the option closest to what you want - you can change it later.");
        return false;
      }
      next.cabinPreference = working.pref;
      detail = `Cabin preference confirmed: ${working.pref}`;
    } else if (id === "celebration") {
      next.celebration = (working.text ?? "").trim();
      next.celebrationDeferred = false;
      detail = next.celebration ? "Celebration noted" : "No celebration";
    } else if (id === "insurance_interest") {
      if (!(working.choice ?? "").trim()) {
        setTaskError("Choose one - 'Discuss with my agent' is a fine answer.");
        return false;
      }
      next.insuranceInterest = working.choice;
      detail = `Insurance interest: ${working.choice}`;
    }

    if (!next.confirmedTasks.includes(id)) next.confirmedTasks = [...next.confirmedTasks, id];
    setDraft(next);
    setTaskError("");
    emit("guest", "field_confirmed", detail, id);
    emit("system", "task_completed", `Autosaved to durable draft (mock): ${detail}`, id);
    if (id === "ages") {
      emit(
        "system",
        "rate_qualification_derived",
        mockMscSeniorCandidate(next)
          ? "MSC age-based candidate: all cabin occupants are 65+; live rate still required"
          : "Age-based rates will still be checked live; no MSC 65+ all-occupant candidate in this mock",
        id
      );
    }
    if (id === "savings_eligibility" && next.serviceRateInterest !== "no") {
      emit(
        "guest",
        next.serviceRateInterest === "yes" ? "rate_qualification_claimed" : "rate_qualification_needs_verification",
        serviceRateSummary(next),
        id
      );
    }
    flashSaved();
    if (id !== "phone") persistConfirmedTask(id, next);

    if (id === "email" && !draft.confirmedTasks.includes("email")) {
      emit("system", "resume_email_sent", `Secure resume link emailed to ${next.email} (mock - nothing sent)`);
      // Partial-lead capture: the guest is now identifiable (name + email) but
      // the durable server save is still phone-gated — surface them to the
      // dashboard's booking leads even if they never finish. Best-effort
      // beacon; the track route's public-deal gate filters lab/mock deal ids.
      if (next.email) {
        postBookingContactCaptured(activeDeal.dealId, {
          email: next.email,
          firstName: next.firstName || undefined,
        });
      }
    }
    if (id === "phone" && !draft.confirmedTasks.includes("phone")) {
      emit("assistant", "option_menu_opened", "'Get help now' is now available in More Options");
      // All contact fields captured — persist to real DynamoDB via guest API.
      if (next.firstName && next.email && next.phone && !serverDraftId) {
        const realDraftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setServerSavePending(true);
        apiSaveDraft({
          draftId: realDraftId,
          personId: `person-${Date.now()}`,
          dealSnapshot: {
            dealId: activeDeal.dealId,
            packageId: activeDeal.packageId,
            siid: activeDeal.siid,
            cruiseLine: activeDeal.line,
            ship: activeDeal.ship,
            sailingDateIso: activeDeal.sailDateIso,
            nights: activeDeal.nights,
            departurePort: activeDeal.departure,
            itineraryLabel: activeDeal.itinerary,
            dealAngle: activeDeal.title,
            priceDisplay: activeDeal.priceBasis,
            currency: "USD",
            taxFeeBasis: "per person",
            priceCapturedAtIso: new Date().toISOString(),
            sourceBookingUrl: activeDeal.sourceBookingUrl,
            linkHealthState: "unknown",
          },
          contact: {
            firstName: next.firstName,
            email: next.email,
            phoneE164: next.phone,
            preferredChannel: "phone",
            emailVerified: false,
            phoneVerified: false,
            transactionalEmailConsent: true,
            callbackConsent: true,
            smsConsent: false,
            marketingConsent: false,
          },
          initialStatus: "collecting",
          decisions: {
            travelInsuranceDecision: next.insuranceInterest || undefined,
            passengerDataReviewConfirmed: false,
            packetStorageConsent: false,
          },
        }).then(async (result) => {
          if (result.success) {
            setServerDraftId(result.result.draftId);
            let seededVersion = result.result.version;
            for (const taskId of ["first_name", "email", "phone"]) {
              const field = persistedFieldForTask(taskId, next);
              if (!field) continue;
              const seeded = await apiConfirmDraftField(
                result.result.draftId,
                seededVersion,
                field.fieldId,
                field.value,
                nextTaskId(next),
                completionPct,
                `contact-bootstrap:${taskId}:${result.result.draftId}`
              );
              if (!seeded.success) {
                setServerError(seeded.error);
                break;
              }
              seededVersion = seeded.result.newVersion;
            }
            serverDraftVersionRef.current = seededVersion;
            setServerDraftVersion(seededVersion);
            setServerFallbackKey(result.result.fallbackCallKey.rawKey);
            emit("system", "booking_draft_persisted", `Draft saved to DynamoDB: ${result.result.draftId}, key=${result.result.fallbackCallKey.rawKey}`);
          } else {
            setServerError(result.error);
            emit("system", "draft_persist_failed", `Server save failed: ${result.error}`);
          }
          setServerSavePending(false);
        });
      }
    }

    // Route: back to review if this was an edit, otherwise the next unconfirmed task.
    if (returnToReview) {
      setReturnToReview(false);
      const upcoming = nextTaskId(next);
      if (upcoming === "review") {
        goToReview(next);
      } else {
        // The edit invalidated dependents (e.g. party size changed) - resume order.
        setCurrentTaskId(upcoming);
        setWorking(workingForTask(upcoming, next));
        emit("assistant", "task_presented", "Changed answer re-opened dependent tasks", upcoming);
      }
      return true;
    }

    const upcoming = nextTaskId(next);
    if (upcoming === "review") {
      goToReview(next);
    } else {
      setCurrentTaskId(upcoming);
      setWorking(workingForTask(upcoming, next));
      setVoiceState("idle");
      const def = buildTaskList(next).find((task) => task.id === upcoming);
      emit("assistant", "task_presented", def ? def.title : upcoming, upcoming);
    }
    return true;
  }

  function goToReview(fromDraft?: MockDraft) {
    const base = fromDraft ?? draft;
    setCurrentTaskId("review");
    setWorking({});
    setTaskError("");
    setScreen("task");
    emit("assistant", "task_presented", "Full review presented", "review");
    if (fromDraft) setDraft(base);
  }

  function deferCurrentTask() {
    if (!currentTask?.deferrable) return;
    const next = { ...draft };
    if (currentTask.id === "celebration") {
      next.celebrationDeferred = true;
      if (!next.confirmedTasks.includes("celebration")) next.confirmedTasks = [...next.confirmedTasks, "celebration"];
    }
    setDraft(next);
    emit("guest", "field_deferred", "'I don't have this yet' - optional task moved on", currentTask.id);
    const upcoming = nextTaskId(next);
    if (upcoming === "review") {
      goToReview(next);
    } else {
      goToTask(upcoming);
    }
  }

  async function submitReview() {
    const missingTask = buildTaskList(draft).find(
      (task) => task.id !== "review" && !draft.confirmedTasks.includes(task.id)
    );
    if (missingTask) {
      goToTask(missingTask.id);
      setTaskError("Please complete this quick step before the final review.");
      return;
    }
    if (!draft.accuracyAcknowledged) {
      setTaskError("Please confirm the accuracy acknowledgement first.");
      return;
    }
    if (serverSavePending) {
      setTaskError("Saving your information securely. Please wait a moment and try again.");
      return;
    }
    if (!serverDraftId || !serverFallbackKey || serverDraftVersion <= 0) {
      setTaskError(serverError ?? "Your information could not be saved securely. Please restart this booking.");
      return;
    }
    const next = { ...draft, preparationAuthorized: true, status: "ready_to_call_agent" as const };
    setServerSavePending(true);
    try {
      const result = await apiMarkReviewReady(serverDraftId, serverDraftVersion, {
        travelers: buildTravelerPayloads(next),
        cabin: buildCabinPayload(next),
        decisions: {
          travelInsuranceDecision: next.insuranceInterest || undefined,
          passengerDataReviewConfirmed: next.accuracyAcknowledged,
          packetStorageConsent: next.preparationAuthorized,
        },
      });
      if (!result.success) {
        // Self-healing for a stale-state re-submit: if the guest taps "Looks
        // right" again after the packet was already accepted (typically by going
        // Back into the flow), the server can report an invalid transition
        // instead of a fresh success. Rather than dead-end the guest at a raw
        // "Invalid status transition" message + Restart, re-sync from the server
        // and, if the draft is already at/after review, carry them forward to the
        // call-finalize screen exactly as a clean submit would.
        const recovered = await recoverFromReviewSubmitError(next);
        if (recovered) return;
        setServerError(result.error);
        setTaskError(result.error);
        emit("system", "review_ready_failed", `Server update failed: ${result.error}`);
        return;
      }

      setServerDraftVersion(result.result.newVersion);
      setDraft(next);
      emit("guest", "field_confirmed", "Accuracy acknowledged for all travelers", "review");
      emit("system", "booking_packet_reviewed", "Reviewed packet saved in the booking draft");
      emit("system", "state_transitioned", "collecting -> ready_to_call_agent");
      emit(
        "system",
        callSignal ? "fallback_call_key_reused" : "fallback_call_key_issued",
        `Fallback call key ready (redacted from payload); mode ${COMPLETION_MODE}`
      );
      emit("assistant", "ready_to_call_presented", "Call-agent-to-finalize screen shown");
      setScreen("call_finalize");
    } finally {
      setServerSavePending(false);
    }
  }

  /**
   * Re-sync from the server after a failed review submit and, when the draft has
   * already advanced to (or past) review, move the guest forward instead of
   * showing a state-machine error. Returns true when it took over the guest's
   * next step, false to let the caller fall back to the normal error display.
   */
  async function recoverFromReviewSubmitError(reviewedDraft: MockDraft): Promise<boolean> {
    const current = await apiResumeCurrentDraft();
    if (!current.success) return false;
    const metadata = current.result.draft.metadata;
    // Only recover our own draft for this deal; anything else is a genuine
    // mismatch the caller should surface.
    if (metadata.dealId !== activeDeal.dealId || metadata.bookingDraftId !== serverDraftId) {
      return false;
    }
    const alreadyReviewed =
      metadata.status === "review_ready" || metadata.status === "ready_to_call_agent";
    if (!alreadyReviewed) return false;

    setServerDraftVersion(metadata.version);
    setServerError(null);
    setTaskError("");
    setDraft({ ...reviewedDraft, preparationAuthorized: true, status: "ready_to_call_agent" });
    emit("system", "review_ready_recovered", `Re-synced after duplicate submit; server status ${metadata.status}`);
    emit("assistant", "ready_to_call_presented", "Call-agent-to-finalize screen shown");
    setScreen("call_finalize");
    return true;
  }

  // --- Section 29 call-agent-to-finalize ------------------------------------

  /**
   * Guest taps "Call agent to finalize". Sequence (29.1.7): disable duplicate
   * submit -> disclosure -> publish signal (call_signal_pending) -> WAIT for
   * the operator panel to pin + acknowledge THIS attempt before "calling_now".
   * A generic publish success is not enough.
   */
  function launchCall() {
    if (draft.status === "call_signal_pending" || draft.status === "calling_now") return;
    const callAttemptId = `call-${Date.now().toString(36)}`;
    emit("assistant", "call_disclosure_presented", "Phone-finalization disclosure shown above the button");
    setCallSignal({
      callAttemptId,
      draftId,
      fallbackKey,
      publishedAtIso: nowIso(),
      acknowledged: false,
      callerIdState: null,
      callerVerified: false,
      outcome: null,
    });
    setDraft((prev) => ({ ...prev, status: "call_signal_pending" }));
    emit("guest", "call_launch_requested", `Attempt ${callAttemptId} (idempotent)`);
    emit("system", "call_intent_signal_published", "Intent published to operator dashboard (awaiting pin/ack)");

    // Persist call intent signal to real DynamoDB.
    if (serverDraftId && serverDraftVersion > 0) {
      apiSignalCallIntent(serverDraftId, serverDraftVersion).then((result) => {
        if (result.success) {
          setServerDraftVersion(result.result.newVersion);
          if (result.result.outcome === "no_agents") {
            setCallSignal(null);
            setDesktopCallPrompt(null);
            setDraft((prev) => ({ ...prev, status: "ready_to_call_agent" }));
            setNoAgentsMode(true);
            emit("system", "no_agents_mode_presented", "No agents are currently available; callback choices shown");
            return;
          }
          emit("system", "call_signal_persisted", `Server: call intent published, attempt ${result.result.callAttemptId}`);
          if (!isPrototype) {
            if (configuredAgentPhone) {
              if (isDialableDevice) {
                window.location.href = `tel:${configuredAgentPhone}`;
              } else {
                // Desktop: signal/pin already happened (same rules). We can't
                // dial, so surface the number and ask the guest to call it.
                setDesktopCallPrompt(configuredAgentPhone);
                emit("system", "call_number_displayed", "Desktop device: showed agent number to dial manually");
              }
            } else {
              const message = "Calling is not available right now. Please ask for help or try again later.";
              setServerError(message);
              emit("system", "call_launch_failed", message);
            }
          }
        } else {
          setServerError(result.error);
          setCallSignal(null);
          setDraft((prev) => (
            prev.status === "call_signal_pending"
              ? { ...prev, status: "ready_to_call_agent" }
              : prev
          ));
          emit("system", "call_signal_failed", `Server signal failed: ${result.error}`);
        }
      });
    } else if (!isPrototype) {
      const message = "Your saved booking session is unavailable. Restart this booking before calling.";
      setServerError(message);
      emit("system", "call_launch_failed", message);
    }
  }

  function callLater() {
    setCallLaterNotice(true);
    emit("guest", "call_later_selected", "Guest chose to call later; key + receipt preserved");
    // Stays ready_to_call_agent; no real message is sent in the lab.
  }

  /**
   * Guest-initiated escape hatch from a stuck call-signal-pending/calling_now
   * state - the call didn't connect, or they're returning to a stale signal
   * from an earlier visit. Same end state as the operator's expire action
   * (ready_to_call_agent, signal cleared) but guest-triggered and immediate,
   * not dependent on the auto-expiry timer or an operator noticing.
   *
   * Must also persist server-side (mirrors launchCall's apiSignalCallIntent
   * call): a client-only reset leaves the server's draft version stranded at
   * whatever launchCall bumped it to, so the guest's *next* real signal
   * attempt sends a stale expectedVersion and 500s on a version conflict.
   */
  function cancelCallSignal() {
    if (draft.status !== "call_signal_pending" && draft.status !== "calling_now") return;
    emit("guest", "call_intent_signal_cancelled_by_guest", "Guest cancelled a stuck/unconnected call signal");
    setCallSignal(null);
    setDesktopCallPrompt(null);
    setDraft((prev) => ({ ...prev, status: "ready_to_call_agent" }));

    if (serverDraftId && serverDraftVersion > 0) {
      apiCancelCallIntentSignal(serverDraftId, serverDraftVersion).then((result) => {
        if (result.success) {
          setServerDraftVersion(result.result.newVersion);
          emit("system", "call_signal_cancel_persisted", "Server: call intent signal cancelled");
        } else {
          setServerError(result.error);
          emit("system", "call_signal_cancel_failed", `Server cancel failed: ${result.error}`);
        }
      });
    }
  }

  // Operator actions, invoked from the wrapper's mock operator panel.
  function operatorAcknowledgeSignal() {
    setCallSignal((prev) => (prev && !prev.acknowledged ? { ...prev, acknowledged: true } : prev));
    emit("operator", "operator_call_draft_pinned", "Draft pinned in Calling-now slot; attempt acknowledged");
    // Only now does the guest advance to calling_now and simulate tel:.
    setDraft((prev) => (prev.status === "call_signal_pending" ? { ...prev, status: "calling_now" } : prev));
    emit("system", "state_transitioned", "call_signal_pending -> calling_now (ack received; simulating tel:)");
  }

  function operatorExpireSignal() {
    emit("system", "call_intent_signal_expired", "Unclaimed signal expired; returned to ready-to-call");
    setCallSignal(null);
    setDesktopCallPrompt(null);
    setDraft((prev) =>
      prev.status === "call_signal_pending" || prev.status === "calling_now"
        ? { ...prev, status: "ready_to_call_agent" }
        : prev
    );
  }

  function operatorLookupFallbackKey(candidate: string): boolean {
    emit("operator", "fallback_call_key_lookup_attempted", "Exact fallback-key lookup attempted (key redacted)");
    const matched = candidate.trim().toUpperCase() === fallbackKey;
    emit("operator", "fallback_call_key_lookup_result", matched ? "Masked draft match" : "No match");
    return matched;
  }

  function operatorSetCallerId(state: CallerIdState) {
    setCallSignal((prev) => (prev ? { ...prev, callerIdState: state } : prev));
    emit("operator", "caller_id_compared", `Caller ID: ${state} (never authentication)`);
  }

  function operatorRecordVerification() {
    setCallSignal((prev) => (prev ? { ...prev, callerVerified: true } : prev));
    emit("operator", "caller_verification_recorded", "Caller verified; full packet may now be revealed");
  }

  function operatorStartProcessing() {
    emit("operator", "operator_claimed", "Operator claimed the draft (post-verification)");
    emit("operator", "agent_processing_started", "Fresh supplier session + recheck checklist begun (mock)");
    setDraft((prev) => ({ ...prev, status: "agent_processing" }));
    emit("system", "state_transitioned", "calling_now -> agent_processing");
  }

  function operatorRecordOutcome(outcome: CallOutcome) {
    emit("operator", "call_outcome_recorded", `Outcome: ${CALL_OUTCOME_LABELS[outcome]}`);
    if (outcome === "confirmed") {
      // Booking_confirmed only after the separate reconciliation action (29.3).
      emit("operator", "reconciliation_completed", "CBAT Trip reconciliation matched (mock)");
      emit("system", "booking_confirmed", "Authoritative confirmation recorded");
      setDraft((prev) => ({ ...prev, status: "booking_confirmed" }));
    }
  }

  // --- Continue later / resume ---------------------------------------------

  const emailConfirmed = draft.confirmedTasks.includes("email");
  const phoneConfirmed = draft.confirmedTasks.includes("phone");

  function currentWorkingIsSaveable(): boolean {
    if (!currentTask) return false;
    if (currentTask.id === "first_name") return (working.firstName ?? "").trim().length >= 2 && !draft.confirmedTasks.includes("first_name");
    if (currentTask.id === "phone") return isValidPhone(working.phone ?? "") && !draft.confirmedTasks.includes("phone");
    return false;
  }

  async function pause(saveWorking: boolean) {
    const pausedAtTask = currentTaskId;
    if (saveWorking) confirmCurrentTask();
    if (serverDraftId) {
      await fieldSaveChainRef.current;
      const currentIndex = tasks.findIndex((task) => task.id === pausedAtTask);
      const resumeAt = saveWorking
        ? tasks[currentIndex + 1]?.id ?? "review"
        : pausedAtTask;
      setServerSavePending(true);
      const result = await apiContinueDraftLater(
        serverDraftId,
        serverDraftVersionRef.current,
        resumeAt,
        resumeAt,
        `continue-later:${serverDraftId}:${Date.now()}`
      );
      setServerSavePending(false);
      if (!result.success) {
        setServerError(result.error);
        setTaskError(result.error);
        return;
      }
      serverDraftVersionRef.current = result.result.newVersion;
      setServerDraftVersion(result.result.newVersion);
      emit(
        "system",
        result.result.notificationAccepted ? "continue_later_receipt_sent" : "continue_later_receipt_queued",
        result.result.notificationAccepted
          ? "Secure save receipt accepted by the email provider"
          : "Progress saved; email delivery needs retry"
      );
    }
    // Functional update: confirmCurrentTask queued its own setDraft, and a
    // plain object here would clobber the answer it just saved.
    setDraft((prev) => ({
      ...prev,
      status: "paused_by_guest",
      resumeTaskId: saveWorking ? nextTaskId(prev) : pausedAtTask,
    }));
    setSheet("none");
    setScreen("paused");
    emit("guest", "continue_later_selected", `Paused at '${currentTask?.title ?? currentTaskId}'`);
    emit("system", "reminder_program_armed", "continue_later_v1 armed: every 3 days, capped");
  }

  async function requestNoAgentsCallback(input: {
    preference: "as_soon_as_available" | "preferred_window";
    windowStartIso?: string;
    windowEndIso?: string;
    timeZone: string;
  }): Promise<{ resumeEmailAccepted: boolean; operatorAlertAccepted: boolean }> {
    if (!serverDraftId || serverDraftVersion <= 0) {
      throw new Error("Your saved booking session is unavailable. Please refresh this page and try again.");
    }
    const result = await apiRequestBookingCallback(serverDraftId, serverDraftVersion, input);
    if (!result.success) {
      setServerError(result.error);
      throw new Error(result.error);
    }
    setServerDraftVersion(result.result.newVersion);
    setDraft((prev) => ({ ...prev, status: "human_requested" }));
    emit("guest", "callback_requested", `Callback preference: ${input.preference}`);
    return {
      resumeEmailAccepted: result.result.notificationAccepted,
      operatorAlertAccepted: result.result.operatorAlertAccepted === true,
    };
  }

  async function chooseNoAgentsTryLater(): Promise<boolean> {
    if (!serverDraftId || serverDraftVersion <= 0) return false;
    const result = await apiChooseNoAgentsTryLater(serverDraftId, serverDraftVersion);
    if (!result.success) {
      setServerError(result.error);
      throw new Error(result.error);
    }
    setServerDraftVersion(result.result.newVersion);
    emit("guest", "no_agents_try_later_selected", "Guest chose to return by secure resume link");
    return result.result.notificationAccepted;
  }

  function resume(via: "continue_now" | "email_link") {
    const target = draft.resumeTaskId ?? nextTaskId(draft);
    const next = { ...draft, status: "collecting" as const, resumeTaskId: null };
    setDraft(next);
    if (via === "email_link") {
      emit("system", "resume_token_consumed", "One-time token exchanged for session cookie (mock)");
    }
    emit("guest", "draft_reactivated", `Resumed at exact task '${target}'`);
    goToTask(target);
  }

  // --- Voice simulation -----------------------------------------------------

  function startVoice() {
    const sample = voiceValueForTask(currentTaskId);
    if (!sample || !currentTask) return;
    setVoiceState("listening");
    emit("guest", "voice_started", "Microphone tapped (simulated - nothing is recorded)", currentTaskId);
    window.setTimeout(() => {
      setVoiceState("heard");
      setHeardText(currentTask.voiceSample ?? sample.value);
      setWorking((prev) => ({ ...prev, [sample.field]: sample.value }));
      emit("system", "voice_transcript_sanitized", `Heard: "${currentTask.voiceSample ?? sample.value}"`, currentTaskId);
      emit("assistant", "field_proposed", "Proposed value shown in editable confirmation card", currentTaskId);
    }, 1400);
  }

  // --- Side questions -------------------------------------------------------

  async function askQuestion(picked?: { q: string; a: string }) {
    const q = picked?.q ?? questionText.trim();
    if (!q || questionPending) return;
    emit("guest", "side_question_asked", q, currentTaskId);

    // Suggestion chips carry an approved answer — show it instantly, no round-trip.
    const canned = picked ?? SIDE_QUESTIONS.find((entry) => entry.q === q);
    if (canned) {
      setQuestionAnswer({ q, a: canned.a });
      setQuestionText("");
      emit("assistant", "assistant_response_presented", "Approved answer shown; task and input preserved", currentTaskId);
      return;
    }

    // Free-text question → the real grounded assistant (cheap Claude tier).
    setQuestionText("");
    setQuestionPending(true);
    setQuestionAnswer({ q, a: "" }); // renders the "thinking" state under the question
    const result = await askBookingQuestion(activeDeal.dealId, q, {
      line: activeDeal.line,
      ship: activeDeal.ship,
      title: activeDeal.title,
      nights: activeDeal.nights,
      sailDateLabel: activeDeal.sailDateLabel,
      departure: activeDeal.departure,
      itinerary: activeDeal.itinerary,
      priceBasis: activeDeal.priceBasis,
    });
    const answer = result.success ? result.answer : result.error;
    setQuestionAnswer({ q, a: answer });
    setQuestionPending(false);
    emit(
      "assistant",
      "assistant_response_presented",
      result.success ? "Grounded assistant answer shown" : "Assistant unavailable; fallback shown",
      currentTaskId
    );
  }

  function requestHelp() {
    const taskId = currentTask?.id;
    if (serverDraftId && serverDraftVersionRef.current > 0) {
      setServerSavePending(true);
      apiRequestHumanHelp(serverDraftId, serverDraftVersionRef.current, taskId).then((result) => {
        setServerSavePending(false);
        if (!result.success) {
          setServerError(result.error);
          emit("system", "human_help_request_failed", `Server help request failed: ${result.error}`);
          return;
        }
        serverDraftVersionRef.current = result.result.newVersion;
        setServerDraftVersion(result.result.newVersion);
        const next = { ...draft, status: "human_requested" as const };
        setDraft(next);
        setSheet("none");
        setScreen("help");
        emit("guest", "human_help_requested", "'Get help now' tapped");
        emit("system", "state_transitioned", `${draft.status} -> human_requested`);
        emit("operator", "operator_claimed", "Urgent Pushover sent to operator");
      });
      return;
    }
    const next = { ...draft, status: "human_requested" as const };
    setDraft(next);
    setSheet("none");
    setScreen("help");
    emit("guest", "human_help_requested", "'Get help now' tapped");
    emit("system", "state_transitioned", `${draft.status} -> human_requested`);
    emit("operator", "operator_claimed", "Urgent Pushover sent to operator (mock)");
  }

  function resetFlow() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    seqRef.current = 0;
    setDraft(emptyDraft());
    setJournal([]);
    setScreen("landing");
    setCurrentTaskId("first_name");
    setWorking({});
    setSheet("none");
    setTaskError("");
    setVoiceMode(false);
    setVoiceState("idle");
    setServerDraftId(null);
    setServerDraftVersion(0);
    setServerFallbackKey(null);
    setServerSavePending(false);
    setServerError(null);
    setQuestionAnswer(null);
    setCallSignal(null);
  }

  function confirmRestartFlow() {
    const confirmed = window.confirm(
      "Restart this booking on this device? Your answers on this screen will be cleared so a new secure booking session can be created."
    );
    if (!confirmed) return;
    resetFlow();
  }

  useImperativeHandle(ref, () => ({
    reset: resetFlow,
    simulateEmailResume: () => {
      if (screen === "paused") resume("email_link");
    },
    operatorAcknowledgeSignal,
    operatorSetCallerId,
    operatorRecordVerification,
    operatorLookupFallbackKey,
    operatorStartProcessing,
    operatorRecordOutcome,
    operatorExpireSignal,
  }));

  // --- More Options contents (max 4 contextual before View all) -------------

  const optionActions = useMemo(() => {
    const contextual: Array<{ label: string; hint: string; run: () => void }> = [];
    if (emailConfirmed && screen === "task") {
      contextual.push({
        label: "Continue later",
        hint: "Save confirmed answers, get a secure email link",
        run: () => setSheet("pause_confirm"),
      });
      contextual.push({
        label: "Email my resume link",
        hint: "Send the secure link again",
        run: () => {
          emit("system", "resume_email_sent", `Resume link re-sent to ${draft.email} (mock)`);
          setSheet("none");
        },
      });
    }
    if (phoneConfirmed) {
      contextual.push({ label: "Get help now", hint: "A real agent, with everything you've entered", run: requestHelp });
      contextual.push({
        label: "Request a callback",
        hint: "We call you when an agent is free",
        run: () => {
          emit("guest", "human_help_requested", "Callback requested (mock)");
          setSheet("none");
        },
      });
    }
    const always: Array<{ label: string; hint: string; run: () => void }> = [
      { label: "Ask a question", hint: "Without losing your place", run: () => setSheet("question") },
      {
        label: voiceMode ? "Switch to typing" : "Switch to voice",
        hint: "Answer by speaking or typing - same booking either way",
        run: () => {
          setVoiceMode((value) => !value);
          setSheet("none");
        },
      },
      { label: "View progress", hint: "What's done and what's left", run: () => setSheet("progress") },
      { label: "Privacy & data use", hint: "What we save and why", run: () => setSheet("privacy") },
    ];
    if (draft.confirmedTasks.includes("savings_eligibility") && screen === "task") {
      always.unshift({
        label: "Review savings eligibility",
        hint: "Update who may qualify; age-based rates are checked automatically",
        run: () => {
          setSheet("none");
          goToTask("savings_eligibility", { fromReview: currentTaskId === "review" });
        },
      });
    }
    return { contextual: contextual.slice(0, 4), always };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailConfirmed, phoneConfirmed, screen, voiceMode, draft.email, draft.confirmedTasks, currentTaskId, emit, goToTask]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: CREAM, color: MUTED }}>
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden" style={{ background: CREAM }}>
      {/* Campaign hero image, laid very faintly behind the entire flow so a guest
          who leaves and returns is reminded which trip this is. Purely decorative:
          pointer-events-none, non-interactive, hidden when no image is available.
          A CREAM scrim over the top keeps it a whisper, not a photo. */}
      {activeDeal.heroImageUrl && (
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${activeDeal.heroImageUrl})`, opacity: 0.18 }}
          />
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(${CREAM}11, ${CREAM}44)` }}
          />
        </div>
      )}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      {staleDraftSkipped && (
        <div className="relative z-20 flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex-1">
            We started you fresh for this cruise. Any booking you began for a different
            trip is saved separately and wasn&apos;t changed.
          </span>
          <button
            type="button"
            onClick={() => setStaleDraftSkipped(false)}
            aria-label="Dismiss"
            className="shrink-0 rounded px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-100"
          >
            Got it
          </button>
        </div>
      )}
      <FlowContent
        screen={screen}
        deal={activeDeal}
        draft={draft}
        tasks={tasks}
        currentTask={currentTask}
        confirmedCount={confirmedCount}
        completionPct={completionPct}
        working={working}
        setWorking={setWorking}
        taskError={taskError}
        submitting={serverSavePending}
        savedFlash={savedFlash}
        emailConfirmed={emailConfirmed}
        voiceMode={voiceMode}
        voiceState={voiceState}
        heardText={heardText}
        onStart={startBooking}
        onContinue={confirmCurrentTask}
        onBackStep={goBackOneTask}
        onDefer={deferCurrentTask}
        onOpenOptions={() => setSheet("options")}
        onOpenQuestion={() => setSheet("question")}
        onOpenPause={() => setSheet("pause_confirm")}
        onSubmitReview={submitReview}
        onRestart={confirmRestartFlow}
        onEditFromReview={(taskId) => goToTask(taskId, { fromReview: true })}
        onResume={() => resume("continue_now")}
        onBackFromHelp={() => {
          setDraft((prev) => ({ ...prev, status: "collecting" }));
          setScreen("task");
        }}
        onStartVoice={startVoice}
        setDraft={setDraft}
        reminderDate={reminderDateLabel()}
        fallbackKey={fallbackKey}
        callSignal={callSignal}
        onLaunchCall={launchCall}
        noAgentsMode={noAgentsMode}
        onRequestCallback={requestNoAgentsCallback}
        onNoAgentsTryLater={chooseNoAgentsTryLater}
        onCallLater={callLater}
        callLaterNotice={callLaterNotice}
        desktopCallPrompt={desktopCallPrompt}
        onCancelSignal={cancelCallSignal}
        onReviewAnswers={() => {
          emit("guest", "navigation_performed", "Returned to review from call-finalization screen", "review");
          goToReview();
        }}
        onOpenQuestionFromCall={() => setSheet("question")}
        onEmit={emit}
        isPrototype={isPrototype}
      />
      </div>

      {/* ---- Bottom sheets ---- */}
      {sheet !== "none" && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/40" onClick={() => setSheet("none")}>
          <div
            className="max-h-[75%] overflow-y-auto rounded-t-3xl bg-white p-5"
            style={{ color: NAVY }}
            onClick={(event) => event.stopPropagation()}
          >
            {sheet === "options" && (
              <OptionsSheet contextual={optionActions.contextual} always={optionActions.always} onClose={() => setSheet("none")} />
            )}
            {sheet === "question" && (
              <QuestionSheet
                questionText={questionText}
                setQuestionText={setQuestionText}
                answer={questionAnswer}
                pending={questionPending}
                onAsk={askQuestion}
                onClose={() => {
                  setQuestionAnswer(null);
                  setSheet("none");
                }}
              />
            )}
            {sheet === "progress" && <ProgressSheet tasks={tasks} draft={draft} onClose={() => setSheet("none")} />}
            {sheet === "privacy" && <PrivacySheet isPrototype={isPrototype} onClose={() => setSheet("none")} />}
            {sheet === "pause_confirm" && (
              <PauseConfirmSheet
                saveable={currentWorkingIsSaveable()}
                onPause={pause}
                onClose={() => setSheet("none")}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Screens
// ============================================================================

interface FlowContentProps {
  screen: Screen;
  deal: BookingAssistantDealContext;
  draft: MockDraft;
  tasks: TaskDef[];
  currentTask?: TaskDef;
  confirmedCount: number;
  completionPct: number;
  working: WorkingState;
  setWorking: React.Dispatch<React.SetStateAction<WorkingState>>;
  taskError: string;
  submitting: boolean;
  savedFlash: boolean;
  emailConfirmed: boolean;
  voiceMode: boolean;
  voiceState: "idle" | "listening" | "heard";
  heardText: string;
  reminderDate: string;
  onStart: () => void;
  onContinue: () => void;
  onBackStep: () => void;
  onDefer: () => void;
  onOpenOptions: () => void;
  onOpenQuestion: () => void;
  onOpenPause: () => void;
  onSubmitReview: () => void;
  onRestart: () => void;
  onEditFromReview: (taskId: string) => void;
  onResume: () => void;
  onBackFromHelp: () => void;
  onStartVoice: () => void;
  setDraft: React.Dispatch<React.SetStateAction<MockDraft>>;
  fallbackKey: string;
  callSignal: CallSignal | null;
  onLaunchCall: () => void;
  noAgentsMode: boolean;
  onRequestCallback: (input: {
    preference: "as_soon_as_available" | "preferred_window";
    windowStartIso?: string;
    windowEndIso?: string;
    timeZone: string;
  }) => Promise<{ resumeEmailAccepted: boolean; operatorAlertAccepted: boolean }>;
  onNoAgentsTryLater: () => Promise<boolean>;
  onCallLater: () => void;
  callLaterNotice: boolean;
  desktopCallPrompt: string | null;
  onCancelSignal: () => void;
  onReviewAnswers: () => void;
  onOpenQuestionFromCall: () => void;
  onEmit: (actor: MockJournalEvent["actor"], eventType: string, detail: string, taskId?: string) => void;
  isPrototype: boolean;
}

function FlowContent(props: FlowContentProps) {
  const { screen } = props;
  if (screen === "landing") return <LandingScreen deal={props.deal} onStart={props.onStart} />;
  if (screen === "paused") return <PausedScreen draft={props.draft} tasks={props.tasks} completionPct={props.completionPct} reminderDate={props.reminderDate} onResume={props.onResume} />;
  if (screen === "help") return <HelpScreen onBack={props.onBackFromHelp} isPrototype={props.isPrototype} />;
  if (screen === "call_finalize")
    return (
        <CallFinalizeScreen
          draft={props.draft}
          fallbackKey={props.fallbackKey}
        callSignal={props.callSignal}
        onLaunchCall={props.onLaunchCall}
        noAgentsMode={props.noAgentsMode}
        onRequestCallback={props.onRequestCallback}
        onNoAgentsTryLater={props.onNoAgentsTryLater}
        onCallLater={props.onCallLater}
        callLaterNotice={props.callLaterNotice}
        desktopCallPrompt={props.desktopCallPrompt}
        onCancelSignal={props.onCancelSignal}
        onReviewAnswers={props.onReviewAnswers}
        onOpenOptions={props.onOpenOptions}
          onOpenQuestion={props.onOpenQuestionFromCall}
          onEmit={props.onEmit}
          isPrototype={props.isPrototype}
        />
    );
  return <TaskScreen {...props} />;
}

function GuestButton({
  children,
  onClick,
  primary,
  disabled,
  small,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-lg font-semibold uppercase tracking-[0.05em] transition-opacity disabled:opacity-40"
      style={{
        minHeight: small ? 44 : 56,
        fontSize: small ? 13 : 15,
        background: primary ? NAVY : "#FFFFFF",
        color: primary ? CREAM : NAVY,
        border: primary ? "1px solid transparent" : `1px solid ${BORDER}`,
      }}
    >
      {children}
    </button>
  );
}

function LandingScreen({ deal, onStart }: { deal: BookingAssistantDealContext; onStart: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-5" style={{ color: NAVY }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
        Curated Deal
      </p>
      <h2 className="mt-2 text-2xl font-bold leading-tight">{deal.title}</h2>
      <div className="mt-4 rounded-xl bg-white p-4" style={{ border: `1px solid ${BORDER}` }}>
        <p className="text-sm font-semibold">{deal.line} - {deal.ship}</p>
        <p className="mt-1 text-sm" style={{ color: MUTED }}>
          {deal.nights} nights - {deal.itinerary}
        </p>
        <p className="text-sm" style={{ color: MUTED }}>{deal.departure} - {deal.sailDateLabel}</p>
        <p className="mt-2 text-sm font-semibold">{deal.priceBasis}</p>
        <p className="text-[11px]" style={{ color: MUTED }}>
          Final price and availability are confirmed with you before payment.
        </p>
      </div>
      <div className="mt-auto pt-6">
        <p className="mb-3 text-[12px] leading-5" style={{ color: MUTED }}>
          We save your confirmed answers and this conversation to complete your booking and support
          you. No payment details are ever collected here.
        </p>
        <GuestButton primary onClick={onStart}>
          Start booking
        </GuestButton>
        <p className="mt-3 text-center text-[11px]" style={{ color: MUTED }}>
          Takes about 5 minutes. Pause anytime - we keep your place.
        </p>
      </div>
    </div>
  );
}

function TaskScreen(props: FlowContentProps) {
  const {
    deal, draft, tasks, currentTask, confirmedCount, working, setWorking, taskError, submitting, savedFlash,
    emailConfirmed, voiceMode, voiceState, heardText, onContinue, onBackStep, onDefer, onOpenOptions,
    onOpenQuestion, onOpenPause, onSubmitReview, onRestart, onEditFromReview, onStartVoice, setDraft,
  } = props;

  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (taskError) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [taskError]);

  if (!currentTask) return null;
  const isReview = currentTask.id === "review";
  const sectionRemaining = tasks.filter(
    (task) => task.section === currentTask.section && !draft.confirmedTasks.includes(task.id)
  ).length;
  const supportsVoice = voiceValueForTask(currentTask.id) !== null;
  const currentTaskIndex = tasks.findIndex((task) => task.id === currentTask.id);
  const canGoBack = currentTaskIndex > 0;

  return (
    <div className="flex h-full flex-col" style={{ color: NAVY }}>
      {/* Sticky header */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: BORDER, background: "#FFFFFF" }}>
        <div className="flex min-w-0 items-center gap-3">
          {canGoBack && (
            <button
              type="button"
              onClick={onBackStep}
              className="shrink-0 rounded-lg px-3 py-2 text-[12px] font-bold"
              style={{ border: `1px solid ${BORDER}`, background: "#FFFFFF", minHeight: 44 }}
              aria-label="Go back to the previous booking step"
            >
              &larr; Back
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-[12px] font-bold">{deal.title}</p>
            <p className="text-[10px]" style={{ color: MUTED }}>
              {deal.ship} - {deal.sailDateLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{
              background: savedFlash ? "#047857" : "#EEF2F1",
              color: savedFlash ? "#FFFFFF" : MUTED,
              transition: "background 300ms",
            }}
          >
            {savedFlash ? "Saved just now" : confirmedCount > 0 ? "Saved" : "Secure"}
          </span>
          <button
            type="button"
            onClick={onOpenOptions}
            className="rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ border: `1px solid ${BORDER}`, background: "#FFFFFF" }}
          >
            Help
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="px-5 pt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
          {currentTask.section}
          {!isReview && sectionRemaining > 0 ? ` - ${sectionRemaining} item${sectionRemaining === 1 ? "" : "s"} left` : ""}
        </p>
      </div>

      {/* Task card */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 pt-2">
        <h2 className="text-[21px] font-bold leading-snug">{currentTask.title}</h2>
        {currentTask.helper && (
          <p className="mt-1.5 text-[13px] leading-5" style={{ color: MUTED }}>
            {currentTask.helper}
          </p>
        )}

        {voiceMode && supportsVoice && !isReview && (
          <div className="mt-3 rounded-xl bg-white p-3 text-center" style={{ border: `1px solid ${BORDER}` }}>
            {voiceState === "listening" ? (
              <p className="text-[13px] font-semibold" style={{ color: GOLD }}>
                Listening... speak now (simulated)
              </p>
            ) : voiceState === "heard" ? (
              <p className="text-[12px]" style={{ color: MUTED }}>
                Heard: "{heardText}" - check the box below, edit if needed, then Continue.
              </p>
            ) : (
              <button
                type="button"
                onClick={onStartVoice}
                className="mx-auto rounded-full px-5 py-2.5 text-[13px] font-bold text-white"
                style={{ background: NAVY, minHeight: 44 }}
              >
                Tap to speak
              </button>
            )}
          </div>
        )}

        <div className="mt-4">
          {isReview ? (
            <ReviewCard draft={draft} onEdit={onEditFromReview} setDraft={setDraft} />
          ) : (
            <TaskInputs taskId={currentTask.id} draft={draft} working={working} setWorking={setWorking} />
          )}
        </div>

        {taskError && (
          <div ref={errorRef} className="mt-3 rounded-lg bg-[#FDECEA] px-3 py-2 text-[13px] font-medium text-[#B3261E]">
            <p>{taskError}</p>
            {isReview && (
              <button
                type="button"
                onClick={onRestart}
                className="mt-2 rounded-lg bg-white px-3 py-2 text-[12px] font-bold"
                style={{ border: "1px solid #B3261E", color: "#B3261E", minHeight: 40 }}
              >
                Restart this booking
              </button>
            )}
          </div>
        )}

        {currentTask.deferrable && !isReview && (
          <button type="button" onClick={onDefer} className="mt-4 text-[13px] font-semibold underline" style={{ color: MUTED }}>
            I don't have this yet
          </button>
        )}
      </div>

      {/* Ask-a-question, visually separate from the task */}
      <div className="px-5 pb-2">
        <button type="button" onClick={onOpenQuestion} className="text-[13px] font-semibold underline" style={{ color: GOLD }}>
          Ask a question
        </button>
      </div>

      {/* Sticky bottom actions */}
      <div className="border-t bg-white px-4 pb-5 pt-3" style={{ borderColor: BORDER }}>
        <GuestButton primary onClick={isReview ? onSubmitReview : onContinue} disabled={isReview && submitting}>
          {isReview ? (
            submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden
                />
                Preparing your booking…
              </span>
            ) : (
              "Looks right - prepare my booking"
            )
          ) : (
            "Continue"
          )}
        </GuestButton>
        {isReview && submitting && (
          <p className="mt-2 text-center text-[12px]" style={{ color: MUTED }} aria-live="polite">
            Saving your answers and getting an agent ready. This takes a few seconds - no need to tap again.
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          {emailConfirmed && (
            <button
              type="button"
              onClick={onOpenPause}
              disabled={isReview && submitting}
              className="flex-1 rounded-lg py-2.5 text-[12px] font-semibold transition-opacity disabled:opacity-40"
              style={{ border: `1px solid ${BORDER}`, color: MUTED, minHeight: 44 }}
            >
              Continue later
            </button>
          )}
          <button
            type="button"
            onClick={onOpenOptions}
            disabled={isReview && submitting}
            className="flex-1 rounded-lg py-2.5 text-[12px] font-semibold transition-opacity disabled:opacity-40"
            style={{ border: `1px solid ${BORDER}`, color: MUTED, minHeight: 44 }}
          >
            More options
          </button>
        </div>
        {isReview && (
          <button
            type="button"
            onClick={onRestart}
            disabled={submitting}
            className="mt-2 w-full py-2 text-[12px] font-semibold underline transition-opacity disabled:opacity-40"
            style={{ color: MUTED, minHeight: 40 }}
          >
            Restart this booking
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold" style={{ color: NAVY }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const guestInput: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  background: "#FFFFFF",
  padding: "13px 13px",
  fontSize: 17,
  color: NAVY,
  boxSizing: "border-box",
};

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-4 text-[14px] font-semibold"
      style={{
        minHeight: 48,
        border: `1.5px solid ${active ? NAVY : BORDER}`,
        background: active ? NAVY : "#FFFFFF",
        color: active ? CREAM : NAVY,
      }}
    >
      {label}
    </button>
  );
}

function TaskInputs({
  taskId,
  draft,
  working,
  setWorking,
}: {
  taskId: string;
  draft: MockDraft;
  working: WorkingState;
  setWorking: React.Dispatch<React.SetStateAction<WorkingState>>;
}) {
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setWorking((prev) => ({ ...prev, [key]: event.target.value }));
  const setValue = (key: string, value: string) => setWorking((prev) => ({ ...prev, [key]: value }));

  if (taskId === "first_name") {
    return <input style={guestInput} autoComplete="given-name" placeholder="e.g. Margaret" value={working.firstName ?? ""} onChange={set("firstName")} />;
  }
  if (taskId === "email") {
    return <input style={guestInput} type="email" inputMode="email" autoComplete="email" placeholder="e.g. name@email.com" value={working.email ?? ""} onChange={set("email")} />;
  }
  if (taskId === "phone") {
    return <input style={guestInput} type="tel" inputMode="tel" autoComplete="tel" placeholder="e.g. (555) 201-7744" value={working.phone ?? ""} onChange={set("phone")} />;
  }
  if (taskId === "party_size") {
    return (
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((n) => (
          <Chip key={n} label={String(n)} active={working.travelerCount === String(n)} onClick={() => setValue("travelerCount", String(n))} />
        ))}
      </div>
    );
  }
  if (taskId === "ages") {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: draft.travelerCount }, (_, i) => (
          <Field key={i} label={i === 0 ? `${draft.firstName || "You"} (traveler 1)` : `Traveler ${i + 1}`}>
            <input style={guestInput} inputMode="numeric" placeholder="Age on sailing day" value={working[`age${i}`] ?? ""} onChange={set(`age${i}`)} />
          </Field>
        ))}
      </div>
    );
  }
  if (taskId.startsWith("legal_identity_")) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Title">
            <select style={guestInput} value={working.title ?? ""} onChange={set("title")}>
              <option value="">Select...</option>
              {["Mr", "Mrs", "Ms", "Miss", "Dr"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Gender (as on ID)">
            <select style={guestInput} value={working.gender ?? ""} onChange={set("gender")}>
              <option value="">Select...</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </Field>
        </div>
        <Field label="Legal first name">
          <input style={guestInput} autoComplete="off" value={working.first ?? ""} onChange={set("first")} />
        </Field>
        <Field label="Middle name (optional)">
          <input style={guestInput} autoComplete="off" value={working.middle ?? ""} onChange={set("middle")} />
        </Field>
        <Field label="Legal last name">
          <input style={guestInput} autoComplete="off" value={working.last ?? ""} onChange={set("last")} />
        </Field>
        <Field label="Date of birth">
          <input style={guestInput} type="date" value={working.dob ?? ""} onChange={set("dob")} />
        </Field>
      </div>
    );
  }
  if (taskId === "citizenship_residency") {
    return (
      <div className="flex flex-col gap-3">
        <Field label="Citizenship">
          <select style={guestInput} value={working.citizenship ?? "United States"} onChange={set("citizenship")}>
            <option value="United States">United States</option>
            <option value="Other">Other (routes to an agent in this pilot)</option>
          </select>
        </Field>
        <Field label="Home state">
          <select style={guestInput} value={working.residencyState ?? ""} onChange={set("residencyState")}>
            <option value="">Select...</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
    );
  }
  if (taskId === "savings_eligibility") {
    const ageCandidate = mockMscSeniorCandidate(draft);
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-white p-3 text-[13px] leading-5" style={{ border: `1px solid ${BORDER}`, color: NAVY }}>
          <p className="font-bold">Age-based savings: checked automatically</p>
          <p className="mt-1" style={{ color: MUTED }}>
            {ageCandidate
              ? "This MSC mock flags the cabin as a 65+ candidate. Your agent still has to find and compare the live rate."
              : "We will check the live sailing using every traveler's age. No extra senior question is needed."}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Chip label="Yes" active={working.interest === "yes"} onClick={() => setValue("interest", "yes")} />
          <Chip label="No" active={working.interest === "no"} onClick={() => setValue("interest", "no")} />
          <Chip label="Not sure - ask my agent" active={working.interest === "not_sure"} onClick={() => setValue("interest", "not_sure")} />
        </div>
        {working.interest === "yes" && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] leading-5" style={{ color: MUTED }}>
              Select every traveler who may qualify. Each claim is saved on that traveler&apos;s record.
            </p>
            {draft.travelers.slice(0, draft.travelerCount).map((traveler, travelerIndex) => {
              const enabled = working[`claimEnabled${travelerIndex}`] === "yes";
              return (
                <div
                  key={travelerIndex}
                  className="flex flex-col gap-3 rounded-xl bg-white p-3"
                  style={{ border: `1px solid ${BORDER}` }}
                >
                  <Chip
                    label={`${traveler.firstName || `Traveler ${travelerIndex + 1}`} may qualify`}
                    active={enabled}
                    onClick={() => setValue(`claimEnabled${travelerIndex}`, enabled ? "" : "yes")}
                  />
                  {enabled && (
                    <>
                      <Field label="Closest category">
                        <select
                          style={guestInput}
                          value={working[`claimCategory${travelerIndex}`] ?? ""}
                          onChange={set(`claimCategory${travelerIndex}`)}
                        >
                          <option value="">Select...</option>
                          <option value="Active duty">Active duty</option>
                          <option value="Retired military">Retired military</option>
                          <option value="Veteran or honorably discharged">Veteran or honorably discharged</option>
                          <option value="Reserve or National Guard">Reserve or National Guard</option>
                          <option value="Canadian Armed Forces">Canadian Armed Forces</option>
                          <option value="Government, civil service, or Department of Defense">Government, civil service, or Department of Defense</option>
                          <option value="First responder - police, fire, or EMS">First responder - police, fire, or EMS</option>
                          <option value="Airline or interline personnel">Airline or interline personnel</option>
                          <option value="Eligible family member">Eligible family member</option>
                          <option value="Other or not sure">Other or not sure</option>
                        </select>
                      </Field>
                      <Field label="Could they provide proof later if the cruise line asks?">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <Chip
                            label="Yes, later"
                            active={working[`claimProof${travelerIndex}`] === "available_later"}
                            onClick={() => setValue(`claimProof${travelerIndex}`, "available_later")}
                          />
                          <Chip
                            label="I need help"
                            active={working[`claimProof${travelerIndex}`] === "need_help"}
                            onClick={() => setValue(`claimProof${travelerIndex}`, "need_help")}
                          />
                          <Chip
                            label="Not sure"
                            active={working[`claimProof${travelerIndex}`] === "not_sure"}
                            onClick={() => setValue(`claimProof${travelerIndex}`, "not_sure")}
                          />
                        </div>
                      </Field>
                    </>
                  )}
                </div>
              );
            })}
            <p className="text-[12px] leading-5" style={{ color: MUTED }}>
              Do not upload or type a military ID, service number, or discharge document here. Your agent will explain the exact cruise-line requirement only if a live rate is available.
            </p>
          </div>
        )}
      </div>
    );
  }
  if (taskId === "address") {
    return (
      <div className="flex flex-col gap-3">
        <Field label="Street address">
          <input style={guestInput} autoComplete="street-address" value={working.line1 ?? ""} onChange={set("line1")} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="City">
            <input style={guestInput} value={working.city ?? ""} onChange={set("city")} />
          </Field>
          <Field label="State">
            <select style={guestInput} value={working.state ?? ""} onChange={set("state")}>
              <option value="">Select...</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="ZIP code">
          <input style={guestInput} inputMode="numeric" autoComplete="postal-code" value={working.zip ?? ""} onChange={set("zip")} />
        </Field>
      </div>
    );
  }
  if (taskId === "accessibility") {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Chip label="No special requests" active={working.mode === "none"} onClick={() => setValue("mode", "none")} />
          <Chip label="Yes, a few things" active={working.mode === "some"} onClick={() => setValue("mode", "some")} />
        </div>
        {working.mode === "some" && (
          <textarea
            style={{ ...guestInput, minHeight: 90, fontFamily: "inherit" }}
            placeholder="e.g. wheelchair-accessible cabin, near the elevator"
            value={working.text ?? ""}
            onChange={set("text")}
          />
        )}
      </div>
    );
  }
  if (taskId === "cabin_preference") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {["Interior", "Oceanview", "Balcony", "Suite", "Best value", "Not sure yet"].map((option) => (
          <Chip key={option} label={option} active={working.pref === option} onClick={() => setValue("pref", option)} />
        ))}
      </div>
    );
  }
  if (taskId === "celebration") {
    return (
      <input
        style={guestInput}
        placeholder="e.g. 40th anniversary (or leave blank)"
        value={working.text ?? ""}
        onChange={set("text")}
      />
    );
  }
  if (taskId === "insurance_interest") {
    return (
      <div className="flex flex-col gap-2">
        {["Yes, tell me about it", "No thanks", "Discuss with my agent"].map((option) => (
          <Chip key={option} label={option} active={working.choice === option} onClick={() => setValue("choice", option)} />
        ))}
      </div>
    );
  }
  return null;
}

function ReviewCard({
  draft,
  onEdit,
  setDraft,
}: {
  draft: MockDraft;
  onEdit: (taskId: string) => void;
  setDraft: React.Dispatch<React.SetStateAction<MockDraft>>;
}) {
  const savingsSummary = `${mockMscSeniorCandidate(draft) ? "MSC 65+ cabin candidate - live rate required" : "Age-based rates checked live"}; ${serviceRateSummary(draft)}`;
  const row = (label: string, value: string, taskId: string) => (
    <div key={taskId} className="flex items-start justify-between gap-3 border-b py-2.5 last:border-b-0" style={{ borderColor: BORDER }}>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: MUTED }}>{label}</p>
        <p className="text-[14px] font-medium" style={{ color: NAVY }}>{value || "-"}</p>
      </div>
      <button type="button" onClick={() => onEdit(taskId)} className="shrink-0 text-[12px] font-bold underline" style={{ color: GOLD, minHeight: 44 }}>
        Edit
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-white px-4 py-1" style={{ border: `1px solid ${BORDER}` }}>
        {row("Name", draft.firstName, "first_name")}
        {row("Email", draft.email, "email")}
        {row("Mobile", draft.phone, "phone")}
        {row("Travelers", `${draft.travelerCount} adult(s), 1 cabin`, "party_size")}
        {draft.travelers.map((traveler, i) =>
          row(
            `Traveler ${i + 1}`,
            `${traveler.title} ${traveler.firstName} ${traveler.middleName} ${traveler.lastName}`.split(" ").filter(Boolean).join(" ") +
              (traveler.dob ? `, born ${traveler.dob}` : ""),
            `legal_identity_${i}`
          )
        )}
        {row("Citizenship / state", `${draft.citizenship} / ${draft.residencyState}`, "citizenship_residency")}
        {row("Savings check", savingsSummary, "savings_eligibility")}
        {row("Address", [draft.addressLine1, draft.addressCity, draft.addressState, draft.addressZip].filter(Boolean).join(", "), "address")}
        {row("Accessibility", draft.accessibility === "none" ? "No special requests" : draft.accessibility, "accessibility")}
        {row("Cabin preference", draft.cabinPreference, "cabin_preference")}
        {row("Celebration", draft.celebrationDeferred ? "Skipped for now" : draft.celebration || "None", "celebration")}
        {row("Insurance", draft.insuranceInterest, "insurance_interest")}
      </div>

      <label className="flex items-start gap-3 rounded-xl bg-white p-4" style={{ border: `1px solid ${BORDER}` }}>
        <input
          type="checkbox"
          checked={draft.accuracyAcknowledged}
          onChange={(event) => setDraft((prev) => ({ ...prev, accuracyAcknowledged: event.target.checked }))}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        <span className="text-[13px] leading-5" style={{ color: NAVY }}>
          I confirm this information is accurate, including details I provided for other travelers,
          and I authorize a booking agent to prepare my booking. Price, exact cabin, and any extras
          will still be confirmed with me before payment.
        </span>
      </label>
    </div>
  );
}

function PausedScreen({
  draft,
  tasks,
  completionPct,
  reminderDate,
  onResume,
}: {
  draft: MockDraft;
  tasks: TaskDef[];
  completionPct: number;
  reminderDate: string;
  onResume: () => void;
}) {
  const nextDef = tasks.find((task) => task.id === (draft.resumeTaskId ?? nextTaskId(draft)));
  return (
    <div className="flex h-full flex-col overflow-y-auto p-6" style={{ color: NAVY }}>
      <div className="my-auto text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>Saved for later</p>
        <h2 className="mt-2 text-2xl font-bold">You're {completionPct}% done</h2>
        <p className="mt-3 text-[14px] leading-6" style={{ color: MUTED }}>
          Everything you confirmed is saved. We emailed {draft.email || "you"} a secure link, and
          we'll remind you on {reminderDate} if you haven't returned.
        </p>
        {nextDef && (
          <p className="mt-3 rounded-xl bg-white px-4 py-3 text-[13px]" style={{ border: `1px solid ${BORDER}` }}>
            Next up: <span className="font-bold">{nextDef.title}</span>
          </p>
        )}
        <p className="mt-3 text-[12px]" style={{ color: MUTED }}>
          Prices and cabins aren't held - we recheck everything live when you're ready.
        </p>
        <div className="mt-6">
          <GuestButton primary onClick={onResume}>Continue now</GuestButton>
        </div>
        <div className="mt-3 flex justify-center gap-5 text-[12px]">
          <button type="button" className="underline" style={{ color: MUTED }}>Change email reminders</button>
          <button type="button" className="underline" style={{ color: MUTED }}>Stop reminders</button>
        </div>
      </div>
    </div>
  );
}

function HelpScreen({
  onBack,
  isPrototype,
}: {
  onBack: () => void;
  isPrototype: boolean;
}) {
  return (
    <div className="flex h-full flex-col p-6" style={{ color: NAVY }}>
      <div className="my-auto text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>Help is on the way</p>
        <h2 className="mt-2 text-2xl font-bold">An agent has been alerted</h2>
        <p className="mt-3 text-[14px] leading-6" style={{ color: MUTED }}>
          {isPrototype ? "(Simulated.) " : ""}
          {isPrototype ? "A real agent would see" : "An agent can now see"} everything you've entered so far, so you never have to repeat yourself.
          During business hours, expect a call within minutes.
        </p>
        <div className="mt-6">
          <GuestButton onClick={onBack} small>Keep filling things in while I wait</GuestButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Format a phone number for *display* only. The raw value (kept in the tel:
 * href) must stay E.164 like "+19042573134" so the dial works reliably across
 * devices/carriers; this just makes it readable, e.g. "+1 (904) 257-3134".
 * US/NANP 11-digit "+1" numbers get the familiar grouping; anything else is
 * returned unchanged so we never mangle an international number. No regex here
 * per this file's policy - we walk the characters by hand.
 */
function formatAgentPhoneForDisplay(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = "";
  for (const ch of trimmed) {
    if (ch >= "0" && ch <= "9") digits += ch;
  }
  // NANP: a leading "1" country code + 10 national digits.
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7, 11);
    return `+1 (${area}) ${prefix}-${line}`;
  }
  // Bare 10-digit US number (no country code).
  if (digits.length === 10 && !hasPlus) {
    const area = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    const line = digits.slice(6, 10);
    return `(${area}) ${prefix}-${line}`;
  }
  // Unknown shape (international, short code, etc.): leave it exactly as given.
  return trimmed;
}

/**
 * Section 29.1 call-agent-to-finalize screen. The end goal: the guest's packet
 * is saved, and one primary action alerts the agent + hands off to a phone
 * call. The three-letter key is a de-emphasized fallback, not the main path.
 */
function CallFinalizeScreen({
  draft,
  fallbackKey,
  callSignal,
  onLaunchCall,
  noAgentsMode,
  onRequestCallback,
  onNoAgentsTryLater,
  onCallLater,
  callLaterNotice,
  desktopCallPrompt,
  onCancelSignal,
  onReviewAnswers,
  onOpenOptions,
  onOpenQuestion,
  onEmit,
  isPrototype,
}: {
  draft: MockDraft;
  fallbackKey: string;
  callSignal: CallSignal | null;
  onLaunchCall: () => void;
  noAgentsMode: boolean;
  onRequestCallback: FlowContentProps["onRequestCallback"];
  onNoAgentsTryLater: () => Promise<boolean>;
  onCallLater: () => void;
  callLaterNotice: boolean;
  desktopCallPrompt: string | null;
  onCancelSignal: () => void;
  onReviewAnswers: () => void;
  onOpenOptions: () => void;
  onOpenQuestion: () => void;
  onEmit: (actor: MockJournalEvent["actor"], eventType: string, detail: string, taskId?: string) => void;
  isPrototype: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [callbackChoice, setCallbackChoice] = useState<"as_soon_as_available" | "preferred_window">("as_soon_as_available");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [noAgentsSubmitting, setNoAgentsSubmitting] = useState(false);
  const [noAgentsComplete, setNoAgentsComplete] = useState<"callback" | "later" | null>(null);
  const [noAgentsError, setNoAgentsError] = useState("");
  const [resumeEmailAccepted, setResumeEmailAccepted] = useState(false);
  const [operatorAlertAccepted, setOperatorAlertAccepted] = useState(false);
  const status = draft.status;
  const pending = status === "call_signal_pending";
  const calling = status === "calling_now";
  const processing = status === "agent_processing";
  const confirmed = status === "booking_confirmed";
  const ackFailed = callSignal === null && (pending || calling); // signal expired mid-attempt

  function copyKey() {
    const done = () => {
      setCopied(true);
      onEmit("guest", "fallback_call_key_copied", "Key copied (redacted from payload)");
      window.setTimeout(() => setCopied(false), 1800);
    };
    try {
      navigator.clipboard?.writeText(fallbackKey).then(done, done);
    } catch {
      done();
    }
  }

  function readKeyAloud() {
    onEmit("guest", "fallback_call_key_read_aloud", "Key read aloud (redacted from payload)");
    try {
      const utterance = new SpeechSynthesisUtterance(fallbackKey.split("").join("-"));
      window.speechSynthesis?.speak(utterance);
    } catch {
      // Speech unavailable: the visible key text is the fallback.
    }
  }

  async function submitCallbackRequest() {
    let windowStartIso: string | undefined;
    let windowEndIso: string | undefined;
    if (callbackChoice === "preferred_window") {
      const start = Date.parse(windowStart);
      const end = Date.parse(windowEnd);
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        setNoAgentsError("Please choose both a callback start and end time.");
        return;
      }
      if (start <= Date.now()) {
        setNoAgentsError("Please choose a callback window in the future.");
        return;
      }
      if (end <= start) {
        setNoAgentsError("Please choose an end time after the start time.");
        return;
      }
      windowStartIso = new Date(start).toISOString();
      windowEndIso = new Date(end).toISOString();
    }
    setNoAgentsSubmitting(true);
    setNoAgentsError("");
    try {
      const accepted = await onRequestCallback({
        preference: callbackChoice,
        windowStartIso,
        windowEndIso,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      });
      setResumeEmailAccepted(accepted.resumeEmailAccepted);
      setOperatorAlertAccepted(accepted.operatorAlertAccepted);
      setNoAgentsComplete("callback");
    } catch (error) {
      setNoAgentsError(error instanceof Error ? error.message : "We could not save the callback request");
    } finally {
      setNoAgentsSubmitting(false);
    }
  }

  async function submitTryLater() {
    setNoAgentsSubmitting(true);
    setNoAgentsError("");
    try {
      const accepted = await onNoAgentsTryLater();
      setResumeEmailAccepted(accepted);
      setNoAgentsComplete("later");
    } catch (error) {
      setNoAgentsError(error instanceof Error ? error.message : "We could not send the resume email");
    } finally {
      setNoAgentsSubmitting(false);
    }
  }

  // Post-verification states get a distinct, calmer confirmation surface.
  if (processing || confirmed) {
    return (
      <div className="flex h-full flex-col overflow-y-auto p-6" style={{ color: NAVY }}>
        <div className="my-auto">
          <p className="text-center text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: confirmed ? "#047857" : GOLD }}>
            {confirmed ? "Booking confirmed" : "Your agent is on the line"}
          </p>
          <h2 className="mt-2 text-center text-2xl font-bold">
            {confirmed ? `You're booked, ${draft.firstName || "friend"}!` : "Finalizing with your agent"}
          </h2>
          <div className="mt-5 rounded-xl bg-white p-4 text-[13px] leading-6" style={{ border: `1px solid ${BORDER}`, color: MUTED }}>
            <p className="font-bold" style={{ color: NAVY }}>{confirmed ? "What happened:" : "Happening now with your agent:"}</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>Your agent opened a fresh cruise session and rechecked live price, cabins, and any qualifying rates.</li>
              <li>They reviewed the final choices and terms with you.</li>
              <li>Payment was taken by phone through the cruise line's official system - we never see your card.</li>
            </ol>
          </div>
          {confirmed && (
            <p className="mt-5 text-center text-[13px] font-semibold" style={{ color: "#047857" }}>
              A confirmation email is on its way.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (noAgentsMode) {
    return (
      <div className="flex h-full flex-col overflow-y-auto p-5" style={{ color: NAVY }}>
        <div className="my-auto">
          <p className="text-center text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
            Information saved
          </p>
          <h2 className="mt-2 text-center text-[24px] font-bold">
            No agents currently available
          </h2>
          {noAgentsComplete ? (
            <div className="mt-5 rounded-xl bg-white p-4 text-[13px] leading-6" style={{ border: `1px solid ${BORDER}` }}>
              <p className="font-bold">
                {noAgentsComplete === "callback" ? "Your callback request is saved." : "Your information is saved."}
              </p>
              <p className="mt-2" style={{ color: MUTED }}>
                {noAgentsComplete === "callback"
                  ? `${operatorAlertAccepted ? "We have alerted the booking team." : "Your request is in the booking team's callback queue."} An agent will call as close to your requested time as possible. ${resumeEmailAccepted ? "We sent a secure resume link to your email." : "Your request is saved; the resume email may be delayed."}`
                  : `${resumeEmailAccepted ? "We emailed you a secure link." : "Your progress is saved; the resume email may be delayed."} Use it whenever you are ready to return - you will not need to complete this form again.`}
              </p>
            </div>
          ) : (
            <>
              <p className="mt-3 text-center text-[13px] leading-5" style={{ color: MUTED }}>
                Your information is safely saved. Ask an agent to call when available, or return later without completing this form again.
              </p>
              <div className="mt-5 rounded-xl bg-white p-4" style={{ border: `1px solid ${BORDER}` }}>
                <p className="text-[13px] font-bold">When is a good time to call?</p>
                <label className="mt-3 flex min-h-11 items-center gap-3 text-[13px]">
                  <input
                    type="radio"
                    checked={callbackChoice === "as_soon_as_available"}
                    onChange={() => {
                      setCallbackChoice("as_soon_as_available");
                      setNoAgentsError("");
                    }}
                  />
                  As soon as an agent is available
                </label>
                <label className="mt-2 flex min-h-11 items-center gap-3 text-[13px]">
                  <input
                    type="radio"
                    checked={callbackChoice === "preferred_window"}
                    onChange={() => {
                      setCallbackChoice("preferred_window");
                      setNoAgentsError("");
                    }}
                  />
                  Choose a date and time window
                </label>
                {callbackChoice === "preferred_window" && (
                  <div className="mt-3 grid gap-3">
                    <label className="text-[12px] font-semibold">
                      Window starts
                      <input
                        type="datetime-local"
                        value={windowStart}
                        onChange={(event) => {
                          setWindowStart(event.target.value);
                          setNoAgentsError("");
                        }}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        style={{ borderColor: BORDER, backgroundColor: "#FFFFFF", color: NAVY, colorScheme: "light" }}
                      />
                    </label>
                    <label className="text-[12px] font-semibold">
                      Window ends
                      <input
                        type="datetime-local"
                        value={windowEnd}
                        onChange={(event) => {
                          setWindowEnd(event.target.value);
                          setNoAgentsError("");
                        }}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        style={{ borderColor: BORDER, backgroundColor: "#FFFFFF", color: NAVY, colorScheme: "light" }}
                      />
                    </label>
                  </div>
                )}
                <p className="mt-2 text-[11px]" style={{ color: MUTED }}>
                  Times use {Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone"}. We will call as close to the requested window as possible.
                </p>
              </div>
              <div className="mt-4">
                {noAgentsError && (
                  <p className="mb-2 rounded-lg bg-red-50 p-2 text-[12px] text-red-700">{noAgentsError}</p>
                )}
                <GuestButton primary onClick={() => void submitCallbackRequest()} disabled={noAgentsSubmitting}>
                  {noAgentsSubmitting ? "Saving..." : "Have an agent call me"}
                </GuestButton>
              </div>
              <button
                type="button"
                onClick={() => void submitTryLater()}
                disabled={noAgentsSubmitting}
                className="mt-3 min-h-11 w-full rounded-xl border px-4 py-2 text-[13px] font-bold"
                style={{ borderColor: BORDER }}
              >
                I&apos;ll try again later
              </button>
            </>
          )}
          <div className="mt-4 rounded-xl border border-dashed p-3 text-center" style={{ borderColor: BORDER }}>
            <p className="text-[11px]" style={{ color: MUTED }}>Your three-letter call key remains</p>
            <p className="mt-1 text-2xl font-bold tracking-[0.3em]">{fallbackKey}</p>
          </div>
          <p className="mt-4 text-center text-[11px]" style={{ color: MUTED }}>
            Nothing is booked, held, or charged. Price and availability will be rechecked when you speak with an agent.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5" style={{ color: NAVY }}>
      <div className="my-auto">
        {!pending && !calling && (
          <button
            type="button"
            onClick={onReviewAnswers}
            className="mb-4 rounded-lg px-3 py-2 text-[12px] font-bold"
            style={{ border: `1px solid ${BORDER}`, background: "#FFFFFF", minHeight: 44 }}
          >
            &larr; Review or change answers
          </button>
        )}
        <p className="text-center text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
          Information saved
        </p>
        <h2 className="mt-2 text-center text-[22px] font-bold leading-snug">
          Your information is saved. Call your booking agent to finalize.
        </h2>

        {/* Disclosure immediately above the primary button (29.1.5). */}
        <div className="mt-4 rounded-xl bg-white p-4 text-[12px] leading-5" style={{ border: `1px solid ${BORDER}`, color: MUTED }}>
          When you tap the button, we will alert your agent and place your saved information at the
          top of the agent&apos;s booking screen before your phone starts the call. The agent will
          verify who you are, start a new live cruise-booking session, recheck the current price,
          cabin availability, and any discounts, enter your information, review the final choices and
          terms with you, take your payment by phone, and complete the booking. If the agent
          cannot see your information automatically, give the agent your three-letter call key.
          Nothing is booked, held, or charged yet, and price or availability may change before the
          agent completes the booking.
        </div>

        {/* Pending / calling status banner. Includes an always-available
            escape hatch (not gated on the auto-expiry timer) so a guest who
            returns to a stuck signal - the call never connected, or they just
            left mid-attempt - is never trapped on a disabled button. */}
        {(pending || calling || ackFailed) && (
          <div
            className="mt-3 rounded-xl px-4 py-3 text-[13px] font-semibold"
            style={
              ackFailed
                ? { background: "#FDECEA", color: "#B3261E" }
                : calling
                  ? { background: "#E7F3EC", color: "#047857" }
                  : { background: "#FBF3E4", color: GOLD }
            }
          >
            <p>
              {ackFailed
                ? "We could not alert your agent yet."
                : calling
                  ? "Your agent has your information. Starting the call..."
                  : "Alerting your agent... placing your information on their screen."}
            </p>
            {(pending || calling) && (
              <>
                <p className="mt-1 text-[12px] font-normal">
                  Didn&apos;t connect, or this is from an earlier visit? You can cancel and try again any time.
                </p>
                <button
                  type="button"
                  onClick={onCancelSignal}
                  className="mt-1.5 font-bold underline"
                  style={{ minHeight: 32 }}
                >
                  Cancel and go back
                </button>
              </>
            )}
          </div>
        )}

        {/* Desktop guests can't place a tel: call. The agent has still been
            signaled (same flow/rules); this asks the guest to dial the number
            on their phone. Shown only after a successful non-no_agents signal. */}
        {desktopCallPrompt && (
          <div
            className="mt-4 rounded-xl px-4 py-3 text-center"
            style={{ background: "#E7F3EC", border: `1px solid ${BORDER}` }}
          >
            <p className="text-[13px] font-bold" style={{ color: "#047857" }}>
              Your agent has your information. Call to finish on your phone:
            </p>
            <a
              href={`tel:${desktopCallPrompt}`}
              className="mt-1 block text-2xl font-bold tracking-wide"
              style={{ color: NAVY }}
            >
              {formatAgentPhoneForDisplay(desktopCallPrompt)}
            </a>
            <button
              type="button"
              onClick={() => {
                try {
                  navigator.clipboard?.writeText(desktopCallPrompt);
                  onEmit("guest", "agent_number_copied", "Guest copied the agent number on desktop");
                } catch {
                  // Clipboard unavailable: the visible number is the fallback.
                }
              }}
              className="mt-2 rounded-lg px-3 py-2 text-[12px] font-semibold"
              style={{ border: `1px solid ${BORDER}`, color: NAVY, minHeight: 40 }}
            >
              Copy number
            </button>
            <p className="mt-2 text-[11px]" style={{ color: MUTED }}>
              Nothing is booked, held, or charged yet. Your three-letter key is below if the agent needs it.
            </p>
          </div>
        )}

        <div className="mt-4">
          <GuestButton primary onClick={onLaunchCall} disabled={pending || calling}>
            {ackFailed ? "Try again" : pending ? "Alerting your agent..." : calling ? "Calling now..." : desktopCallPrompt ? "Alert agent again" : "Call agent to finalize"}
          </GuestButton>
        </div>
        <p className="mt-2 text-center text-[11px]" style={{ color: MUTED }}>
          We will place your saved information on your agent&apos;s screen before the call starts.
          {isPrototype ? " (Prototype: the call is simulated, not dialed.)" : ""}
        </p>

        {/* De-emphasized fallback key card (29.1.4). */}
        <div className="mt-4 rounded-xl border border-dashed p-3 text-center" style={{ borderColor: BORDER }}>
          <p className="text-[11px]" style={{ color: MUTED }}>
            If needed, your three-letter call key is
          </p>
          <p className="mt-1 text-2xl font-bold tracking-[0.3em]" style={{ color: NAVY }}>{fallbackKey}</p>
          <p className="mt-1 text-[10px]" style={{ color: MUTED }}>
            Not a booking, confirmation, or payment number - just helps your agent find you.
          </p>
          <div className="mt-2 flex justify-center gap-2">
            <button
              type="button"
              onClick={copyKey}
              className="rounded-lg px-3 py-2 text-[12px] font-semibold"
              style={{ border: `1px solid ${BORDER}`, color: NAVY, minHeight: 40 }}
            >
              {copied ? "Copied!" : "Copy key"}
            </button>
            <button
              type="button"
              onClick={readKeyAloud}
              className="rounded-lg px-3 py-2 text-[12px] font-semibold"
              style={{ border: `1px solid ${BORDER}`, color: NAVY, minHeight: 40 }}
            >
              Read key aloud
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-5 text-[12px]">
          <button type="button" onClick={onCallLater} className="font-semibold underline" style={{ color: MUTED }}>
            Call later
          </button>
          <button type="button" onClick={onOpenQuestion} className="font-semibold underline" style={{ color: GOLD }}>
            Ask a question
          </button>
          <button type="button" onClick={onOpenOptions} className="font-semibold underline" style={{ color: MUTED }}>
            More options
          </button>
        </div>
        {callLaterNotice && (
          <div className="mt-3 rounded-xl bg-white px-4 py-3 text-center text-[12px] leading-5" style={{ border: `1px solid ${BORDER}`, color: MUTED }}>
            You&apos;re all set to return later. Your information stays saved, your three-letter key stays the same, and you can use the secure email link or come back here whenever you&apos;re ready to call.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sheets
// ============================================================================

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: GOLD }}>{title}</p>
      <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-[12px] font-bold" style={{ border: `1px solid ${BORDER}`, minHeight: 40 }}>
        Close
      </button>
    </div>
  );
}

function OptionsSheet({
  contextual,
  always,
  onClose,
}: {
  contextual: Array<{ label: string; hint: string; run: () => void }>;
  always: Array<{ label: string; hint: string; run: () => void }>;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? [...contextual, ...always] : contextual.length > 0 ? contextual : always.slice(0, 4);
  return (
    <div>
      <SheetHeader title="More options" onClose={onClose} />
      <div className="flex flex-col gap-2">
        {rows.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.run}
            className="rounded-xl bg-white px-4 py-3 text-left"
            style={{ border: `1px solid ${BORDER}`, minHeight: 56 }}
          >
            <p className="text-[14px] font-bold" style={{ color: NAVY }}>{action.label}</p>
            <p className="text-[12px]" style={{ color: MUTED }}>{action.hint}</p>
          </button>
        ))}
      </div>
      {!showAll && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-3 w-full text-center text-[13px] font-semibold underline" style={{ color: MUTED, minHeight: 44 }}>
          View all available help
        </button>
      )}
    </div>
  );
}

function QuestionSheet({
  questionText,
  setQuestionText,
  answer,
  pending,
  onAsk,
  onClose,
}: {
  questionText: string;
  setQuestionText: (value: string) => void;
  answer: { q: string; a: string } | null;
  pending: boolean;
  onAsk: (picked?: { q: string; a: string }) => void;
  onClose: () => void;
}) {
  const canSubmit = questionText.trim().length > 0 && !pending;
  return (
    <div>
      <SheetHeader title="Ask a question" onClose={onClose} />
      <p className="mb-3 text-[12px]" style={{ color: MUTED }}>
        Your place in the booking is saved - closing this brings you right back.
      </p>
      {answer && (
        <div className="mb-3 rounded-xl bg-[#F5EFE6] p-3">
          <p className="text-[12px] font-bold" style={{ color: NAVY }}>{answer.q}</p>
          {pending && !answer.a ? (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] leading-5" style={{ color: MUTED }}>
              <span
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
              Thinking…
            </p>
          ) : (
            <p className="mt-1 text-[13px] leading-5" style={{ color: MUTED }}>{answer.a}</p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {SIDE_QUESTIONS.map((entry) => (
          <button
            key={entry.q}
            type="button"
            onClick={() => onAsk(entry)}
            disabled={pending}
            className="rounded-lg bg-white px-3 py-2.5 text-left text-[13px] font-medium disabled:opacity-50"
            style={{ border: `1px solid ${BORDER}`, color: NAVY, minHeight: 44 }}
          >
            {entry.q}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          style={{ ...guestInput, fontSize: 14 }}
          placeholder="Or type your own..."
          value={questionText}
          disabled={pending}
          onChange={(event) => setQuestionText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSubmit) onAsk();
          }}
        />
        <button
          type="button"
          onClick={() => onAsk()}
          disabled={!canSubmit}
          className="shrink-0 rounded-lg px-4 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: NAVY, minHeight: 48 }}
        >
          {pending ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}

function ProgressSheet({ tasks, draft, onClose }: { tasks: TaskDef[]; draft: MockDraft; onClose: () => void }) {
  const sections = Array.from(new Set(tasks.map((task) => task.section)));
  return (
    <div>
      <SheetHeader title="Your progress" onClose={onClose} />
      <div className="flex flex-col gap-3">
        {sections.map((section) => {
          const sectionTasks = tasks.filter((task) => task.section === section);
          const done = sectionTasks.filter((task) => draft.confirmedTasks.includes(task.id)).length;
          return (
            <div key={section} className="rounded-xl bg-white p-3" style={{ border: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold" style={{ color: NAVY }}>{section}</p>
                <p className="text-[12px] font-semibold" style={{ color: done === sectionTasks.length ? "#047857" : MUTED }}>
                  {done}/{sectionTasks.length}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrivacySheet({ onClose, isPrototype }: { onClose: () => void; isPrototype: boolean }) {
  return (
    <div>
      <SheetHeader title="Privacy & data use" onClose={onClose} />
      <div className="flex flex-col gap-2 text-[13px] leading-5" style={{ color: MUTED }}>
        <p>We save your confirmed answers so you never have to repeat them, and so an agent can finish your booking with you.</p>
        <p>We never collect or store card numbers - payment happens only in the cruise line's official system.</p>
        <p>You can pause, change reminders, or ask us to delete your saved details at any time.</p>
        {isPrototype && <p className="text-[11px]">(Lab note: this prototype also keeps its scenario state in this browser tab.)</p>}
      </div>
    </div>
  );
}

function PauseConfirmSheet({
  saveable,
  onPause,
  onClose,
}: {
  saveable: boolean;
  onPause: (saveWorking: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div>
      <SheetHeader title="Continue later" onClose={onClose} />
      <p className="text-[13px] leading-5" style={{ color: MUTED }}>
        We'll save everything you've confirmed and email you a secure link. Prices and cabins are
        not held - we recheck them live when you return.
      </p>
      {saveable ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-[13px] font-bold" style={{ color: NAVY }}>Save the answer you just typed too?</p>
          <GuestButton primary small onClick={() => onPause(true)}>Save it, then pause</GuestButton>
          <GuestButton small onClick={() => onPause(false)}>Pause without it</GuestButton>
        </div>
      ) : (
        <div className="mt-4">
          <GuestButton primary small onClick={() => onPause(false)}>Save my progress & pause</GuestButton>
        </div>
      )}
    </div>
  );
}
