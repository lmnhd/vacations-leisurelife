"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * The campaign/source picker that sits at the top of every deal-system step
 * page (Funnel Synthesis, Meta Ad, Google Ads, …). Historically this was a
 * permanently-expanded vertical <ul> of radio rows — one full-height row per
 * campaign — which dominated the top of every step and pushed the actual
 * image work below the fold.
 *
 * This consolidates it into a single ~44px bar: the current selection reads as
 * a labelled chip, and a dropdown menu switches between the rest. The primary
 * action (e.g. "Load carousel cards") lives on the same row so the whole
 * "pick a campaign, then act on it" gesture is one compact control.
 *
 * It is intentionally generic — each step passes its own items, labels, and
 * action so the bar looks and behaves identically everywhere.
 */

export interface CampaignSelectItem {
  id: string;
  title: string;
  /** e.g. "4 carousel card(s)" or an audience tag — one short line. */
  subtitle?: string;
  /**
   * Optional trailing status pill (e.g. Publish's live/not-live badge). Shown on
   * the collapsed chip for the selected item and on the right of each dropdown
   * row, so status stays glanceable without expanding the list.
   */
  badge?: ReactNode;
}

export function CampaignSelectBar({
  eyebrow,
  items,
  selectedId,
  onSelect,
  action,
  emptyState,
  accent = "cyan",
}: {
  /** Uppercase label, e.g. "Campaign" or "Step 7 funnel synthesis". */
  eyebrow: string;
  items: CampaignSelectItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The primary action button for this step (Load / Synthesize / …). */
  action?: ReactNode;
  /** Shown in place of the picker when there are no items. */
  emptyState?: ReactNode;
  accent?: "cyan" | "violet";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId]
  );

  // Close the menu on outside-click and Escape — a bare dropdown that only
  // closes on re-select strands the operator with an open overlay.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ring =
    accent === "violet"
      ? "border-violet-300/60 bg-violet-400/10 text-violet-100"
      : "border-cyan-300/60 bg-cyan-400/10 text-cyan-100";

  if (items.length === 0) {
    return (
      <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/70 px-5 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>
        <div className="mt-2">{emptyState}</div>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/70 px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{eyebrow}</p>

        {/* The current-selection chip + dropdown trigger. */}
        <div ref={wrapRef} className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-left transition ${ring}`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">
                {selected?.title ?? "Choose a campaign…"}
              </span>
              {selected?.subtitle && (
                <span className="block truncate text-[11px] text-slate-300">{selected.subtitle}</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {selected?.badge}
              <svg
                className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>

          {open && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-auto rounded-xl border border-white/15 bg-slate-900/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur"
            >
              {items.map((item) => {
                const isSel = item.id === selectedId;
                return (
                  <li key={item.id} role="option" aria-selected={isSel}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(item.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition ${
                        isSel ? "bg-cyan-400/10" : "hover:bg-white/[0.06]"
                      }`}
                    >
                      <span
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          isSel ? "bg-cyan-300" : "bg-slate-600"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-white">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="block truncate text-[11px] text-slate-400">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                      {item.badge && <span className="shrink-0">{item.badge}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}
