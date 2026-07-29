"use client";

import { useState, type ReactNode } from "react";

/**
 * A collapsible configuration section for the deal-system step pages. These
 * pages carry several set-and-forget controls — the image prompt template,
 * creative direction, negation rules — that were each rendered as a fully
 * exposed card, permanently, even after the operator had set them once. That
 * inverted the page's priorities: loud config, cramped images.
 *
 * This collapses each control down to a single header row that still surfaces
 * its current value (the `summary`), so the operator can confirm state at a
 * glance and only expand when they actually need to change something. Content
 * space then goes back to the images, which is what the page is really for.
 *
 * The accent maps to each section's existing colour so the collapsed page
 * still reads as the same colour-coded system it did when everything was open.
 */

type Accent = "violet" | "cyan" | "rose" | "fuchsia" | "emerald" | "amber";

const accentText: Record<Accent, string> = {
  violet: "text-violet-300",
  cyan: "text-cyan-300",
  rose: "text-rose-300",
  fuchsia: "text-fuchsia-300",
  emerald: "text-emerald-300",
  amber: "text-amber-300",
};

const accentBorder: Record<Accent, string> = {
  violet: "border-violet-400/25 bg-violet-500/[0.04]",
  cyan: "border-cyan-400/25 bg-cyan-500/[0.04]",
  rose: "border-rose-400/25 bg-rose-500/[0.04]",
  fuchsia: "border-fuchsia-400/25 bg-fuchsia-500/[0.04]",
  emerald: "border-emerald-400/25 bg-emerald-500/[0.04]",
  amber: "border-amber-400/25 bg-amber-500/[0.04]",
};

export function ConfigSection({
  eyebrow,
  summary,
  accent = "cyan",
  defaultOpen = false,
  children,
}: {
  /** Uppercase section label, e.g. "Creative Direction". */
  eyebrow: string;
  /** The current value shown on the collapsed header, e.g. the active preset. */
  summary?: ReactNode;
  accent?: Accent;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`mb-4 rounded-2xl border ${accentBorder[accent]}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:opacity-90"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className={`block text-[11px] font-bold uppercase tracking-[0.22em] ${accentText[accent]}`}>
            {eyebrow}
          </span>
          {!open && summary != null && (
            <span className="mt-0.5 block truncate text-xs text-slate-300">{summary}</span>
          )}
        </span>
      </button>
      {open && <div className="border-t border-white/10 px-5 py-4">{children}</div>}
    </section>
  );
}
