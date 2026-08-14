'use client';

/**
 * Leisure Life Cruise Concierge - public showcase experience.
 *
 * Deliberately audio-first and restrained: microphone and call controls,
 * explicit state, transcript, text fallback, tool status, confirmation
 * cards, compact session facts, errors, disclosures, and the hidden trace.
 *
 * Explicitly NOT here (see the canonical plan): Hero Chat Canvas, cinematic
 * headlines, typewriter animation, contextual hero imagery/slideshows,
 * mood-reactive backgrounds, particles, or HyperFrames.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

import {
  useConversationVoice,
  type ConfirmationCard,
  type VoiceStatus,
} from '@/app/hooks/useConversationVoice';
import { AgentTraceDrawer } from './agent-trace-drawer';

const STATUS_COPY: Record<VoiceStatus, { label: string; hint: string }> = {
  idle: { label: 'Ready', hint: 'Tap the microphone to start talking.' },
  connecting: { label: 'Connecting', hint: 'Setting up a secure voice session.' },
  listening: { label: 'Listening', hint: 'Go ahead - speak naturally.' },
  thinking: { label: 'Thinking', hint: 'Working on your answer.' },
  speaking: { label: 'Speaking', hint: 'Interrupt any time - just start talking.' },
  interrupted: { label: 'Interrupted', hint: 'Stopped. Carry on whenever you are ready.' },
  reconnecting: { label: 'Reconnecting', hint: 'The connection dropped. Trying again.' },
  error: { label: 'Error', hint: 'Something went wrong. You can keep going by typing.' },
};

const SUGGESTED_PROMPTS: string[] = [
  'Find me a seven-night Caribbean cruise leaving from Florida next winter.',
  'I like quiet ships, balcony cabins, and good live music.',
  'What do you already know about what I like?',
  'Compare those two sailings for me.',
  'Show me what the booking process would look like.',
];

const TOOL_LABELS: Record<string, string> = {
  perplexity_cruise_research: 'Researching cruises',
  cruise_brothers_knowledge: 'Checking agency knowledge',
  excursion_finder: 'Finding excursions',
  cruise_brothers_scraper: 'Scanning current deals',
  social_media_insights: 'Reading traveler reviews',
  cruise_trend_analysis: 'Analyzing cruise trends',
  odysseus_search: 'Searching live availability',
  pricing_comparator: 'Comparing pricing',
  showcase_preferences_read: 'Reading demo preferences',
  showcase_preferences_save: 'Saving demo preference',
  showcase_trip_history: 'Reading demo trip history',
  showcase_booking_draft_prepare: 'Updating demo booking draft',
  showcase_payment_handoff_simulated: 'Preparing simulated checkout',
  request_human_help: 'Requesting human help',
};

export function VoiceAssistantExperience() {
  const [traceOpen, setTraceOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [typedMessage, setTypedMessage] = useState('');
  const [textMode, setTextMode] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const voice = useConversationVoice({ mode: 'showcase', source: 'voice_assistant' });

  const {
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
  } = voice;

  const active = status !== 'idle' && status !== 'error';

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript]);

  const handleMicrophone = useCallback(() => {
    if (active) {
      stop();
      return;
    }
    void start();
  }, [active, start, stop]);

  const handleSendTyped = useCallback(() => {
    const text = typedMessage.trim();
    if (text.length === 0) return;
    if (!active) {
      void start().then(() => sendText(text));
    } else {
      sendText(text);
    }
    setTypedMessage('');
  }, [typedMessage, active, start, sendText]);

  const openConfirmations = useMemo(
    () => confirmations.filter((card) => !card.resolved),
    [confirmations]
  );

  const runningTools = useMemo(
    () => toolActivity.slice(-4).reverse(),
    [toolActivity]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 md:px-8">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-50 md:text-3xl">
              Leisure Life Cruise Concierge
            </h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              A voice assistant that finds cruises, compares sailings, remembers what you like,
              and prepares a booking - built on OpenAI Realtime speech-to-speech.
            </p>
          </div>
          <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/15">
            Demo mode
          </Badge>
        </header>

        <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-100/90">
          <strong className="font-semibold">What is and is not real:</strong> the voice, the
          cruise research, and the live availability search are real. The traveler profile, trip
          history, booking draft, and checkout are synthetic. Nothing here creates a reservation,
          holds a cabin, or takes a payment. Please do not say card numbers or personal
          identification - this assistant will refuse them.
        </p>

        {/* ── Voice stage ───────────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={handleMicrophone}
              aria-label={active ? 'End the voice conversation' : 'Start talking'}
              className={`flex h-28 w-28 items-center justify-center rounded-full border-2 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                active
                  ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                  : 'border-slate-700 bg-slate-800/60 text-slate-200 hover:border-slate-500'
              }`}
            >
              {active ? 'End' : 'Talk'}
            </button>

            <div className="text-center" aria-live="polite">
              <p className="font-display text-lg text-slate-100">{STATUS_COPY[status].label}</p>
              <p className="mt-0.5 text-sm text-slate-400">{STATUS_COPY[status].hint}</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
                onClick={interrupt}
                disabled={!active}
              >
                Stop speaking
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
                onClick={stop}
                disabled={!active}
              >
                End conversation
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 text-slate-300 hover:text-slate-50"
                onClick={() => setTextMode((value) => !value)}
              >
                {textMode ? 'Hide typing' : 'Switch to typing'}
              </Button>
            </div>

            {errorMessage && (
              <p
                role="alert"
                className="w-full rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-center text-sm text-rose-200"
              >
                {errorMessage}
              </p>
            )}
          </div>

          {textMode && (
            <div className="mt-5 flex gap-2">
              <Input
                value={typedMessage}
                onChange={(event) => setTypedMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSendTyped();
                }}
                placeholder="Type your message"
                aria-label="Type a message to the concierge"
                className="h-11 border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
              />
              <Button
                type="button"
                className="h-11"
                onClick={handleSendTyped}
                disabled={typedMessage.trim().length === 0}
              >
                Send
              </Button>
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* ── Transcript, tools, confirmations ────────────────────── */}
          <div className="space-y-4">
            {openConfirmations.length > 0 && (
              <section aria-label="Items to confirm" className="space-y-3">
                {openConfirmations.map((card) => (
                  <ConfirmationCardView
                    key={card.id}
                    card={card}
                    onResolve={() => resolveConfirmation(card.id)}
                  />
                ))}
              </section>
            )}

            {runningTools.length > 0 && (
              <Card className="border-slate-800 bg-slate-900/50">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-sm text-slate-200">
                    Tool activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 pb-4">
                  {runningTools.map((entry) => (
                    <div
                      key={entry.callId}
                      className="flex items-center justify-between text-xs text-slate-400"
                    >
                      <span>{TOOL_LABELS[entry.toolId] ?? entry.toolId}</span>
                      <span className="font-mono text-slate-500">
                        {entry.status === 'running'
                          ? 'running...'
                          : entry.durationMs
                            ? `${(entry.durationMs / 1000).toFixed(1)}s`
                            : 'done'}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-sm text-slate-200">Transcript</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                {transcript.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">
                      Nothing yet. Try one of these to start:
                    </p>
                    <ul className="space-y-1.5">
                      {SUGGESTED_PROMPTS.map((prompt) => (
                        <li key={prompt}>
                          <button
                            type="button"
                            onClick={() => {
                              setTextMode(true);
                              setTypedMessage(prompt);
                            }}
                            className="w-full rounded-md border border-slate-800 px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100"
                          >
                            {prompt}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div
                    className="max-h-[26rem] space-y-3 overflow-y-auto pr-1"
                    aria-live="polite"
                    aria-atomic="false"
                  >
                    {transcript.map((entry) => (
                      <div key={entry.id}>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">
                          {entry.role === 'user' ? 'You' : 'Concierge'}
                          {!entry.final && ' (speaking)'}
                        </p>
                        <p
                          className={`text-sm leading-relaxed ${
                            entry.final ? 'text-slate-200' : 'italic text-slate-400'
                          }`}
                        >
                          {entry.text}
                        </p>
                      </div>
                    ))}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Session facts + how this works ──────────────────────── */}
          <aside className="space-y-4">
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-sm text-slate-200">
                  This session
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 pb-4 text-xs text-slate-400">
                <FactRow label="Mode" value={facts.demoMode ? 'Demo (synthetic data)' : '-'} />
                <FactRow label="Model" value={facts.modelLabel ?? 'Not connected'} />
                <FactRow label="Profile" value={facts.sessionProfile ?? '-'} />
                <FactRow
                  label="Skill"
                  value={facts.skillId ? `${facts.skillId} v${facts.skillVersion ?? 1}` : '-'}
                />
                <FactRow
                  label="Context version"
                  value={facts.snapshotVersion ? String(facts.snapshotVersion) : '-'}
                />
                <FactRow label="Transport" value={active ? 'WebRTC connected' : 'Not connected'} />
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-sm text-slate-200">
                  How this works
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-0 text-xs text-sky-300 hover:text-sky-200"
                  onClick={() => setHowItWorksOpen((value) => !value)}
                  aria-expanded={howItWorksOpen}
                >
                  {howItWorksOpen ? 'Hide details' : 'Show details'}
                </Button>

                {howItWorksOpen && (
                  <div className="mt-3 space-y-3 text-xs leading-relaxed text-slate-400">
                    <p>
                      Your browser holds a direct WebRTC audio session with OpenAI Realtime. The
                      session is created by this server with a short-lived client secret, so no
                      API key ever reaches the browser.
                    </p>
                    <p>
                      The server picks the model, assembles the instructions from a versioned
                      runtime skill, builds a bounded context snapshot, and computes the tool
                      allowlist. The browser cannot add tools, change the skill, or inject
                      instructions.
                    </p>
                    <p>
                      Every tool call is dispatched back through this server, checked against the
                      conversation&apos;s allowlist, and executed with a typed schema. The same
                      configuration drives text chat and the telephone agent.
                    </p>
                    <Separator className="bg-slate-800" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-full border-slate-700 bg-transparent text-xs text-slate-200 hover:bg-slate-800"
                      onClick={() => setTraceOpen(true)}
                    >
                      View agent trace
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      <AgentTraceDrawer
        open={traceOpen}
        onOpenChange={setTraceOpen}
        conversationId={facts.conversationId}
      />
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-mono text-[11px] text-slate-300">{value}</span>
    </div>
  );
}

function ConfirmationCardView({
  card,
  onResolve,
}: {
  card: ConfirmationCard;
  onResolve: () => void;
}) {
  const [value, setValue] = useState(card.value ?? '');

  if (card.kind === 'payment_simulation') {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm text-emerald-200">
            Secure supplier checkout - simulated
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-4 text-xs text-emerald-100/80">
          <p>
            In production this hands off to an approved Cruise Brothers or cruise line payment
            surface. Leisure Life never collects card details.
          </p>
          <p className="font-mono text-[11px] text-emerald-200/70">
            handoff token: demo-handoff-000000 &middot; status: simulated
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 border-emerald-500/40 bg-transparent text-xs text-emerald-100 hover:bg-emerald-500/10"
            onClick={onResolve}
          >
            Dismiss
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (card.kind === 'handoff') {
    return (
      <Card className="border-sky-500/30 bg-sky-500/5">
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <p className="text-sm text-sky-100">{card.message ?? 'Human help'}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 border-sky-500/40 bg-transparent text-xs text-sky-100 hover:bg-sky-500/10"
            onClick={onResolve}
          >
            Dismiss
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isPreference = card.kind === 'preference_confirmation';

  return (
    <Card className="border-sky-500/30 bg-sky-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-sm text-sky-100">
          {isPreference ? 'Save this preference?' : 'Add this to the demo booking?'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div className="space-y-1.5">
          <label
            htmlFor={`confirm-${card.id}`}
            className="text-[11px] uppercase tracking-wide text-sky-200/70"
          >
            {card.field ?? 'value'}
          </label>
          <Input
            id={`confirm-${card.id}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-10 border-sky-500/30 bg-slate-950 text-sm text-slate-100"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" className="h-9 text-xs" onClick={onResolve}>
            Looks right
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 text-xs text-slate-300 hover:text-slate-100"
            onClick={onResolve}
          >
            Discard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
