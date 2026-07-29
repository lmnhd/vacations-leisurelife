"use client";

/**
 * Public showcase for a deal's Meta ad-carousel cards (Step 8), rendered below
 * the (unchanged) ship hero on the premium Deal Page. Two layout treatments —
 * quilt / tab-spotlight — picked deterministically per deal
 * (`pickAdCardsLayout` in public-deal-projection.ts) so campaign pages carry
 * brand nuance across the many decks running at once, without the layout
 * flickering between visits to the same deal.
 *
 * All four (or however many are "ready") cards are always shown intact — never
 * cropped to a single featured image — because this section's whole job is to
 * prove "the exact ad you clicked is one of several real, deliberate angles for
 * this sailing," not to pick a winner among them.
 *
 * Both layouts render every card at one readable size: all cards equal (quilt)
 * or one at a time at full size (tab-spotlight). A mixed big-lead-plus-
 * thumbnails treatment ("editorial-mosaic") was removed 2026-07-28 — the small
 * cards' headlines were unreadable, so the section stopped conveying several
 * legible angles. Don't add a layout that renders cards at unequal sizes.
 */

import { useState } from "react";
import Image from "next/image";

import type { DealAdCardsShowcaseView, DealAdCardView } from "@/lib/cb/deals-system/public-deal-projection";

const shellClass = "box-border border-y border-[#E8E1D5] bg-white px-6 py-[clamp(56px,7vw,96px)]";
const innerClass = "mx-auto max-w-[1160px]";
const kickerWrapClass = "mb-[clamp(28px,3.5vw,40px)] max-w-[640px]";
const eyebrowClass = "mb-3.5 text-[13px] font-semibold uppercase tracking-[0.18em] text-[#8C6A3C]";
const headingClass = "m-0 font-serif text-[clamp(26px,3vw,36px)] font-semibold leading-[1.15] text-[#0F3042]";
const cardFigureClass = "relative aspect-square overflow-hidden rounded-[4px]";
const captionClass =
  "absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgba(8,23,33,0.86),transparent_75%)] text-[#F5EFE6]";

/** Shorten a card headline to a tab label (~14 chars) without cutting mid-word. */
function tabLabel(headline: string): string {
  if (headline.length <= 16) return headline;
  const truncated = headline.slice(0, 16);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${(lastSpace > 6 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <section className={shellClass}>
      <div className={innerClass}>{children}</div>
    </section>
  );
}

function SectionKicker({ eyebrow, heading }: { eyebrow: string; heading: string }) {
  return (
    <div className={kickerWrapClass}>
      <p className={eyebrowClass}>
        {eyebrow}
      </p>
      <h2 className={headingClass}>
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
      <div className="grid gap-[clamp(10px,1.6vw,18px)] [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
        {cards.map((card, i) => (
          <figure key={`${card.imageUrl}-${i}`} className={cardFigureClass}>
            <Image
              src={card.imageUrl}
              alt={card.headline}
              fill
              loading="lazy"
              sizes="(max-width: 700px) 50vw, 280px"
              className="object-cover"
            />
            <figcaption className={`${captionClass} px-3 py-[10px] text-[12.5px] font-bold leading-[1.35]`}>
              {card.headline}
            </figcaption>
          </figure>
        ))}
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
      <div role="tablist" aria-label="This sailing's ad angles" className="mb-5 flex overflow-x-auto border-b border-[#E8E1D5]">
        {cards.map((c, i) => (
          i === active ? (
            <button
              key={`${c.imageUrl}-${i}`}
              type="button"
              role="tab"
              aria-selected="true"
              onClick={() => setActive(i)}
              className="flex-[1_0_auto] min-w-[110px] cursor-pointer border-0 border-b-2 border-[#8C6A3C] bg-transparent px-2.5 py-3 text-center text-[12.5px] font-bold uppercase tracking-[0.04em] text-[#0F3042]"
            >
              {tabLabel(c.headline)}
            </button>
          ) : (
            <button
              key={`${c.imageUrl}-${i}`}
              type="button"
              role="tab"
              aria-selected="false"
              onClick={() => setActive(i)}
              className="flex-[1_0_auto] min-w-[110px] cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-2.5 py-3 text-center text-[12.5px] font-bold uppercase tracking-[0.04em] text-[#5B6873]"
            >
              {tabLabel(c.headline)}
            </button>
          )
        ))}
      </div>
      <figure className="relative m-0 aspect-square w-full max-w-[640px] overflow-hidden rounded-[4px]">
        <Image
          key={card.imageUrl}
          src={card.imageUrl}
          alt={card.headline}
          fill
          sizes="(max-width: 700px) 100vw, 640px"
          className="object-cover"
        />
        <figcaption className={`${captionClass} px-5 py-4 font-serif text-[20px] font-semibold leading-[1.25]`}>
          {card.headline}
        </figcaption>
      </figure>
      {card.bodyText && (
        <p key={`${card.imageUrl}-body`} className="mt-4 max-w-[640px] px-1 text-[16px] leading-[1.65] text-[#0F3042]">
          {card.bodyText}
        </p>
      )}
    </SectionShell>
  );
}

/**
 * Entry point — both layouts render as a full-width section immediately below
 * the (unchanged) hero.
 */
export function DealAdCardsShowcase({ view }: { view: DealAdCardsShowcaseView }) {
  const { layout, eyebrow, heading, cards } = view;
  if (layout === "tab-spotlight") return <TabSpotlightLayout eyebrow={eyebrow} heading={heading} cards={cards} />;
  return <QuiltLayout eyebrow={eyebrow} heading={heading} cards={cards} />;
}
