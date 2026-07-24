'use client';

import { useState, useCallback, useEffect } from 'react';
import { GuestInfoPanel } from './guest-info-panel';
import { CallChecklist } from './call-checklist';

// ── Types ───────────────────────────────────────────────────────────────────

interface QueueCard {
  bookingDraftId: string;
  firstName: string;
  dealSummary: string;
  status: string;
  completionPct: number;
  urgency: string;
  lastActivityIso: string;
  missingSections: string[];
  channels: string[];
}

interface LookupResult {
  result: 'match' | 'no_match' | 'invalid_key';
  draftId?: string;
  maskedCallerSummary?: string;
  dealSummary?: string;
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

// ── Page ────────────────────────────────────────────────────────────────────

export default function BookingAssistantOperatorConsolePage() {
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
  const [revealedPacket, setRevealedPacket] = useState<RevealResult | null>(null);
  const [verified, setVerified] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [processingLoading, setProcessingLoading] = useState(false);
  const [outcomeLoading, setOutcomeLoading] = useState(false);

  const [selectedCallerIdState, setSelectedCallerIdState] = useState<string>('matched');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [outcomeCompleted, setOutcomeCompleted] = useState(false);

  // ── Guest Simulator state ──
  const [guestFirstName, setGuestFirstName] = useState('Test');
  const [guestEmail, setGuestEmail] = useState('test@example.com');
  const [guestPhone, setGuestPhone] = useState('555-123-4567');
  const [guestSaveLoading, setGuestSaveLoading] = useState(false);
  const [guestSaveResult, setGuestSaveResult] = useState<GuestSaveResult | null>(null);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestSignalLoading, setGuestSignalLoading] = useState(false);
  const [guestReviewLoading, setGuestReviewLoading] = useState(false);

  const [actionLog, setActionLog] = useState<string[]>([]);

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setActionLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const pollQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      const res = await fetch('/api/booking-assistant/queue');
      const data = await res.json() as QueueApiResponse;
      if (data.success) {
        const cards = 'result' in data ? data.result.cards : data.cards;
        setQueue(cards);
        log(`Queue polled: ${cards.length} cards`);
      } else {
        setQueueError(data.error);
      }
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Queue poll failed');
    } finally {
      setQueueLoading(false);
    }
  }, [log]);

  useEffect(() => {
    if (!autoPoll) return;
    const interval = setInterval(pollQueue, 5000);
    return () => clearInterval(interval);
  }, [autoPoll, pollQueue]);

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
          setActiveDraftId(data.result.draftId);
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
  }, [lookupInput, log]);

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
        setActiveDraftVersion(data.result.newVersion);
        log(`Caller verified: ${selectedCallerIdState} (event ${data.result.journalEventId})`);
      } else {
        log(`Verify failed: ${data.error}`);
      }
    } catch (err) {
      log(`Verify error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setVerifyLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, selectedCallerIdState, verificationNotes, log]);

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

  const [claimed, setClaimed] = useState(false);
  const [processing, setProcessing] = useState(false);

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
        setActiveDraftVersion(data.result.newVersion);
        setClaimed(true);
        log(`Draft claimed, lease expires ${data.result.claimLeaseExpiresAtIso}`);
      } else {
        log(`Claim failed: ${data.error}`);
      }
    } catch (err) {
      log(`Claim error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setClaimLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, log]);

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
        setActiveDraftVersion(data.result.newVersion);
        setProcessing(true);
        log(`Agent processing started (v${data.result.newVersion})`);
      } else {
        log(`Processing failed: ${data.error}`);
      }
    } catch (err) {
      log(`Processing error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setProcessingLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, log]);

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
        setActiveDraftVersion(data.result.newVersion);
        setOutcomeCompleted(true);
        log(`Outcome recorded: ${OUTCOME_LABELS[outcome] ?? outcome} → ${data.result.newStatus}`);
      } else {
        log(`Outcome failed: ${data.error}`);
      }
    } catch (err) {
      log(`Outcome error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setOutcomeLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, log]);

  const resetSession = useCallback(() => {
    setActiveDraftId(null);
    setActiveDraftVersion(null);
    setRevealedPacket(null);
    setVerified(false);
    setLookupResult(null);
    setLookupInput('');
    setVerificationNotes('');
    setClaimed(false);
    setProcessing(false);
    setOutcomeCompleted(false);
    log('Session reset');
  }, [log]);

  // ── Guest Simulator handlers ──

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
        setActiveDraftId(data.result.draftId);
        setActiveDraftVersion(data.result.version);
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
  }, [guestFirstName, guestEmail, guestPhone, log]);

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
        setActiveDraftVersion(data.result.newVersion);
        log(`Call intent signaled: ${data.result.callAttemptId}, expires ${data.result.signalExpiresAtIso}`);
      } else {
        log(`Signal failed: ${data.error}`);
      }
    } catch (err) {
      log(`Signal error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setGuestSignalLoading(false);
    }
  }, [guestSaveResult, log]);

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
        setActiveDraftVersion(data.result.newVersion);
        log(`Review ready: v${data.result.newVersion}`);
      } else {
        log(`Review ready failed: ${data.error}`);
      }
    } catch (err) {
      log(`Review ready error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setGuestReviewLoading(false);
    }
  }, [guestSaveResult, log]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-100 mb-1">Booking Assistant Operator Console</h1>
        <p className="text-sm text-slate-400 mb-6">Localhost-only operator surface for the booking pilot</p>

        {/* ── Guest Flow Simulator (E2E) ── */}
        <div className="mb-6 bg-slate-900 rounded-lg border border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Guest Flow Simulator (E2E)</h2>
            <span className="text-[10px] text-slate-600">Creates real draft in DynamoDB via guest API</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
          </div>
          {guestError && <p className="text-xs text-red-400 mt-2">{guestError}</p>}
          {guestSaveResult && (
            <div className="mt-3 p-3 bg-emerald-950/30 rounded border border-emerald-800/50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Draft ID:</span>{' '}
                  <span className="font-mono text-slate-300">{guestSaveResult.draftId}</span>
                </div>
                <div>
                  <span className="text-slate-500">Version:</span>{' '}
                  <span className="text-slate-300">v{guestSaveResult.version}</span>
                </div>
                <div>
                  <span className="text-slate-500">Fallback Key:</span>{' '}
                  <span className="font-mono text-lg font-bold text-emerald-300 tracking-wider">{guestSaveResult.fallbackCallKey.rawKey}</span>
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left: Queue ── */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Queue</h2>
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
              {queue.length === 0 && !queueLoading && (
                <p className="text-xs text-slate-500">No drafts in queue</p>
              )}
              <div className="space-y-2">
                {queue.map((card) => (
                  <div
                    key={card.bookingDraftId}
                    className={`p-3 rounded border cursor-pointer transition-colors ${
                      activeDraftId === card.bookingDraftId
                        ? 'border-sky-500 bg-sky-950/40'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    }`}
                    onClick={() => {
                      setActiveDraftId(card.bookingDraftId);
                      log(`Selected draft: ${card.bookingDraftId}`);
                    }}
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
                        {card.urgency}
                      </span>
                    </div>
                    {card.dealSummary && (
                      <div className="text-xs text-slate-400">{card.dealSummary}</div>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-sky-400 font-medium">{card.status.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-slate-600">{card.lastActivityIso.slice(11, 19)}</span>
                    </div>
                  </div>
                ))}
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
                    disabled={verifyLoading || verified}
                    className="w-full px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-white font-medium"
                  >
                    {verified ? 'Verified ✓' : verifyLoading ? 'Verifying...' : 'Record Verification'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-600 mt-2">Caller ID is never authentication. Verify through approved procedure.</p>
              </div>
            )}

            {/* Packet Reveal */}
            {verified && activeDraftId && (
              <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Packet Reveal</h2>
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
                  <GuestInfoPanel draft={revealedPacket.draft} />
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

                {verified && (
                  <CallChecklist
                    draftId={activeDraftId}
                    onClaim={handleClaim}
                    onProcessing={handleProcessing}
                    onOutcome={handleOutcome}
                    claimLoading={claimLoading}
                    processingLoading={processingLoading}
                    outcomeLoading={outcomeLoading}
                    claimed={claimed}
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
      </div>
    </div>
  );
}
