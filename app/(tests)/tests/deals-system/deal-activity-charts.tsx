"use client";

/**
 * Activity-over-time charts for Curated Deals — a 14-day sparkline for the
 * inventory card plus the expanded panel's daily reach and daily actions bar
 * charts (with hover tooltips and a table-view twin). Pure inline SVG, no
 * chart library. Series colors are the validated dark-surface categorical
 * palette (blue / green / magenta); chrome stays in text tokens.
 */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  DealBookingFunnelStage,
  DealDailyActivityBucket,
} from "@/lib/cb/deals-system/deal-events-store";

// Validated against the dashboard's chart surface (#0b0f1f): all pairs clear
// the CVD floor, normal-vision floor, and 3:1 contrast. Order is fixed.
const SERIES_BLUE = "#3987e5";
const SERIES_GREEN = "#008300";
const SERIES_MAGENTA = "#d55181";
// Booking-flow identity; validated as the 4th slot alongside the three above.
const SERIES_AMBER = "#b8791a";

const GRID_STROKE = "rgba(255,255,255,0.07)";
const AXIS_STROKE = "rgba(255,255,255,0.16)";

const ACTION_SERIES = [
  { key: "bookNowClicks", label: "Book-now clicks", color: SERIES_BLUE },
  { key: "linkRequests", label: "Link requests", color: SERIES_GREEN },
  { key: "callbackRequests", label: "Callbacks", color: SERIES_MAGENTA },
] as const;

type ActionSeriesKey = (typeof ACTION_SERIES)[number]["key"];

function formatDay(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateIso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Round up to a clean axis maximum (1/2/5 × 10^k), never below 1. */
function niceCeil(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

function useMeasuredWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Bar with a 4px rounded data-end and a square baseline end. */
function roundedBarPath(x: number, yTop: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  const yBase = yTop + h;
  return [
    `M${x},${yBase}`,
    `L${x},${yTop + r}`,
    `Q${x},${yTop} ${x + r},${yTop}`,
    `L${x + w - r},${yTop}`,
    `Q${x + w},${yTop} ${x + w},${yTop + r}`,
    `L${x + w},${yBase}`,
    "Z",
  ].join(" ");
}

// ─── Card sparkline ──────────────────────────────────────────────────────────

/**
 * 14-day reach trend for the inventory card: views as de-emphasis bars, today
 * in the dashboard accent, and a magenta dot over days with clicks/actions.
 * Full detail lives in the expanded activity panel; each day carries a title
 * tooltip.
 */
export function DealTrendSparkline({ daily }: { daily: DealDailyActivityBucket[] }) {
  if (daily.length === 0) return null;

  const barWidth = 7;
  const gap = 2;
  const plotHeight = 30;
  const dotBand = 6;
  const width = daily.length * (barWidth + gap) - gap;
  const height = plotHeight + dotBand;
  const maxViews = Math.max(1, ...daily.map((d) => d.views));

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Views per day, last 14 days"
      className="shrink-0"
    >
      {daily.map((day, index) => {
        const x = index * (barWidth + gap);
        const h = day.views > 0 ? Math.max(2, (day.views / maxViews) * plotHeight) : 1;
        const clicks = day.bookNowClicks + day.totalActions;
        const isToday = index === daily.length - 1;
        return (
          <g key={day.dateIso}>
            <title>
              {`${formatDay(day.dateIso)} · ${day.views} views · ${day.bookNowClicks} book clicks · ${day.totalActions} actions` +
                (day.bookingPortalEntries > 0 ? ` · ${day.bookingPortalEntries} portal` : "") +
                (day.bookingsConfirmed > 0 ? ` · ${day.bookingsConfirmed} booked` : "")}
            </title>
            {/* Full-height invisible hit area so the title tooltip is easy to reach. */}
            <rect x={x} y={0} width={barWidth + gap} height={height} fill="transparent" />
            <path
              d={roundedBarPath(x, dotBand + plotHeight - h, barWidth, h)}
              fill={isToday ? "#22d3ee" : "#475569"}
            />
            {clicks > 0 && (
              <circle cx={x + barWidth / 2} cy={dotBand / 2 + 1} r={2.5} fill={SERIES_MAGENTA} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Compact "last 7 days vs the 7 before" read-out shown beside the sparkline. */
export function SevenDayDelta({ daily }: { daily: DealDailyActivityBucket[] }) {
  if (daily.length < 14) return null;
  const sum = (slice: DealDailyActivityBucket[], pick: (d: DealDailyActivityBucket) => number) =>
    slice.reduce((total, day) => total + pick(day), 0);
  const last7 = daily.slice(7);
  const prior7 = daily.slice(0, 7);
  const views = sum(last7, (d) => d.views);
  const viewsDelta = views - sum(prior7, (d) => d.views);
  const clicks = sum(last7, (d) => d.bookNowClicks + d.totalActions);
  const clicksDelta = clicks - sum(prior7, (d) => d.bookNowClicks + d.totalActions);

  const deltaTone = (delta: number) =>
    delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-500";
  const signed = (delta: number) => (delta > 0 ? `+${delta}` : `${delta}`);

  return (
    <span className="text-[11px] leading-4 text-slate-400">
      7d: <span className="font-semibold text-slate-200">{views}</span> views{" "}
      <span className={deltaTone(viewsDelta)}>({signed(viewsDelta)})</span> ·{" "}
      <span className="font-semibold text-slate-200">{clicks}</span> clicks{" "}
      <span className={deltaTone(clicksDelta)}>({signed(clicksDelta)})</span>
    </span>
  );
}

// ─── Shared chart scaffolding ────────────────────────────────────────────────

interface TooltipState {
  x: number;
  y: number;
  body: ReactNode;
}

const MARGIN = { top: 20, right: 8, bottom: 20, left: 34 };
const PLOT_HEIGHT = 120;

interface DayChartFrameProps {
  title: string;
  buckets: DealDailyActivityBucket[];
  maxValue: number;
  legend?: ReactNode;
  renderDay: (args: {
    day: DealDailyActivityBucket;
    x: number;
    barWidth: number;
    scaleY: (value: number) => number;
    baseline: number;
  }) => ReactNode;
  tooltipFor: (day: DealDailyActivityBucket) => ReactNode;
  peak?: { index: number; value: number } | null;
}

/**
 * Axis + gridlines + per-day hover layer shared by both daily charts. The hit
 * target for each day is the full column slot (never just the painted bar);
 * keyboard focus shows the same tooltip as hover.
 */
function DayChartFrame({
  title,
  buckets,
  maxValue,
  legend,
  renderDay,
  tooltipFor,
  peak,
}: DayChartFrameProps) {
  const [containerRef, measuredWidth] = useMeasuredWidth<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const width = Math.max(measuredWidth, 200);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const height = MARGIN.top + PLOT_HEIGHT + MARGIN.bottom;
  const baseline = MARGIN.top + PLOT_HEIGHT;

  const slot = buckets.length > 0 ? plotWidth / buckets.length : plotWidth;
  const barWidth = Math.min(24, Math.max(2, slot - Math.max(2, slot * 0.25)));

  const yMax = niceCeil(maxValue);
  const scaleY = (value: number) => baseline - (value / yMax) * PLOT_HEIGHT;
  const ticks = yMax % 2 === 0 || yMax === 1 ? [0, yMax / 2, yMax] : [0, Math.ceil(yMax / 2), yMax];

  // Label roughly six x positions; always the first and last day.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));

  const showTooltip = (day: DealDailyActivityBucket, index: number) => {
    const x = MARGIN.left + index * slot + slot / 2;
    setTooltip({ x, y: MARGIN.top, body: tooltipFor(day) });
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
        {legend}
      </div>
      <div ref={containerRef} className="relative mt-1">
        {measuredWidth > 0 && (
          <svg width={width} height={height} role="img" aria-label={title}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={scaleY(tick)}
                  y2={scaleY(tick)}
                  stroke={tick === 0 ? AXIS_STROKE : GRID_STROKE}
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 6}
                  y={scaleY(tick) + 3}
                  textAnchor="end"
                  className="fill-slate-500"
                  fontSize={9}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {tick.toLocaleString()}
                </text>
              </g>
            ))}

            {buckets.map((day, index) => {
              const x = MARGIN.left + index * slot + (slot - barWidth) / 2;
              const lastIndex = buckets.length - 1;
              // Interior labels keep a full interval's clearance from the
              // end-anchored last label so they never collide with it.
              const isLabeled =
                index === 0 ||
                index === lastIndex ||
                (index % labelEvery === 0 && index > 0 && lastIndex - index >= labelEvery);
              return (
                <g key={day.dateIso}>
                  {renderDay({ day, x, barWidth, scaleY, baseline })}
                  {isLabeled && (
                    <text
                      x={MARGIN.left + index * slot + slot / 2}
                      y={baseline + 13}
                      textAnchor={
                        index === 0 ? "start" : index === buckets.length - 1 ? "end" : "middle"
                      }
                      className="fill-slate-500"
                      fontSize={9}
                    >
                      {formatDay(day.dateIso)}
                    </text>
                  )}
                </g>
              );
            })}

            {peak && peak.value > 0 && (
              <text
                x={Math.min(
                  Math.max(MARGIN.left + peak.index * slot + slot / 2, MARGIN.left + 30),
                  width - MARGIN.right - 30
                )}
                y={scaleY(peak.value) - 5}
                textAnchor="middle"
                className="fill-slate-200"
                fontSize={9}
                fontWeight={600}
              >
                {`peak ${peak.value.toLocaleString()} · ${formatDay(buckets[peak.index].dateIso)}`}
              </text>
            )}

            {/* Hover/focus layer: one full-height hit target per day slot. */}
            {buckets.map((day, index) => (
              <rect
                key={`hit-${day.dateIso}`}
                x={MARGIN.left + index * slot}
                y={MARGIN.top}
                width={slot}
                height={PLOT_HEIGHT}
                fill="transparent"
                tabIndex={0}
                onPointerMove={() => showTooltip(day, index)}
                onPointerLeave={() => setTooltip(null)}
                onFocus={() => showTooltip(day, index)}
                onBlur={() => setTooltip(null)}
              />
            ))}
          </svg>
        )}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-white/15 bg-slate-900 px-2.5 py-1.5 shadow-xl shadow-black/40"
            style={{
              left: Math.min(Math.max(tooltip.x, 70), Math.max(width - 70, 70)),
              top: tooltip.y - 2,
            }}
          >
            {tooltip.body}
          </div>
        )}
      </div>
    </div>
  );
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-[11px]">
      {color && <span className="h-0.5 w-3 shrink-0 rounded" style={{ background: color }} />}
      <span className="font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value.toLocaleString()}
      </span>
      <span className="text-slate-400">{label}</span>
    </div>
  );
}

function TooltipDate({ dateIso }: { dateIso: string }) {
  return <p className="mb-1 text-[10px] font-semibold text-slate-300">{formatDay(dateIso)}</p>;
}

// ─── Daily reach (views) ─────────────────────────────────────────────────────

export function DailyReachChart({ buckets }: { buckets: DealDailyActivityBucket[] }) {
  const maxViews = Math.max(...buckets.map((d) => d.views), 0);
  const peak = useMemo(() => {
    if (maxViews === 0) return null;
    return { index: buckets.findIndex((d) => d.views === maxViews), value: maxViews };
  }, [buckets, maxViews]);

  return (
    <DayChartFrame
      title="Daily views"
      buckets={buckets}
      maxValue={maxViews}
      peak={peak}
      renderDay={({ day, x, barWidth, scaleY, baseline }) => {
        if (day.views === 0) return null;
        const yTop = scaleY(day.views);
        return <path d={roundedBarPath(x, yTop, barWidth, baseline - yTop)} fill={SERIES_BLUE} />;
      }}
      tooltipFor={(day) => (
        <div>
          <TooltipDate dateIso={day.dateIso} />
          <TooltipRow label="views" value={day.views} />
          <TooltipRow label="unique sessions" value={day.uniqueSessions} />
          <TooltipRow label="engaged" value={day.engagedViews} />
        </div>
      )}
    />
  );
}

// ─── Daily actions (stacked: book clicks / link requests / callbacks) ───────

function actionTotal(day: DealDailyActivityBucket): number {
  return ACTION_SERIES.reduce((total, series) => total + day[series.key as ActionSeriesKey], 0);
}

export function DailyActionsChart({ buckets }: { buckets: DealDailyActivityBucket[] }) {
  const maxTotal = Math.max(...buckets.map(actionTotal), 0);
  const peak = useMemo(() => {
    if (maxTotal === 0) return null;
    return { index: buckets.findIndex((d) => actionTotal(d) === maxTotal), value: maxTotal };
  }, [buckets, maxTotal]);

  const legend = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {ACTION_SERIES.map((series) => (
        <span key={series.key} className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span className="h-2 w-2 rounded-sm" style={{ background: series.color }} />
          {series.label}
        </span>
      ))}
    </div>
  );

  return (
    <DayChartFrame
      title="Daily actions"
      buckets={buckets}
      maxValue={maxTotal}
      legend={legend}
      peak={peak}
      renderDay={({ day, x, barWidth, scaleY, baseline }) => {
        const segments = ACTION_SERIES.map((series) => ({
          ...series,
          value: day[series.key as ActionSeriesKey],
        })).filter((segment) => segment.value > 0);
        if (segments.length === 0) return null;

        let cumulative = 0;
        const topIndex = segments.length - 1;
        return segments.map((segment, segmentIndex) => {
          const yBottomValue = cumulative;
          cumulative += segment.value;
          // 2px surface gap between touching segments, carved off the shared edge.
          const rawBottom = segmentIndex === 0 ? baseline : scaleY(yBottomValue) - 1;
          const rawTop = scaleY(cumulative) + (segmentIndex === topIndex ? 0 : 1);
          const h = rawBottom - rawTop;
          if (h < 0.75) return null;
          return segmentIndex === topIndex ? (
            <path key={segment.key} d={roundedBarPath(x, rawTop, barWidth, h)} fill={segment.color} />
          ) : (
            <rect key={segment.key} x={x} y={rawTop} width={barWidth} height={h} fill={segment.color} />
          );
        });
      }}
      tooltipFor={(day) => (
        <div>
          <TooltipDate dateIso={day.dateIso} />
          {ACTION_SERIES.map((series) => (
            <TooltipRow
              key={series.key}
              color={series.color}
              label={series.label.toLowerCase()}
              value={day[series.key as ActionSeriesKey]}
            />
          ))}
          <TooltipRow label="total" value={actionTotal(day)} />
        </div>
      )}
    />
  );
}

// ─── Daily booking flow (portal entries + confirmed-booking dots) ────────────

const CONFIRMED_DOT_Y = 8; // px below the plot top, mirroring the sparkline's dot band

// Self-serve exits stack inside the portal-entries bar. Magenta is reused from
// the palette above: within this chart it only ever sits against amber and
// green, and that trio validates (`--pairs all`, dark surface) — the one FAIL
// there is the pre-existing green↔amber pair, which this reuse doesn't affect.
const SERIES_SELF_SERVE = SERIES_MAGENTA;

export function DailyBookingChart({ buckets }: { buckets: DealDailyActivityBucket[] }) {
  const maxEntries = Math.max(...buckets.map((d) => d.bookingPortalEntries), 0);
  const peak = useMemo(() => {
    if (maxEntries === 0) return null;
    return {
      index: buckets.findIndex((d) => d.bookingPortalEntries === maxEntries),
      value: maxEntries,
    };
  }, [buckets, maxEntries]);

  const legend = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <span className="h-2 w-2 rounded-sm" style={{ background: SERIES_AMBER }} />
        Portal entries
      </span>
      <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <span className="h-2 w-2 rounded-sm" style={{ background: SERIES_SELF_SERVE }} />
        Self-serve exits
      </span>
      <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <span className="h-2 w-2 rounded-full" style={{ background: SERIES_GREEN }} />
        Booking confirmed
      </span>
    </div>
  );

  return (
    <DayChartFrame
      title="Daily booking flow"
      buckets={buckets}
      maxValue={maxEntries}
      legend={legend}
      peak={peak}
      renderDay={({ day, x, barWidth, scaleY, baseline }) => {
        const nodes: ReactNode[] = [];
        if (day.bookingPortalEntries > 0) {
          const yTop = scaleY(day.bookingPortalEntries);
          nodes.push(
            <path
              key="entries"
              d={roundedBarPath(x, yTop, barWidth, baseline - yTop)}
              fill={SERIES_AMBER}
            />
          );
          // Self-serve exits sit at the base of the same bar. Clamped to the
          // bar's own height because the two beacons are guarded independently
          // (a returning session can log an exit without a fresh entry), so the
          // subset can briefly exceed its parent on a given day.
          const selfServe = Math.min(day.bookingSelfServeExits, day.bookingPortalEntries);
          if (selfServe > 0) {
            // 1px carved off the shared edge, matching the daily-actions chart's
            // 2px surface gap between touching segments.
            const ySelfTop = scaleY(selfServe) + (selfServe < day.bookingPortalEntries ? 1 : 0);
            const height = baseline - ySelfTop;
            if (height >= 0.75) {
              // When every entry self-served, this segment IS the bar top, so it
              // wears the rounded data-end instead of a flat edge.
              const isWholeBar = selfServe === day.bookingPortalEntries;
              nodes.push(
                isWholeBar ? (
                  <path
                    key="self-serve"
                    d={roundedBarPath(x, ySelfTop, barWidth, height)}
                    fill={SERIES_SELF_SERVE}
                  />
                ) : (
                  <rect
                    key="self-serve"
                    x={x}
                    y={ySelfTop}
                    width={barWidth}
                    height={height}
                    fill={SERIES_SELF_SERVE}
                  />
                )
              );
            }
          }
        }
        if (day.bookingsConfirmed > 0) {
          // Confirmed bookings ride a fixed band above the bars (the card
          // sparkline's bars+dot idiom); the tooltip carries the exact count.
          nodes.push(
            <circle
              key="confirmed"
              cx={x + barWidth / 2}
              cy={baseline - PLOT_HEIGHT + CONFIRMED_DOT_Y}
              r={3}
              fill={SERIES_GREEN}
              stroke="#0b0f1f"
              strokeWidth={1}
            />
          );
        }
        return nodes.length > 0 ? nodes : null;
      }}
      tooltipFor={(day) => (
        <div>
          <TooltipDate dateIso={day.dateIso} />
          <TooltipRow
            color={SERIES_AMBER}
            label="portal entries"
            value={day.bookingPortalEntries}
          />
          <TooltipRow
            color={SERIES_SELF_SERVE}
            label="self-serve exits"
            value={day.bookingSelfServeExits}
          />
          <TooltipRow color={SERIES_GREEN} label="confirmed" value={day.bookingsConfirmed} />
        </div>
      )}
    />
  );
}

// ─── Booking funnel strip (stage totals, all-time) ───────────────────────────

/**
 * Horizontal stage funnel for the booking portal: rounded bars proportional to
 * the top stage, direct count labels, and the stage→stage conversion rate in
 * muted ink. Single hue — one entity across ordered stages. Counts are
 * distinct guests/drafts, all-time (the funnel is depth, not a time series).
 */
export function BookingFunnelStrip({ stages }: { stages: DealBookingFunnelStage[] }) {
  const max = Math.max(...stages.map((stage) => stage.count), 1);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Booking funnel
        </p>
        <p className="text-[10px] text-slate-600">all time · unique guests</p>
      </div>
      <div className="mt-2 space-y-1.5">
        {stages.map((stage, index) => {
          const prior = index > 0 ? stages[index - 1].count : 0;
          const rate =
            index > 0 && prior > 0 ? Math.round((stage.count / prior) * 100) : null;
          const isConfirmed = stage.key === "confirmed";
          return (
            <div key={stage.key} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-[11px] text-slate-400">
                {stage.label}
              </span>
              <div className="relative h-4 min-w-0 flex-1">
                {stage.count > 0 && (
                  <div
                    className="h-full rounded-r"
                    style={{
                      width: `${Math.max((stage.count / max) * 100, 3)}%`,
                      background: isConfirmed ? SERIES_GREEN : SERIES_AMBER,
                      opacity: isConfirmed ? 1 : 0.55 + 0.45 * (stage.count / max),
                    }}
                  />
                )}
              </div>
              <span
                className="w-7 shrink-0 text-right text-[11px] font-bold text-slate-200"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {stage.count}
              </span>
              <span className="w-10 shrink-0 text-right text-[10px] text-slate-500">
                {rate !== null ? `${rate}%` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Table view (the WCAG-clean twin of both charts) ─────────────────────────

export function DailyActivityTable({ buckets }: { buckets: DealDailyActivityBucket[] }) {
  const rows = [...buckets].reverse();
  return (
    <div className="max-h-72 overflow-y-auto rounded-xl border border-white/[0.08]">
      <table
        className="w-full text-left text-[11px] text-slate-300"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        <thead className="sticky top-0 bg-slate-900 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-3 py-2">Day</th>
            <th className="px-3 py-2 text-right">Views</th>
            <th className="px-3 py-2 text-right">Unique</th>
            <th className="px-3 py-2 text-right">Engaged</th>
            <th className="px-3 py-2 text-right">Book clicks</th>
            <th className="px-3 py-2 text-right">Link reqs</th>
            <th className="px-3 py-2 text-right">Emails</th>
            <th className="px-3 py-2 text-right">Callbacks</th>
            <th className="px-3 py-2 text-right">Portal</th>
            <th className="px-3 py-2 text-right">Self-serve</th>
            <th className="px-3 py-2 text-right">Booked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((day) => (
            <tr key={day.dateIso} className="border-t border-white/[0.06]">
              <td className="px-3 py-1.5 text-slate-400">{formatDay(day.dateIso)}</td>
              <td className="px-3 py-1.5 text-right">{day.views.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{day.uniqueSessions.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{day.engagedViews.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{day.bookNowClicks.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{day.linkRequests.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{day.linkEmailsSent.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{day.callbackRequests.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{day.bookingPortalEntries.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{day.bookingSelfServeExits.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{day.bookingsConfirmed.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
