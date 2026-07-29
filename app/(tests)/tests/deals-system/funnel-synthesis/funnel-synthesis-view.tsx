"use client";

import { useMemo, useState } from "react";

import type { DealAdCopy } from "@/lib/cb/deals-system/deal-ad-copy-types";
import type { DealPageFacts } from "@/lib/cb/deals-system/deal-page-facts";
import {
  DEAL_IMAGE_CATEGORIES,
  DEAL_IMAGE_CATEGORY_SPECS,
  type DealFunnelSynthesis,
  type DealImageCandidate,
  type DealImageCategory,
  type DealLandingSegmentKey,
  type DealLandingSegment,
} from "@/lib/cb/deals-system/deal-page-design-types";

import { CampaignSelectBar } from "../campaign-select-bar";

const CATEGORY_LABEL: Record<DealImageCategory, string> = Object.fromEntries(
  DEAL_IMAGE_CATEGORY_SPECS.map((s) => [s.category, s.label])
) as Record<DealImageCategory, string>;

const CAROUSEL_HEADLINE_MAX = 40;
const CAROUSEL_PRIMARY_TEXT_MAX = 125;

interface SynthResponse {
  ok: boolean;
  error?: string;
  synthesis?: DealFunnelSynthesis;
  syntheses?: DealFunnelSynthesis[];
  category?: string;
}

function firstSynthesisIdForAdCopy(
  syntheses: DealFunnelSynthesis[],
  adCopyId: string | null
): string | null {
  if (!adCopyId) return null;
  return syntheses.find((s) => s.sourceAdCopyId === adCopyId)?.id ?? null;
}

function candidateById(s: DealFunnelSynthesis, id?: string): DealImageCandidate | undefined {
  if (!id) return undefined;
  return s.candidates.find((c) => c.id === id);
}

// ── Full-screen preview ─────────────────────────────────────────────────────────

function ImageLightbox({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-lg text-white transition hover:bg-black/80"
        aria-label="Close full-screen preview"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── Landing page render ────────────────────────────────────────────────────────

function SegmentBlock({
  segment,
  synthesis,
  onPickImage,
  busy,
}: {
  segment: DealLandingSegment;
  synthesis: DealFunnelSynthesis;
  onPickImage: (segmentKey: string, imageId: string) => void;
  busy: boolean;
}) {
  const img = candidateById(synthesis, segment.imageId);
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <div className="overflow-hidden rounded-md border border-white/10 bg-black/40">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.thumbnailUrl} alt={segment.heading} className="h-28 w-full object-cover" />
          ) : (
            <div className="flex h-28 items-center justify-center text-[10px] text-slate-500">
              no image picked
            </div>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
            {segment.heading}
          </p>
          <p className="mt-1 text-xs leading-6 text-slate-300">{segment.body}</p>
        </div>
      </div>
      {(() => {
        // Prefer candidates sourced for THIS segment's category; fall back to the
        // gallery if none match (e.g. an older synthesis with uncategorized images).
        const sameCategory = synthesis.candidates.filter((c) => c.category === segment.segment);
        const pool = sameCategory.length > 0 ? sameCategory : synthesis.candidates;
        if (pool.length === 0) return null;
        return (
          <div className="mt-2">
            <p className="mb-1 text-[9px] uppercase tracking-widest text-slate-600">
              {sameCategory.length > 0 ? `${segment.segment} images` : "all images"} · click to use here
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pool.map((c) => {
                const picked = segment.imageId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onPickImage(segment.segment, c.id)}
                    className={`h-9 w-12 overflow-hidden rounded border transition disabled:opacity-50 ${
                      picked ? "border-cyan-300 ring-1 ring-cyan-300" : "border-white/10 hover:border-white/40"
                    }`}
                    title="Use for this segment"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function LandingPanel({
  synthesis,
  onPickSegmentImage,
  busy,
}: {
  synthesis: DealFunnelSynthesis;
  onPickSegmentImage: (segmentKey: string, imageId: string) => void;
  busy: boolean;
}) {
  const hero = candidateById(synthesis, synthesis.heroImageId ?? synthesis.galleryIds[0]);
  const lp = synthesis.landingPage;
  return (
    <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.04] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
        Landing page · broad market
      </p>
      <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black/30">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.imageUrl} alt={lp.heroHeadline} className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-20 items-center justify-center text-[11px] text-slate-500">
            no hero picked — choose one in the image set
          </div>
        )}
        <div className="p-3">
          <h3 className="text-base font-bold leading-snug text-white">{lp.heroHeadline}</h3>
          <p className="mt-1 text-xs text-slate-300">{lp.heroSubhead}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {lp.segments.map((seg) => (
          <SegmentBlock
            key={seg.segment}
            segment={seg}
            synthesis={synthesis}
            onPickImage={onPickSegmentImage}
            busy={busy}
          />
        ))}
      </div>

      {lp.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] text-amber-200">
          {lp.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Carousel render ────────────────────────────────────────────────────────────

function CarouselPanel({ synthesis }: { synthesis: DealFunnelSynthesis }) {
  return (
    <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/[0.04] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-300">
        Meta carousel · hyper niche
      </p>
      <div className="mt-2 space-y-2">
        {synthesis.carousel.cards.map((card, i) => {
          const hOver = card.headline.length > CAROUSEL_HEADLINE_MAX;
          const pOver = card.primaryText.length > CAROUSEL_PRIMARY_TEXT_MAX;
          return (
            <div key={i} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-fuchsia-300">
                  Card {i + 1}
                </span>
              </div>
              <h4 className="mt-1 text-sm font-bold text-white">{card.headline}</h4>
              <p className={`text-[10px] ${hOver ? "text-amber-300" : "text-slate-500"}`}>
                headline {card.headline.length}/{CAROUSEL_HEADLINE_MAX}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-300">{card.primaryText}</p>
              <p className={`text-[10px] ${pOver ? "text-amber-300" : "text-slate-500"}`}>
                primary text {card.primaryText.length}/{CAROUSEL_PRIMARY_TEXT_MAX}
              </p>
            </div>
          );
        })}
      </div>
      {synthesis.carousel.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] text-amber-200">
          {synthesis.carousel.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Image set picker ───────────────────────────────────────────────────────────

function ImageThumb({
  c,
  synthesis,
  onToggleGallery,
  onPickHero,
  onAssignLandingImage,
  onPreviewImage,
  busy,
}: {
  c: DealImageCandidate;
  synthesis: DealFunnelSynthesis;
  onToggleGallery: (id: string) => void;
  onPickHero: (id: string) => void;
  onAssignLandingImage: (
    id: string,
    target: "hero" | DealLandingSegmentKey
  ) => void;
  onPreviewImage: (url: string, alt: string) => void;
  busy: boolean;
}) {
  const inGallery = synthesis.galleryIds.includes(c.id);
  const isHero = synthesis.heroImageId ? synthesis.heroImageId === c.id : synthesis.galleryIds[0] === c.id;
  return (
    <div className="relative">
      {/* Thumbnail click zooms — curation lives on the explicit buttons below,
          so "see it big" and "use it" are separate gestures. */}
      <button
        type="button"
        onClick={() => onPreviewImage(c.imageUrl, c.title ?? "")}
        title="Click to view full screen"
        className={`group block h-24 w-full cursor-zoom-in overflow-hidden rounded border transition ${
          inGallery ? "border-cyan-300 ring-1 ring-cyan-300" : "border-white/10 hover:border-white/40"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={c.thumbnailUrl}
          alt={c.title ?? ""}
          className="h-full w-full object-cover transition group-hover:scale-[1.03]"
        />
      </button>
      {inGallery && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onPickHero(c.id)}
          className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-bold shadow-sm transition ${
            isHero ? "bg-amber-400 text-black" : "bg-black/70 text-slate-200 hover:bg-black/90"
          }`}
        >
          {isHero ? "★ hero" : "hero?"}
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => onToggleGallery(c.id)}
        title={inGallery ? "Remove from gallery" : "Add to gallery"}
        className={`mt-1.5 h-7 w-full rounded border text-[10px] font-semibold transition disabled:opacity-50 ${
          inGallery
            ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25"
            : "border-white/15 bg-white/[0.04] text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"
        }`}
      >
        {inGallery ? "✓ In gallery" : "+ Add"}
      </button>
      <select
        aria-label={`Use ${c.title ?? "image"} on landing page`}
        disabled={busy}
        value=""
        onChange={(event) => {
          const target = event.target.value as "hero" | DealLandingSegmentKey;
          if (target) onAssignLandingImage(c.id, target);
        }}
        className="mt-1 h-7 w-full rounded border border-white/10 bg-slate-950 px-1 text-[9px] text-slate-200 outline-none transition hover:border-cyan-300/40 disabled:opacity-50"
      >
        <option value="">Use on page...</option>
        <option value="hero">Hero image</option>
        {synthesis.landingPage.segments.map((segment) => (
          <option key={segment.segment} value={segment.segment}>
            {segment.heading}
          </option>
        ))}
      </select>
    </div>
  );
}

function ImageCategoryGroup({
  cat,
  items,
  synthesis,
  onToggleGallery,
  onPickHero,
  onAssignLandingImage,
  onPreviewImage,
  onSearchMore,
  busy,
}: {
  cat: DealImageCategory;
  items: DealImageCandidate[];
  synthesis: DealFunnelSynthesis;
  onToggleGallery: (id: string) => void;
  onPickHero: (id: string) => void;
  onAssignLandingImage: (id: string, target: "hero" | DealLandingSegmentKey) => void;
  onPreviewImage: (url: string, alt: string) => void;
  onSearchMore: (category?: DealImageCategory) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inGalleryCount = items.filter((c) => synthesis.galleryIds.includes(c.id)).length;

  return (
    <div className="rounded-lg border border-white/10 bg-black/20">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left transition hover:opacity-90"
        >
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
            {CATEGORY_LABEL[cat]}
          </span>
          <span className="text-[10px] text-slate-500">{items.length}</span>
          {inGalleryCount > 0 && (
            <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-100">
              {inGalleryCount} in gallery
            </span>
          )}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSearchMore(cat)}
          className="shrink-0 text-[10px] font-semibold text-slate-400 underline-offset-2 transition hover:text-cyan-200 hover:underline disabled:opacity-50"
        >
          + more
        </button>
      </div>
      {open && (
        <div className="border-t border-white/10 px-3 py-3">
          {items.length === 0 ? (
            <p className="text-[10px] text-slate-600">none yet — “+ more” to search this category</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((c) => (
                <ImageThumb
                  key={c.id}
                  c={c}
                  synthesis={synthesis}
                  onToggleGallery={onToggleGallery}
                  onPickHero={onPickHero}
                  onAssignLandingImage={onAssignLandingImage}
                  onPreviewImage={onPreviewImage}
                  busy={busy}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImageSetPanel({
  synthesis,
  onToggleGallery,
  onPickHero,
  onAssignLandingImage,
  onPreviewImage,
  onSearchMore,
  busy,
}: {
  synthesis: DealFunnelSynthesis;
  onToggleGallery: (id: string) => void;
  onPickHero: (id: string) => void;
  onAssignLandingImage: (
    id: string,
    target: "hero" | DealLandingSegmentKey
  ) => void;
  onPreviewImage: (url: string, alt: string) => void;
  /** category omitted = re-search the whole diversified pool. */
  onSearchMore: (category?: DealImageCategory) => void;
  busy: boolean;
}) {
  // The whole image set collapses to a single header when you're not curating —
  // 64 candidates across 8 categories otherwise fill the entire page. Open it,
  // then open only the category you're working in; each thumbnail zooms.
  const [open, setOpen] = useState(false);

  const byCategory = useMemo(() => {
    const map = new Map<DealImageCategory, DealImageCandidate[]>();
    for (const cat of DEAL_IMAGE_CATEGORIES) map.set(cat, []);
    // Drop any duplicate-id candidates defensively — older caches were written
    // with positional ids that could collide, and a duplicate React key throws.
    const seenIds = new Set<string>();
    for (const c of synthesis.candidates) {
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      const list = map.get(c.category) ?? map.set(c.category, []).get(c.category)!;
      list.push(c);
    }
    return map;
  }, [synthesis.candidates]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left transition hover:opacity-90"
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
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">Image set</span>
          <span className="truncate text-[11px] text-slate-500">
            {synthesis.candidates.length} candidate(s) · {synthesis.galleryIds.length} in gallery
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSearchMore()}
          className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-cyan-300/50 disabled:opacity-50"
        >
          Search all categories (SERP)
        </button>
      </div>
      {open &&
        (synthesis.candidates.length === 0 ? (
          <p className="border-t border-white/10 px-4 py-3 text-[11px] text-slate-500">
            No candidates yet — click “Search all categories (SERP)” to pull a diversified
            pool of ship and destination photos.
          </p>
        ) : (
          <div className="space-y-2 border-t border-white/10 px-4 py-3">
            {DEAL_IMAGE_CATEGORIES.map((cat) => (
              <ImageCategoryGroup
                key={cat}
                cat={cat}
                items={byCategory.get(cat) ?? []}
                synthesis={synthesis}
                onToggleGallery={onToggleGallery}
                onPickHero={onPickHero}
                onAssignLandingImage={onAssignLandingImage}
                onPreviewImage={onPreviewImage}
                onSearchMore={onSearchMore}
                busy={busy}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

function DealFactsPanel({ facts }: { facts?: DealPageFacts }) {
  if (!facts) {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-[11px] text-amber-100">
        No cruise facts found for this ad copy — its trip manifest is missing. The page would
        not be self-sufficient for purchase.
      </div>
    );
  }
  const p = facts.cabinPricing;
  const price = (n?: number) => (typeof n === "number" ? `$${n.toLocaleString()}` : "—");
  return (
    <div
      className={`rounded-xl border p-4 ${
        facts.readiness === "resolved"
          ? "border-emerald-400/25 bg-emerald-500/[0.05]"
          : "border-amber-400/30 bg-amber-500/[0.06]"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
          Cruise facts for the page
        </p>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
            facts.readiness === "resolved"
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-amber-400/40 bg-amber-500/10 text-amber-200"
          }`}
        >
          {facts.readiness === "resolved" ? "resolved" : "draft — resolve in Step 2"}
        </span>
      </div>

      <div className="mt-2 grid gap-x-4 gap-y-1 text-[11px] text-slate-300 sm:grid-cols-2">
        <span>Ship: <b className="text-white">{facts.shipName ?? facts.shipClassHint ?? "—"}</b></span>
        <span>Line: <b className="text-white">{facts.cruiseLine}</b></span>
        <span>
          Sail date:{" "}
          <b className="text-white">
            {facts.sailDateIso ??
              `${facts.sailWindow?.earliestIso ?? "?"} – ${facts.sailWindow?.latestIso ?? "?"} (window)`}
          </b>
        </span>
        <span>Nights: <b className="text-white">{facts.nights ?? "—"}</b></span>
        <span className="sm:col-span-2">
          Itinerary: <b className="text-white">{facts.departurePort ?? "?"}</b>
          {facts.portsOfCall.length > 0 ? ` → ${facts.portsOfCall.join(" → ")}` : ""}
        </span>
        <span className="sm:col-span-2">
          Pricing:{" "}
          {p ? (
            <b className="text-white">
              Inside {price(p.inside)} · Outside {price(p.outside)} · Balcony {price(p.balcony)} ·
              Suite {price(p.suite)} {p.currencyCode}
            </b>
          ) : (
            <span className="text-amber-200">live lookup (no on-page price yet)</span>
          )}
        </span>
        <span className="sm:col-span-2">
          Specials: <b className="text-white">{facts.promos.length}</b>{" "}
          {facts.promos.map((pr) => pr.title).filter(Boolean).join("; ")}
        </span>
      </div>

      {facts.notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[10px] text-amber-200">
          {facts.notes.map((n) => (
            <li key={n}>⚠ {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FunnelSynthesisView({
  adCopies,
  initialSyntheses,
  dealFacts,
  preselectedAdCopyId,
}: {
  adCopies: DealAdCopy[];
  initialSyntheses: DealFunnelSynthesis[];
  dealFacts: Record<string, DealPageFacts>;
  preselectedAdCopyId: string | null;
}) {
  const initialSelectedAdCopyId =
    preselectedAdCopyId && adCopies.some((a) => a.id === preselectedAdCopyId)
      ? preselectedAdCopyId
      : adCopies[0]?.id ?? null;

  const [selectedAdCopyId, setSelectedAdCopyId] = useState<string | null>(initialSelectedAdCopyId);
  const [syntheses, setSyntheses] = useState<DealFunnelSynthesis[]>(initialSyntheses);
  const [activeId, setActiveId] = useState<string | null>(
    firstSynthesisIdForAdCopy(initialSyntheses, initialSelectedAdCopyId) ?? initialSyntheses[0]?.id ?? null
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);

  async function copyClaudeDesignPayload() {
    if (!active) return;
    // The exact shape the Claude Design page primer ({{FUNNEL_SYNTHESIS_JSON}})
    // expects: the broad landing copy + ONLY the curated images + the operator's
    // hero/gallery/per-segment selections.
    const inGallery = (id?: string) => Boolean(id && active.galleryIds.includes(id));
    const resolvedHeroImageId = active.heroImageId ?? active.galleryIds[0];
    const usedImageIds = new Set<string>([
      ...active.galleryIds,
      ...(resolvedHeroImageId ? [resolvedHeroImageId] : []),
      ...active.landingPage.segments.map((s) => s.imageId).filter((x): x is string => Boolean(x)),
    ]);
    const facts = dealFacts[active.sourceAdCopyId];
    const payload = {
      sailingAngleTitle: active.sailingAngleTitle,
      // The COMPLETE cruise facts so the page is self-sufficient for purchase:
      // ship, sail date, nights, itinerary + every stop, cabin pricing, and the
      // specials/promo packages. Absent only if the manifest isn't resolved yet.
      dealFacts: facts ?? null,
      landingPage: {
        heroHeadline: active.landingPage.heroHeadline,
        heroSubhead: active.landingPage.heroSubhead,
        segments: active.landingPage.segments.map((s) => ({
          segment: s.segment,
          heading: s.heading,
          body: s.body,
          imageId: inGallery(s.imageId) ? s.imageId : undefined,
        })),
      },
      heroImageId: inGallery(resolvedHeroImageId) ? resolvedHeroImageId : undefined,
      galleryIds: active.galleryIds,
      candidates: active.candidates
        .filter((c) => usedImageIds.has(c.id))
        .map((c) => ({ id: c.id, imageUrl: c.imageUrl, category: c.category, title: c.title })),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ tone: "error", text: "Clipboard unavailable — copy from the AI debug panel instead." });
    }
  }

  const selectedAdCopy = useMemo(
    () => adCopies.find((a) => a.id === selectedAdCopyId) ?? null,
    [adCopies, selectedAdCopyId]
  );
  const active = useMemo(
    () => syntheses.find((s) => s.id === activeId) ?? null,
    [syntheses, activeId]
  );
  // Only the selected ad copy's syntheses — the tab row must not surface another
  // ad copy's funnel, or the picker and the panels below would disagree.
  const visibleSyntheses = useMemo(
    () => syntheses.filter((s) => s.sourceAdCopyId === selectedAdCopyId),
    [syntheses, selectedAdCopyId]
  );

  function applySynthesis(s: DealFunnelSynthesis) {
    setSyntheses((prev) => {
      const next = prev.filter((x) => x.id !== s.id);
      next.push(s);
      return next;
    });
    setSelectedAdCopyId(s.sourceAdCopyId);
    setActiveId(s.id);
  }

  function selectAdCopy(adCopyId: string) {
    setSelectedAdCopyId(adCopyId);
    // Point the active synthesis at this ad copy's synthesis — or clear it if
    // none exists yet, so the panels below don't keep showing the previously
    // selected ad copy's funnel.
    setActiveId(firstSynthesisIdForAdCopy(syntheses, adCopyId));
  }

  async function post(body: Record<string, unknown>): Promise<SynthResponse> {
    const res = await fetch("/api/tests/deals-system/funnel-synthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as SynthResponse;
  }

  async function synthesize() {
    if (!selectedAdCopyId) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await post({ action: "synthesize", adCopyId: selectedAdCopyId });
      if (!data.ok || !data.synthesis) throw new Error(data.error ?? "Synthesis failed.");
      applySynthesis(data.synthesis);
      if (data.syntheses) setSyntheses(data.syntheses);
      setMessage({ tone: "ok", text: "Funnel synthesized — landing page + carousel ready. Curate the image set below." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function searchMore(category?: DealImageCategory) {
    if (!active) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await post({
        action: "search_images",
        synthesisId: active.id,
        ...(category ? { category } : {}),
      });
      if (!data.ok || !data.synthesis) throw new Error(data.error ?? "Image search failed.");
      applySynthesis(data.synthesis);
      setMessage({
        tone: "ok",
        text: category ? `Searched more ${category} images.` : "Searched all image categories.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function selectImages(patch: {
    galleryIds?: string[];
    heroImageId?: string;
    segmentImageIds?: Record<string, string>;
  }) {
    if (!active) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await post({ action: "select_images", synthesisId: active.id, ...patch });
      if (!data.ok || !data.synthesis) throw new Error(data.error ?? "Saving selection failed.");
      applySynthesis(data.synthesis);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  function toggleGallery(id: string) {
    if (!active) return;
    const wasInGallery = active.galleryIds.includes(id);
    const next = wasInGallery
      ? active.galleryIds.filter((g) => g !== id)
      : [...active.galleryIds, id];
    let heroImageId = active.heroImageId ?? "";
    if (!wasInGallery && !heroImageId) {
      heroImageId = id;
    } else if (heroImageId && !next.includes(heroImageId)) {
      heroImageId = next[0] ?? "";
    }
    void selectImages({ galleryIds: next, heroImageId });
  }

  function assignLandingImage(
    id: string,
    target: "hero" | DealLandingSegmentKey
  ) {
    if (!active) return;
    const galleryIds = active.galleryIds.includes(id)
      ? active.galleryIds
      : [...active.galleryIds, id];
    if (target === "hero") {
      void selectImages({ galleryIds, heroImageId: id });
      return;
    }
    void selectImages({
      galleryIds,
      segmentImageIds: { [target]: id },
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">
            Deal Workflow · Step 4
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Funnel Synthesis</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Split the copywriter&apos;s hyper-niche ad copy into two assets: a broad-market{" "}
            <span className="text-emerald-200">landing page</span> (jargon stripped, segment
            paragraphs beside SERP imagery) and a hyper-niche{" "}
            <span className="text-fuchsia-200">4-card Meta carousel</span> that flags the exact
            subculture in the feed.
          </p>
        </div>
        <a
          href="/tests/deals-system"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          ← Back to Deals dashboard
        </a>
      </div>

      {message && (
        <div
          className={`mb-6 rounded-xl border p-4 text-sm ${
            message.tone === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : "border-rose-400/30 bg-rose-500/10 text-rose-100"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Campaign selector — one compact bar, shared across every step page. */}
      <CampaignSelectBar
        eyebrow="Ad copy to synthesize"
        items={adCopies.map((a) => {
          const sel = a.selectedVariantIndex ?? 0;
          return {
            id: a.id,
            title: a.campaignName,
            subtitle: `${a.targetAudienceTag} · final ad: ${a.variants[sel]?.variantLabel ?? "—"}`,
          };
        })}
        selectedId={selectedAdCopyId}
        onSelect={selectAdCopy}
        emptyState={
          <p className="text-sm text-amber-200">
            No ad copy cached yet. Run Step 3 · Ad Copywriter first.
          </p>
        }
        action={
          <button
            type="button"
            disabled={busy || !selectedAdCopy}
            onClick={() => void synthesize()}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Synthesizing…" : "Synthesize funnel (landing + carousel)"}
          </button>
        }
      />

      {/* Synthesis tabs — scoped to the selected ad copy */}
      {visibleSyntheses.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {visibleSyntheses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                activeId === s.id
                  ? "border-cyan-300/60 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
              }`}
            >
              {s.sailingAngleTitle}
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-400/25 bg-violet-500/[0.06] p-3">
            <p className="text-[11px] text-violet-100">
              Curated the copy + image set? Hand this deal to Claude Design with the page primer.
            </p>
            <button
              type="button"
              onClick={() => void copyClaudeDesignPayload()}
              className="inline-flex h-9 items-center rounded-lg border border-violet-300/40 bg-violet-400/10 px-3 text-[11px] font-semibold text-violet-100 transition hover:bg-violet-400/20"
            >
              {copied ? "Copied ✓" : "Copy Claude Design payload"}
            </button>
          </div>

          <div className="mb-4">
            <DealFactsPanel facts={dealFacts[active.sourceAdCopyId]} />
          </div>

          <div className="mb-6">
            <ImageSetPanel
              synthesis={active}
              busy={busy}
              onToggleGallery={toggleGallery}
              onPickHero={(id) => void selectImages({ heroImageId: id })}
              onAssignLandingImage={assignLandingImage}
              onPreviewImage={(url, alt) => setPreviewImage({ url, alt })}
              onSearchMore={(category) => void searchMore(category)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <LandingPanel
              synthesis={active}
              busy={busy}
              onPickSegmentImage={(segmentKey, imageId) =>
                void selectImages({ segmentImageIds: { [segmentKey]: imageId } })
              }
            />
            <CarouselPanel synthesis={active} />
          </div>

          {active.aiTrace && (
            <details className="mt-4 rounded-lg border border-white/10 bg-black/20 p-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">
                AI debug{" "}
                <span className="text-slate-500">
                  ({active.aiTrace.model} · {active.aiTrace.latencyMs}ms)
                </span>
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
                {active.aiTrace.promptSent}
              </pre>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
                {active.aiTrace.rawResponse}
              </pre>
            </details>
          )}
        </>
      )}

      {previewImage && (
        <ImageLightbox
          url={previewImage.url}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
