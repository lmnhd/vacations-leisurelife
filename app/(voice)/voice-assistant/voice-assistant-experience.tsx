'use client';

/**
 * Leisure Life Cruise Concierge - public showcase experience.
 *
 * Visual direction: maximum-saturation tropical pop. Electric magenta, hot
 * coral, acid lime, cyan, and violet on a deep aubergine ground - a sunset
 * over a Caribbean pool deck at full volume. Deliberately NOT the slate-blue
 * developer console look.
 *
 * All color lives in the SHADE constants and inline styles below, scoped to
 * this route only: the global shadcn tokens are grayscale-ish and would flatten
 * this, and conversely nothing here should leak into the rest of the app.
 *
 * Still explicitly NOT here (canonical plan): Hero Chat Canvas, cinematic
 * headlines, typewriter animation, contextual hero imagery/slideshows,
 * mood-reactive backgrounds tied to conversation state, HyperFrames. The color
 * is static decoration, not agent-driven atmosphere.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useConversationVoice,
  type ConfirmationCard,
  type VoiceStatus,
} from '@/app/hooks/useConversationVoice';
import { AgentTraceDrawer } from './agent-trace-drawer';
import { VoiceEntryDialog } from './voice-entry-dialog';

// ── Palette ────────────────────────────────────────────────────────────────

const INK = '#1A0B2E';        // deep aubergine ground
const INK_2 = '#2D0F4C';      // raised panel
const MAGENTA = '#FF2D95';
const CORAL = '#FF5E3A';
const TANGERINE = '#FFA51F';
const LIME = '#B4FF39';
const CYAN = '#22E4FF';
const VIOLET = '#A855F7';
const CREAM = '#FFF4E8';

/** Per-state color + copy. The state is the loudest thing on the page. */
const STATE_STYLE: Record<
  VoiceStatus,
  { label: string; hint: string; color: string; glow: string }
> = {
  idle: {
    label: 'READY',
    hint: 'Hit the button and just start talking.',
    color: LIME,
    glow: 'rgba(180,255,57,0.55)',
  },
  connecting: {
    label: 'CONNECTING',
    hint: 'Opening a secure voice line.',
    color: TANGERINE,
    glow: 'rgba(255,165,31,0.55)',
  },
  listening: {
    label: 'LISTENING',
    hint: 'Go ahead - talk like you would to a friend.',
    color: CYAN,
    glow: 'rgba(34,228,255,0.6)',
  },
  thinking: {
    label: 'THINKING',
    hint: 'Working on it.',
    color: VIOLET,
    glow: 'rgba(168,85,247,0.6)',
  },
  speaking: {
    label: 'SPEAKING',
    hint: 'Cut in any time - just talk over me.',
    color: MAGENTA,
    glow: 'rgba(255,45,149,0.65)',
  },
  interrupted: {
    label: 'STOPPED',
    hint: 'All yours whenever you are ready.',
    color: TANGERINE,
    glow: 'rgba(255,165,31,0.5)',
  },
  reconnecting: {
    label: 'RECONNECTING',
    hint: 'Connection wobbled. Grabbing it back.',
    color: TANGERINE,
    glow: 'rgba(255,165,31,0.55)',
  },
  error: {
    label: 'TROUBLE',
    hint: 'Voice is down - typing still works fine.',
    color: CORAL,
    glow: 'rgba(255,94,58,0.6)',
  },
};

const SUGGESTED_PROMPTS: { text: string; color: string }[] = [
  { text: 'Find me a seven-night Caribbean cruise leaving from Florida next winter.', color: CYAN },
  { text: 'I like quiet ships, balcony cabins, and good live music.', color: LIME },
  { text: 'What do you already know about what I like?', color: TANGERINE },
  { text: 'Compare those two sailings for me.', color: MAGENTA },
  { text: 'Show me what the booking process would look like.', color: VIOLET },
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

const TOOL_COLOR_CYCLE = [CYAN, LIME, MAGENTA, TANGERINE, VIOLET, CORAL];

export function VoiceAssistantExperience({ telephoneNumber }: { telephoneNumber: string }) {
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
  const stateStyle = STATE_STYLE[status];

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

  const runningTools = useMemo(() => toolActivity.slice(-4).reverse(), [toolActivity]);

  return (
    <div
      className="min-h-screen"
      style={{
        background: `radial-gradient(1200px 600px at 10% -5%, ${VIOLET}55 0%, transparent 60%),
                     radial-gradient(900px 500px at 95% 5%, ${MAGENTA}4D 0%, transparent 55%),
                     radial-gradient(1000px 700px at 50% 110%, ${CYAN}33 0%, transparent 60%),
                     ${INK}`,
        color: CREAM,
      }}
    >
      <VoiceEntryDialog telephoneNumber={telephoneNumber} />

      {/* Rainbow top rule */}
      <div
        aria-hidden
        style={{
          height: 8,
          background: `linear-gradient(90deg, ${MAGENTA}, ${CORAL}, ${TANGERINE}, ${LIME}, ${CYAN}, ${VIOLET})`,
        }}
      />

      <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-8 md:px-8">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p
              className="text-[11px] font-black uppercase tracking-[0.28em]"
              style={{ color: CYAN }}
            >
              Leisure Life Interactive
            </p>
            <h1
              className="mt-1 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl"
              style={{
                backgroundImage: `linear-gradient(100deg, ${LIME}, ${CYAN}, ${MAGENTA}, ${TANGERINE})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              CRUISE CONCIERGE
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed" style={{ color: '#F3D9F5' }}>
              Talk to it out loud. It searches real cruises, compares sailings, remembers what you
              like, and walks a booking end to end - speech to speech, no typing required.
            </p>
          </div>

          <span
            className="shrink-0 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-widest"
            style={{ background: LIME, color: INK, boxShadow: `0 0 24px ${LIME}88` }}
          >
            Demo mode
          </span>
        </header>

        {/* ── Disclosure ─────────────────────────────────────────────── */}
        <div
          className="mt-5 rounded-2xl px-5 py-4 text-[13px] leading-relaxed"
          style={{
            background: `linear-gradient(120deg, ${TANGERINE}26, ${MAGENTA}1F)`,
            border: `2px solid ${TANGERINE}`,
            color: '#FFE9CF',
          }}
        >
          <strong className="font-black uppercase tracking-wide" style={{ color: TANGERINE }}>
            Real vs. not real:
          </strong>{' '}
          the voice, the cruise research, and the live availability search are real. The traveler
          profile, trip history, booking draft, and checkout are synthetic. Nothing here books a
          cabin or takes a payment. Please don&apos;t say card numbers or ID numbers - it will
          refuse them.
        </div>

        {/* ── Voice stage ────────────────────────────────────────────── */}
        <section
          className="mt-6 rounded-3xl p-7"
          style={{
            background: `linear-gradient(160deg, ${INK_2}, ${INK})`,
            border: `2px solid ${VIOLET}66`,
            boxShadow: `0 0 60px ${VIOLET}33, inset 0 1px 0 ${CREAM}14`,
          }}
        >
          <div className="flex flex-col items-center gap-5">
            <button
              type="button"
              onClick={handleMicrophone}
              aria-label={active ? 'End the voice conversation' : 'Start talking'}
              className="flex h-36 w-36 items-center justify-center rounded-full text-xl font-black uppercase tracking-wider transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4"
              style={{
                background: active
                  ? `linear-gradient(140deg, ${MAGENTA}, ${CORAL})`
                  : `linear-gradient(140deg, ${LIME}, ${CYAN})`,
                color: INK,
                border: `4px solid ${CREAM}`,
                boxShadow: `0 0 0 6px ${stateStyle.glow}, 0 0 70px ${stateStyle.glow}`,
              }}
            >
              {active ? 'END' : 'TALK'}
            </button>

            <div className="text-center" aria-live="polite">
              <p
                className="text-3xl font-black uppercase tracking-[0.12em]"
                style={{ color: stateStyle.color, textShadow: `0 0 28px ${stateStyle.glow}` }}
              >
                {stateStyle.label}
              </p>
              <p className="mt-1 text-sm" style={{ color: '#EBD3F0' }}>
                {stateStyle.hint}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <PopButton onClick={interrupt} disabled={!active} color={TANGERINE}>
                Stop speaking
              </PopButton>
              <PopButton onClick={stop} disabled={!active} color={CORAL}>
                End conversation
              </PopButton>
              <PopButton onClick={() => setTextMode((value) => !value)} color={CYAN}>
                {textMode ? 'Hide typing' : 'Switch to typing'}
              </PopButton>
            </div>

            {errorMessage && (
              <p
                role="alert"
                className="w-full rounded-xl px-4 py-3 text-center text-sm font-semibold"
                style={{ background: `${CORAL}26`, border: `2px solid ${CORAL}`, color: '#FFD9CF' }}
              >
                {errorMessage}
              </p>
            )}
          </div>

          {textMode && (
            <div className="mt-6 flex gap-2">
              <input
                value={typedMessage}
                onChange={(event) => setTypedMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSendTyped();
                }}
                placeholder="Type your message"
                aria-label="Type a message to the concierge"
                className="h-12 flex-1 rounded-xl px-4 text-[15px] outline-none"
                style={{
                  background: INK,
                  border: `2px solid ${CYAN}`,
                  color: CREAM,
                }}
              />
              <button
                type="button"
                onClick={handleSendTyped}
                disabled={typedMessage.trim().length === 0}
                className="h-12 rounded-xl px-6 text-sm font-black uppercase tracking-wider disabled:opacity-40"
                style={{ background: `linear-gradient(120deg, ${LIME}, ${CYAN})`, color: INK }}
              >
                Send
              </button>
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_330px]">
          {/* ── Left column ──────────────────────────────────────────── */}
          <div className="space-y-5">
            {openConfirmations.length > 0 && (
              <section aria-label="Items to confirm" className="space-y-4">
                {openConfirmations.map((card) => (
                  <ConfirmationCardView
                    key={card.id}
                    card={card}
                    onConfirm={() => resolveConfirmation(card.id, 'confirmed')}
                    onDiscard={() => resolveConfirmation(card.id, 'discarded')}
                  />
                ))}
              </section>
            )}

            {runningTools.length > 0 && (
              <Panel title="Tool activity" accent={TANGERINE}>
                <div className="space-y-2">
                  {runningTools.map((entry, index) => {
                    const color = TOOL_COLOR_CYCLE[index % TOOL_COLOR_CYCLE.length] ?? CYAN;
                    return (
                      <div
                        key={entry.callId}
                        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                        style={{ background: `${color}1A`, borderLeft: `4px solid ${color}` }}
                      >
                        <span className="text-[13px] font-semibold" style={{ color: CREAM }}>
                          {TOOL_LABELS[entry.toolId] ?? entry.toolId}
                        </span>
                        <span className="font-mono text-[11px] font-bold" style={{ color }}>
                          {entry.status === 'running'
                            ? 'RUNNING'
                            : entry.durationMs
                              ? `${(entry.durationMs / 1000).toFixed(1)}s`
                              : 'DONE'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            <Panel title="Transcript" accent={CYAN}>
              {transcript.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm" style={{ color: '#D9C2E8' }}>
                    Nothing yet. Try one of these:
                  </p>
                  <ul className="space-y-2">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <li key={prompt.text}>
                        <button
                          type="button"
                          onClick={() => {
                            setTextMode(true);
                            setTypedMessage(prompt.text);
                          }}
                          className="w-full rounded-xl px-4 py-3 text-left text-[14px] font-medium transition-transform duration-150 hover:translate-x-1"
                          style={{
                            background: `${prompt.color}14`,
                            border: `2px solid ${prompt.color}`,
                            color: CREAM,
                          }}
                        >
                          {prompt.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div
                  className="max-h-[26rem] space-y-4 overflow-y-auto pr-1"
                  aria-live="polite"
                  aria-atomic="false"
                >
                  {transcript.map((entry) => {
                    const isUser = entry.role === 'user';
                    const color = isUser ? CYAN : MAGENTA;
                    return (
                      <div
                        key={entry.id}
                        className="rounded-xl px-4 py-3"
                        style={{
                          background: `${color}14`,
                          borderLeft: `5px solid ${color}`,
                        }}
                      >
                        <p
                          className="text-[10px] font-black uppercase tracking-[0.2em]"
                          style={{ color }}
                        >
                          {isUser ? 'You' : 'Concierge'}
                          {!entry.final && ' - speaking'}
                        </p>
                        <p
                          className="mt-1 text-[15px] leading-relaxed"
                          style={{
                            color: entry.final ? CREAM : '#C9AEDB',
                            fontStyle: entry.final ? 'normal' : 'italic',
                          }}
                        >
                          {entry.text}
                        </p>
                      </div>
                    );
                  })}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </Panel>
          </div>

          {/* ── Right column ─────────────────────────────────────────── */}
          <aside className="space-y-5">
            <Panel title="This session" accent={LIME}>
              <div className="space-y-2">
                <FactRow
                  label="Mode"
                  value={facts.demoMode ? 'Demo / synthetic' : '-'}
                  color={LIME}
                />
                <FactRow label="Model" value={facts.modelLabel ?? 'Not connected'} color={CYAN} />
                <FactRow label="Profile" value={facts.sessionProfile ?? '-'} color={TANGERINE} />
                <FactRow
                  label="Skill"
                  value={facts.skillId ? `${facts.skillId} v${facts.skillVersion ?? 1}` : '-'}
                  color={MAGENTA}
                />
                <FactRow
                  label="Context"
                  value={facts.snapshotVersion ? `v${facts.snapshotVersion}` : '-'}
                  color={VIOLET}
                />
                <FactRow
                  label="Transport"
                  value={active ? 'WebRTC live' : 'Not connected'}
                  color={CORAL}
                />
              </div>
            </Panel>

            <Panel title="How this works" accent={VIOLET}>
              <button
                type="button"
                onClick={() => setHowItWorksOpen((value) => !value)}
                aria-expanded={howItWorksOpen}
                className="text-xs font-black uppercase tracking-widest underline-offset-4 hover:underline"
                style={{ color: CYAN }}
              >
                {howItWorksOpen ? 'Hide details' : 'Show details'}
              </button>

              {howItWorksOpen && (
                <div className="mt-3 space-y-3 text-[13px] leading-relaxed" style={{ color: '#DCC6EA' }}>
                  <p>
                    Your browser holds a direct WebRTC audio session with OpenAI Realtime. This
                    server mints a short-lived client secret, so no API key ever reaches the
                    browser.
                  </p>
                  <p>
                    The server picks the model, assembles instructions from a versioned runtime
                    skill, builds a bounded context snapshot, and computes the tool allowlist. The
                    browser cannot add tools, change the skill, or inject instructions.
                  </p>
                  <p>
                    Every tool call comes back through this server, gets checked against the
                    allowlist, and runs against a typed schema. The same configuration drives text
                    chat and the phone agent.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTraceOpen(true)}
                    className="mt-1 w-full rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest transition-transform duration-150 hover:scale-[1.02]"
                    style={{
                      background: `linear-gradient(120deg, ${VIOLET}, ${MAGENTA})`,
                      color: CREAM,
                      boxShadow: `0 0 28px ${VIOLET}66`,
                    }}
                  >
                    View agent trace
                  </button>
                </div>
              )}
            </Panel>
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

// ── Building blocks ────────────────────────────────────────────────────────

function Panel({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-5"
      style={{
        background: `${INK_2}CC`,
        border: `2px solid ${accent}55`,
        boxShadow: `0 0 34px ${accent}1F`,
      }}
    >
      <h2
        className="mb-3 text-[11px] font-black uppercase tracking-[0.24em]"
        style={{ color: accent }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function PopButton({
  children,
  onClick,
  disabled,
  color,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-5 text-xs font-black uppercase tracking-widest transition-transform duration-150 hover:scale-105 active:scale-95 disabled:opacity-35 disabled:hover:scale-100"
      style={{
        minHeight: 46,
        background: 'transparent',
        border: `2px solid ${color}`,
        color,
      }}
    >
      {children}
    </button>
  );
}

function FactRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#B79BCB' }}>
        {label}
      </span>
      <span className="text-right font-mono text-[11px] font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function ConfirmationCardView({
  card,
  onConfirm,
  onDiscard,
}: {
  card: ConfirmationCard;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const [value, setValue] = useState(card.value ?? '');

  if (card.kind === 'payment_simulation') {
    return (
      <section
        className="rounded-2xl p-5"
        style={{
          background: `linear-gradient(135deg, ${LIME}1F, ${CYAN}1A)`,
          border: `3px solid ${LIME}`,
          boxShadow: `0 0 44px ${LIME}44`,
        }}
      >
        <h3
          className="text-sm font-black uppercase tracking-[0.16em]"
          style={{ color: LIME }}
        >
          Secure supplier checkout - simulated
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: '#E6FFD6' }}>
          In production this hands off to an approved Cruise Brothers or cruise line payment
          surface. Leisure Life never collects card details.
        </p>
        <p className="mt-2 font-mono text-[11px] font-bold" style={{ color: CYAN }}>
          handoff token: demo-handoff-000000 &middot; status: simulated
        </p>
        <div className="mt-3">
          <PopButton onClick={onConfirm} color={LIME}>
            Dismiss
          </PopButton>
        </div>
      </section>
    );
  }

  if (card.kind === 'handoff') {
    return (
      <section
        className="flex items-center justify-between gap-3 rounded-2xl p-5"
        style={{
          background: `${TANGERINE}1A`,
          border: `3px solid ${TANGERINE}`,
          boxShadow: `0 0 34px ${TANGERINE}3D`,
        }}
      >
        <p className="text-sm font-bold" style={{ color: '#FFE6C4' }}>
          {card.message ?? 'Human help'}
        </p>
        <PopButton onClick={onConfirm} color={TANGERINE}>
          Dismiss
        </PopButton>
      </section>
    );
  }

  const isPreference = card.kind === 'preference_confirmation';

  return (
    <section
      className="rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${MAGENTA}1F, ${VIOLET}1A)`,
        border: `3px solid ${MAGENTA}`,
        boxShadow: `0 0 44px ${MAGENTA}44`,
      }}
    >
      <h3 className="text-sm font-black uppercase tracking-[0.16em]" style={{ color: MAGENTA }}>
        {isPreference ? 'Save this preference?' : 'Add this to the demo booking?'}
      </h3>

      <label
        htmlFor={`confirm-${card.id}`}
        className="mt-3 block text-[10px] font-black uppercase tracking-[0.2em]"
        style={{ color: CYAN }}
      >
        {card.field ?? 'value'}
      </label>
      <input
        id={`confirm-${card.id}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="mt-1 w-full rounded-xl px-4 text-[15px] outline-none"
        style={{
          minHeight: 46,
          background: INK,
          border: `2px solid ${CYAN}`,
          color: CREAM,
        }}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-xl px-6 text-xs font-black uppercase tracking-widest transition-transform duration-150 hover:scale-105 active:scale-95"
          style={{
            minHeight: 46,
            background: `linear-gradient(120deg, ${LIME}, ${CYAN})`,
            color: INK,
          }}
        >
          Looks right
        </button>
        <PopButton onClick={onDiscard} color={CORAL}>
          Discard
        </PopButton>
      </div>
    </section>
  );
}
