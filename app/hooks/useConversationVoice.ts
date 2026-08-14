'use client';

/**
 * useConversationVoice - the one browser voice shell.
 *
 * Both the public showcase page and the Booking Assistant use this hook, so
 * there is a single voice lifecycle, a single tool dispatch path, and a
 * single set of states. The hook owns transport plumbing only: the server
 * already decided the skill, tools, context, and model before it hands back
 * an ephemeral client secret.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { acquireMicrophone } from '@/lib/voice/audio-adapter';
import {
  connectRealtimeTransport,
  type RealtimeTransportHandle,
  type RealtimeTransportState,
  type SpeechActivity,
} from '@/lib/voice/realtime-transport';

export type VoiceStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'reconnecting'
  | 'error';

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  final: boolean;
}

export interface ToolActivityEntry {
  callId: string;
  toolId: string;
  label: string;
  status: 'running' | 'done' | 'failed';
  durationMs?: number;
}

export interface ConfirmationCard {
  id: string;
  kind: 'preference_confirmation' | 'booking_confirmation' | 'payment_simulation' | 'handoff';
  field?: string;
  value?: string;
  message?: string;
  resolved: boolean;
}

export interface LaunchSubjectRefs {
  dealId?: string;
  campaignSlug?: string;
  bookingDraftId?: string;
}

export interface UseConversationVoiceOptions {
  mode: 'showcase' | 'deal_booking' | 'campaign_landing' | 'guest_support';
  source: 'voice_assistant' | 'booking_assistant' | 'campaign_page';
  subjectRefs?: LaunchSubjectRefs;
  /** Called when a tool proposes a value the guest must confirm. */
  onConfirmationProposed?: (card: ConfirmationCard) => void;
}

export interface SessionFacts {
  conversationId: string | null;
  modelLabel: string | null;
  sessionProfile: string | null;
  skillId: string | null;
  skillVersion: number | null;
  snapshotVersion: number | null;
  demoMode: boolean;
}

const EMPTY_FACTS: SessionFacts = {
  conversationId: null,
  modelLabel: null,
  sessionProfile: null,
  skillId: null,
  skillVersion: null,
  snapshotVersion: null,
  demoMode: false,
};

export function useConversationVoice(options: UseConversationVoiceOptions) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [toolActivity, setToolActivity] = useState<ToolActivityEntry[]>([]);
  const [confirmations, setConfirmations] = useState<ConfirmationCard[]>([]);
  const [facts, setFacts] = useState<SessionFacts>(EMPTY_FACTS);

  const transportRef = useRef<RealtimeTransportHandle | null>(null);
  const micRef = useRef<{ stop: () => void } | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);

  // ── Trace reporting ──────────────────────────────────────────────────────
  // Most of what a voice conversation does is only visible here in the
  // browser. These refs batch those moments and flush them on a timer so the
  // trace never adds latency to the conversation itself, and so a trace
  // failure can never surface to the guest.
  const traceQueueRef = useRef<{ event: string; detail?: Record<string, unknown> }[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnCounterRef = useRef(0);
  const activityRef = useRef<SpeechActivity | null>(null);

  const flushTrace = useCallback(async (): Promise<void> => {
    const conversationId = conversationIdRef.current;
    if (!conversationId) return;
    if (traceQueueRef.current.length === 0) return;

    const batch = traceQueueRef.current.splice(0, traceQueueRef.current.length);
    try {
      await fetch('/api/conversation/trace/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, events: batch }),
        keepalive: true,
      });
    } catch {
      // Trace reporting is best-effort by contract. Dropping a batch is
      // always preferable to disturbing the conversation.
    }
  }, []);

  const reportTrace = useCallback(
    (event: string, detail?: Record<string, unknown>): void => {
      traceQueueRef.current.push(detail ? { event, detail } : { event });
      // Keep the queue bounded if a flush is failing repeatedly.
      if (traceQueueRef.current.length > 100) {
        traceQueueRef.current.splice(0, traceQueueRef.current.length - 100);
      }
    },
    []
  );

  useEffect(() => {
    optionsRef.current = options;
  });

  const stop = useCallback(() => {
    transportRef.current?.close();
    transportRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    reportTrace('transport.closed');
    void flushTrace();
    setStatus('idle');
  }, [reportTrace, flushTrace]);

  useEffect(() => {
    return () => {
      transportRef.current?.close();
      micRef.current?.stop();
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      void flushTrace();
    };
  }, [flushTrace]);

  const dispatchTool = useCallback(
    async (toolId: string, argumentsJson: string): Promise<string> => {
      const conversationId = conversationIdRef.current;
      if (!conversationId) {
        return JSON.stringify({ error: 'no_active_conversation' });
      }

      let payload: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(argumentsJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          payload = parsed as Record<string, unknown>;
        }
      } catch {
        payload = {};
      }

      // Report WHICH arguments the model chose to send, never their values.
      // Seeing that odysseus_search was called with [passengers, guestAges,
      // startDate] is the interesting part; the values are guest data.
      reportTrace('tool.model_requested', {
        toolId,
        argumentCount: Object.keys(payload).length,
        argumentKeys: Object.keys(payload).sort().join(','),
      });

      const response = await fetch('/api/conversation/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, toolId, payload }),
      });

      const body = (await response.json()) as {
        data?: Record<string, unknown>;
        ui?: ConfirmationCard;
      };

      reportTrace('tool.result_returned', {
        toolId,
        resultStatus: response.status,
        resultChars: JSON.stringify(body.data ?? {}).length,
      });

      if (body.ui) {
        const card: ConfirmationCard = {
          id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          kind: body.ui.kind,
          field: body.ui.field,
          value: body.ui.value,
          message: body.ui.message,
          resolved: false,
        };
        setConfirmations((current) => [...current, card]);
        optionsRef.current.onConfirmationProposed?.(card);
        reportTrace('proposal.presented', { field: card.field ?? card.kind });
      }

      return JSON.stringify(body.data ?? { error: 'tool_dispatch_failed' });
    },
    [reportTrace]
  );

  const start = useCallback(async () => {
    if (status !== 'idle' && status !== 'error') return;

    setErrorMessage(null);
    setStatus('connecting');

    try {
      const { mode, source, subjectRefs } = optionsRef.current;

      const launchResponse = await fetch('/api/conversation/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'browser_voice',
          mode,
          source,
          subjectRefs: subjectRefs ?? {},
        }),
      });

      const launch = (await launchResponse.json()) as {
        conversationId?: string;
        clientSecret?: string;
        modelLabel?: string;
        sessionProfile?: string;
        skillId?: string;
        skillVersion?: number;
        snapshotVersion?: number;
        demoMode?: boolean;
        error?: string;
      };

      if (!launchResponse.ok || !launch.clientSecret || !launch.conversationId) {
        throw new Error(launch.error ?? 'voice_session_unavailable');
      }

      conversationIdRef.current = launch.conversationId;
      setFacts({
        conversationId: launch.conversationId,
        modelLabel: launch.modelLabel ?? null,
        sessionProfile: launch.sessionProfile ?? null,
        skillId: launch.skillId ?? null,
        skillVersion: launch.skillVersion ?? null,
        snapshotVersion: launch.snapshotVersion ?? null,
        demoMode: Boolean(launch.demoMode),
      });

      // Start flushing now that a conversation id exists.
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flushTimerRef.current = setInterval(() => void flushTrace(), 900);

      reportTrace('transport.mic_requested');
      let mic: { stream: MediaStream; stop: () => void };
      try {
        mic = await acquireMicrophone();
      } catch (micError) {
        reportTrace('transport.mic_denied');
        void flushTrace();
        throw micError;
      }
      reportTrace('transport.mic_granted');
      micRef.current = mic;

      reportTrace('transport.connecting', {
        sessionProfile: launch.sessionProfile ?? 'unknown',
      });

      const handle = await connectRealtimeTransport({
        clientSecret: launch.clientSecret,
        audioStream: mic.stream,
        callbacks: {
          onStateChange: (transportState: RealtimeTransportState) => {
            if (transportState === 'connected') {
              setStatus('listening');
              reportTrace('transport.connected', { connectionState: transportState });
            } else if (transportState === 'reconnecting') {
              setStatus('reconnecting');
              reportTrace('transport.reconnecting', { connectionState: transportState });
            } else if (transportState === 'error') {
              setStatus('error');
              reportTrace('transport.failed', { connectionState: transportState });
            } else if (transportState === 'closed') {
              setStatus('idle');
              reportTrace('transport.closed', { connectionState: transportState });
            }
          },
          onActivityChange: (activity: SpeechActivity) => {
            setStatus((current) =>
              current === 'reconnecting' || current === 'error' ? current : activity
            );

            // Turn taking is the rhythm of the conversation, and it is only
            // observable here. Report each transition once.
            const previous = activityRef.current;
            if (previous === activity) return;
            activityRef.current = activity;

            if (activity === 'listening') {
              reportTrace('turn.user_speech_started', { activity, previousActivity: previous ?? 'none' });
            } else if (activity === 'thinking') {
              reportTrace('turn.assistant_response_started', {
                activity,
                previousActivity: previous ?? 'none',
              });
            } else if (activity === 'speaking') {
              reportTrace('turn.assistant_speaking', { activity });
            } else if (activity === 'interrupted') {
              reportTrace('turn.barge_in', { activity, previousActivity: previous ?? 'none' });
            }
          },
          onTranscript: (event) => {
            // Report the SHAPE of the turn only: who spoke and how long it
            // was. The words themselves never leave the browser for the trace.
            if (event.final) {
              turnCounterRef.current += 1;
              reportTrace(
                event.role === 'user' ? 'turn.user_transcript_final' : 'turn.assistant_response_done',
                {
                  role: event.role,
                  turnNumber: turnCounterRef.current,
                  turnChars: event.text.length,
                  final: true,
                }
              );
            }

            setTranscript((current) => {
              const existingIndex = current.findIndex(
                (entry) => entry.id === `${event.role}:${event.itemId}` && !entry.final
              );
              const entry: TranscriptEntry = {
                id: `${event.role}:${event.itemId}`,
                role: event.role,
                text: event.text,
                final: event.final,
              };
              if (existingIndex >= 0) {
                const next = [...current];
                const previous = next[existingIndex];
                next[existingIndex] = event.final
                  ? entry
                  : { ...entry, text: (previous?.text ?? '') + event.text };
                return next;
              }
              return [...current, entry];
            });
          },
          onToolStarted: (toolId, callId) => {
            setToolActivity((current) => [
              ...current,
              { callId, toolId, label: toolId, status: 'running' },
            ]);
          },
          onToolFinished: (toolId, callId, durationMs) => {
            setToolActivity((current) =>
              current.map((entry) =>
                entry.callId === callId ? { ...entry, status: 'done', durationMs } : entry
              )
            );
          },
          onToolCall: async ({ toolId, argumentsJson }) => dispatchTool(toolId, argumentsJson),
          onError: (message: string) => {
            setErrorMessage(message);
            reportTrace('client.error');
          },
        },
      });

      transportRef.current = handle;
    } catch (error) {
      micRef.current?.stop();
      micRef.current = null;
      transportRef.current = null;
      setStatus('error');
      reportTrace('transport.failed');
      void flushTrace();
      setErrorMessage(
        error instanceof Error && error.message === 'voice_session_unavailable'
          ? 'The voice service is unavailable right now. You can keep going by typing.'
          : describeStartFailure(error)
      );
    }
  }, [status, dispatchTool, reportTrace, flushTrace]);

  const interrupt = useCallback(() => {
    transportRef.current?.interrupt();
    reportTrace('turn.barge_in', { interruptedResponse: true });
  }, [reportTrace]);

  const sendText = useCallback(
    (text: string) => {
      transportRef.current?.sendUserText(text);
      reportTrace('turn.user_text_submitted', {
        turnChars: text.length,
        textFallbackUsed: true,
      });
    },
    [reportTrace]
  );

  const resolveConfirmation = useCallback(
    (cardId: string, outcome: 'confirmed' | 'discarded' = 'confirmed') => {
      setConfirmations((current) =>
        current.map((card) => (card.id === cardId ? { ...card, resolved: true } : card))
      );
      reportTrace(outcome === 'confirmed' ? 'proposal.confirmed' : 'proposal.discarded', {
        confirmed: outcome === 'confirmed',
      });
    },
    [reportTrace]
  );

  return {
    status,
    errorMessage,
    transcript,
    toolActivity,
    confirmations,
    facts,
    start,
    stop,
    interrupt,
    sendText,
    resolveConfirmation,
  };
}

function describeStartFailure(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'Microphone access was blocked. Allow the microphone in your browser, or continue by typing.';
    }
    if (error.name === 'NotFoundError') {
      return 'No microphone was found. You can continue by typing instead.';
    }
  }
  return 'The voice session could not start. You can continue by typing.';
}
