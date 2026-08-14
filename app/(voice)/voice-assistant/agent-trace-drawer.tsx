'use client';

/**
 * Hidden agent trace window.
 *
 * Hidden by default, opened from "How this works". Opening it never pauses
 * or restarts the live conversation - it only polls a sanitized server
 * projection. If the trace fails, the conversation is unaffected.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

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

const CATEGORIES: TraceCategory[] = [
  'context',
  'skill',
  'tools',
  'state',
  'transport',
  'safety',
  'errors',
];

const SEVERITY_STYLES: Record<TraceEvent['severity'], string> = {
  info: 'text-slate-300',
  notice: 'text-sky-300',
  warning: 'text-amber-300',
  error: 'text-rose-300',
};

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
        className="flex h-full w-full flex-col gap-0 border-slate-800 bg-slate-950 p-0 text-slate-100 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-slate-800 px-5 py-4 text-left">
          <SheetTitle className="font-display text-lg text-slate-50">Agent trace</SheetTitle>
          <SheetDescription className="text-xs text-slate-400">
            A sanitized projection of server events: context, skill, tool, state, transport, and
            safety activity. No prompts, reasoning, transcripts, or personal data appear here.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 px-5 py-3">
          {CATEGORIES.map((category) => {
            const active = activeCategories.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
                  active
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-300 hover:text-slate-50"
            onClick={() => setFollowing((value) => !value)}
          >
            {following ? 'Pause following' : 'Follow live'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-300 hover:text-slate-50"
            onClick={copySelected}
            disabled={!selectedEventId}
          >
            Copy event
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-slate-300 hover:text-slate-50"
            onClick={exportTrace}
            disabled={events.length === 0}
          >
            Export JSON
          </Button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-2">
          {traceUnavailable && (
            <p className="px-3 py-2 text-xs text-amber-300">
              The trace stream is not reachable right now. The conversation is unaffected.
            </p>
          )}
          {visibleEvents.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              No events yet. Start a conversation to see activity.
            </p>
          ) : (
            <ul className="space-y-1">
              {visibleEvents.map((event) => {
                const selected = event.eventId === selectedEventId;
                return (
                  <li key={event.eventId}>
                    <button
                      type="button"
                      onClick={() => setSelectedEventId(selected ? null : event.eventId)}
                      className={`w-full rounded-md px-3 py-2 text-left font-mono text-[11px] leading-relaxed transition-colors ${
                        selected ? 'bg-slate-800/80' : 'hover:bg-slate-900'
                      }`}
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-slate-500">
                          {event.occurredAtIso.slice(11, 23)}
                        </span>
                        <Badge
                          variant="outline"
                          className="border-slate-700 px-1.5 py-0 text-[10px] capitalize text-slate-400"
                        >
                          {event.category}
                        </Badge>
                        <span className={SEVERITY_STYLES[event.severity]}>{event.event}</span>
                      </span>
                      {selected && (
                        <span className="mt-2 block space-y-0.5 text-slate-400">
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
