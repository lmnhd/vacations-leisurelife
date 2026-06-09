import React from "react";
import PromotionTile, { PromotionTileProps } from "../promotion-tile";
import {
  StoredCbDealDetail,
  StoredCbHomepageDeal,
} from "@/lib/cb/cb-deal-types";
import { getStoredCbDeals } from "@/lib/cb/cb-deals-store";

export const dynamic = "force-dynamic";

export default async function CBDestinationPicksTiles() {
  const storedDeals = await getStoredCbDeals();
  const dealDetails = (storedDeals?.dealDetails ?? []).filter((deal) => Boolean(deal.booking.bookingUrl));
  const publishableDealIds = new Set(dealDetails.map((deal) => deal.id));
  const homepageDeals: StoredCbHomepageDeal[] = (storedDeals?.homepageDeals ?? []).filter((deal) =>
    publishableDealIds.has(deal.id)
  );

  if (homepageDeals.length === 0) {
    return null;
  }

  function mapTileData(deals: StoredCbHomepageDeal[], details: StoredCbDealDetail[]) {
    return deals.map((deal, index) => {
      const detail = details.find((item) => item.id === deal.id);
      const promotionTileProps: PromotionTileProps = {
        imageSrc: deal.imageSrc,
        alt: deal.alt,
        day: deal.day,
        port: deal.port,
        header1: deal.header1,
        header2: deal.header2,
        description: deal.description,
        price: {
          perPerson: deal.pricePerPerson,
        },
        bookButton: Boolean(detail?.booking.bookingUrl),
        bookButtonHref: detail?.booking.bookingUrl,
        toolTips: deal.toolTips,
        detailsLink: `/deals/${encodeURIComponent(deal.id)}`,
      };

      return (
        <div
          key={index}
          className="flex flex-col items-center gap-4 rounded-lg p-2"
        >
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.45em] text-muted-foreground">
            <span className="inline-flex h-1.5 w-10 rounded-full bg-primary" />
            <span className="text-sm font-bold text-foreground">
              {deal.destination}
            </span>
          </div>
          <div className="w-full max-w-[22rem]">
            <PromotionTile promotion={promotionTileProps} />
          </div>
        </div>
      );
    });
  }

  return (
    <section className="relative overflow-hidden bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            Deals and Specials
          </p>
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
            Cruise Deals You Can Book Now
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            Weekly Cruise Brothers specials, packaged for quick comparison and a cleaner booking handoff.
          </p>
        </div>
        <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {mapTileData(homepageDeals, dealDetails)}
        </div>
      </div>
    </section>
  );
}
