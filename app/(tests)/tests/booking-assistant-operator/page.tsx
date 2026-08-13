'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { GuestInfoPanel } from './guest-info-panel';
import { CallChecklist } from './call-checklist';
import { OperatorCopilotPanel } from './operator-copilot-panel';
import { CustomEmailComposer, type CustomEmailComposerHandle } from './custom-email-composer';

// ── Types ───────────────────────────────────────────────────────────────────

interface QueueCard {
  bookingDraftId: string;
  version: number;
  firstName: string;
  dealSummary: string;
  status: string;
  completionPct: number;
  urgency: string;
  lastActivityIso: string;
  missingSections: string[];
  channels: string[];
  claimLeaseExpiresAtIso?: string;
  callbackWindowLabel?: string;
}

interface LookupResult {
  result: 'match' | 'no_match' | 'invalid_key';
  draftId?: string;
  maskedCallerSummary?: string;
  dealSummary?: string;
  version?: number;
  status?: string;
  packetVersion?: number;
  keyVersion?: number;
  issuedAtIso?: string;
}

interface VerifyResult {
  verified: boolean;
  newVersion: number;
  journalEventId: string;
}

interface RevealResult {
  draft: {
    metadata: Record<string, unknown>;
    dealSnapshot: Record<string, unknown>;
    contact: Record<string, unknown>;
    travelers: Record<string, unknown>[];
    cabins: Record<string, unknown>[];
    decisions: Record<string, unknown>;
    fallbackCallKey?: Record<string, unknown>;
  };
  revealedAtIso: string;
  journalEventId: string;
}

interface ClaimResult {
  newVersion: number;
  claimLeaseExpiresAtIso: string;
  journalEventId: string;
}

interface ProcessingResult {
  newVersion: number;
  journalEventId: string;
}

interface OutcomeResult {
  newVersion: number;
  newStatus: string;
  journalEventId: string;
}

interface DismissResult {
  newVersion: number;
  journalEventId: string;
}

interface AgentAvailability {
  mode: 'available' | 'no_agents';
  effectiveUntilIso?: string;
  changedAtIso: string;
  version: number;
}

interface OperatorDetail {
  currentState: {
    bookingDraftId: string;
    status: string;
    version: number;
    packetVersion: number;
    completionMode: string;
    completionModeVersion: number;
    assignedOperatorId?: string;
    claimLeaseExpiresAtIso?: string;
    nextTaskId?: string;
    updatedAtIso: string;
  };
  timeline: Array<{
    journalEventId: string;
    eventType: string;
    actorType: string;
    occurredAtIso: string;
    sequence: number;
  }>;
  journey: Array<{
    sequence: number;
    occurredAtIso: string;
    actorType: string;
    eventType: string;
    label: string;
    detail?: string;
  }>;
  conversations: Array<{
    turnId: string;
    role: string;
    channel: string;
    text: string;
    occurredAtIso: string;
  }>;
  conversationLocked: boolean;
}

interface GuestSaveResult {
  draftId: string;
  version: number;
  createdAtIso: string;
  fallbackCallKey: {
    rawKey: string;
    normalizedKey: string;
    keyVersion: number;
  };
}

interface GuestSignalResult {
  newVersion: number;
  callAttemptId: string;
  signalExpiresAtIso: string;
}

type ApiResult<T> = { success: true; result: T } | { success: false; error: string };
type QueueApiResponse =
  | { success: true; result: { cards: QueueCard[] } }
  | { success: true; cards: QueueCard[] }
  | { success: false; error: string };

const CALLER_ID_STATES = ['matched', 'different', 'blocked', 'unavailable'] as const;

const OUTCOME_LABELS: Record<string, string> = {
  no_call_received: 'No call received',
  disconnected_call_back: 'Disconnected - call back',
  needs_guest_decision: 'Needs a guest decision',
  material_change: 'Unavailable / material change',
  payment_failed: 'Payment failed',
  declined: 'Card declined',
  completed_pending_reconciliation: 'Completed - pending reconciliation',
  confirmed: 'Confirmed',
};

const ACTIVE_CALL_STATUS_ORDER = [
  'call_signal_pending',
  'calling_now',
  'agent_claimed',
  'agent_processing',
] as const;

function wouldRegressActiveCallStatus(
  currentStatus: string | null,
  incomingStatus: string
): boolean {
  if (!currentStatus) return false;
  const currentIndex = ACTIVE_CALL_STATUS_ORDER.indexOf(
    currentStatus as (typeof ACTIVE_CALL_STATUS_ORDER)[number]
  );
  const incomingIndex = ACTIVE_CALL_STATUS_ORDER.indexOf(
    incomingStatus as (typeof ACTIVE_CALL_STATUS_ORDER)[number]
  );
  return currentIndex >= 0 && incomingIndex >= 0 && incomingIndex < currentIndex;
}

const QUEUE_STATUS_DETAILS: Record<string, { label: string; hint: string; color: string }> = {
  review_ready: {
    label: 'Guest packet complete',
    hint: 'Waiting for the guest to call the agent.',
    color: 'text-slate-300',
  },
  ready_to_call_agent: {
    label: 'Ready to call',
    hint: 'Waiting for the guest to call the agent.',
    color: 'text-slate-300',
  },
  human_requested: {
    label: 'Guest asked for help',
    hint: 'Claim this request and return the call.',
    color: 'text-amber-300',
  },
  call_signal_pending: {
    label: 'Live caller waiting',
    hint: 'Open this draft and pin the call now.',
    color: 'text-sky-400',
  },
  calling_now: {
    label: 'Call pinned - verify guest',
    hint: 'Verify the guest, then claim the draft.',
    color: 'text-sky-400',
  },
  agent_claimed: {
    label: 'Operator owns this call',
    hint: 'Reveal the packet and continue the call.',
    color: 'text-amber-300',
  },
  agent_processing: {
    label: 'Booking being completed',
    hint: 'Finish the booking and record the outcome.',
    color: 'text-indigo-300',
  },
  reconciliation_review: {
    label: 'Reconciliation required',
    hint: 'Verify the authoritative booking reference before confirmation.',
    color: 'text-fuchsia-300',
  },
};

function queueStatusDetail(status: string): { label: string; hint: string; color: string } {
  return QUEUE_STATUS_DETAILS[status] ?? {
    label: status,
    hint: 'Review this draft before taking action.',
    color: 'text-slate-400',
  };
}

function urgencyBadgeLabel(urgency: string, status: string): string {
  if (status === 'call_signal_pending' || status === 'calling_now') return 'Live now';
  if (status === 'human_requested') return 'Call back';
  if (urgency === 'urgent') return 'Urgent';
  if (urgency === 'normal') return 'Active';
  return 'Queued';
}

function canRevealPacket(status: string | null, claimed: boolean, verified: boolean): boolean {
  if (!claimed) return false;
  if (verified) return true;
  return status === 'agent_claimed' || status === 'agent_processing' || status === 'reconciliation_review';
}

function queueLane(status: string): 'live_calls' | 'callbacks' | 'waiting_packets' | 'other' {
  if (status === 'call_signal_pending' || status === 'calling_now') return 'live_calls';
  if (status === 'human_requested' || status === 'agent_claimed' || status === 'agent_processing' || status === 'reconciliation_review') return 'callbacks';
  if (status === 'review_ready' || status === 'ready_to_call_agent') return 'waiting_packets';
  return 'other';
}

function activeDraftMode(status: string | null): { label: string; hint: string; tone: string } {
  if (status === 'call_signal_pending' || status === 'calling_now') {
    return {
      label: 'Live incoming call',
      hint: 'This guest is trying to reach an agent now. Pin, verify, and continue the call.',
      tone: 'border-sky-700 bg-sky-950/30 text-sky-200',
    };
  }
  if (status === 'human_requested' || status === 'agent_claimed' || status === 'agent_processing' || status === 'reconciliation_review') {
    return {
      label: 'Callback workflow',
      hint: 'This guest asked to be called back. Claim the request, reveal the packet, and return the call.',
      tone: 'border-amber-700 bg-amber-950/30 text-amber-200',
    };
  }
  if (status === 'review_ready' || status === 'ready_to_call_agent') {
    return {
      label: 'Waiting for guest call',
      hint: 'The packet is complete, but the guest has not requested a callback or signaled a live call yet.',
      tone: 'border-slate-700 bg-slate-950/40 text-slate-300',
    };
  }
  return {
    label: 'Draft selected',
    hint: 'Review the current status and next action below.',
    tone: 'border-slate-700 bg-slate-950/40 text-slate-300',
  };
}

function laneContainerTone(lane: 'live_calls' | 'callbacks' | 'waiting_packets' | 'other'): string {
  if (lane === 'live_calls') return 'border-sky-800/70 bg-sky-950/18';
  if (lane === 'callbacks') return 'border-amber-800/70 bg-amber-950/18';
  if (lane === 'waiting_packets') return 'border-slate-700 bg-slate-950/35';
  return 'border-slate-800 bg-slate-950/20';
}

function laneHeaderTone(lane: 'live_calls' | 'callbacks' | 'waiting_packets' | 'other'): string {
  if (lane === 'live_calls') return 'text-sky-200';
  if (lane === 'callbacks') return 'text-amber-200';
  if (lane === 'waiting_packets') return 'text-slate-200';
  return 'text-slate-300';
}

function selectedCardTone(lane: 'live_calls' | 'callbacks' | 'waiting_packets' | 'other'): string {
  if (lane === 'live_calls') return 'border-sky-400 bg-sky-950/45 ring-1 ring-sky-500/40';
  if (lane === 'callbacks') return 'border-amber-400 bg-amber-950/40 ring-1 ring-amber-500/35';
  if (lane === 'waiting_packets') return 'border-slate-500 bg-slate-900/70 ring-1 ring-slate-400/25';
  return 'border-slate-500 bg-slate-900/70 ring-1 ring-slate-400/20';
}

function digitsOnly(value: string): string {
  let result = '';
  for (const character of value) {
    if (character >= '0' && character <= '9') result += character;
  }
  return result;
}

function canDismissQueueCard(card: QueueCard): boolean {
  if (card.status !== 'agent_processing') {
    return card.status !== 'booking_confirmed';
  }
  const claimLeaseExpiresAt = Date.parse(card.claimLeaseExpiresAtIso ?? '');
  return Number.isFinite(claimLeaseExpiresAt) && claimLeaseExpiresAt <= Date.now();
}

function QueueSection({
  title,
  hint,
  emptyLabel,
  cards,
  activeDraftId,
  lane,
  onSelect,
  onDismiss,
}: {
  title: string;
  hint: string;
  emptyLabel: string;
  cards: QueueCard[];
  activeDraftId: string | null;
  lane: 'live_calls' | 'callbacks' | 'waiting_packets' | 'other';
  onSelect: (card: QueueCard) => void;
  onDismiss: (card: QueueCard) => void;
}) {
  return (
    <div className={`space-y-2 rounded-lg border p-3 ${laneContainerTone(lane)}`}>
      <div>
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${laneHeaderTone(lane)}`}>{title}</h3>
        <p className="mt-1 text-[10px] text-slate-500">{hint}</p>
      </div>
      {cards.length === 0 ? (
        <p className="rounded border border-slate-800/80 bg-slate-950/35 px-3 py-2 text-xs text-slate-500">
          {emptyLabel}
        </p>
      ) : (
        cards.map((card) => (
          <div
            key={card.bookingDraftId}
            className={`p-3 rounded border cursor-pointer transition-colors ${
              activeDraftId === card.bookingDraftId
                ? selectedCardTone(lane)
                : queueLane(card.status) === 'live_calls'
                  ? 'border-sky-900/70 bg-sky-950/20 hover:border-sky-700'
                  : queueLane(card.status) === 'callbacks'
                    ? 'border-amber-900/70 bg-amber-950/20 hover:border-amber-700'
                    : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
            }`}
            onClick={() => onSelect(card)}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-200">
                {card.firstName || 'Unknown guest'}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                card.urgency === 'urgent' ? 'bg-red-900/50 text-red-300' :
                card.urgency === 'normal' ? 'bg-amber-900/50 text-amber-300' :
                'bg-slate-800 text-slate-400'
              }`}>
                {urgencyBadgeLabel(card.urgency, card.status)}
              </span>
            </div>
            {card.dealSummary && (
              <div className="text-xs text-slate-400">{card.dealSummary}</div>
            )}
            {card.callbackWindowLabel && (
              <div className="mt-1 text-xs font-medium text-amber-200">
                Requested: {card.callbackWindowLabel}
              </div>
            )}
            <div className="flex items-center justify-between mt-1 gap-2">
              <div>
                <span className={`text-[10px] font-medium ${queueStatusDetail(card.status).color}`}>
                  {queueStatusDetail(card.status).label}
                </span>
                <p className="text-[10px] text-slate-600">{queueStatusDetail(card.status).hint}</p>
              </div>
              <span className="text-[10px] text-slate-600">{card.lastActivityIso.slice(11, 19)}</span>
            </div>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDismiss(card);
              }}
              disabled={!canDismissQueueCard(card)}
              className="mt-2 px-2 py-1 text-[10px] bg-slate-800 hover:bg-rose-900/70 disabled:opacity-40 rounded text-slate-300"
              title={
                card.status === 'agent_processing' && !canDismissQueueCard(card)
                  ? 'An active processing claim cannot be dismissed'
                  : 'Cancels this draft while keeping its audit history'
              }
            >
              {card.status === 'agent_processing' ? 'Close stale draft' : 'Dismiss from queue'}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function BookingAssistantOperatorWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [autoPoll, setAutoPoll] = useState(false);

  const [lookupInput, setLookupInput] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeDraftVersion, setActiveDraftVersion] = useState<number | null>(null);
  const [activeDraftStatus, setActiveDraftStatus] = useState<string | null>(null);
  const activeDraftIdRef = useRef<string | null>(null);
  const activeDraftVersionRef = useRef<number | null>(null);
  const activeDraftStatusRef = useRef<string | null>(null);
  const customEmailComposerRef = useRef<CustomEmailComposerHandle | null>(null);
  const [acknowledgeLoading, setAcknowledgeLoading] = useState(false);
  const [revealedPacket, setRevealedPacket] = useState<RevealResult | null>(null);
  const [verified, setVerified] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [processingLoading, setProcessingLoading] = useState(false);
  const [outcomeLoading, setOutcomeLoading] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [selectedCallerIdState, setSelectedCallerIdState] = useState<string>('matched');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [outcomeCompleted, setOutcomeCompleted] = useState(false);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [operatorDetail, setOperatorDetail] = useState<OperatorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bookingReference, setBookingReference] = useState('');
  const [evidenceType, setEvidenceType] = useState<'cbat_trip' | 'supplier_confirmation'>('cbat_trip');
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [operatorActionLoading, setOperatorActionLoading] = useState(false);
  const [operatorFieldId, setOperatorFieldId] = useState('preferences.cabin');
  const [operatorFieldValue, setOperatorFieldValue] = useState('');

  // ── Guest Simulator state ──
  const [guestFirstName, setGuestFirstName] = useState('Test');
  const [guestEmail, setGuestEmail] = useState('test@example.com');
  const [guestPhone, setGuestPhone] = useState('555-123-4567');
  const [guestSaveLoading, setGuestSaveLoading] = useState(false);
  const [guestSaveResult, setGuestSaveResult] = useState<GuestSaveResult | null>(null);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestSignalLoading, setGuestSignalLoading] = useState(false);
  const [guestReviewLoading, setGuestReviewLoading] = useState(false);
  const [guestQuickSendLoading, setGuestQuickSendLoading] = useState(false);

  const [actionLog, setActionLog] = useState<string[]>([]);
  const [availability, setAvailability] = useState<AgentAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setActionLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const updateActiveDraftVersion = useCallback((version: number | null) => {
    activeDraftVersionRef.current = version;
    setActiveDraftVersion(version);
  }, []);

  const updateActiveDraftStatus = useCallback((status: string | null) => {
    activeDraftStatusRef.current = status;
    setActiveDraftStatus(status);
  }, []);

  const selectQueueDraft = useCallback((card: QueueCard) => {
    activeDraftIdRef.current = card.bookingDraftId;
    setActiveDraftId(card.bookingDraftId);
    updateActiveDraftVersion(card.version || null);
    updateActiveDraftStatus(card.status);
    setRevealedPacket(null);
    setVerified(card.status === 'agent_processing' || card.status === 'reconciliation_review');
    setClaimed(card.status === 'agent_claimed' || card.status === 'agent_processing' || card.status === 'reconciliation_review');
    setProcessing(card.status === 'agent_processing');
    log(`Selected draft: ${card.bookingDraftId}`);
  }, [log, updateActiveDraftStatus, updateActiveDraftVersion]);

  const liveQueue = queue.filter((card) => queueLane(card.status) === 'live_calls');
  const callbackQueue = queue.filter((card) => queueLane(card.status) === 'callbacks');
  const waitingQueue = queue.filter((card) => queueLane(card.status) === 'waiting_packets');
  const otherQueue = queue.filter((card) => queueLane(card.status) === 'other');
  const draftMode = activeDraftMode(activeDraftStatus);

  useEffect(() => {
    activeDraftIdRef.current = activeDraftId;
  }, [activeDraftId]);

  const pollQueue = useCallback(async (): Promise<QueueCard[] | null> => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      const res = await fetch('/api/booking-assistant/queue');
      const data = await res.json() as QueueApiResponse;
      if (data.success) {
        const cards = 'result' in data ? data.result.cards : data.cards;
        setQueue(cards);
        log(`Queue polled: ${cards.length} cards`);
        return cards;
      }
      setQueueError(data.error);
      return null;
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Queue poll failed');
      return null;
    } finally {
      setQueueLoading(false);
    }
  }, [log]);

  // Lets the auto-poll loop call the latest pollQueue without re-running its
  // effect (and resetting backoff) on every render.
  const pollQueueRef = useRef(pollQueue);
  useEffect(() => {
    pollQueueRef.current = pollQueue;
  }, [pollQueue]);

  const loadAvailability = useCallback(async () => {
    try {
      const response = await fetch('/api/booking-assistant/availability', { cache: 'no-store' });
      const data = await response.json() as ApiResult<AgentAvailability>;
      if (data.success) setAvailability(data.result);
      else log(`Availability lookup failed: ${data.error}`);
    } catch (error) {
      log(`Availability lookup failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }, [log]);

  const changeAvailability = useCallback(async (
    mode: AgentAvailability['mode'],
    effectiveUntilIso?: string
  ) => {
    if (!availability) return;
    setAvailabilityLoading(true);
    try {
      const response = await fetch('/api/booking-assistant/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          effectiveUntilIso,
          expectedVersion: availability.version,
        }),
      });
      const data = await response.json() as ApiResult<AgentAvailability>;
      if (!data.success) throw new Error(data.error);
      setAvailability(data.result);
      log(`Agent availability changed to ${data.result.mode}`);
    } catch (error) {
      log(`Availability update failed: ${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      setAvailabilityLoading(false);
    }
  }, [availability, log]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const loadDetail = useCallback(async (draftId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/booking-assistant/detail?draftId=${encodeURIComponent(draftId)}`);
      const data = await res.json() as ApiResult<OperatorDetail>;
      if (!data.success) throw new Error(data.error);
      if (activeDraftIdRef.current !== draftId) return;
      const currentVersion = activeDraftVersionRef.current;
      if (
        currentVersion !== null &&
        data.result.currentState.version < currentVersion
      ) {
        log(
          `Ignored stale detail v${data.result.currentState.version}; active draft is v${currentVersion}`
        );
        return;
      }
      if (
        wouldRegressActiveCallStatus(
          activeDraftStatusRef.current,
          data.result.currentState.status
        )
      ) {
        log(
          `Ignored stale detail status ${data.result.currentState.status}; active draft is ${activeDraftStatusRef.current}`
        );
        return;
      }
      setOperatorDetail(data.result);
      updateActiveDraftVersion(data.result.currentState.version);
      updateActiveDraftStatus(data.result.currentState.status);
    } catch (err) {
      log(`Detail error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setDetailLoading(false);
    }
  }, [log, updateActiveDraftStatus, updateActiveDraftVersion]);

  useEffect(() => {
    if (!activeDraftId) {
      setOperatorDetail(null);
      return;
    }
    void loadDetail(activeDraftId);
  }, [activeDraftId, loadDetail]);

  // Auto-poll: pauses when the tab is hidden, never overlaps requests, and
  // backs off when the queue is quiet. A tab left open overnight used to bill
  // a full-rate poll every 5s indefinitely.
  useEffect(() => {
    if (!autoPoll) return;

    // Deliberately slow. Pushover handles time-critical alerts, so the queue
    // only needs to stay reasonably fresh for a human watching the screen.
    const ACTIVE_MS = 30_000;
    const IDLE_MS = 180_000;
    const IDLE_AFTER_UNCHANGED_POLLS = 3;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let inFlight = false;
    let unchangedPolls = 0;
    let lastSignature = '';

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(runPoll, delayMs);
    };

    const runPoll = async () => {
      if (cancelled) return;
      if (inFlight || document.visibilityState !== 'visible') {
        schedule(ACTIVE_MS);
        return;
      }
      inFlight = true;
      try {
        const cards = await pollQueueRef.current();
        const signature = (cards ?? [])
          .map((card) => `${card.bookingDraftId}:${card.version}:${card.status}`)
          .join('|');
        unchangedPolls = signature === lastSignature ? unchangedPolls + 1 : 0;
        lastSignature = signature;
      } finally {
        inFlight = false;
      }
      schedule(unchangedPolls >= IDLE_AFTER_UNCHANGED_POLLS ? IDLE_MS : ACTIVE_MS);
    };

    // Poll immediately on focus so returning to the tab feels instant.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      unchangedPolls = 0;
      if (timer) clearTimeout(timer);
      void runPoll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    void runPoll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [autoPoll]);

  const handleLookup = useCallback(async () => {
    if (!lookupInput.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    setRevealedPacket(null);
    setVerified(false);
    try {
      const res = await fetch('/api/booking-assistant/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawKeyInput: lookupInput.trim() }),
      });
      const data = await res.json() as ApiResult<LookupResult>;
      if (data.success) {
        setLookupResult(data.result);
        if (data.result.result === 'match' && data.result.draftId) {
          activeDraftIdRef.current = data.result.draftId;
          setActiveDraftId(data.result.draftId);
          updateActiveDraftVersion(data.result.version ?? null);
          updateActiveDraftStatus(data.result.status ?? null);
          setRevealedPacket(null);
          setVerified(data.result.status === 'agent_processing' || data.result.status === 'reconciliation_review');
          setClaimed(data.result.status === 'agent_claimed' || data.result.status === 'agent_processing' || data.result.status === 'reconciliation_review');
          setProcessing(data.result.status === 'agent_processing');
          log(`Lookup match: ${data.result.draftId} — ${data.result.maskedCallerSummary}`);
        } else {
          log(`Lookup: ${data.result.result}`);
        }
      } else {
        setLookupError(data.error);
      }
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  }, [lookupInput, log, updateActiveDraftStatus, updateActiveDraftVersion]);

  const handleAcknowledge = useCallback(async () => {
    if (!activeDraftId || activeDraftVersion === null) return;
    setAcknowledgeLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: activeDraftId, expectedVersion: activeDraftVersion }),
      });
      const data = await res.json() as ApiResult<{ newVersion: number }>;
      if (!data.success) throw new Error(data.error);
      updateActiveDraftVersion(data.result.newVersion);
      updateActiveDraftStatus('calling_now');
      log(`Call intent acknowledged and pinned (v${data.result.newVersion})`);
      void pollQueue();
    } catch (err) {
      log(`Acknowledge failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setAcknowledgeLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, log, pollQueue, updateActiveDraftStatus, updateActiveDraftVersion]);

  const handleVerify = useCallback(async () => {
    if (!activeDraftId || activeDraftVersion === null) return;
    setVerifyLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: activeDraftId,
          expectedVersion: activeDraftVersion,
          callerIdState: selectedCallerIdState,
          verificationNotes,
        }),
      });
      const data = await res.json() as ApiResult<VerifyResult>;
      if (data.success) {
        setVerified(true);
        updateActiveDraftVersion(data.result.newVersion);
        log(`Caller verified: ${selectedCallerIdState} (event ${data.result.journalEventId})`);
      } else {
        log(`Verify failed: ${data.error}`);
      }
    } catch (err) {
      log(`Verify error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setVerifyLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, selectedCallerIdState, verificationNotes, log, updateActiveDraftVersion]);

  const handleReveal = useCallback(async () => {
    if (!activeDraftId) return;
    setRevealLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: activeDraftId }),
      });
      const data = await res.json() as ApiResult<RevealResult>;
      if (data.success) {
        setRevealedPacket(data.result);
        log(`Packet revealed at ${data.result.revealedAtIso}`);
      } else {
        log(`Reveal failed: ${data.error}`);
      }
    } catch (err) {
      log(`Reveal error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setRevealLoading(false);
    }
  }, [activeDraftId, log]);

  const handleClaim = useCallback(async () => {
    if (!activeDraftId || activeDraftVersion === null) return;
    setClaimLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: activeDraftId, expectedVersion: activeDraftVersion }),
      });
      const data = await res.json() as ApiResult<ClaimResult>;
      if (data.success) {
        updateActiveDraftVersion(data.result.newVersion);
        setClaimed(true);
        updateActiveDraftStatus('agent_claimed');
        log(`Draft claimed, lease expires ${data.result.claimLeaseExpiresAtIso}`);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown';
      log(`Claim error: ${detail}`);
      throw err;
    } finally {
      setClaimLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, log, updateActiveDraftStatus, updateActiveDraftVersion]);

  const handleProcessing = useCallback(async () => {
    if (!activeDraftId || activeDraftVersion === null) return;
    setProcessingLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/processing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: activeDraftId, expectedVersion: activeDraftVersion }),
      });
      const data = await res.json() as ApiResult<ProcessingResult>;
      if (data.success) {
        updateActiveDraftVersion(data.result.newVersion);
        setProcessing(true);
        updateActiveDraftStatus('agent_processing');
        log(`Agent processing started (v${data.result.newVersion})`);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown';
      log(`Processing error: ${detail}`);
      throw err;
    } finally {
      setProcessingLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, log, updateActiveDraftStatus, updateActiveDraftVersion]);

  const handleOutcome = useCallback(async (outcome: string, notes: string) => {
    if (!activeDraftId || activeDraftVersion === null) return;
    setOutcomeLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: activeDraftId,
          expectedVersion: activeDraftVersion,
          outcome,
          notes,
        }),
      });
      const data = await res.json() as ApiResult<OutcomeResult>;
      if (data.success) {
        const outcomeLabel = OUTCOME_LABELS[outcome] ?? outcome;
        setCompletionNotice(`Ticket closed: ${outcomeLabel}. The draft is now ${data.result.newStatus}.`);
        setQueue((current) => current.filter((card) => card.bookingDraftId !== activeDraftId));
        activeDraftIdRef.current = null;
        setActiveDraftId(null);
        updateActiveDraftVersion(null);
        updateActiveDraftStatus(null);
        setRevealedPacket(null);
        setVerified(false);
        setClaimed(false);
        setProcessing(false);
        setOutcomeCompleted(false);
        setLookupResult(null);
        setLookupInput('');
        setVerificationNotes('');
        log(`Outcome recorded: ${outcomeLabel} → ${data.result.newStatus}`);
        void pollQueue();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown';
      log(`Outcome error: ${detail}`);
      throw err;
    } finally {
      setOutcomeLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, log, pollQueue, updateActiveDraftStatus, updateActiveDraftVersion]);

  const handleReconcile = useCallback(async () => {
    if (!activeDraftId || activeDraftVersion === null || !bookingReference.trim()) return;
    setReconcileLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: activeDraftId,
          expectedVersion: activeDraftVersion,
          bookingReference: bookingReference.trim(),
          evidenceType,
        }),
      });
      const data = await res.json() as ApiResult<OutcomeResult>;
      if (!data.success) throw new Error(data.error);
      setCompletionNotice('Booking confirmed after authoritative reference reconciliation.');
      log(`Reconciliation completed (v${data.result.newVersion})`);
      activeDraftIdRef.current = null;
      setActiveDraftId(null);
      updateActiveDraftVersion(null);
      updateActiveDraftStatus(null);
      setRevealedPacket(null);
      setVerified(false);
      setClaimed(false);
      setProcessing(false);
      setOperatorDetail(null);
      setBookingReference('');
      void pollQueue();
    } catch (err) {
      log(`Reconciliation error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setReconcileLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, bookingReference, evidenceType, log, pollQueue, updateActiveDraftStatus, updateActiveDraftVersion]);

  const handleOperatorAction = useCallback(async (
    action: 'call_guest' | 'email_guest' | 'request_field' | 'correct_field'
  ) => {
    if (!activeDraftId || activeDraftVersion === null) return;
    setOperatorActionLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: activeDraftId,
          action,
          fieldId: operatorFieldId,
          value: operatorFieldValue,
          expectedVersion: activeDraftVersion,
        }),
      });
      const data = await res.json() as ApiResult<{
        href?: string;
        newVersion?: number;
        fieldId?: string;
      }>;
      if (!data.success) throw new Error(data.error);
      if (data.result.newVersion) updateActiveDraftVersion(data.result.newVersion);
      if (data.result.href) window.location.href = data.result.href;
      log(`Operator action recorded: ${action}`);
      if (action === 'correct_field') setOperatorFieldValue('');
      void loadDetail(activeDraftId);
    } catch (err) {
      log(`Operator action failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setOperatorActionLoading(false);
    }
  }, [
    activeDraftId,
    activeDraftVersion,
    loadDetail,
    log,
    operatorFieldId,
    operatorFieldValue,
    updateActiveDraftVersion,
  ]);

  const resetSession = useCallback(() => {
    activeDraftIdRef.current = null;
    setActiveDraftId(null);
    updateActiveDraftVersion(null);
    updateActiveDraftStatus(null);
    setRevealedPacket(null);
    setVerified(false);
    setLookupResult(null);
    setLookupInput('');
    setVerificationNotes('');
    setClaimed(false);
    setProcessing(false);
    setOutcomeCompleted(false);
    setOperatorDetail(null);
    setBookingReference('');
    log('Session reset');
  }, [log, updateActiveDraftStatus, updateActiveDraftVersion]);

  const handleDismiss = useCallback(async (card: QueueCard) => {
    const staleProcessingDraft = card.status === 'agent_processing';
    const confirmed = window.confirm(
      staleProcessingDraft
        ? `Close this stale in-progress draft for ${card.firstName || 'this guest'}? Its operator claim has expired. This cancels the draft but preserves its audit history.`
        : `Dismiss ${card.firstName || 'this guest'} from the active queue? This cancels the draft but preserves its audit history.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/booking-assistant/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: card.bookingDraftId,
          expectedVersion: card.version,
          reason: staleProcessingDraft
            ? 'expired_processing_claim_cleanup'
            : 'operator_queue_cleanup',
        }),
      });
      const data = await res.json() as ApiResult<DismissResult>;
      if (!data.success) throw new Error(data.error);

      setQueue((current) => current.filter((entry) => entry.bookingDraftId !== card.bookingDraftId));
      if (activeDraftId === card.bookingDraftId) {
        resetSession();
      }
      log(`Draft dismissed from queue (v${data.result.newVersion})`);
    } catch (err) {
      log(`Dismiss failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }, [activeDraftId, log, resetSession]);

  // ── Guest Simulator handlers ──

  const handleQuickSend = useCallback(async () => {
    setGuestQuickSendLoading(true);
    setGuestError(null);
    setGuestSaveResult(null);
    try {
      const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const nowIso = new Date().toISOString();

      // Step 1: Create draft with full packet (travelers + cabin + decisions)
      const saveRes = await fetch('/api/booking-assistant/guest/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId,
          personId: `person-${Date.now()}`,
          dealSnapshot: {
            dealId: 'test-deal-001',
            packageId: 'pkg-001',
            siid: 'SI-001',
            cruiseLine: 'MSC Cruises',
            ship: 'MSC Seaview',
            sailingDateIso: '2026-08-22',
            nights: 7,
            departurePort: 'Miami',
            itineraryLabel: '7-Night Caribbean',
            dealAngle: 'Senior discount',
            priceDisplay: '$599',
            currency: 'USD',
            taxFeeBasis: 'per person',
            priceCapturedAtIso: nowIso,
            sourceBookingUrl: 'https://example.com/deal/001',
            linkHealthState: 'unknown',
          },
          contact: {
            firstName: guestFirstName,
            email: guestEmail,
            phoneE164: `+1${digitsOnly(guestPhone)}`,
            preferredChannel: 'phone',
            emailVerified: true,
            phoneVerified: true,
            transactionalEmailConsent: true,
            callbackConsent: true,
            smsConsent: false,
            marketingConsent: false,
          },
          travelers: [
            {
              travelerId: 'traveler-1',
              isPrimary: true,
              classification: 'adult',
              title: 'Mr',
              supplierGender: 'M',
              legalFirstName: guestFirstName,
              legalLastName: 'Testerson',
              dateOfBirth: '1965-03-15',
              ageAtSailing: 61,
              nationality: 'US',
              residencyCountry: 'US',
              residencyStateProvince: 'FL',
              accessibilityNeeds: 'none',
              rateQualificationClaims: [],
              fieldStatuses: {},
            },
            {
              travelerId: 'traveler-2',
              isPrimary: false,
              classification: 'adult',
              title: 'Mrs',
              supplierGender: 'F',
              legalFirstName: 'Jane',
              legalLastName: 'Testerson',
              dateOfBirth: '1968-07-22',
              ageAtSailing: 58,
              nationality: 'US',
              residencyCountry: 'US',
              residencyStateProvince: 'FL',
              rateQualificationClaims: [],
              fieldStatuses: {},
            },
          ],
          cabin: {
            cabinId: 'cabin-1',
            assignedTravelerIds: ['traveler-1', 'traveler-2'],
            categoryPreference: 'Balcony',
            cabinPreference: 'Mid-ship',
            accessibilityRequirement: 'none',
            qualifyingTravelerIds: ['traveler-1', 'traveler-2'],
            rateCandidates: [],
          },
          decisions: {
            travelInsuranceDecision: 'Yes, I would like to discuss travel insurance options with the agent',
            passengerDataReviewConfirmed: true,
            packetStorageConsent: true,
          },
          initialStatus: 'collecting',
        }),
      });
      const saveData = await saveRes.json() as ApiResult<GuestSaveResult>;
      if (!saveData.success) {
        setGuestError(saveData.error);
        log(`Quick send save failed: ${saveData.error}`);
        return;
      }
      setGuestSaveResult(saveData.result);
      activeDraftIdRef.current = saveData.result.draftId;
      setActiveDraftId(saveData.result.draftId);
      updateActiveDraftVersion(saveData.result.version);
      log(`Quick send: draft created ${saveData.result.draftId} v${saveData.result.version}, key=${saveData.result.fallbackCallKey.rawKey}`);

      // Step 2: Mark review ready (transitions to review_ready)
      const reviewRes = await fetch('/api/booking-assistant/guest/review-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: saveData.result.draftId,
          expectedVersion: saveData.result.version,
          travelers: [
            {
              travelerId: 'traveler-1',
              isPrimary: true,
              classification: 'adult',
              title: 'Mr',
              supplierGender: 'M',
              legalFirstName: guestFirstName,
              legalLastName: 'Testerson',
              dateOfBirth: '1965-03-15',
              ageAtSailing: 61,
              nationality: 'US',
              residencyCountry: 'US',
              residencyStateProvince: 'FL',
              accessibilityNeeds: 'none',
              rateQualificationClaims: [],
              fieldStatuses: {},
            },
            {
              travelerId: 'traveler-2',
              isPrimary: false,
              classification: 'adult',
              title: 'Mrs',
              supplierGender: 'F',
              legalFirstName: 'Jane',
              legalLastName: 'Testerson',
              dateOfBirth: '1968-07-22',
              ageAtSailing: 58,
              nationality: 'US',
              residencyCountry: 'US',
              residencyStateProvince: 'FL',
              rateQualificationClaims: [],
              fieldStatuses: {},
            },
          ],
          cabin: {
            cabinId: 'cabin-1',
            assignedTravelerIds: ['traveler-1', 'traveler-2'],
            categoryPreference: 'Balcony',
            cabinPreference: 'Mid-ship',
            accessibilityRequirement: 'none',
            qualifyingTravelerIds: ['traveler-1', 'traveler-2'],
            rateCandidates: [],
          },
          decisions: {
            travelInsuranceDecision: 'Yes, I would like to discuss travel insurance options with the agent',
            passengerDataReviewConfirmed: true,
            packetStorageConsent: true,
          },
        }),
      });
      const reviewData = await reviewRes.json() as ApiResult<{ newVersion: number }>;
      if (!reviewData.success) {
        log(`Quick send review-ready failed: ${reviewData.error}`);
        return;
      }
      updateActiveDraftVersion(reviewData.result.newVersion);
      log(`Quick send: review ready v${reviewData.result.newVersion}`);

      // Step 3: Signal call intent (transitions to call_signal_pending)
      const signalRes = await fetch('/api/booking-assistant/guest/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: saveData.result.draftId,
          expectedVersion: reviewData.result.newVersion,
        }),
      });
      const signalData = await signalRes.json() as ApiResult<GuestSignalResult>;
      if (signalData.success) {
        updateActiveDraftVersion(signalData.result.newVersion);
        log(`Quick send: call intent signaled v${signalData.result.newVersion} — draft should appear in queue now`);
      } else {
        log(`Quick send signal failed: ${signalData.error}`);
      }
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : 'Quick send failed');
      log(`Quick send error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setGuestQuickSendLoading(false);
    }
  }, [guestFirstName, guestEmail, guestPhone, log, updateActiveDraftVersion]);

  const handleGuestSave = useCallback(async () => {
    setGuestSaveLoading(true);
    setGuestError(null);
    setGuestSaveResult(null);
    try {
      const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch('/api/booking-assistant/guest/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId,
          personId: `person-${Date.now()}`,
          dealSnapshot: {
            dealId: 'test-deal-001',
            packageId: 'pkg-001',
            siid: 'SI-001',
            cruiseLine: 'MSC Cruises',
            ship: 'MSC Seaview',
            sailingDateIso: '2026-08-22',
            nights: 7,
            departurePort: 'Miami',
            itineraryLabel: '7-Night Caribbean',
            dealAngle: 'Senior discount',
            priceDisplay: '$599',
            currency: 'USD',
            taxFeeBasis: 'per person',
            priceCapturedAtIso: new Date().toISOString(),
            sourceBookingUrl: 'https://example.com/deal/001',
            linkHealthState: 'unknown',
          },
          contact: {
            firstName: guestFirstName,
            email: guestEmail,
            phone: guestPhone,
            preferredChannel: 'phone',
            consentToCall: true,
            consentToEmail: true,
          },
          initialStatus: 'ready_to_call_agent',
        }),
      });
      const data = await res.json() as ApiResult<GuestSaveResult>;
      if (data.success) {
        setGuestSaveResult(data.result);
        activeDraftIdRef.current = data.result.draftId;
        setActiveDraftId(data.result.draftId);
        updateActiveDraftVersion(data.result.version);
        log(`Guest save: draft ${data.result.draftId} v${data.result.version}, key=${data.result.fallbackCallKey.rawKey}`);
      } else {
        setGuestError(data.error);
        log(`Guest save failed: ${data.error}`);
      }
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : 'Guest save failed');
      log(`Guest save error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setGuestSaveLoading(false);
    }
  }, [guestFirstName, guestEmail, guestPhone, log, updateActiveDraftVersion]);

  const handleGuestSignal = useCallback(async () => {
    if (!guestSaveResult) return;
    setGuestSignalLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/guest/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: guestSaveResult.draftId,
          expectedVersion: guestSaveResult.version,
        }),
      });
      const data = await res.json() as ApiResult<GuestSignalResult>;
      if (data.success) {
        updateActiveDraftVersion(data.result.newVersion);
        log(`Call intent signaled: ${data.result.callAttemptId}, expires ${data.result.signalExpiresAtIso}`);
      } else {
        log(`Signal failed: ${data.error}`);
      }
    } catch (err) {
      log(`Signal error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setGuestSignalLoading(false);
    }
  }, [guestSaveResult, log, updateActiveDraftVersion]);

  const handleGuestReviewReady = useCallback(async () => {
    if (!guestSaveResult) return;
    setGuestReviewLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/guest/review-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: guestSaveResult.draftId,
          expectedVersion: guestSaveResult.version,
        }),
      });
      const data = await res.json() as ApiResult<{ newVersion: number }>;
      if (data.success) {
        updateActiveDraftVersion(data.result.newVersion);
        log(`Review ready: v${data.result.newVersion}`);
      } else {
        log(`Review ready failed: ${data.error}`);
      }
    } catch (err) {
      log(`Review ready error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setGuestReviewLoading(false);
    }
  }, [guestSaveResult, log, updateActiveDraftVersion]);

  return (
    <div className={`${embedded ? '' : 'min-h-screen p-6'} bg-slate-950 text-slate-100`}>
      <div className="max-w-7xl mx-auto">
        {!embedded && (
          <>
            <h1 className="text-2xl font-bold text-slate-100 mb-1">Booking Assistant Operator Console</h1>
            <p className="text-sm text-slate-400 mb-6">Localhost-only operator surface for the booking pilot</p>
          </>
        )}
        {completionNotice && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
            <span>{completionNotice}</span>
            <button
              onClick={() => setCompletionNotice(null)}
              className="text-xs font-medium text-emerald-100 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Agent availability controls */}
        <section className={`mb-6 rounded-lg border p-4 ${
          availability?.mode === 'no_agents'
            ? 'border-amber-700 bg-amber-950/30'
            : 'border-emerald-800 bg-emerald-950/20'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Agent availability</p>
              <p className={`mt-1 text-lg font-bold ${
                availability?.mode === 'no_agents' ? 'text-amber-300' : 'text-emerald-300'
              }`}>
                {availability?.mode === 'no_agents' ? 'No Agents mode' : 'Calls available'}
              </p>
              {availability?.mode === 'no_agents' && (
                <p className="mt-1 text-xs text-amber-200/80">
                  Guests can save their booking and request a callback, but no phone call will launch.
                  {availability.effectiveUntilIso
                    ? ` Automatically ends ${new Date(availability.effectiveUntilIso).toLocaleString()}.`
                    : ' Remains active until manually changed.'}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={availabilityLoading || !availability} onClick={() => void changeAvailability('available')} className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                Accept calls
              </button>
              <button
                type="button"
                disabled={availabilityLoading || !availability}
                onClick={() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  tomorrow.setHours(8, 0, 0, 0);
                  void changeAvailability('no_agents', tomorrow.toISOString());
                }}
                className="rounded bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                No Agents until tomorrow
              </button>
              <button type="button" disabled={availabilityLoading || !availability} onClick={() => void changeAvailability('no_agents')} className="rounded bg-slate-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                No Agents until changed
              </button>
            </div>
          </div>
        </section>

        {!embedded && (
          <OperatorCopilotPanel
            activeDraftId={activeDraftId}
            onSendToGuest={(draft) => customEmailComposerRef.current?.seed(draft)}
          />
        )}

        {!embedded && false && <div className="mb-6 bg-slate-900 rounded-lg border border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Guest Flow Simulator (E2E)</h2>
            <span className="text-[10px] text-slate-600">Creates real draft in DynamoDB via guest API</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">First Name</label>
              <input
                type="text"
                value={guestFirstName}
                onChange={(e) => setGuestFirstName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Email</label>
              <input
                type="text"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Phone</label>
              <input
                type="text"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleGuestSave}
                disabled={guestSaveLoading}
                className="w-full px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-white font-medium"
              >
                {guestSaveLoading ? 'Creating...' : 'Create Draft'}
              </button>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleQuickSend}
                disabled={guestQuickSendLoading}
                className="w-full px-4 py-2 text-sm bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded text-white font-medium"
              >
                {guestQuickSendLoading ? 'Sending...' : 'Quick Send Full Packet'}
              </button>
            </div>
          </div>
          {guestError && <p className="text-xs text-red-400 mt-2">{guestError}</p>}
          {guestSaveResult && (
            <div className="mt-3 p-3 bg-emerald-950/30 rounded border border-emerald-800/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Draft ID:</span>{' '}
                  <span className="font-mono text-slate-300">{guestSaveResult!.draftId}</span>
                </div>
                <div>
                  <span className="text-slate-500">Version:</span>{' '}
                  <span className="text-slate-300">v{guestSaveResult!.version}</span>
                </div>
                <div>
                  <span className="text-slate-500">Fallback Key:</span>{' '}
                  <span className="font-mono text-lg font-bold text-emerald-300 tracking-wider">{guestSaveResult!.fallbackCallKey.rawKey}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleGuestSignal}
                  disabled={guestSignalLoading}
                  className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-white font-medium"
                >
                  {guestSignalLoading ? 'Signaling...' : 'Signal Call Intent'}
                </button>
                <button
                  onClick={handleGuestReviewReady}
                  disabled={guestReviewLoading}
                  className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-slate-200 font-medium"
                >
                  {guestReviewLoading ? 'Marking...' : 'Mark Review Ready'}
                </button>
                <button
                  onClick={() => {
                    if (guestSaveResult) {
                      setLookupInput(guestSaveResult.fallbackCallKey.rawKey);
                      log('Copied key to lookup input');
                    }
                  }}
                  className="px-3 py-1.5 text-xs bg-sky-700 hover:bg-sky-600 rounded text-white font-medium"
                >
                  Copy Key to Lookup
                </button>
                <button
                  onClick={pollQueue}
                  disabled={queueLoading}
                  className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-slate-200 font-medium"
                >
                  Refresh Queue
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-600">
                E2E flow: Create Draft → Copy Key → Lookup → Verify → Reveal → Claim → Process → Outcome
              </p>
            </div>
          )}
        </div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left: Queue ── */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Pre-call Queue</h2>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={autoPoll}
                      onChange={(e) => setAutoPoll(e.target.checked)}
                      className="accent-sky-500"
                    />
                    Auto
                  </label>
                  <button
                    onClick={pollQueue}
                    disabled={queueLoading}
                    className="px-3 py-1 text-xs bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded text-white font-medium"
                  >
                    {queueLoading ? 'Polling...' : 'Poll'}
                  </button>
                </div>
              </div>
              {queueError && (
                <p className="text-xs text-red-400 mb-2">{queueError}</p>
              )}
              <p className="text-[10px] text-slate-600 mb-2">
                Drafts leave this queue when processing starts or an outcome is recorded. Dismiss cancels an unwanted test draft while retaining its audit record.
              </p>
              {queue.length === 0 && !queueLoading && (
                <p className="text-xs text-slate-500">No drafts in queue</p>
              )}
              <div className="space-y-4">
                <QueueSection
                  title="Live calls now"
                  hint="Guests in this lane are trying to reach an agent right now."
                  emptyLabel="No live calls are waiting right now."
                  cards={liveQueue}
                  activeDraftId={activeDraftId}
                  lane="live_calls"
                  onSelect={selectQueueDraft}
                  onDismiss={(card) => { void handleDismiss(card); }}
                />
                <QueueSection
                  title="Callback requests"
                  hint="Guests in this lane asked to be called back. Claim one to reveal the packet and return the call."
                  emptyLabel="No callback requests are waiting right now."
                  cards={callbackQueue}
                  activeDraftId={activeDraftId}
                  lane="callbacks"
                  onSelect={selectQueueDraft}
                  onDismiss={(card) => { void handleDismiss(card); }}
                />
                <QueueSection
                  title="Waiting for guest call"
                  hint="These packets are complete, but the guest has not called or requested a callback yet."
                  emptyLabel="No completed packets are waiting for a guest call."
                  cards={waitingQueue}
                  activeDraftId={activeDraftId}
                  lane="waiting_packets"
                  onSelect={selectQueueDraft}
                  onDismiss={(card) => { void handleDismiss(card); }}
                />
                {otherQueue.length > 0 && (
                  <QueueSection
                    title="Other queue items"
                    hint="Less common states that still need review."
                    emptyLabel="No other queue items."
                    cards={otherQueue}
                    activeDraftId={activeDraftId}
                    lane="other"
                    onSelect={selectQueueDraft}
                    onDismiss={(card) => { void handleDismiss(card); }}
                  />
                )}
              </div>
            </div>

            {/* Action Log */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Action Log</h2>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {actionLog.length === 0 && (
                  <p className="text-xs text-slate-500">No actions yet</p>
                )}
                {actionLog.map((entry, i) => (
                  <p key={i} className="text-[11px] text-slate-400 font-mono">{entry}</p>
                ))}
              </div>
            </div>
          </div>

          {/* ── Center: Lookup + Workflow ── */}
          <div className="lg:col-span-1 space-y-4">
            {/* Fallback Key Lookup */}
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Fallback Key Lookup</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={lookupInput}
                  onChange={(e) => setLookupInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                  placeholder="3-letter key (e.g. MAP)"
                  maxLength={3}
                  className="flex-1 px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono uppercase tracking-wider focus:border-sky-500 focus:outline-none"
                />
                <button
                  onClick={handleLookup}
                  disabled={lookupLoading || !lookupInput.trim()}
                  className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded text-white font-medium"
                >
                  {lookupLoading ? '...' : 'Lookup'}
                </button>
              </div>
              {lookupError && <p className="text-xs text-red-400 mt-2">{lookupError}</p>}
              {lookupResult && (
                <div className="mt-3 p-3 bg-slate-950/50 rounded border border-slate-800">
                  {lookupResult.result === 'match' && (
                    <>
                      <p className="text-xs text-green-400 font-medium mb-2">Match found</p>
                      <dl className="space-y-1 text-xs">
                        <div><dt className="text-slate-500 inline">Draft:</dt> <dd className="text-slate-300 font-mono inline">{lookupResult.draftId}</dd></div>
                        <div><dt className="text-slate-500 inline">Caller:</dt> <dd className="text-slate-300 inline">{lookupResult.maskedCallerSummary}</dd></div>
                        <div><dt className="text-slate-500 inline">Deal:</dt> <dd className="text-slate-300 inline">{lookupResult.dealSummary}</dd></div>
                        <div><dt className="text-slate-500 inline">Packet v:</dt> <dd className="text-slate-300 inline">{lookupResult.packetVersion}</dd></div>
                        <div><dt className="text-slate-500 inline">Issued:</dt> <dd className="text-slate-300 inline">{lookupResult.issuedAtIso}</dd></div>
                      </dl>
                    </>
                  )}
                  {lookupResult.result === 'no_match' && (
                    <p className="text-xs text-amber-400">No match found for this key</p>
                  )}
                  {lookupResult.result === 'invalid_key' && (
                    <p className="text-xs text-red-400">Invalid key — must be 3 letters from the registry</p>
                  )}
                </div>
              )}
            </div>

            {/* Caller Verification */}
            {activeDraftId && (
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Caller Verification</h2>
                <p className="text-xs text-slate-500 mb-3">Draft: <span className="font-mono text-slate-300">{activeDraftId}</span></p>
                <div className={`mb-3 rounded border px-3 py-2 text-xs ${draftMode.tone}`}>
                  <p className="font-semibold uppercase tracking-wide">{draftMode.label}</p>
                  <p className="mt-1 normal-case tracking-normal">{draftMode.hint}</p>
                </div>
                {activeDraftStatus === 'call_signal_pending' && !verified && (
                  <button
                    onClick={handleAcknowledge}
                    disabled={acknowledgeLoading || activeDraftVersion === null}
                    className="w-full mb-3 px-4 py-2 text-sm bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded text-white font-medium"
                  >
                    {acknowledgeLoading ? 'Pinning call...' : 'Pin + acknowledge call intent'}
                  </button>
                )}
                {activeDraftStatus === 'human_requested' && !claimed && (
                  <>
                    <button
                      onClick={() => void handleClaim()}
                      disabled={claimLoading || activeDraftVersion === null}
                      className="w-full mb-3 px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-white font-medium"
                    >
                      {claimLoading ? 'Claiming callback...' : 'Claim callback request'}
                    </button>
                    <p className="mb-3 rounded border border-amber-800/60 bg-amber-950/20 p-2 text-xs text-amber-200">
                      Claim this callback request to unlock the guest packet and callback details.
                    </p>
                  </>
                )}
                {activeDraftStatus === 'agent_claimed' && claimed && !verified && (
                  <button
                    type="button"
                    disabled={operatorActionLoading}
                    onClick={() => void handleOperatorAction('call_guest')}
                    className="w-full mb-3 px-4 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-white font-medium"
                  >
                    Call guest
                  </button>
                )}
                {(activeDraftStatus === 'review_ready' || activeDraftStatus === 'ready_to_call_agent') && (
                  <p className="mb-3 rounded border border-slate-700 bg-slate-950/50 p-2 text-xs text-slate-400">
                    The guest has completed their packet. Wait until they call and signal the handoff before verifying or claiming this draft.
                  </p>
                )}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Caller ID State</label>
                    <select
                      value={selectedCallerIdState}
                      onChange={(e) => setSelectedCallerIdState(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-sky-500 focus:outline-none"
                    >
                      {CALLER_ID_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Verification Notes</label>
                    <textarea
                      value={verificationNotes}
                      onChange={(e) => setVerificationNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-sky-500 focus:outline-none"
                      placeholder="Optional notes..."
                    />
                  </div>
                  <button
                    onClick={handleVerify}
                    disabled={
                      verifyLoading ||
                      verified ||
                      (activeDraftStatus !== 'calling_now' && activeDraftStatus !== 'agent_claimed')
                    }
                    className="w-full px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-white font-medium"
                  >
                    {verified ? 'Verified ✓' : verifyLoading ? 'Verifying...' : 'Record Verification'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-600 mt-2">Caller ID is never authentication. Verify through approved procedure.</p>
              </div>
            )}

            {/* Packet Reveal */}
            {canRevealPacket(activeDraftStatus, claimed, verified) && activeDraftId && (
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Packet Reveal</h2>
                {!verified && activeDraftStatus === 'agent_claimed' && (
                  <p className="mb-3 rounded border border-amber-800/60 bg-amber-950/20 p-2 text-xs text-amber-200">
                    This was a callback request. Reveal the packet to get the guest&apos;s callback phone number and saved details.
                  </p>
                )}
                {!revealedPacket && (
                  <button
                    onClick={handleReveal}
                    disabled={revealLoading}
                    className="w-full px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded text-white font-medium"
                  >
                    {revealLoading ? 'Revealing...' : 'Reveal Full Packet'}
                  </button>
                )}
                {revealedPacket && (
                  <>
                    <GuestInfoPanel draft={revealedPacket.draft} />
                    <div className="mt-4 rounded border border-slate-800 bg-slate-950/50 p-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Audited operator actions
                      </h3>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={operatorActionLoading}
                          onClick={() => void handleOperatorAction('call_guest')}
                          className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Call guest
                        </button>
                        <button
                          type="button"
                          disabled={operatorActionLoading}
                          onClick={() => void handleOperatorAction('email_guest')}
                          className="rounded bg-sky-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Email guest
                        </button>
                      </div>
                      <select
                        value={operatorFieldId}
                        onChange={(event) => setOperatorFieldId(event.target.value)}
                        className="mt-3 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                      >
                        <option value="preferences.cabin">Cabin preference</option>
                        <option value="preferences.insurance">Insurance preference</option>
                        <option value="preferences.accessibility">Accessibility needs</option>
                        <option value="contact.email">Guest email</option>
                        <option value="travelers.legal_identity">Legal identity</option>
                      </select>
                      <input
                        type="text"
                        value={operatorFieldValue}
                        onChange={(event) => setOperatorFieldValue(event.target.value)}
                        placeholder="Tier A correction value"
                        className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
                      />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={operatorActionLoading}
                          onClick={() => void handleOperatorAction('request_field')}
                          className="rounded bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Request from guest
                        </button>
                        <button
                          type="button"
                          disabled={
                            operatorActionLoading ||
                            !operatorFieldValue.trim() ||
                            (operatorFieldId !== 'preferences.cabin' &&
                              operatorFieldId !== 'preferences.insurance')
                          }
                          onClick={() => void handleOperatorAction('correct_field')}
                          className="rounded bg-purple-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Correct Tier A field
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-slate-500">
                        Protected guest fields cannot be edited here; request them from the guest.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Right: Call Checklist ── */}
          <div className="lg:col-span-1 space-y-4">
            {activeDraftId && (
              <>
                {/* Active Draft Status */}
                <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                  <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Active Draft</h2>
                  <dl className="space-y-1 text-xs">
                    <div><dt className="text-slate-500 inline">ID:</dt> <dd className="text-slate-300 font-mono inline">{activeDraftId}</dd></div>
                    <div><dt className="text-slate-500 inline">Version:</dt> <dd className="text-slate-300 inline">{activeDraftVersion ?? '?'}</dd></div>
                    <div><dt className="text-slate-500 inline">Status:</dt> <dd className="text-slate-300 inline">{activeDraftStatus ?? 'from lookup'}</dd></div>
                    <div><dt className="text-slate-500 inline">Verified:</dt> <dd className={verified ? 'text-green-400 inline' : 'text-slate-500 inline'}>{verified ? 'Yes' : 'No'}</dd></div>
                    <div><dt className="text-slate-500 inline">Revealed:</dt> <dd className={revealedPacket ? 'text-green-400 inline' : 'text-slate-500 inline'}>{revealedPacket ? 'Yes' : 'No'}</dd></div>
                    <div><dt className="text-slate-500 inline">Claimed:</dt> <dd className={claimed ? 'text-green-400 inline' : 'text-slate-500 inline'}>{claimed ? 'Yes' : 'No'}</dd></div>
                    <div><dt className="text-slate-500 inline">Processing:</dt> <dd className={processing ? 'text-green-400 inline' : 'text-slate-500 inline'}>{processing ? 'Yes' : 'No'}</dd></div>
                  </dl>
                  <button
                    onClick={resetSession}
                    className="mt-3 w-full px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                  >
                    Reset Session
                  </button>
                </div>

                {(verified || activeDraftStatus === 'agent_claimed') && (
                  activeDraftStatus === 'call_signal_pending' ||
                  activeDraftStatus === 'calling_now' ||
                  activeDraftStatus === 'agent_claimed' ||
                  activeDraftStatus === 'agent_processing'
                ) && (
                  <CallChecklist
                    draftId={activeDraftId}
                    onClaim={handleClaim}
                    onProcessing={handleProcessing}
                    onOutcome={handleOutcome}
                    claimLoading={claimLoading}
                    processingLoading={processingLoading}
                    outcomeLoading={outcomeLoading}
                    verified={verified}
                    claimed={claimed}
                    revealed={revealedPacket !== null || activeDraftStatus === 'agent_processing'}
                    processing={processing}
                    completed={outcomeCompleted}
                  />
                )}
              </>
            )}

            {!activeDraftId && (
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-8 text-center">
                <p className="text-sm text-slate-500">
                  Look up a fallback key or select a draft from the queue to begin
                </p>
              </div>
            )}
          </div>
        </div>

        {activeDraftStatus === 'reconciliation_review' && activeDraftId && (
          <section className="mt-6 rounded-lg border border-fuchsia-800/60 bg-fuchsia-950/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fuchsia-200">
              Booking-reference reconciliation
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Confirmation remains blocked until the reference is verified against CBAT Trip or the supplier confirmation.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px_auto]">
              <input
                type="text"
                value={bookingReference}
                onChange={(event) => setBookingReference(event.target.value)}
                placeholder="Authoritative booking reference"
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
              <select
                value={evidenceType}
                onChange={(event) => setEvidenceType(event.target.value as typeof evidenceType)}
                className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="cbat_trip">CBAT Trip</option>
                <option value="supplier_confirmation">Supplier confirmation</option>
              </select>
              <button
                type="button"
                onClick={handleReconcile}
                disabled={reconcileLoading || !bookingReference.trim()}
                className="rounded bg-fuchsia-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {reconcileLoading ? 'Reconciling...' : 'Confirm booking'}
              </button>
            </div>
          </section>
        )}

        {activeDraftId && (
          <section className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Live draft detail
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Current state, audited journey, and claim-gated conversation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadDetail(activeDraftId)}
                disabled={detailLoading}
                className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              >
                {detailLoading ? 'Refreshing...' : 'Refresh detail'}
              </button>
            </div>
            {operatorDetail && (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <DetailValue label="Status" value={operatorDetail.currentState.status} />
                  <DetailValue label="Packet" value={`v${operatorDetail.currentState.packetVersion}`} />
                  <DetailValue
                    label="Claim lease"
                    value={operatorDetail.currentState.claimLeaseExpiresAtIso
                      ? new Date(operatorDetail.currentState.claimLeaseExpiresAtIso).toLocaleString()
                      : 'Not claimed'}
                  />
                  <DetailValue
                    label="Completion mode"
                    value={`${operatorDetail.currentState.completionMode} (fixed)`}
                  />
                </div>
                <div className="mt-3 rounded border border-slate-800 bg-slate-950/50 p-3">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Completion mode
                  </label>
                  <select
                    value={operatorDetail.currentState.completionMode}
                    disabled
                    title="Completion mode is fixed once live execution begins"
                    className="mt-1 w-full rounded border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400"
                  >
                    <option value="call_agent_to_finalize_v1">Call agent to finalize (pilot)</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Future completion modes remain disabled after call signaling, claim, or supplier execution begins.
                  </p>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded border border-slate-800 bg-slate-950/50 p-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Journey replay</h3>
                    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                      {operatorDetail.journey.map((step) => (
                        <div key={`${step.sequence}-${step.eventType}`} className="border-l border-sky-700 pl-3 text-xs">
                          <p className="text-slate-200">{step.label}</p>
                          <p className="text-slate-500">
                            {new Date(step.occurredAtIso).toLocaleString()} · {step.actorType}
                            {step.detail ? ` · ${step.detail}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/50 p-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conversation</h3>
                    {operatorDetail.conversationLocked ? (
                      <p className="mt-3 text-xs text-amber-300">
                        Conversation is locked until this operator holds an active claim.
                      </p>
                    ) : operatorDetail.conversations.length === 0 ? (
                      <p className="mt-3 text-xs text-slate-500">No stored conversation turns.</p>
                    ) : (
                      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                        {operatorDetail.conversations.map((turn) => (
                          <div key={turn.turnId} className="rounded bg-slate-900 p-2 text-xs">
                            <p className="font-semibold text-slate-400">{turn.role} · {turn.channel}</p>
                            <p className="mt-1 whitespace-pre-wrap text-slate-200">{turn.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {!embedded && (
          <CustomEmailComposer
            ref={customEmailComposerRef}
            activeDraftId={activeDraftId}
            onLog={log}
          />
        )}
      </div>
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xs text-slate-200">{value}</p>
    </div>
  );
}

export default function BookingAssistantOperatorConsolePage() {
  return <BookingAssistantOperatorWorkspace />;
}
