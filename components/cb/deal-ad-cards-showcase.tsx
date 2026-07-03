"use client";

/**
 * Public showcase for a deal's Meta ad-carousel cards (Step 8), rendered below
 * the (unchanged) ship hero on the premium Deal Page. Three layout treatments —
 * quilt / tab-spotlight / editorial-mosaic — picked deterministically per deal
 * (`pickAdCardsLayout` in public-deal-projection.ts) so campaign pages carry
 * brand nuance across the many decks running at once, without the layout
 * flickering between visits to the same deal.
 *
 * All four (or however many are "ready") cards are always shown intact — never
 * cropped to a single featured image — because this section's whole job is to
 * prove "the exact ad you clicked is one of several real, deliberate angles for
 * this sailing," not to pick a winner among them.
 */

import { useState } from "react";
import Image from "next/image";

import type { DealAdCardsShowcaseView, DealAdCardView } from "@/lib/cb/deals-system/public-deal-projection";

const C = {
  bg: "#FAF7F2",
  navy: "#0F3042",
  navyDark: "#0B2433",
  surface: "#FFFFFF",
  border: "#E8E1D5",
  gold: "#8C6A3C",
  goldRule: "#C9B286",
  muted: "#5B6873",
  cream: "#F5EFE6",
} as const;

const serif = "'Cormorant Garamond',Georgia,serif";

/** Shorten a card headline to a tab label (~14 chars) without cutting mid-word. */
function tabLabel(headline: string): string {
  if (headline.length <= 16) return headline;
  const truncated = headline.slice(0, 16);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 6 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "clamp(56px, 7vw, 96px) 24px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1160, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function SectionKicker({ eyebrow, heading }: { eyebrow: string; heading: string }) {
  return (
    <div style={{ maxWidth: 640, marginBottom: "clamp(28px, 3.5vw, 40px)" }}>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: C.gold,
        }}
      >
        {eyebrow}
      </p>
      <h2
        style={{
          margin: 0,
          fontFamily: serif,
          fontWeight: 600,
          fontSize: "clamp(26px, 3vw, 36px)",
          lineHeight: 1.15,
          color: C.navy,
        }}
      >
        {heading}
      </h2>
    </div>
  );
}

// ── Quilt: even grid, all cards equal weight, reflows 2x2 -> 4-across ────────
function QuiltLayout({ eyebrow, heading, cards }: { eyebrow: string; heading: string; cards: DealAdCardView[] }) {
  return (
    <SectionShell>
      <SectionKicker eyebrow={eyebrow} heading={heading} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
          gap: "clamp(10px, 1.6vw, 18px)",
        }}
      >
        {cards.map((card, i) => (
          <figure
            key={`${card.imageUrl}-${i}`}
            style={{ margin: 0, position: "relative", aspectRatio: "1 / 1", borderRadius: 4, overflow: "hidden" }}
          >
            <Image
              src={card.imageUrl}
              alt={card.headline}
              fill
              loading="lazy"
              sizes="(max-width: 700px) 50vw, 280px"
              style={{ objectFit: "cover" }}
            />
            <figcaption
              style={{
                position: "absolute",
                inset: "auto 0 0 0",
                padding: "10px 12px",
                fontSize: 12.5,
                fontWeight: 700,
                lineHeight: 1.35,
                color: C.cream,
                background: "linear-gradient(to top, rgba(8,23,33,0.86), transparent 75%)",
              }}
            >
              {card.headline}
            </figcaption>
          </figure>
        ))}
      </div>
    </SectionShell>
  );
}

// ── Editorial mosaic: one lead card large, the rest stacked smaller beside it ─
/**
 * The lead card is the deal's first ready card (cardIndex order — the
 * operator's/generator's own ordering, not a random pick), enlarged to ~60%
 * width with the remaining cards stacked at full visibility beside it. Mirrors
 * the premium page's existing five-segment "one image, one block" rhythm, so
 * this reads as native to the page rather than imported ad-tooling chrome.
 *
 * The lead card's bodyText (when it passed the broad-appeal check) renders as
 * a real paragraph below the image, not squeezed into the gradient caption —
 * desktop has the width to spare, and a proper paragraph reads calmer than
 * text crammed over a photo.
 */
function EditorialMosaicLayout({
  eyebrow,
  heading,
  cards,
}: {
  eyebrow: string;
  heading: string;
  cards: DealAdCardView[];
}) {
  const [lead, ...rest] = cards;
  if (!lead) return null;

  return (
    <SectionShell>
      <SectionKicker eyebrow={eyebrow} heading={heading} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          gap: "clamp(12px, 2vw, 20px)",
          alignItems: "start",
        }}
      >
        <div>
          <figure
            style={{ margin: 0, position: "relative", aspectRatio: "1 / 1", borderRadius: 4, overflow: "hidden" }}
          >
            <Image
              src={lead.imageUrl}
              alt={lead.headline}
              fill
              priority={false}
              sizes="(max-width: 860px) 100vw, 55vw"
              style={{ objectFit: "cover" }}
            />
            <figcaption
              style={{
                position: "absolute",
                inset: "auto 0 0 0",
                padding: "16px 20px",
                fontFamily: serif,
                fontSize: 20,
                fontWeight: 600,
                lineHeight: 1.25,
                color: C.cream,
                background: "linear-gradient(to top, rgba(8,23,33,0.86), transparent 75%)",
              }}
            >
              {lead.headline}
            </figcaption>
          </figure>
          {lead.bodyText && (
            <p
              style={{
                margin: "14px 4px 0",
                fontSize: 16,
                lineHeight: 1.65,
                color: C.navy,
                maxWidth: "56ch",
              }}
            >
              {lead.bodyText}
            </p>
          )}
        </div>
        {rest.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
              gap: "clamp(8px, 1.4vw, 14px)",
              alignContent: "start",
            }}
          >
            {rest.map((card, i) => (
              <figure
                key={`${card.imageUrl}-${i}`}
                style={{ margin: 0, position: "relative", aspectRatio: "1 / 1", borderRadius: 4, overflow: "hidden" }}
              >
                <Image
                  src={card.imageUrl}
                  alt={card.headline}
                  fill
                  loading="lazy"
                  sizes="(max-width: 700px) 33vw, 180px"
                  style={{ objectFit: "cover" }}
                />
                <figcaption
                  style={{
                    position: "absolute",
                    inset: "auto 0 0 0",
                    padding: "8px 10px",
                    fontSize: 11.5,
                    fontWeight: 700,
                    lineHeight: 1.3,
                    color: C.cream,
                    background: "linear-gradient(to top, rgba(8,23,33,0.86), transparent 75%)",
                  }}
                >
                  {card.headline}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </SectionShell>
  );
}

// ── Tab spotlight: one large image at a time, four short labeled tabs ────────
function TabSpotlightLayout({
  eyebrow,
  heading,
  cards,
}: {
  eyebrow: string;
  heading: string;
  cards: DealAdCardView[];
}) {
  const [active, setActive] = useState(0);
  const card = cards[active] ?? cards[0];

  return (
    <SectionShell>
      <SectionKicker eyebrow={eyebrow} heading={heading} />
      <div
        role="tablist"
        aria-label="This sailing's ad angles"
        style={{
          display: "flex",
          borderBottom: `1px solid ${C.border}`,
          marginBottom: 20,
          overflowX: "auto",
        }}
      >
        {cards.map((c, i) => (
          <button
            key={`${c.imageUrl}-${i}`}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            style={{
              flex: "1 0 auto",
              minWidth: 110,
              textAlign: "center",
              padding: "12px 10px",
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: i === active ? C.navy : C.muted,
              background: "none",
              border: "none",
              borderBottom: i === active ? `2px solid ${C.gold}` : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {tabLabel(c.headline)}
          </button>
        ))}
      </div>
      <figure
        style={{
          margin: 0,
          position: "relative",
          width: "100%",
          maxWidth: 640,
          aspectRatio: "1 / 1",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <Image
          key={card.imageUrl}
          src={card.imageUrl}
          alt={card.headline}
          fill
          sizes="(max-width: 700px) 100vw, 640px"
          style={{ objectFit: "cover" }}
        />
        <figcaption
          style={{
            position: "absolute",
            inset: "auto 0 0 0",
            padding: "16px 20px",
            fontFamily: serif,
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 1.25,
            color: C.cream,
            background: "linear-gradient(to top, rgba(8,23,33,0.86), transparent 75%)",
          }}
        >
          {card.headline}
        </figcaption>
      </figure>
      {card.bodyText && (
        <p
          key={`${card.imageUrl}-body`}
          style={{
            margin: "16px 4px 0",
            maxWidth: 640,
            fontSize: 16,
            lineHeight: 1.65,
            color: C.navy,
          }}
        >
          {card.bodyText}
        </p>
      )}
    </SectionShell>
  );
}

/**
 * Entry point — all three layouts render as a full-width section immediately
 * below the (unchanged) hero.
 */
export function DealAdCardsShowcase({ view }: { view: DealAdCardsShowcaseView }) {
  const { layout, eyebrow, heading, cards } = view;
  if (layout === "tab-spotlight") return <TabSpotlightLayout eyebrow={eyebrow} heading={heading} cards={cards} />;
  if (layout === "editorial-mosaic")
    return <EditorialMosaicLayout eyebrow={eyebrow} heading={heading} cards={cards} />;
  return <QuiltLayout eyebrow={eyebrow} heading={heading} cards={cards} />;
}
