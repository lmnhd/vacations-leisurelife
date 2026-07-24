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
  markReviewReady as apiMarkReviewReady,
  type GuestSaveResponse,
  type GuestTravelerPayload,
  type GuestCabinPayload,
} from "./guest-api-client";

const STORAGE_KEY = "lll-booking-assistant-lab-v1";

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
    rateQualificationClaims: [],
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
    return {
      interest: draft.serviceRateInterest,
      travelerIndex: draft.serviceRateTravelerIndex,
      category: draft.serviceRateCategory,
      proofReadiness: draft.serviceRateProofReadiness,
    };
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

export const BookingFlowExperience = forwardRef<
  BookingFlowHandle,
  { onDebug?: (snapshot: BookingFlowSnapshot) => void }
>(function BookingFlowExperience({ onDebug }, ref) {
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
  const [callSignal, setCallSignal] = useState<CallSignal | null>(null);

  // Server-side draft state (real DynamoDB persistence via guest API).
  const [serverDraftId, setServerDraftId] = useState<string | null>(null);
  const [serverDraftVersion, setServerDraftVersion] = useState<number>(0);
  const [serverFallbackKey, setServerFallbackKey] = useState<string | null>(null);
  const [serverSavePending, setServerSavePending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Stable per-scenario draft id: the mock deal id yields the documented "MAP"
  // key and survives refresh/resume (the key is derived, never regenerated).
  const draftId = serverDraftId ?? MOCK_DEAL.dealId;
  const fallbackKey = serverFallbackKey ?? fallbackCallKey(MOCK_DEAL.dealId);

  const tasks = useMemo(() => buildTaskList(draft), [draft]);
  const currentTask: TaskDef | undefined = tasks.find((task) => task.id === currentTaskId);
  const confirmedCount = tasks.filter((task) => draft.confirmedTasks.includes(task.id)).length;
  const completionPct = tasks.length > 0 ? Math.round((confirmedCount / tasks.length) * 100) : 0;

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
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedLab;
        setDraft(saved.draft);
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
        setWorking(workingForTask(saved.currentTaskId, saved.draft));
      }
    } catch {
      // Corrupt lab state: start fresh.
    }
    setHydrated(true);
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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Storage full/unavailable: the lab keeps working in-memory.
    }
  }, [hydrated, draft, currentTaskId, journal, screen, voiceMode, callSignal, serverDraftId, serverDraftVersion, serverFallbackKey]);

  // Stream the observable state to the lab wrapper (no-op in production).
  useEffect(() => {
    if (!hydrated) return;
    onDebug?.({ draft, journal, screen, tasks, completionPct, callSignal, fallbackKey });
  }, [hydrated, draft, journal, screen, tasks, completionPct, callSignal, fallbackKey, onDebug]);

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

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  }, []);

  function startBooking() {
    emit("guest", "booking_assistant_opened", `Start booking tapped for ${MOCK_DEAL.title}`);
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
      next.serviceRateTravelerIndex = "";
      next.serviceRateCategory = "";
      next.serviceRateProofReadiness = "";
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
        const travelerIndex = working.travelerIndex ?? "";
        const category = (working.category ?? "").trim();
        const proofReadiness = working.proofReadiness ?? "";
        const numericIndex = Number(travelerIndex);
        if (travelerIndex === "" || !Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= next.travelerCount) {
          setTaskError("Choose the traveler who may qualify.");
          return false;
        }
        if (!category) {
          setTaskError("Choose the closest service category - 'Other or not sure' is fine.");
          return false;
        }
        if (!proofReadiness) {
          setTaskError("Tell us whether proof is available later - no document is needed here.");
          return false;
        }
        next.serviceRateTravelerIndex = travelerIndex;
        next.serviceRateCategory = category;
        next.serviceRateProofReadiness = proofReadiness;
        detail = "Military/service rate claimed - operator verification required";
      } else {
        next.serviceRateTravelerIndex = "";
        next.serviceRateCategory = "";
        next.serviceRateProofReadiness = "";
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

    if (id === "email" && !draft.confirmedTasks.includes("email")) {
      emit("system", "resume_email_sent", `Secure resume link emailed to ${next.email} (mock - nothing sent)`);
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
            dealId: MOCK_DEAL.dealId,
            packageId: "pkg-mock-001",
            siid: "SI-MOCK-001",
            cruiseLine: MOCK_DEAL.line,
            ship: MOCK_DEAL.ship,
            sailingDateIso: "2026-08-22",
            nights: MOCK_DEAL.nights,
            departurePort: MOCK_DEAL.departure,
            itineraryLabel: MOCK_DEAL.itinerary,
            dealAngle: MOCK_DEAL.title,
            priceDisplay: MOCK_DEAL.priceBasis,
            currency: "USD",
            taxFeeBasis: "per person",
            priceCapturedAtIso: new Date().toISOString(),
            sourceBookingUrl: "https://example.com/deal/mock-msc-summer",
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
        }).then((result) => {
          if (result.success) {
            setServerDraftId(result.result.draftId);
            setServerDraftVersion(result.result.version);
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

  function submitReview() {
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
    // Section 29.1: atomic packet save -> ready_to_call_agent with a stable key.
    const next = { ...draft, preparationAuthorized: true, status: "ready_to_call_agent" as const };
    setDraft(next);
    emit("guest", "field_confirmed", "Accuracy acknowledged for all travelers", "review");
    emit("system", "booking_packet_reviewed", "Reviewed packet saved atomically (mock)");
    emit("system", "state_transitioned", "collecting -> ready_to_call_agent");
    // Key is derived, not stored per attempt: reuse if the key already existed.
    emit(
      "system",
      callSignal ? "fallback_call_key_reused" : "fallback_call_key_issued",
      `Fallback call key ready (redacted from payload); mode ${COMPLETION_MODE}`
    );
    emit("assistant", "ready_to_call_presented", "Call-agent-to-finalize screen shown");
    setScreen("call_finalize");

    // Persist review-ready status to real DynamoDB.
    if (serverDraftId && serverDraftVersion > 0) {
      apiMarkReviewReady(serverDraftId, serverDraftVersion, {
        travelers: buildTravelerPayloads(next),
        cabin: buildCabinPayload(next),
        decisions: {
          travelInsuranceDecision: next.insuranceInterest || undefined,
          passengerDataReviewConfirmed: next.accuracyAcknowledged,
          packetStorageConsent: next.preparationAuthorized,
        },
      }).then((result) => {
        if (result.success) {
          setServerDraftVersion(result.result.newVersion);
          emit("system", "review_ready_persisted", `Server updated: v${result.result.newVersion}, insurance=${next.insuranceInterest || "none"}, travelers=${next.travelerCount}`);
        } else {
          setServerError(result.error);
          emit("system", "review_ready_failed", `Server update failed: ${result.error}`);
        }
      });
    }
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
          emit("system", "call_signal_persisted", `Server: call intent published, attempt ${result.result.callAttemptId}`);
        } else {
          setServerError(result.error);
          emit("system", "call_signal_failed", `Server signal failed: ${result.error}`);
        }
      });
    }
  }

  function callLater() {
    emit("guest", "call_later_selected", "Guest chose to call later; key + receipt preserved");
    // Stays ready_to_call_agent; no real message is sent in the lab.
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

  function pause(saveWorking: boolean) {
    const pausedAtTask = currentTaskId;
    if (saveWorking) confirmCurrentTask();
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
    emit("system", "reminder_program_armed", "continue_later_v1 armed: every 3 days, capped (mock)");
    emit("system", "continue_later_receipt_sent", "Save receipt emailed with secure resume link (mock)");
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

  function askQuestion(picked?: { q: string; a: string }) {
    const q = picked?.q ?? questionText.trim();
    if (!q) return;
    const canned = picked ?? SIDE_QUESTIONS.find((entry) => entry.q === q);
    const answer = canned?.a ??
      "(Mock assistant) Great question - in the real flow I'd answer from approved deal facts, and offer a human agent if I wasn't sure.";
    setQuestionAnswer({ q, a: answer });
    setQuestionText("");
    emit("guest", "side_question_asked", q, currentTaskId);
    emit("assistant", "assistant_response_presented", "Short grounded answer shown; task and input preserved", currentTaskId);
  }

  function requestHelp() {
    const next = { ...draft, status: "human_requested" as const };
    setDraft(next);
    setSheet("none");
    setScreen("help");
    emit("guest", "human_help_requested", "'Get help now' tapped");
    emit("system", "state_transitioned", "collecting -> human_requested");
    emit("operator", "operator_claimed", "Urgent Pushover sent to operator (mock)");
  }

  function resetFlow() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
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
      <FlowContent
        screen={screen}
        draft={draft}
        tasks={tasks}
        currentTask={currentTask}
        confirmedCount={confirmedCount}
        completionPct={completionPct}
        working={working}
        setWorking={setWorking}
        taskError={taskError}
        savedFlash={savedFlash}
        emailConfirmed={emailConfirmed}
        voiceMode={voiceMode}
        voiceState={voiceState}
        heardText={heardText}
        onStart={startBooking}
        onContinue={confirmCurrentTask}
        onDefer={deferCurrentTask}
        onOpenOptions={() => setSheet("options")}
        onOpenQuestion={() => setSheet("question")}
        onOpenPause={() => setSheet("pause_confirm")}
        onSubmitReview={submitReview}
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
        onCallLater={callLater}
        onOpenQuestionFromCall={() => setSheet("question")}
        onEmit={emit}
      />

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
                onAsk={askQuestion}
                onClose={() => {
                  setQuestionAnswer(null);
                  setSheet("none");
                }}
              />
            )}
            {sheet === "progress" && <ProgressSheet tasks={tasks} draft={draft} onClose={() => setSheet("none")} />}
            {sheet === "privacy" && <PrivacySheet onClose={() => setSheet("none")} />}
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
  draft: MockDraft;
  tasks: TaskDef[];
  currentTask?: TaskDef;
  confirmedCount: number;
  completionPct: number;
  working: WorkingState;
  setWorking: React.Dispatch<React.SetStateAction<WorkingState>>;
  taskError: string;
  savedFlash: boolean;
  emailConfirmed: boolean;
  voiceMode: boolean;
  voiceState: "idle" | "listening" | "heard";
  heardText: string;
  reminderDate: string;
  onStart: () => void;
  onContinue: () => void;
  onDefer: () => void;
  onOpenOptions: () => void;
  onOpenQuestion: () => void;
  onOpenPause: () => void;
  onSubmitReview: () => void;
  onEditFromReview: (taskId: string) => void;
  onResume: () => void;
  onBackFromHelp: () => void;
  onStartVoice: () => void;
  setDraft: React.Dispatch<React.SetStateAction<MockDraft>>;
  fallbackKey: string;
  callSignal: CallSignal | null;
  onLaunchCall: () => void;
  onCallLater: () => void;
  onOpenQuestionFromCall: () => void;
  onEmit: (actor: MockJournalEvent["actor"], eventType: string, detail: string, taskId?: string) => void;
}

function FlowContent(props: FlowContentProps) {
  const { screen } = props;
  if (screen === "landing") return <LandingScreen onStart={props.onStart} />;
  if (screen === "paused") return <PausedScreen draft={props.draft} tasks={props.tasks} completionPct={props.completionPct} reminderDate={props.reminderDate} onResume={props.onResume} />;
  if (screen === "help") return <HelpScreen draft={props.draft} onBack={props.onBackFromHelp} />;
  if (screen === "call_finalize")
    return (
      <CallFinalizeScreen
        draft={props.draft}
        fallbackKey={props.fallbackKey}
        callSignal={props.callSignal}
        onLaunchCall={props.onLaunchCall}
        onCallLater={props.onCallLater}
        onOpenOptions={props.onOpenOptions}
        onOpenQuestion={props.onOpenQuestionFromCall}
        onEmit={props.onEmit}
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

function LandingScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-5" style={{ color: NAVY }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
        Curated Deal - mock landing entry
      </p>
      <h2 className="mt-2 text-2xl font-bold leading-tight">{MOCK_DEAL.title}</h2>
      <div className="mt-4 rounded-xl bg-white p-4" style={{ border: `1px solid ${BORDER}` }}>
        <p className="text-sm font-semibold">{MOCK_DEAL.line} - {MOCK_DEAL.ship}</p>
        <p className="mt-1 text-sm" style={{ color: MUTED }}>
          {MOCK_DEAL.nights} nights - {MOCK_DEAL.itinerary}
        </p>
        <p className="text-sm" style={{ color: MUTED }}>{MOCK_DEAL.departure} - {MOCK_DEAL.sailDate}</p>
        <p className="mt-2 text-sm font-semibold">{MOCK_DEAL.priceBasis}</p>
        <p className="text-[11px]" style={{ color: MUTED }}>
          {MOCK_DEAL.capturedAt}. Final price and availability are confirmed with you before payment.
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
    draft, tasks, currentTask, confirmedCount, working, setWorking, taskError, savedFlash,
    emailConfirmed, voiceMode, voiceState, heardText, onContinue, onDefer, onOpenOptions,
    onOpenQuestion, onOpenPause, onSubmitReview, onEditFromReview, onStartVoice, setDraft,
  } = props;

  if (!currentTask) return null;
  const isReview = currentTask.id === "review";
  const sectionRemaining = tasks.filter(
    (task) => task.section === currentTask.section && !draft.confirmedTasks.includes(task.id)
  ).length;
  const supportsVoice = voiceValueForTask(currentTask.id) !== null;

  return (
    <div className="flex h-full flex-col" style={{ color: NAVY }}>
      {/* Sticky header */}
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: BORDER, background: "#FFFFFF" }}>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold">{MOCK_DEAL.title}</p>
          <p className="text-[10px]" style={{ color: MUTED }}>
            {MOCK_DEAL.ship} - {MOCK_DEAL.sailDate}
          </p>
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
          <p className="mt-3 rounded-lg bg-[#FDECEA] px-3 py-2 text-[13px] font-medium text-[#B3261E]">
            {taskError}
          </p>
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
        <GuestButton primary onClick={isReview ? onSubmitReview : onContinue}>
          {isReview ? "Looks right - prepare my booking" : "Continue"}
        </GuestButton>
        <div className="mt-2 flex items-center gap-2">
          {emailConfirmed && (
            <button
              type="button"
              onClick={onOpenPause}
              className="flex-1 rounded-lg py-2.5 text-[12px] font-semibold"
              style={{ border: `1px solid ${BORDER}`, color: MUTED, minHeight: 44 }}
            >
              Continue later
            </button>
          )}
          <button
            type="button"
            onClick={onOpenOptions}
            className="flex-1 rounded-lg py-2.5 text-[12px] font-semibold"
            style={{ border: `1px solid ${BORDER}`, color: MUTED, minHeight: 44 }}
          >
            More options
          </button>
        </div>
        {emailConfirmed && (
          <p className="mt-1.5 text-center text-[10px]" style={{ color: MUTED }}>
            We'll save your confirmed answers and email you a secure link every 3 days.
          </p>
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
          <div className="flex flex-col gap-3 rounded-xl bg-white p-3" style={{ border: `1px solid ${BORDER}` }}>
            <Field label="Who may qualify?">
              <select style={guestInput} value={working.travelerIndex ?? ""} onChange={set("travelerIndex")}>
                <option value="">Select traveler...</option>
                {draft.travelers.slice(0, draft.travelerCount).map((traveler, i) => (
                  <option key={i} value={String(i)}>{traveler.firstName || `Traveler ${i + 1}`}</option>
                ))}
              </select>
            </Field>
            <Field label="Closest category">
              <select style={guestInput} value={working.category ?? ""} onChange={set("category")}>
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
            <Field label="Could you provide proof later if the cruise line asks?">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Chip label="Yes, later" active={working.proofReadiness === "available_later"} onClick={() => setValue("proofReadiness", "available_later")} />
                <Chip label="I need help" active={working.proofReadiness === "need_help"} onClick={() => setValue("proofReadiness", "need_help")} />
                <Chip label="Not sure" active={working.proofReadiness === "not_sure"} onClick={() => setValue("proofReadiness", "not_sure")} />
              </div>
            </Field>
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

function HelpScreen({ draft, onBack }: { draft: MockDraft; onBack: () => void }) {
  return (
    <div className="flex h-full flex-col p-6" style={{ color: NAVY }}>
      <div className="my-auto text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD }}>Help is on the way</p>
        <h2 className="mt-2 text-2xl font-bold">An agent has been alerted</h2>
        <p className="mt-3 text-[14px] leading-6" style={{ color: MUTED }}>
          (Simulated.) A real agent would see everything you've entered so far and call{" "}
          {draft.phone || "your number"} - you never have to repeat yourself. During business hours,
          expect a call within minutes.
        </p>
        <div className="mt-6">
          <GuestButton onClick={onBack} small>Keep filling things in while I wait</GuestButton>
        </div>
      </div>
    </div>
  );
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
  onCallLater,
  onOpenOptions,
  onOpenQuestion,
  onEmit,
}: {
  draft: MockDraft;
  fallbackKey: string;
  callSignal: CallSignal | null;
  onLaunchCall: () => void;
  onCallLater: () => void;
  onOpenOptions: () => void;
  onOpenQuestion: () => void;
  onEmit: (actor: MockJournalEvent["actor"], eventType: string, detail: string, taskId?: string) => void;
}) {
  const [copied, setCopied] = useState(false);
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

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5" style={{ color: NAVY }}>
      <div className="my-auto">
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

        {/* Pending / calling status banner. */}
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
            {ackFailed
              ? "We could not alert your agent yet."
              : calling
                ? "Your agent has your information. Starting the call..."
                : "Alerting your agent... placing your information on their screen."}
          </div>
        )}

        <div className="mt-4">
          <GuestButton primary onClick={onLaunchCall} disabled={pending || calling}>
            {ackFailed ? "Try again" : pending ? "Alerting your agent..." : calling ? "Calling now..." : "Call agent to finalize"}
          </GuestButton>
        </div>
        <p className="mt-2 text-center text-[11px]" style={{ color: MUTED }}>
          We will place your saved information on your agent&apos;s screen before the call starts.
          {" "}(Prototype: the call is simulated, not dialed.)
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
        <p className="mt-4 text-center text-[11px]" style={{ color: MUTED }}>
          Agent line: {MOCK_AGENT_PHONE}
        </p>
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
  onAsk,
  onClose,
}: {
  questionText: string;
  setQuestionText: (value: string) => void;
  answer: { q: string; a: string } | null;
  onAsk: (picked?: { q: string; a: string }) => void;
  onClose: () => void;
}) {
  return (
    <div>
      <SheetHeader title="Ask a question" onClose={onClose} />
      <p className="mb-3 text-[12px]" style={{ color: MUTED }}>
        Your place in the booking is saved - closing this brings you right back.
      </p>
      {answer && (
        <div className="mb-3 rounded-xl bg-[#F5EFE6] p-3">
          <p className="text-[12px] font-bold" style={{ color: NAVY }}>{answer.q}</p>
          <p className="mt-1 text-[13px] leading-5" style={{ color: MUTED }}>{answer.a}</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {SIDE_QUESTIONS.map((entry) => (
          <button
            key={entry.q}
            type="button"
            onClick={() => onAsk(entry)}
            className="rounded-lg bg-white px-3 py-2.5 text-left text-[13px] font-medium"
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
          onChange={(event) => setQuestionText(event.target.value)}
        />
        <button type="button" onClick={() => onAsk()} className="shrink-0 rounded-lg px-4 text-[13px] font-bold text-white" style={{ background: NAVY, minHeight: 48 }}>
          Ask
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

function PrivacySheet({ onClose }: { onClose: () => void }) {
  return (
    <div>
      <SheetHeader title="Privacy & data use" onClose={onClose} />
      <div className="flex flex-col gap-2 text-[13px] leading-5" style={{ color: MUTED }}>
        <p>We save your confirmed answers so you never have to repeat them, and so an agent can finish your booking with you.</p>
        <p>We never collect or store card numbers - payment happens only in the cruise line's official system.</p>
        <p>You can pause, change reminders, or ask us to delete your saved details at any time.</p>
        <p className="text-[11px]">(Lab note: this prototype stores everything only in this browser tab.)</p>
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
