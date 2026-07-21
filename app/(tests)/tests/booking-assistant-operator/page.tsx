'use client';

import { useState, useCallback, useEffect } from 'react';

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

type ApiResult<T> = { success: true; result: T } | { success: false; error: string };

const CALLER_ID_STATES = ['matched', 'different', 'blocked', 'unavailable'] as const;
const CALL_OUTCOMES = [
  'no_call_received',
  'disconnected_call_back',
  'needs_guest_decision',
  'material_change',
  'payment_failed',
  'declined',
  'completed_pending_reconciliation',
  'confirmed',
] as const;

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
  const [selectedOutcome, setSelectedOutcome] = useState<string>('confirmed');
  const [outcomeNotes, setOutcomeNotes] = useState('');

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
      const data = await res.json() as ApiResult<{ cards: QueueCard[] }>;
      if (data.success) {
        setQueue(data.result.cards);
        log(`Queue polled: ${data.result.cards.length} cards`);
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

  const handleOutcome = useCallback(async () => {
    if (!activeDraftId || activeDraftVersion === null) return;
    setOutcomeLoading(true);
    try {
      const res = await fetch('/api/booking-assistant/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: activeDraftId,
          expectedVersion: activeDraftVersion,
          outcome: selectedOutcome,
          notes: outcomeNotes,
        }),
      });
      const data = await res.json() as ApiResult<OutcomeResult>;
      if (data.success) {
        setActiveDraftVersion(data.result.newVersion);
        log(`Outcome recorded: ${OUTCOME_LABELS[selectedOutcome] ?? selectedOutcome} → ${data.result.newStatus}`);
      } else {
        log(`Outcome failed: ${data.error}`);
      }
    } catch (err) {
      log(`Outcome error: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setOutcomeLoading(false);
    }
  }, [activeDraftId, activeDraftVersion, selectedOutcome, outcomeNotes, log]);

  const resetSession = useCallback(() => {
    setActiveDraftId(null);
    setActiveDraftVersion(null);
    setRevealedPacket(null);
    setVerified(false);
    setLookupResult(null);
    setLookupInput('');
    setVerificationNotes('');
    setOutcomeNotes('');
    log('Session reset');
  }, [log]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-100 mb-1">Booking Assistant Operator Console</h1>
        <p className="text-sm text-slate-400 mb-6">Localhost-only operator surface for the booking pilot</p>

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
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-300">{card.bookingDraftId.slice(0, 12)}...</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        card.urgency === 'urgent' ? 'bg-red-900/50 text-red-300' :
                        card.urgency === 'normal' ? 'bg-amber-900/50 text-amber-300' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {card.urgency}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{card.status}</div>
                    <div className="text-[10px] text-slate-600 mt-1">{card.lastActivityIso}</div>
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
                <button
                  onClick={handleReveal}
                  disabled={revealLoading || !!revealedPacket}
                  className="w-full px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded text-white font-medium"
                >
                  {revealedPacket ? 'Revealed ✓' : revealLoading ? 'Revealing...' : 'Reveal Full Packet'}
                </button>
                {revealedPacket && (
                  <div className="mt-3 p-3 bg-slate-950/50 rounded border border-slate-800 max-h-64 overflow-y-auto">
                    <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap">
                      {JSON.stringify(revealedPacket.draft, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right: Claim, Processing, Outcome ── */}
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
                  </dl>
                  <button
                    onClick={resetSession}
                    className="mt-3 w-full px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                  >
                    Reset Session
                  </button>
                </div>

                {/* Claim */}
                <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                  <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Claim Draft</h2>
                  <button
                    onClick={handleClaim}
                    disabled={claimLoading || activeDraftVersion === null}
                    className="w-full px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-white font-medium"
                  >
                    {claimLoading ? 'Claiming...' : 'Claim'}
                  </button>
                </div>

                {/* Start Processing */}
                <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                  <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Agent Processing</h2>
                  <button
                    onClick={handleProcessing}
                    disabled={processingLoading || activeDraftVersion === null}
                    className="w-full px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-white font-medium"
                  >
                    {processingLoading ? 'Starting...' : 'Start Processing'}
                  </button>
                </div>

                {/* Record Outcome */}
                <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
                  <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">Record Outcome</h2>
                  <div className="space-y-3">
                    <select
                      value={selectedOutcome}
                      onChange={(e) => setSelectedOutcome(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-sky-500 focus:outline-none"
                    >
                      {CALL_OUTCOMES.map((o) => (
                        <option key={o} value={o}>{OUTCOME_LABELS[o] ?? o}</option>
                      ))}
                    </select>
                    <textarea
                      value={outcomeNotes}
                      onChange={(e) => setOutcomeNotes(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-sky-500 focus:outline-none"
                      placeholder="Outcome notes..."
                    />
                    <button
                      onClick={handleOutcome}
                      disabled={outcomeLoading || activeDraftVersion === null}
                      className="w-full px-4 py-2 text-sm bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded text-white font-medium"
                    >
                      {outcomeLoading ? 'Recording...' : 'Record Outcome'}
                    </button>
                  </div>
                </div>
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
