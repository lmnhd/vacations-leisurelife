"use client";

export function MetaAdSynthesisView() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-violet-300">
            Deal Workflow · Step 6
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Meta Ad Synthesis</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Turn a published deal&apos;s funnel synthesis (landing page segments + hyper-niche
            carousel copy) into ready-to-launch Meta ad creative — primary text, headlines,
            descriptions, and the carousel card set for the ad platform.
          </p>
        </div>
        <a
          href="/tests/deals-system"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          ← Back to Deals dashboard
        </a>
      </div>

      <section className="rounded-2xl border border-dashed border-violet-400/25 bg-violet-500/[0.04] p-6 text-sm text-slate-300">
        <p className="font-semibold text-violet-200">Coming soon</p>
        <p className="mt-2 leading-6 text-slate-400">
          This lab will pick up from an approved, published Deal and its Step 4 Funnel
          Synthesis output (broad landing page + niche carousel), then generate Meta ad creative
          — primary text variants, headlines, descriptions, and a curated carousel card set
          ready for the ad platform.
        </p>
      </section>
    </div>
  );
}
