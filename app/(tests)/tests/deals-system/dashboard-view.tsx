"use client";

import { useState, type ReactNode } from "react";

import {
  type DealsSystemDashboardData,
  type DealsSystemPhaseStatus,
} from "@/lib/cb/deals-system/dashboard-data";
import { DEALS_SYSTEM_OPERATOR_ACTIONS } from "@/lib/cb/deals-system/operator-actions";

import { CallbackRequestsPanel } from "./callback-requests-panel";
import { DealCampaignWorkbench } from "./campaign-workbench";
import { DealsSystemControls } from "./controls";
import { PackageLookupControl } from "./package-lookup-control";

type StatusTone = DealsSystemPhaseStatus["status"] | "ok" | "error" | "neutral";

const statusStyles: Record<StatusTone, string> = {
  complete: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  foundation: "border-sky-400/35 bg-sky-500/10 text-sky-200",
  pending: "border-amber-400/35 bg-amber-500/10 text-amber-200",
  blocked: "border-rose-400/35 bg-rose-500/10 text-rose-200",
  ok: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  error: "border-rose-400/35 bg-rose-500/10 text-rose-200",
  neutral: "border-white/10 bg-white/5 text-slate-200",
};

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${statusStyles[tone]}`}
    >
      {children}
    </span>
  );
}

function CollapsiblePanel({
  title,
  eyebrow,
  children,
  defaultOpen = true,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition"
      >
        <div className="text-left">
          {eyebrow && (
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
              {eyebrow}
            </p>
          )}
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
      {isOpen && <div className="border-t border-white/10 px-5 py-4">{children}</div>}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{note}</p>
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm text-slate-400">
      {children}
    </div>
  );
}

function homepageReadiness(data: DealsSystemDashboardData) {
  if (data.summary.publishableDeals > 0) {
    return `${data.summary.publishableDeals} Deal(s) pass the publishing gate and can be wired into the homepage.`;
  }
  if (data.summary.curatedDeals > 0) {
    return "Curated Deal records exist, but none are bookable with valid link health yet. Homepage Deals should stay hidden until Phase 9 finishes.";
  }
  return "Promo and Link Broker data may exist, but no Curated Deal records have been assembled yet.";
}

export function DealsSystemDashboardView({
  data,
  eyebrow,
  heading,
  description,
  refreshHref,
  refreshLabel,
}: {
  data: DealsSystemDashboardData;
  eyebrow: string;
  heading: string;
  description: string;
  refreshHref: string;
  refreshLabel: string;
}) {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">{heading}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <a
          href={refreshHref}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
        >
          {refreshLabel}
        </a>
      </div>

      <div className="space-y-4">
        <section className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.06] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                Deal Workflow · Step 1
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Discovery — start from research
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                {data.discovery.hasSavedResearch
                  ? `Saved discovery research is available${
                      data.discovery.researchCachedAt
                        ? ` (cached ${data.discovery.researchCachedAt})`
                        : ""
                    }. Generate retail package ideas from it — ${data.discovery.ideaCount} idea(s) cached so far.`
                  : "No saved discovery research yet. Run Group discovery research first, then generate retail package ideas here."}
              </p>
            </div>
            <a
              href="/tests/deals-system/discovery"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/25"
            >
              Open Discovery →
            </a>
          </div>

          {data.discovery.angles.length > 0 && (
            <div className="mt-4 border-t border-cyan-400/15 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">
                Discovery angles — pick one to manifest
              </p>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {data.discovery.angles.map((angle) => (
                  <li
                    key={angle.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">
                        {angle.sailingAngleTitle}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">{angle.isolatedNiche}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {angle.hasManifest && (
                        <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-200">
                          manifested
                        </span>
                      )}
                      <a
                        href={`/tests/deals-system/trip-manifestation?angleId=${encodeURIComponent(angle.id)}`}
                        className="rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
                      >
                        Manifest →
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.06] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                Deal Workflow · Step 2
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">Trip Manifestation</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Turn a discovery angle into a deal-package: correlate it with the CB promo
                intelligence to manifest the cruise line, destination, sail window, and applicable
                perks that pre-fill Source &amp; Assemble.{" "}
                {data.discovery.manifestCount > 0
                  ? `${data.discovery.manifestCount} manifest(s) cached.`
                  : data.discovery.ideaCount > 0
                    ? "Pick one of your discovery angles to manifest."
                    : "Generate discovery angles in Step 1 first."}
              </p>
            </div>
            <a
              href="/tests/deals-system/trip-manifestation"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/25"
            >
              Open Trip Manifestation →
            </a>
          </div>

          {data.discovery.manifests.length > 0 && (
            <div className="mt-4 border-t border-cyan-400/15 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">
                Trip manifests — pick one to write ad copy
              </p>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {data.discovery.manifests.map((manifest) => (
                  <li
                    key={manifest.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">
                        {manifest.sailingAngleTitle}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {manifest.cruiseLine} · {manifest.destination}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {manifest.hasAdCopy && (
                        <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-200">
                          ad copy ✓
                        </span>
                      )}
                      <a
                        href={`/tests/deals-system/copywriter?manifestId=${encodeURIComponent(manifest.id)}`}
                        className="rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
                      >
                        Write ad copy →
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.06] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">
                Deal Workflow · Step 3
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">Ad Copywriter</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Expand a manifest&apos;s creative brief + inventory into direct-response ad copy —
                a primary retail play plus aspirational upsells, with insider voice and embedded
                targeting hooks.{" "}
                {data.discovery.adCopyCount > 0
                  ? `${data.discovery.adCopyCount} ad-copy set(s) cached.`
                  : data.discovery.manifestCount > 0
                    ? "Pick a trip manifest to write ad copy."
                    : "Manifest a trip in Step 2 first."}
              </p>
            </div>
            <a
              href="/tests/deals-system/copywriter"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/25"
            >
              Open Ad Copywriter →
            </a>
          </div>
        </section>

        <CollapsiblePanel title="Script Runner" eyebrow="Run allowlisted npm scripts" defaultOpen={false}>
          <DealsSystemControls actions={[...DEALS_SYSTEM_OPERATOR_ACTIONS]} />
        </CollapsiblePanel>

        <CollapsiblePanel title="Package Lookup" eyebrow="Resolve cruise facts to Odysseus packages">
          <PackageLookupControl />
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Deal Campaign Workbench"
          eyebrow="Develop a Deal with AI — research, copy, ad, media, approval"
        >
          <DealCampaignWorkbench deals={data.curatedDeals} promoOptions={data.promoOptions} />
        </CollapsiblePanel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Promo records"
            value={data.summary.promoRecords}
            note={`${data.summary.extractedPromos} extracted from CB Today's View`}
          />
          <Stat
            label="Curated Deals"
            value={data.summary.curatedDeals}
            note={`${data.summary.publishableDeals} currently pass the homepage gate`}
          />
          <Stat
            label="Link Broker"
            value={data.summary.linkBrokerRecords}
            note={`${data.summary.validLinks} validated as live booking links`}
          />
          <Stat
            label="Callbacks"
            value={data.summary.callbackRequests}
            note="Requests queued for email, Crisp, and dashboard workflow"
          />
        </div>

        <CollapsiblePanel title="Homepage Readiness" eyebrow={`Read ${formatDateTime(data.readAtIso)}`}>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-base font-semibold text-white">{homepageReadiness(data)}</p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                The public Deals surface should only read Curated Deals where status is bookable
                and Link Broker health is valid. Promo records are useful raw intelligence, but
                they are not sellable by themselves.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Immediate next moves
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                {data.nextActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="Phase Map" eyebrow="Implementation visibility">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.phases.map((phase) => (
              <div key={phase.phase} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                      Phase {phase.phase}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-white">{phase.name}</h3>
                  </div>
                  <Badge tone={phase.status}>{phase.status}</Badge>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-400">{phase.evidence}</p>
              </div>
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="Cache Health" eyebrow="Local artifacts">
          <div className="grid gap-3 lg:grid-cols-2">
            {data.caches.map((cache) => (
              <div key={cache.key} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{cache.label}</h3>
                    <p className="mt-1 break-all text-xs text-slate-500">{cache.path}</p>
                  </div>
                  <Badge tone={cache.ok ? "ok" : "error"}>{cache.ok ? "valid" : "error"}</Badge>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  {cache.exists
                    ? `Modified ${formatDateTime(cache.modifiedAtIso)}`
                    : "File not found; using empty fallback."}
                </p>
                {cache.errors.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-rose-200">
                    {cache.errors.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="CB Promo Intelligence" eyebrow="Agent promo rules, not sellable alone">
          {data.promoRecords.length === 0 ? (
            <EmptyState>No promo records are currently cached.</EmptyState>
          ) : (
            <div className="space-y-3">
              {data.promoRecords.map((promo) => (
                <article key={promo.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={promo.extractionStatus === "succeeded" ? "ok" : "pending"}>
                          {promo.extractionStatus}
                        </Badge>
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {promo.vendor}
                        </span>
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-white">{promo.title}</h3>
                      <p className="mt-2 text-xs text-slate-400">
                        Book: {promo.bookingWindow} | Sail: {promo.sailingWindow}
                      </p>
                    </div>
                    <a
                      href={promo.detailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-cyan-200 hover:text-cyan-100"
                    >
                      Open CB promo
                    </a>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        Offer types
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {promo.offerTypes.map((offer) => (
                          <Badge key={offer}>{offer.replaceAll("_", " ")}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        Allowed claims
                      </p>
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-300">
                        {promo.allowedClaims.length > 0 ? (
                          promo.allowedClaims.map((claim) => <li key={claim}>{claim}</li>)
                        ) : (
                          <li>No public-safe claims extracted.</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        Angles and cautions
                      </p>
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-300">
                        {[...promo.suggestedAngles, ...promo.cautionFlags].slice(0, 5).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CollapsiblePanel>

        <div className="grid gap-6 xl:grid-cols-2">
          <CollapsiblePanel title="Curated Deals" eyebrow="Homepage publishing gate">
            {data.curatedDeals.length === 0 ? (
              <EmptyState>No Curated Deals have been assembled yet.</EmptyState>
            ) : (
              <div className="space-y-3">
                {data.curatedDeals.map((deal) => (
                  <article key={deal.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{deal.title}</h3>
                        <p className="mt-1 text-xs text-slate-400">
                          {deal.cruiseLine} | {deal.shipName} | {deal.sailDateIso} | package{" "}
                          {deal.packageId}
                        </p>
                      </div>
                      <Badge tone={deal.publishable ? "ok" : "blocked"}>
                        {deal.publishable ? "publishable" : "not public"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>{deal.status}</Badge>
                      <Badge tone={deal.linkHealth === "valid" ? "ok" : "pending"}>
                        {deal.linkHealth}
                      </Badge>
                      <Badge tone={deal.hasAngleResearch ? "ok" : "pending"}>
                        research {deal.hasAngleResearch ? "yes" : "missing"}
                      </Badge>
                      <Badge tone={deal.hasTargetingDemographic ? "ok" : "pending"}>
                        targeting {deal.hasTargetingDemographic ? "yes" : "missing"}
                      </Badge>
                      {deal.pinned && <Badge tone="ok">pinned</Badge>}
                      {deal.hidden && <Badge tone="error">hidden</Badge>}
                    </div>
                    {deal.warnings.length > 0 && (
                      <ul className="mt-3 space-y-1 text-xs leading-5 text-amber-100">
                        {deal.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            )}
          </CollapsiblePanel>

          <CollapsiblePanel title="Link Broker Records" eyebrow="Internal link generator cache">
            {data.linkBrokerRecords.length === 0 ? (
              <EmptyState>No Link Broker records are currently cached.</EmptyState>
            ) : (
              <div className="space-y-3">
                {data.linkBrokerRecords.map((record) => (
                  <article key={record.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          Package {record.packageId} / SIID {record.siid}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">{record.cruiseLabel}</p>
                      </div>
                      <Badge tone={record.health === "valid" ? "ok" : "pending"}>
                        {record.health}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>{record.linkClass}</Badge>
                      <Badge>{record.source}</Badge>
                      {record.parameterSummary.map((item) => (
                        <Badge key={item}>{item}</Badge>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Updated {formatDateTime(record.updatedAtIso)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </CollapsiblePanel>
        </div>

        <CollapsiblePanel title="Callback Requests" eyebrow="CTA operations">
          {data.callbackRequests.length === 0 ? (
            <EmptyState>
              No callback requests are cached yet. When a visitor uses &quot;Request an agent
              callback&quot; on a Deal page, it will appear here with their contact info, deal
              context, and link health, and you can mark it contacted or closed.
            </EmptyState>
          ) : (
            <CallbackRequestsPanel requests={data.callbackRequests} />
          )}
        </CollapsiblePanel>
      </div>
    </div>
  );
}
