"use client";

import { useState, type ReactNode } from "react";

import { type DealsSystemDashboardData } from "@/lib/cb/deals-system/dashboard-data";
import { DEALS_SYSTEM_OPERATOR_ACTIONS } from "@/lib/cb/deals-system/operator-actions";

import { CallbackRequestsPanel } from "./callback-requests-panel";
import { DealActivityPanel } from "./deal-activity-panel";
import { DealCampaignWorkbench } from "./campaign-workbench";
import { DealsSystemControls } from "./controls";
import { PackageLookupControl } from "./package-lookup-control";

type CuratedDealSummary = DealsSystemDashboardData["curatedDeals"][number];

type StatusTone = "ok" | "error" | "neutral" | "pending" | "blocked";

const statusStyles: Record<StatusTone, string> = {
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

function Panel({
  title,
  eyebrow,
  children,
  action,
  defaultOpen = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex flex-1 items-center gap-3 text-left transition hover:opacity-80"
        >
          <svg
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div>
            {eyebrow && (
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                {eyebrow}
              </p>
            )}
            <h2 className="text-lg font-semibold text-white">{title}</h2>
          </div>
        </button>
        {action}
      </div>
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
    return "Curated Deal records exist, but none are bookable with valid link health yet. Homepage Deals should stay hidden until they pass the gate.";
  }
  return "Promo and Link Broker data may exist, but no Curated Deal records have been assembled yet.";
}

// ─── Tab scaffolding ─────────────────────────────────────────────────────────

type TabId = "pipeline" | "tools" | "inventory" | "health";

const TABS: Array<{ id: TabId; label: string; hint: string }> = [
  { id: "pipeline", label: "Pipeline", hint: "Discovery → Meta ads" },
  { id: "tools", label: "Operator Tools", hint: "Scripts, lookup, workbench" },
  { id: "inventory", label: "Inventory", hint: "Deals, promos, links" },
  { id: "health", label: "Ops & Health", hint: "Readiness, callbacks, caches" },
];

function TabBar({
  active,
  onChange,
  counts,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
  counts: Record<TabId, number | null>;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-2">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const count = counts[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex-1 min-w-[160px] rounded-xl border px-4 py-3 text-left transition ${
              isActive
                ? "border-cyan-300/50 bg-cyan-400/10"
                : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.03]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-sm font-semibold ${isActive ? "text-cyan-100" : "text-slate-200"}`}
              >
                {tab.label}
              </span>
              {count !== null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    isActive ? "bg-cyan-400/20 text-cyan-100" : "bg-white/5 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">{tab.hint}</p>
          </button>
        );
      })}
    </div>
  );
}

// ─── Pipeline step card ──────────────────────────────────────────────────────

const accents = {
  cyan: {
    eyebrow: "text-cyan-300",
    cta: "border-cyan-300/40 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25",
  },
  fuchsia: {
    eyebrow: "text-fuchsia-300",
    cta: "border-fuchsia-300/40 bg-fuchsia-400/15 text-fuchsia-100 hover:bg-fuchsia-400/25",
  },
  violet: {
    eyebrow: "text-violet-300",
    cta: "border-violet-300/40 bg-violet-400/15 text-violet-100 hover:bg-violet-400/25",
  },
} as const;

function StepCard({
  step,
  title,
  description,
  href,
  cta,
  accent = "cyan",
  children,
}: {
  step: number;
  title: string;
  description: ReactNode;
  href: string;
  cta: string;
  accent?: keyof typeof accents;
  children?: ReactNode;
}) {
  const a = accents[accent];
  const [isOpen, setIsOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-sm font-bold text-white">
            {step}
          </span>
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-[0.22em] ${a.eyebrow}`}>
              Step {step}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
          </div>
        </div>
        <a
          href={href}
          className={`inline-flex h-11 shrink-0 items-center justify-center rounded-xl border px-5 text-sm font-semibold transition ${a.cta}`}
        >
          {cta} →
        </a>
      </div>
      {children && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 transition hover:text-slate-200"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {isOpen ? "Hide details" : "Show details"}
          </button>
          {isOpen && <div className="mt-2">{children}</div>}
        </div>
      )}
    </section>
  );
}

// ─── Tab bodies ──────────────────────────────────────────────────────────────

function PipelineTab({ data }: { data: DealsSystemDashboardData }) {
  return (
    <div className="space-y-4">
      <StepCard
        step={1}
        title="Discovery — start from research"
        href="/tests/deals-system/discovery"
        cta="Open Discovery"
        description={
          data.discovery.hasSavedResearch
            ? `Saved discovery research is available${
                data.discovery.researchCachedAt
                  ? ` (cached ${data.discovery.researchCachedAt})`
                  : ""
              }. Generate retail package ideas from it — ${data.discovery.ideaCount} idea(s) cached so far.`
            : "No saved discovery research yet. Run Group discovery research first, then generate retail package ideas here."
        }
      >
        {data.discovery.angles.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-4">
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
      </StepCard>

      <StepCard
        step={2}
        title="Trip Manifestation"
        href="/tests/deals-system/trip-manifestation"
        cta="Open Trip Manifestation"
        description={
          <>
            Turn a discovery angle into a deal-package: correlate it with the CB promo
            intelligence to manifest the cruise line, destination, sail window, and applicable
            perks that pre-fill Source &amp; Assemble.{" "}
            {data.discovery.manifestCount > 0
              ? `${data.discovery.manifestCount} manifest(s) cached.`
              : data.discovery.ideaCount > 0
                ? "Pick one of your discovery angles to manifest."
                : "Generate discovery angles in Step 1 first."}
          </>
        }
      >
        {data.discovery.manifests.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-4">
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
      </StepCard>

      <StepCard
        step={3}
        title="Ad Copywriter"
        href="/tests/deals-system/copywriter"
        cta="Open Ad Copywriter"
        description={
          <>
            Expand a manifest&apos;s creative brief + inventory into direct-response ad copy — a
            primary retail play plus aspirational upsells, with insider voice and embedded
            targeting hooks.{" "}
            {data.discovery.adCopyCount > 0
              ? `${data.discovery.adCopyCount} ad-copy set(s) cached.`
              : data.discovery.manifestCount > 0
                ? "Pick a trip manifest to write ad copy."
                : "Manifest a trip in Step 2 first."}
          </>
        }
      />

      <StepCard
        step={4}
        accent="fuchsia"
        title="Funnel Synthesis"
        href="/tests/deals-system/funnel-synthesis"
        cta="Open Funnel Synthesis"
        description="Split the copywriter's hyper-niche ad copy into a broad-market landing page (segment paragraphs beside SERP imagery) and a hyper-niche 4-card Meta carousel. Curate the deal's selectable image set here."
      />

      <StepCard
        step={5}
        title="Publish"
        href="/tests/deals-system/publish"
        cta="Open Publish"
        description="Assemble a Curated Deal from a resolved manifest + its ad copy, review approval gates, mark the link valid, set an optional expiration, and approve it for the homepage."
      />

      <StepCard
        step={6}
        accent="violet"
        title="Meta Ad Synthesis"
        href="/tests/deals-system/meta-ad-synthesis"
        cta="Open Meta Ad Synthesis"
        description="Turn a published deal's landing page + carousel copy into ready-to-launch Meta ad creative (primary text, headlines, descriptions, and the carousel card set) for the ad platform. Coming soon."
      />
    </div>
  );
}

function ToolsTab({ data }: { data: DealsSystemDashboardData }) {
  return (
    <div className="space-y-4">
      <Panel title="Script Runner" eyebrow="Run allowlisted npm scripts">
        <DealsSystemControls actions={[...DEALS_SYSTEM_OPERATOR_ACTIONS]} />
      </Panel>

      <Panel title="Package Lookup" eyebrow="Resolve cruise facts to Odysseus packages">
        <PackageLookupControl />
      </Panel>

      <Panel
        title="Deal Campaign Workbench"
        eyebrow="Develop a Deal with AI — research, copy, ad, media, approval"
      >
        <DealCampaignWorkbench deals={data.curatedDeals} promoOptions={data.promoOptions} />
      </Panel>
    </div>
  );
}

function CuratedDealCard({ deal }: { deal: CuratedDealSummary }) {
  const [showActivity, setShowActivity] = useState(false);
  const a = deal.activity;

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{deal.title}</h3>
          <p className="mt-1 text-xs text-slate-400">
            {deal.cruiseLine} | {deal.shipName} | {deal.sailDateIso} | package {deal.packageId}
          </p>
        </div>
        <Badge tone={deal.publishable ? "ok" : "blocked"}>
          {deal.publishable ? "publishable" : "not public"}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge>{deal.status}</Badge>
        <Badge tone={deal.linkHealth === "valid" ? "ok" : "pending"}>{deal.linkHealth}</Badge>
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

      {/* Compact reach/action roll-up — server-rendered, no fetch. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-xs text-slate-300">
        <span>
          <span className="font-semibold text-white">{a.totalViews}</span> views
        </span>
        <span>
          <span className="font-semibold text-white">{a.uniqueSessions}</span> unique
        </span>
        <span>
          <span className="font-semibold text-white">{a.bookNowClicks}</span> book clicks
        </span>
        <span>
          <span className="font-semibold text-white">{a.totalActions}</span> actions
        </span>
        <button
          type="button"
          onClick={() => setShowActivity((value) => !value)}
          className="ml-auto rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
        >
          {showActivity ? "Hide activity" : "View activity"}
        </button>
      </div>

      {showActivity && <DealActivityPanel dealId={deal.id} />}
    </article>
  );
}

function InventoryTab({ data }: { data: DealsSystemDashboardData }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Curated Deals" eyebrow="Homepage publishing gate · reach + actions">
          {data.curatedDeals.length === 0 ? (
            <EmptyState>No Curated Deals have been assembled yet.</EmptyState>
          ) : (
            <div className="space-y-3">
              {data.curatedDeals.map((deal) => (
                <CuratedDealCard key={deal.id} deal={deal} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Link Broker Records" eyebrow="Internal link generator cache">
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
        </Panel>
      </div>

      <Panel title="CB Promo Intelligence" eyebrow="Agent promo rules, not sellable alone">
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
      </Panel>
    </div>
  );
}

function HealthTab({ data }: { data: DealsSystemDashboardData }) {
  return (
    <div className="space-y-4">
      <Panel title="Homepage Readiness" eyebrow={`Read ${formatDateTime(data.readAtIso)}`}>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-base font-semibold text-white">{homepageReadiness(data)}</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              The public Deals surface should only read Curated Deals where status is bookable and
              Link Broker health is valid. Promo records are useful raw intelligence, but they are
              not sellable by themselves.
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
      </Panel>

      <Panel title="Callback Requests" eyebrow="CTA operations">
        {data.callbackRequests.length === 0 ? (
          <EmptyState>
            No callback requests are cached yet. When a visitor uses &quot;Request an agent
            callback&quot; on a Deal page, it will appear here with their contact info, deal
            context, and link health, and you can mark it contacted or closed.
          </EmptyState>
        ) : (
          <CallbackRequestsPanel requests={data.callbackRequests} />
        )}
      </Panel>

      <Panel title="Cache Health" eyebrow="Local artifacts">
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
      </Panel>
    </div>
  );
}

// ─── Page shell ──────────────────────────────────────────────────────────────

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
  const [activeTab, setActiveTab] = useState<TabId>("pipeline");

  const tabCounts: Record<TabId, number | null> = {
    pipeline: null,
    tools: null,
    inventory: data.summary.curatedDeals + data.summary.promoRecords,
    health: data.summary.callbackRequests,
  };

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

      {/* Always-visible at-a-glance stats */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          note="Requests queued for Pushover and dashboard workflow"
        />
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} counts={tabCounts} />

      <div className="mt-6">
        {activeTab === "pipeline" && <PipelineTab data={data} />}
        {activeTab === "tools" && <ToolsTab data={data} />}
        {activeTab === "inventory" && <InventoryTab data={data} />}
        {activeTab === "health" && <HealthTab data={data} />}
      </div>
    </div>
  );
}
