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

  useEffect(() => {
    optionsRef.current = options;
  });

  const stop = useCallback(() => {
    transportRef.current?.close();
    transportRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    setStatus('idle');
  }, []);

  useEffect(() => {
    return () => {
      transportRef.current?.close();
      micRef.current?.stop();
    };
  }, []);

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

      const response = await fetch('/api/conversation/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, toolId, payload }),
      });

      const body = (await response.json()) as {
        data?: Record<string, unknown>;
        ui?: ConfirmationCard;
      };

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
      }

      return JSON.stringify(body.data ?? { error: 'tool_dispatch_failed' });
    },
    []
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

      const mic = await acquireMicrophone();
      micRef.current = mic;

      const handle = await connectRealtimeTransport({
        clientSecret: launch.clientSecret,
        audioStream: mic.stream,
        callbacks: {
          onStateChange: (transportState: RealtimeTransportState) => {
            if (transportState === 'connected') setStatus('listening');
            else if (transportState === 'reconnecting') setStatus('reconnecting');
            else if (transportState === 'error') setStatus('error');
            else if (transportState === 'closed') setStatus('idle');
          },
          onActivityChange: (activity: SpeechActivity) => {
            setStatus((current) =>
              current === 'reconnecting' || current === 'error' ? current : activity
            );
          },
          onTranscript: (event) => {
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
          },
        },
      });

      transportRef.current = handle;
    } catch (error) {
      micRef.current?.stop();
      micRef.current = null;
      transportRef.current = null;
      setStatus('error');
      setErrorMessage(
        error instanceof Error && error.message === 'voice_session_unavailable'
          ? 'The voice service is unavailable right now. You can keep going by typing.'
          : describeStartFailure(error)
      );
    }
  }, [status, dispatchTool]);

  const interrupt = useCallback(() => {
    transportRef.current?.interrupt();
  }, []);

  const sendText = useCallback((text: string) => {
    transportRef.current?.sendUserText(text);
  }, []);

  const resolveConfirmation = useCallback((cardId: string) => {
    setConfirmations((current) =>
      current.map((card) => (card.id === cardId ? { ...card, resolved: true } : card))
    );
  }, []);

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
