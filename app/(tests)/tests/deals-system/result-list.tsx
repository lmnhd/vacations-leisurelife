"use client";

/**
 * Shared result-list UI for the deals-system labs (Steps 1–3).
 *
 * Long lab pages grew unmanageable: every run stacked a huge always-expanded info
 * block with no way to prune. This wraps a list of cached results with:
 *   - collapsible cards (summary header always visible; detail on demand),
 *   - a header with the count + collapse-all / expand-all,
 *   - a latest-only view (show the most recent N, with a "show older" toggle),
 *   - a per-result delete (× with confirm) wired to the caller's onDelete.
 *
 * Generic over the result type. Each lab supplies how to read an id + summary and
 * how to render the (collapsed-by-default) detail.
 */

import { useMemo, useState, type ReactNode } from "react";

const DEFAULT_LATEST_COUNT = 3;

export interface ResultListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** One-line summary shown in the always-visible card header. */
  renderSummary: (item: T) => ReactNode;
  /** Full detail, shown only when the card is expanded. */
  renderDetail: (item: T) => ReactNode;
  /** Delete a result by id. Omit to hide the delete control. */
  onDelete?: (id: string) => void | Promise<void>;
  busy?: boolean;
  /** Noun for the header, e.g. "ad copies". */
  label: string;
  /** Empty-state text. */
  emptyText: string;
  /** How many to show before "show older". Default 3. 0 = show all. */
  latestCount?: number;
  /** Expand every card by default (default false — collapsed). */
  defaultExpanded?: boolean;
}

export function ResultList<T>({
  items,
  getId,
  renderSummary,
  renderDetail,
  onDelete,
  busy = false,
  label,
  emptyText,
  latestCount = DEFAULT_LATEST_COUNT,
  defaultExpanded = false,
}: ResultListProps<T>) {
  // Open/closed per id. Absent = use the global default.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const isOpen = (id: string) => openMap[id] ?? defaultExpanded;

  const visible = useMemo(() => {
    if (latestCount <= 0 || showAll) return items;
    return items.slice(0, latestCount);
  }, [items, latestCount, showAll]);

  const olderCount = items.length - visible.length;

  function setAll(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const item of items) next[getId(item)] = open;
    setOpenMap(next);
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm text-slate-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {label} ({items.length})
        </p>
        <div className="flex items-center gap-3 text-[11px]">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="font-semibold text-slate-400 transition hover:text-cyan-200"
          >
            expand all
          </button>
          <span className="text-slate-700">·</span>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="font-semibold text-slate-400 transition hover:text-cyan-200"
          >
            collapse all
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {visible.map((item) => {
          const id = getId(item);
          const open = isOpen(id);
          return (
            <article key={id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
              <div className="flex items-start gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpenMap((m) => ({ ...m, [id]: !open }))}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  aria-expanded={open ? "true" : "false"}
                >
                  <svg
                    className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <div className="min-w-0 flex-1">{renderSummary(item)}</div>
                </button>

                {onDelete && (
                  <div className="shrink-0">
                    {confirmingId === id ? (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-rose-200">Remove?</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            await onDelete(id);
                            setConfirmingId(null);
                          }}
                          className="rounded border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-100 transition hover:bg-rose-500/25 disabled:opacity-50"
                        >
                          delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300 transition hover:bg-white/10"
                        >
                          cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingId(id)}
                        title="Remove this result"
                        className="rounded-md border border-white/10 px-1.5 py-0.5 text-sm text-slate-500 transition hover:border-rose-400/40 hover:text-rose-200"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
              </div>

              {open && <div className="border-t border-white/10 px-4 py-3">{renderDetail(item)}</div>}
            </article>
          );
        })}
      </div>

      {olderCount > 0 && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-white/30"
          >
            Show {olderCount} older {label.toLowerCase()}
          </button>
        </div>
      )}
      {showAll && items.length > latestCount && latestCount > 0 && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="text-[11px] font-semibold text-slate-500 transition hover:text-slate-300"
          >
            Show latest {latestCount} only
          </button>
        </div>
      )}
    </div>
  );
}
