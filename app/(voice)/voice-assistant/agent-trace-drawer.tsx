'use client';

/**
 * Hidden agent trace window.
 *
 * Hidden by default, opened from "How this works". Opening it never pauses
 * or restarts the live conversation - it only polls a sanitized server
 * projection. If the trace fails, the conversation is unaffected.
 *
 * Color is scoped here to match the route's tropical-pop palette; each event
 * category gets its own hue so a long stream stays readable at a glance.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const INK = '#1A0B2E';
const INK_2 = '#2D0F4C';
const MAGENTA = '#FF2D95';
const CORAL = '#FF5E3A';
const TANGERINE = '#FFA51F';
const LIME = '#B4FF39';
const CYAN = '#22E4FF';
const VIOLET = '#A855F7';
const CREAM = '#FFF4E8';

type TraceCategory =
  | 'context'
  | 'skill'
  | 'tools'
  | 'state'
  | 'transport'
  | 'safety'
  | 'errors';

interface TraceEvent {
  eventId: string;
  occurredAtIso: string;
  severity: 'info' | 'notice' | 'warning' | 'error';
  category: TraceCategory;
  event: string;
  correlationId: string;
  channel: string;
  skillId?: string;
  skillVersion?: number;
  detail: Record<string, string | number | boolean>;
}

const CATEGORY_COLOR: Record<TraceCategory, string> = {
  context: CYAN,
  skill: VIOLET,
  tools: LIME,
  state: TANGERINE,
  transport: MAGENTA,
  safety: '#FFE23D',
  errors: CORAL,
};

const CATEGORIES: TraceCategory[] = [
  'context',
  'skill',
  'tools',
  'state',
  'transport',
  'safety',
  'errors',
];

export function AgentTraceDrawer({
  open,
  onOpenChange,
  conversationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
}) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [activeCategories, setActiveCategories] = useState<TraceCategory[]>(CATEGORIES);
  const [following, setFollowing] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [traceUnavailable, setTraceUnavailable] = useState(false);
  const lastEventIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !conversationId) return;

    let cancelled = false;

    const poll = async (): Promise<void> => {
      try {
        const params = new URLSearchParams({ conversationId });
        if (lastEventIdRef.current) params.set('sinceEventId', lastEventIdRef.current);
        const response = await fetch(`/api/conversation/trace?${params.toString()}`);
        if (!response.ok) throw new Error('trace_unavailable');
        const body = (await response.json()) as { events?: TraceEvent[] };
        if (cancelled) return;
        const incoming = body.events ?? [];
        if (incoming.length > 0) {
          const last = incoming[incoming.length - 1];
          if (last) lastEventIdRef.current = last.eventId;
          setEvents((current) => [...current, ...incoming].slice(-400));
        }
        setTraceUnavailable(false);
      } catch {
        // Non-blocking by contract: surface a quiet notice, never an error state.
        if (!cancelled) setTraceUnavailable(true);
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 1200);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, conversationId]);

  useEffect(() => {
    if (!following || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [events, following]);

  const visibleEvents = useMemo(
    () => events.filter((event) => activeCategories.includes(event.category)),
    [events, activeCategories]
  );

  const toggleCategory = useCallback((category: TraceCategory) => {
    setActiveCategories((current) =>
      current.includes(category)
        ? current.filter((entry) => entry !== category)
        : [...current, category]
    );
  }, []);

  const copySelected = useCallback(() => {
    const selected = events.find((event) => event.eventId === selectedEventId);
    if (!selected) return;
    void navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
  }, [events, selectedEventId]);

  const exportTrace = useCallback(() => {
    const blob = new Blob([JSON.stringify({ conversationId, events }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `leisure-life-agent-trace-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [conversationId, events]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-xl"
        style={{
          background: `linear-gradient(180deg, ${INK_2}, ${INK})`,
          borderLeft: `3px solid ${VIOLET}`,
          color: CREAM,
        }}
      >
        <div
          aria-hidden
          style={{
            height: 6,
            background: `linear-gradient(90deg, ${MAGENTA}, ${CORAL}, ${TANGERINE}, ${LIME}, ${CYAN}, ${VIOLET})`,
          }}
        />

        <SheetHeader
          className="px-5 py-4 text-left"
          style={{ borderBottom: `2px solid ${VIOLET}44` }}
        >
          <SheetTitle
            className="text-lg font-black uppercase tracking-[0.14em]"
            style={{ color: LIME }}
          >
            Agent trace
          </SheetTitle>
          <SheetDescription className="text-xs" style={{ color: '#D2B8E4' }}>
            A sanitized projection of server events: context, skill, tool, state, transport, and
            safety activity. No prompts, reasoning, transcripts, or personal data appear here.
          </SheetDescription>
        </SheetHeader>

        <div
          className="flex flex-wrap gap-1.5 px-5 py-3"
          style={{ borderBottom: `2px solid ${VIOLET}44` }}
        >
          {CATEGORIES.map((category) => {
            const active = activeCategories.includes(category);
            const color = CATEGORY_COLOR[category];
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                aria-pressed={active}
                className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-transform duration-150 hover:scale-105"
                style={{
                  background: active ? color : 'transparent',
                  color: active ? INK : color,
                  border: `2px solid ${color}`,
                  boxShadow: active ? `0 0 16px ${color}66` : 'none',
                }}
              >
                {category}
              </button>
            );
          })}
        </div>

        <div
          className="flex items-center gap-2 px-5 py-2"
          style={{ borderBottom: `2px solid ${VIOLET}44` }}
        >
          <TraceAction onClick={() => setFollowing((value) => !value)} color={CYAN}>
            {following ? 'Pause' : 'Follow'}
          </TraceAction>
          <TraceAction onClick={copySelected} disabled={!selectedEventId} color={TANGERINE}>
            Copy event
          </TraceAction>
          <TraceAction onClick={exportTrace} disabled={events.length === 0} color={MAGENTA}>
            Export JSON
          </TraceAction>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2">
          {traceUnavailable && (
            <p className="px-3 py-2 text-xs font-bold" style={{ color: TANGERINE }}>
              The trace stream is not reachable right now. The conversation is unaffected.
            </p>
          )}
          {visibleEvents.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs" style={{ color: '#A98CBD' }}>
              No events yet. Start a conversation to see activity.
            </p>
          ) : (
            <ul className="space-y-1">
              {visibleEvents.map((event) => {
                const selected = event.eventId === selectedEventId;
                const color = CATEGORY_COLOR[event.category];
                return (
                  <li key={event.eventId}>
                    <button
                      type="button"
                      onClick={() => setSelectedEventId(selected ? null : event.eventId)}
                      className="w-full rounded-lg px-3 py-2 text-left font-mono text-[11px] leading-relaxed transition-colors"
                      style={{
                        background: selected ? `${color}26` : 'transparent',
                        borderLeft: `4px solid ${color}`,
                      }}
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span style={{ color: '#9B7FB0' }}>
                          {event.occurredAtIso.slice(11, 23)}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
                          style={{ background: `${color}2E`, color }}
                        >
                          {event.category}
                        </span>
                        <span className="font-bold" style={{ color: CREAM }}>
                          {event.event}
                        </span>
                        {/* One-glance summary so the stream is readable
                            without expanding every row. */}
                        {summarizeDetail(event) && (
                          <span style={{ color: '#9B7FB0' }}>{summarizeDetail(event)}</span>
                        )}
                      </span>
                      {selected && (
                        <span className="mt-2 block space-y-0.5" style={{ color: '#CDB2DE' }}>
                          {event.skillId && (
                            <span className="block">
                              skill: {event.skillId} v{event.skillVersion ?? 1}
                            </span>
                          )}
                          <span className="block">channel: {event.channel}</span>
                          <span className="block">correlation: {event.correlationId}</span>
                          {Object.entries(event.detail).map(([key, value]) => (
                            <span key={key} className="block">
                              {key}: {String(value)}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * A short inline summary for the collapsed row. Picks the one or two details
 * that make an event meaningful at a glance - the tool name, the turn size,
 * the connection state - so a reviewer can follow the conversation's rhythm
 * by scrolling rather than by clicking every row.
 */
function summarizeDetail(event: TraceEvent): string {
  const detail = event.detail;
  const parts: string[] = [];

  if (typeof detail['toolId'] === 'string') parts.push(String(detail['toolId']));
  if (typeof detail['argumentKeys'] === 'string' && detail['argumentKeys'].length > 0) {
    parts.push(`(${detail['argumentKeys']})`);
  }
  if (typeof detail['role'] === 'string') parts.push(String(detail['role']));
  if (typeof detail['turnChars'] === 'number') parts.push(`${detail['turnChars']} chars`);
  if (typeof detail['durationMs'] === 'number') {
    parts.push(`${(Number(detail['durationMs']) / 1000).toFixed(1)}s`);
  }
  if (typeof detail['connectionState'] === 'string') parts.push(String(detail['connectionState']));
  if (typeof detail['skillId'] === 'string' && event.category === 'skill') {
    parts.push(String(detail['skillId']));
  }
  if (typeof detail['allowedCount'] === 'number') parts.push(`${detail['allowedCount']} tools`);
  if (typeof detail['snapshotChars'] === 'number') parts.push(`${detail['snapshotChars']} chars`);
  if (typeof detail['resultStatus'] === 'number') parts.push(`HTTP ${detail['resultStatus']}`);
  if (typeof detail['field'] === 'string') parts.push(String(detail['field']));

  return parts.slice(0, 3).join(' ');
}

function TraceAction({
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
      className="rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-transform duration-150 hover:scale-105 disabled:opacity-35 disabled:hover:scale-100"
      style={{ border: `2px solid ${color}`, color }}
    >
      {children}
    </button>
  );
}
