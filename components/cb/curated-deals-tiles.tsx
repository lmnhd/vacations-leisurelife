import React from "react";

import PromotionTile, { PromotionTileProps } from "../promotion-tile";
import { getPublicDealTiles } from "@/lib/cb/deals-system/public-deals";

export const dynamic = "force-dynamic";

/**
 * Homepage section for operator-approved Curated Deals (Phase 10).
 *
 * Reads ONLY approval-gated, link-valid, bookable Deals via getPublicDealTiles
 * (which applies isDealHomepageEligible). Renders nothing when there are none, so
 * the homepage shows zero Deals until a Deal is actually approved.
 */
export default async function CuratedDealsTiles() {
  const tiles = await getPublicDealTiles();

  if (tiles.length === 0) {
    return null;
  }

  return (
    <section className="relative overflow-hidden bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            Curated Cruise Deals
          </p>
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
            Hand-picked sailings, ready to book
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            A focused set of cruises worth your time.
          </p>
        </div>
        <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => {
            const promotionTileProps: PromotionTileProps = {
              imageSrc: tile.imageSrc,
              alt: tile.imageAlt,
              port: tile.sailDateLabel,
              header1: tile.header1,
              header2: tile.header2,
              description: tile.shortSummary,
              price: tile.pricePerPersonLabel
                ? { perPerson: tile.pricePerPersonLabel }
                : undefined,
              bookButton: Boolean(tile.bookingUrl),
              bookButtonHref: tile.bookingUrl,
              detailsLink: tile.href,
            };

            return (
              <div key={tile.id} className="flex flex-col items-center gap-4 rounded-lg p-2">
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.45em] text-muted-foreground">
                  <span className="inline-flex h-1.5 w-10 rounded-full bg-primary" />
                  <span className="text-sm font-bold text-foreground">{tile.destination}</span>
                </div>
                <div className="w-full max-w-[22rem]">
                  <PromotionTile promotion={promotionTileProps} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
