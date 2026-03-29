import React from "react";
import PromotionTile, { PromotionTileProps } from "../promotion-tile";
import { Container1Header } from "../containers/container1";
import { cbPicks } from "@/app/(dashboard)/(routes)/destinationdeal/[id]/index";
import { buildHomepageDealsFromPicks } from "@/lib/cb/cb-deals-refresh";
import {
  CBPickData,
  StoredCbHomepageDeal,
} from "@/lib/cb/cb-deal-types";
import { getStoredCbDeals } from "@/lib/cb/cb-deals-store";

export const dynamic = "force-dynamic";

function cleanLabel(value: string, prefix: string): string {
  return value.replace(prefix, "").trim();
}

function buildHomepageFallbackDeals(picks: CBPickData[]): StoredCbHomepageDeal[] {
  const seenDestinations = new Set<string>();
  const fallbackDeals: StoredCbHomepageDeal[] = [];

  for (const pick of picks) {
    const destination = cleanLabel(pick.destination, "Destination:")
      .split(" - ")[0]
      .trim();

    if (seenDestinations.has(destination)) {
      continue;
    }

    seenDestinations.add(destination);

    const otherDetails = cleanLabel(pick.other, "Other details:");
    const priceLabel = cleanLabel(pick.price, "Prices:");
    const firstPriceMatch = priceLabel.match(/\$[\d,]+/);

    fallbackDeals.push({
      id: pick.id,
      destination,
      imageSrc: pick.img,
      alt: pick.destination,
      day: cleanLabel(pick.when, "When:"),
      port: cleanLabel(pick.go, "Where you go:").slice(0, 60),
      header1: destination,
      header2: cleanLabel(pick.what, "What:"),
      description: otherDetails.slice(0, 120),
      pricePerPerson: `${firstPriceMatch?.[0] ?? "See rates"}(*starting)`,
      detailsLink: `/destinationdeal/${pick.id}`,
      toolTips:
        pick.other.includes("onboard credit") ||
        pick.other.includes("dining") ||
        pick.other.includes("beverage") ||
        pick.other.includes("WIFI")
          ? {
              freeDining: pick.other.includes("dining"),
              freeDrinks: pick.other.includes("beverage"),
              freeWifi: pick.other.includes("WIFI"),
              onboardCredits: pick.other.includes("onboard credit"),
            }
          : undefined,
    });

    if (fallbackDeals.length === 6) {
      break;
    }
  }

  return fallbackDeals;
}

export default async function CBDestinationPicksTiles() {
  const storedDeals = await getStoredCbDeals();
  let homepageDeals: StoredCbHomepageDeal[] = storedDeals?.homepageDeals ?? [];

  if (homepageDeals.length === 0 && (storedDeals?.picks?.length ?? 0) > 0) {
    homepageDeals = buildHomepageFallbackDeals(storedDeals!.picks);
  }

  if (homepageDeals.length === 0 && process.env.NODE_ENV === "development") {
    const livePicks = (await cbPicks({ source: "live" })) as CBPickData[];
    homepageDeals = await buildHomepageDealsFromPicks(livePicks);
  }

  if (homepageDeals.length === 0) {
    return null;
  }

  function mapTileData(deals: StoredCbHomepageDeal[]) {
    return deals.map((deal, index) => {
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
        toolTips: deal.toolTips,
        detailsLink: deal.detailsLink,
      };

      return (
        <div
          key={index}
          className="relative flex flex-col items-center gap-4 rounded-[32px] p-4"
        >
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.7em] text-white/90">
            <span className="inline-flex h-1.5 w-12 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500" />
            <span className="text-base font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
              {deal.destination}
            </span>
          </div>
          <div className="relative w-full max-w-[22rem]">
            <div className="pointer-events-none absolute -inset-3 opacity-40 blur-2xl bg-gradient-to-r from-slate-900 via-primary/20 to-slate-900" />
            <div className="relative">
              <PromotionTile promotion={promotionTileProps} />
            </div>
          </div>
        </div>
      );
    });
  }

  return (
    <section className="relative overflow-hidden px-6 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.35),_transparent_65%)]" />
      <div className="pointer-events-none absolute -left-16 top-1/4 h-60 w-60 rounded-full bg-gradient-to-r from-cyan-500/40 to-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-8 bottom-4 h-72 w-72 rounded-full bg-gradient-to-t from-amber-400/40 to-transparent blur-3xl" />
      <div className="relative space-y-10">
        <Container1Header headerText="EXCLUSIVE DEALS FOR OUR TOP CRUISE DESTINATION PICKS" />
        <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {mapTileData(homepageDeals)}
        </div>
      </div>
    </section>
  );
}
