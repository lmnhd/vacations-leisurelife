/**
 * Premium Deal Page — the master template a prospect lands on after clicking a
 * paid ad. Pixel-faithful translation of the Claude Design "Deal Page" handoff
 * (project LLI-Deal-Page). Renders purely from `DealLandingPageView`, with the
 * resolved/draft fork the design specifies — never fabricating a missing fact.
 *
 * Editorial, calm, premium: Cormorant Garamond display + Source Sans 3 body,
 * cream/navy/gold palette and large imagery. Mobile-first; AA contrast; lazy
 * below-fold imagery with explicit aspect ratios.
 */

import type { DealLandingPageView } from "@/lib/cb/deals-system/public-deal-projection";

import { DealAdCardsShowcase } from "./deal-ad-cards-showcase";
import { DealCtaActions } from "./deal-cta-actions";
import { DealImageWithFallback } from "./deal-image-with-fallback";
import { DealLandingPageEnhancements } from "./deal-landing-page-enhancements";

// ── Design tokens (verbatim from the prototype) ──────────────────────────────
const C = {
  bg: "#FAF7F2",
  text: "#1A2530",
  navy: "#0F3042",
  navyDark: "#0B2433",
  navyActive: "#0B2533",
  navyHover: "#16435C",
  surface: "#FFFFFF",
  border: "#E8E1D5",
  gold: "#8C6A3C",
  goldRule: "#C9B286",
  goldLight: "#D9BC8C",
  muted: "#5B6873",
  mutedLight: "#9AA4AC",
  cream: "#F5EFE6",
  priceRow: "#F4ECDD",
  chipText: "#6B5128",
} as const;

const serif = "'Cormorant Garamond',Georgia,serif";

function Eyebrow({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <p
      style={{
        margin: "0 0 14px",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: C.gold,
        textAlign: center ? "center" : "left",
      }}
    >
      {children}
    </p>
  );
}

function SectionHeading({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <h2
      style={{
        margin: center ? "0 0 40px" : "0 0 16px",
        fontFamily: serif,
        fontWeight: 600,
        fontSize: "clamp(28px, 3.4vw, 42px)",
        lineHeight: 1.12,
        color: C.navy,
        textAlign: center ? "center" : "left",
      }}
    >
      {children}
    </h2>
  );
}

// ── Itinerary calendar ──────────────────────────────────────────────────────
function BookNowQuickLink({ center }: { center?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: center ? "center" : "flex-start",
        margin: center ? "28px 0 20px" : "8px 0 18px",
      }}
    >
      <a
        href="#book-now"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          color: C.gold,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textDecoration: "none",
          textTransform: "uppercase",
          borderBottom: `1px solid ${C.goldRule}`,
          paddingBottom: 3,
        }}
      >
        Book now <span aria-hidden="true">&darr;</span>
      </a>
    </div>
  );
}

type ItineraryDayRow = {
  label: string;
  text: string;
  atSea?: boolean;
  timing?: string;
  dateIso?: string;
  day?: number;
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** UTC-stable parse of a "YYYY-MM-DD" date (noon UTC to dodge TZ drift). */
function parseDateIso(iso: string): Date | null {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Renders the voyage as month calendar grids (weeks as rows, Sun–Sat columns),
 * one cell per real date, port days filled with the port name + arrival/departure
 * times and sea days shown lightly. Returns null when no row carries a date, so
 * the caller falls back to the plain day list (legacy deals, coarse ports).
 */
function ItineraryCalendar({ rows }: { rows: ItineraryDayRow[] }) {
  const dated = rows
    .map((r) => ({ row: r, date: r.dateIso ? parseDateIso(r.dateIso) : null }))
    .filter((x): x is { row: ItineraryDayRow; date: Date } => x.date !== null);
  if (dated.length === 0) return null;

  // Bucket days by calendar month (UTC), keyed by year-month for stable order.
  const months = new Map<string, { year: number; month: number; days: Map<number, ItineraryDayRow> }>();
  for (const { row, date } of dated) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const key = `${year}-${month}`;
    const bucket = months.get(key) ?? { year, month, days: new Map<number, ItineraryDayRow>() };
    bucket.days.set(date.getUTCDate(), row);
    months.set(key, bucket);
  }
  const ordered = [...months.values()].sort((a, b) => a.year - b.year || a.month - b.month);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "clamp(28px, 4vw, 44px)" }}>
      {ordered.map(({ year, month, days }) => {
        const first = new Date(Date.UTC(year, month, 1));
        const startWeekday = first.getUTCDay(); // 0 = Sunday
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
        // Leading blanks + day cells, padded to whole weeks.
        const cells: Array<number | null> = [
          ...Array.from({ length: startWeekday }, () => null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ];
        while (cells.length % 7 !== 0) cells.push(null);

        return (
          <div key={`${year}-${month}`}>
            <p
              style={{
                margin: "0 0 12px",
                fontFamily: serif,
                fontSize: 22,
                fontWeight: 600,
                color: C.navy,
                letterSpacing: "0.01em",
              }}
            >
              {monthLabel}
            </p>
            <div style={{ overflowX: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                  gap: 1,
                  background: C.border,
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  overflow: "hidden",
                  minWidth: 480,
                }}
              >
                {WEEKDAY_LABELS.map((wd) => (
                  <div
                    key={wd}
                    style={{
                      background: C.cream,
                      padding: "8px 4px",
                      textAlign: "center",
                      fontSize: "clamp(9px, 2.4vw, 11px)",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: C.gold,
                    }}
                  >
                    {wd}
                  </div>
                ))}
                {cells.map((dayNum, i) => {
                  const row = dayNum ? days.get(dayNum) : undefined;
                  const isPort = Boolean(row && !row.atSea);
                  return (
                    <div
                      key={i}
                      style={{
                        background: dayNum ? (isPort ? C.surface : C.bg) : C.cream,
                        minHeight: "clamp(64px, 18vw, 92px)",
                        padding: "clamp(5px, 1.6vw, 8px) clamp(4px, 1.6vw, 9px)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                        minWidth: 0,
                      }}
                    >
                      {dayNum && (
                        <>
                          <span style={{ fontSize: "clamp(11px, 2.8vw, 13px)", fontWeight: 700, color: row ? C.navy : C.mutedLight }}>
                            {dayNum}
                          </span>
                          {row && isPort ? (
                            <>
                              <span
                                style={{
                                  fontSize: "clamp(10px, 2.6vw, 12.5px)",
                                  fontWeight: 600,
                                  lineHeight: 1.25,
                                  color: C.navy,
                                  overflowWrap: "break-word",
                                }}
                              >
                                {row.text}
                              </span>
                              {row.timing && (
                                <span
                                  style={{
                                    fontSize: "clamp(8.5px, 2vw, 10.5px)",
                                    lineHeight: 1.3,
                                    color: C.muted,
                                    overflowWrap: "break-word",
                                  }}
                                >
                                  {row.timing}
                                </span>
                              )}
                            </>
                          ) : row ? (
                            <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: "clamp(11px, 2.8vw, 13px)", color: C.mutedLight }}>
                              At Sea
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DealLandingPage({ dealId, page }: { dealId: string; page: DealLandingPageView }) {
  const { hero, chips, factBand, segments, itinerary, pricing, specials } = page;
  const cta = page.ctaLabel || "Book Now";
  const promoCheck =
    specials.length > 0
      ? {
          label: "Check bonus offer",
          panelTitle: "Check today's eligible offer",
          defaultNote:
            "Please check today's eligible bonus offer for this sailing before quoting final availability.",
          promoNotes: specials.map((special) => special.title),
        }
      : undefined;
  // Render the day-by-day schedule as a month calendar when the rows carry real
  // dates; otherwise fall back to the vertical list (legacy deals, coarse ports).
  const hasCalendarDates =
    itinerary.kind === "days" && itinerary.rows.some((r) => Boolean(r.dateIso));
  const itineraryCalendar = hasCalendarDates ? (
    <ItineraryCalendar rows={(itinerary as { rows: ItineraryDayRow[] }).rows} />
  ) : null;

  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        fontFamily: "'Source Sans 3','Helvetica Neue',Arial,sans-serif",
        fontSize: 17,
        lineHeight: 1.6,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <DealLandingPageEnhancements dealId={dealId} />

      {/* ============ HERO ============ */}
      <section
        style={{
          position: "relative",
          minHeight: "88vh",
          display: "flex",
          alignItems: "flex-end",
          overflow: "hidden",
          background: C.navy,
        }}
      >
        {hero.imageUrl ? (
          <DealImageWithFallback
            primary={{ imageUrl: hero.imageUrl, imageAlt: hero.imageAlt }}
            fallbacks={hero.imageFallbacks}
            alt={hero.imageAlt ?? "The ship at sea"}
            fill
            priority
            sizes="100vw"
            style={{ objectFit: "cover", objectPosition: "center" }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, rgba(8,23,33,0.92) 0%, rgba(8,23,33,0.45) 48%, rgba(8,23,33,0.12) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(7,22,32,0.72) 0%, rgba(7,22,32,0.58) 28%, rgba(7,22,32,0.24) 54%, rgba(7,22,32,0) 78%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 1160,
            margin: "0 auto",
            padding: "120px 24px 72px",
            color: C.bg,
            boxSizing: "border-box",
          }}
        >
          <p
            style={{
              margin: "0 0 18px",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: C.goldLight,
              textShadow: "0 2px 12px rgba(0,0,0,0.72)",
            }}
          >
            {page.eyebrow}
          </p>
          <h1
            style={{
              margin: 0,
              fontFamily: serif,
              fontWeight: 600,
              fontSize: "clamp(36px, 5.5vw, 64px)",
              lineHeight: 1.08,
              letterSpacing: "-0.01em",
              maxWidth: "19ch",
              textWrap: "balance",
              textShadow: "0 3px 20px rgba(0,0,0,0.78), 0 1px 2px rgba(0,0,0,0.9)",
            }}
          >
            {hero.headline}
          </h1>
          <p
            style={{
              margin: "20px 0 0",
              fontSize: "clamp(17px, 1.6vw, 20px)",
              lineHeight: 1.55,
              maxWidth: "54ch",
              color: "rgba(250,247,242,0.88)",
              textShadow: "0 2px 12px rgba(0,0,0,0.82)",
            }}
          >
            {hero.subhead}
          </p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14, marginTop: 32 }}>
            <DealCtaActions
              dealId={dealId}
              bookingUrl={page.bookingUrl}
              primaryLabel={cta}
              tone="hero"
              promoCheck={promoCheck}
            />
            <span
              style={{
                fontSize: 15,
                color: "rgba(250,247,242,0.9)",
                textShadow: "0 2px 10px rgba(0,0,0,0.82)",
              }}
            >
              {page.fromPriceLabel ? (
                <>
                  Fares from{" "}
                  <strong style={{ fontWeight: 600, color: C.bg }}>{page.fromPriceLabel}</strong> per person
                </>
              ) : (
                "Fares & dates confirmed at booking"
              )}
            </span>
          </div>
          {chips.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 36 }}>
              {chips.map((chip) => (
                <span
                  key={chip}
                  style={{
                    padding: "8px 16px",
                    border: "1px solid rgba(250,247,242,0.32)",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "rgba(250,247,242,0.92)",
                    background: "rgba(8,23,33,0.18)",
                    boxShadow: "0 4px 18px rgba(0,0,0,0.12)",
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {page.adCards ? <DealAdCardsShowcase view={page.adCards} /> : null}

      {/* ============ TRUST / FACT BAND ============ */}
      {factBand.length > 0 && (
        <section style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <div
            style={{
              maxWidth: 1160,
              margin: "0 auto",
              padding: "30px 24px",
              boxSizing: "border-box",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "22px 32px",
            }}
          >
            {factBand.map((fact) => (
              <div key={fact.label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: C.muted,
                  }}
                >
                  {fact.label}
                </span>
                <span style={{ fontSize: 16, fontWeight: 600, color: fact.muted ? C.muted : C.navy }}>
                  {fact.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============ FIVE SEGMENTS ============ */}
      {segments.length > 0 && (
        <section style={{ padding: "clamp(72px, 9vw, 120px) 24px", boxSizing: "border-box" }}>
          <div
            style={{
              maxWidth: 1160,
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              gap: "clamp(72px, 10vw, 128px)",
            }}
          >
            {segments.map((seg, i) => {
              const imageRight = i % 2 === 1; // 01 left, 02 right, …
              return (
                <div
                  key={seg.index}
                  data-reveal="1"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))",
                    gap: "clamp(32px, 5vw, 72px)",
                    alignItems: "center",
                    direction: imageRight ? "rtl" : "ltr",
                  }}
                >
                  <figure style={{ margin: 0, direction: "ltr", position: "relative" }}>
                    {seg.imageUrl ? (
                      <DealImageWithFallback
                        primary={{ imageUrl: seg.imageUrl, imageAlt: seg.imageAlt }}
                        fallbacks={seg.imageFallbacks}
                        alt={seg.imageAlt ?? seg.heading}
                        width={760}
                        height={570}
                        loading="lazy"
                        sizes="(max-width: 820px) 100vw, 560px"
                        style={{ display: "block", width: "100%", height: "auto", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 4 }}
                      />
                    ) : (
                      <div style={{ width: "100%", aspectRatio: "4 / 3", background: C.border, borderRadius: 4 }} />
                    )}
                    {i === 0 && page.vesselLabel ? (
                      <figcaption
                        style={{
                          position: "absolute",
                          left: 18,
                          bottom: 18,
                          maxWidth: "calc(100% - 36px)",
                          padding: "8px 12px",
                          borderRadius: 4,
                          background: "rgba(11,36,51,0.84)",
                          color: C.cream,
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          lineHeight: 1.35,
                          textTransform: "uppercase",
                          boxShadow: "0 8px 28px rgba(0,0,0,0.26)",
                        }}
                      >
                        {page.vesselLabel}
                      </figcaption>
                    ) : null}
                  </figure>
                  <div style={{ direction: "ltr" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.16em", color: C.gold }}>
                        {seg.index}
                      </span>
                      <span style={{ display: "block", width: 44, height: 1, background: C.goldRule }} />
                    </div>
                    <h2
                      style={{
                        margin: "0 0 16px",
                        fontFamily: serif,
                        fontWeight: 600,
                        fontSize: "clamp(28px, 3.4vw, 42px)",
                        lineHeight: 1.12,
                        color: C.navy,
                      }}
                    >
                      {seg.heading}
                    </h2>
                    <p
                      style={{
                        margin: 0,
                        maxWidth: "54ch",
                        fontSize: "clamp(17px, 1.4vw, 18px)",
                        lineHeight: 1.7,
                        color: C.text,
                      }}
                    >
                      {seg.body}
                    </p>
                  </div>
                </div>
              );
            })}
            <BookNowQuickLink center />
          </div>
        </section>
      )}

      {/* ============ ITINERARY ============ */}
      {(itinerary.kind === "days" ? itinerary.rows.length : itinerary.ports.length) > 0 && (
        <section
          id="itinerary"
          style={{
            background: C.surface,
            borderTop: `1px solid ${C.border}`,
            borderBottom: `1px solid ${C.border}`,
            padding: "clamp(72px, 9vw, 120px) 24px",
            boxSizing: "border-box",
          }}
        >
          {itinerary.kind === "days" && itineraryCalendar ? (
            // Calendar view: heading on top, calendar spans the full width below to
            // consolidate the horizontal space (vs. the long vertical list).
            <div data-reveal="1" style={{ maxWidth: 1160, margin: "0 auto" }}>
              <div style={{ maxWidth: 640, marginBottom: "clamp(32px, 4vw, 48px)" }}>
                <Eyebrow>The Route</Eyebrow>
                <SectionHeading>Every stop, in order</SectionHeading>
                <p style={{ margin: 0, maxWidth: "52ch", fontSize: 17, lineHeight: 1.7, color: C.muted }}>
                  The full voyage, day by day — ports and sea days laid out on the calendar below.
                </p>
              </div>
              {itineraryCalendar}
            </div>
          ) : (
            <div
              data-reveal="1"
              style={{
                maxWidth: 1160,
                margin: "0 auto",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
                gap: "clamp(40px, 6vw, 88px)",
                alignItems: "start",
              }}
            >
              <div>
                <Eyebrow>The Route</Eyebrow>
                <SectionHeading>Every stop, in order</SectionHeading>
                <p style={{ margin: 0, maxWidth: "48ch", fontSize: 17, lineHeight: 1.7, color: C.muted }}>
                  {itinerary.kind === "days"
                    ? "The itinerary below runs in order — ports and sea days as the voyage unfolds."
                    : "The crossing calls at the ports below. The full day-by-day route is confirmed at booking."}
                </p>
              </div>
              <div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {itinerary.kind === "days"
                    ? itinerary.rows.map((row, i) => (
                        <div
                          key={`${row.label}-${i}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "88px 1fr",
                            gap: 16,
                            padding: "15px 0",
                            borderTop: `1px solid ${C.border}`,
                            borderBottom: i === itinerary.rows.length - 1 ? `1px solid ${C.border}` : undefined,
                            alignItems: "baseline",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                              color: row.atSea ? C.mutedLight : C.gold,
                            }}
                          >
                            {row.label}
                          </span>
                          {row.atSea ? (
                            <span style={{ fontFamily: serif, fontStyle: "italic", fontSize: 18, color: C.muted }}>
                              {row.text}
                            </span>
                          ) : (
                            <span>
                              <span style={{ display: "block", fontSize: 17, fontWeight: 600, color: C.navy }}>
                                {row.text}
                              </span>
                              {row.timing && (
                                <span style={{ display: "block", marginTop: 2, fontSize: 13, color: C.muted }}>
                                  {row.timing}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      ))
                    : itinerary.ports.map((port, i) => (
                        <div
                          key={`${port}-${i}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "88px 1fr",
                            gap: 16,
                            padding: "15px 0",
                            borderTop: `1px solid ${C.border}`,
                            borderBottom: i === itinerary.ports.length - 1 ? `1px solid ${C.border}` : undefined,
                            alignItems: "baseline",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                              color: C.gold,
                            }}
                          >
                            Port
                          </span>
                          <span style={{ fontSize: 17, fontWeight: 600, color: C.navy }}>{port}</span>
                        </div>
                      ))}
                </div>
              </div>
            </div>
          )}
          <BookNowQuickLink center />
        </section>
      )}

      {/* ============ SPECIALS / OFFER ============ */}
      {specials.length > 0 && (
        <section
          style={{
            background: C.surface,
            borderTop: `1px solid ${C.border}`,
            padding: "clamp(72px, 9vw, 120px) 24px",
            boxSizing: "border-box",
          }}
        >
          <div data-reveal="1" style={{ maxWidth: 760, margin: "0 auto" }}>
            <Eyebrow center>The Offer</Eyebrow>
            <SectionHeading center>What&rsquo;s included</SectionHeading>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {specials.map((promo, idx) => (
                <div
                  key={idx}
                  style={{ border: `1px solid ${C.border}`, borderRadius: 4, padding: "clamp(28px, 4vw, 44px)", background: C.bg }}
                >
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: C.muted,
                    }}
                  >
                    {promo.kicker}
                  </p>
                  <h3
                    style={{
                      margin: "0 0 14px",
                      fontFamily: serif,
                      fontWeight: 600,
                      fontSize: "clamp(24px, 2.6vw, 30px)",
                      lineHeight: 1.2,
                      color: C.navy,
                    }}
                  >
                    {promo.title}
                  </h3>
                  <p style={{ margin: "0 0 22px", fontSize: 17, lineHeight: 1.7, color: C.text }}>{promo.summary}</p>
                  {promo.chips.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 26 }}>
                      {promo.chips.map((chip) => (
                        <span
                          key={chip}
                          style={{
                            padding: "9px 16px",
                            background: C.priceRow,
                            borderRadius: 999,
                            fontSize: 13,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            color: C.chipText,
                          }}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                  {promo.claims.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 26 }}>
                      {promo.claims.map((claim, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                          <span
                            style={{
                              flex: "none",
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              background: C.gold,
                              transform: "translateY(-3px)",
                            }}
                          />
                          <span style={{ fontSize: 16, lineHeight: 1.6, color: C.text }}>{claim}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(promo.bookByLabel || promo.qualifiedNote) && (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                      {promo.bookByLabel && (
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.navy }}>{promo.bookByLabel}</p>
                      )}
                      {promo.qualifiedNote && (
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.muted }}>
                          {promo.qualifiedNote} &mdash; subject to availability, confirmed at booking.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ PRICING ============ */}
      <section id="pricing" style={{ padding: "clamp(72px, 9vw, 120px) 24px", boxSizing: "border-box" }}>
        <div data-reveal="1" style={{ maxWidth: 760, margin: "0 auto" }}>
          <Eyebrow center>Fares</Eyebrow>
          <SectionHeading center>Choose your cabin</SectionHeading>
          {pricing.kind === "table" ? (
            <>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
                {pricing.rows.map((row, i) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "20px 28px",
                      background: row.lead ? C.priceRow : undefined,
                      borderTop: i === 0 ? undefined : `1px solid ${C.border}`,
                    }}
                  >
                    <span style={{ fontSize: 17, fontWeight: 600, color: C.navy }}>
                      {row.label}
                      {row.lead && (
                        <span
                          style={{
                            marginLeft: 10,
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: C.gold,
                          }}
                        >
                          Lead fare
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontSize: row.lead ? 20 : 18,
                        fontWeight: row.lead ? 600 : 400,
                        color: row.lead ? C.navy : C.text,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.price}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ margin: "16px 0 0", fontSize: 13, color: C.muted, textAlign: "center" }}>{pricing.footnote}</p>
            </>
          ) : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: "44px 32px", textAlign: "center" }}>
              <p style={{ margin: "0 0 10px", fontFamily: serif, fontSize: 26, fontWeight: 600, color: C.navy }}>
                Fares for this sailing are confirmed live
              </p>
              <p style={{ margin: "0 auto", maxWidth: "46ch", fontSize: 16, lineHeight: 1.65, color: C.muted }}>
                Pricing for this voyage hasn&rsquo;t been published yet. Current fares and availability resolve the moment
                you check &mdash; no obligation.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ============ CTA BLOCK ============ */}
      <section
        id="book-now"
        style={{
          background: C.navy,
          color: C.cream,
          padding: "clamp(88px, 11vw, 140px) 24px",
          boxSizing: "border-box",
          scrollMarginTop: 24,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: serif,
              fontWeight: 600,
              fontSize: "clamp(30px, 4vw, 48px)",
              lineHeight: 1.15,
              textWrap: "balance",
            }}
          >
            {hero.subhead}
          </h2>
          <DealCtaActions
            dealId={dealId}
            bookingUrl={page.bookingUrl}
            primaryLabel={cta}
            tone="dark"
            align="center"
            promoCheck={promoCheck}
          />
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer style={{ background: C.navyDark, padding: "28px 24px", boxSizing: "border-box" }}>
        <div
          style={{
            maxWidth: 1160,
            margin: "0 auto",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "rgba(245,239,230,0.55)" }}>
            Fares, availability, and offer terms are confirmed at booking.
          </p>
        </div>
      </footer>
    </div>
  );
}
