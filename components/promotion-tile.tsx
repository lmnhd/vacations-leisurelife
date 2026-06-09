import React from "react";
import FeaturesToolTip from "./featurestooltip";
import { ToolTipsProps } from "./featurestooltip";
import Link from "next/link";

export interface PromotionTileProps {
  imageSrc: string;
  alt?: string;
  day?: string;
  port?: string;
  header1: string;
  header2?: string;
  description: string;
  price?: PriceProps;
  bookButton?: boolean;
  bookButtonHref?: string;
  detailsLink?: string;
  toolTips?: ToolTipsProps;
}

export interface PriceProps {
  perPerson?: string;
  perCabin?: string;
}

const PromotionTile = ({ promotion }: { promotion: PromotionTileProps }) => {
  const priceLabel = promotion.price?.perPerson ?? promotion.price?.perCabin;
  const priceSuffix = promotion.price?.perPerson ? "/ person" : "/ cabin";
  const cleanPrice = priceLabel?.replace("$", "");

  return (
    <div className="flex w-80 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">

      {/* Image area */}
      <div className="relative h-64 overflow-hidden">
        <img
          src={promotion.imageSrc}
          alt={promotion.alt}
          className="object-cover w-full h-full"
        />

        {/* Bottom image overlay with day/port */}
        {(promotion.day || promotion.port) && (
          <div className="absolute bottom-0 left-0 w-full px-3 py-2 text-white text-xs bg-gradient-to-t from-black/70 to-transparent">
            {promotion.day && <div className="font-semibold">{promotion.day}</div>}
            {promotion.port && <div className="opacity-90">{promotion.port}</div>}
          </div>
        )}

        {/* Price badge — top right */}
        {cleanPrice && (
          <div className="absolute top-3 right-3 rounded-full bg-primary px-3 py-1.5 text-center text-xs font-bold leading-tight text-primary-foreground shadow-md">
            <div>${cleanPrice}</div>
            <div className="font-normal opacity-80">{priceSuffix}</div>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-0.5 text-base font-bold text-card-foreground">{promotion.header1}</h3>
        {promotion.header2 && (
          <p className="mb-2 line-clamp-1 text-xs font-medium text-primary">
            {promotion.header2}
          </p>
        )}
        <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{promotion.description}</p>

        {promotion.bookButton && promotion.bookButtonHref && (
          <a
            href={promotion.bookButtonHref}
            target="_blank"
            rel="noreferrer"
            className="mt-4 w-full rounded-lg bg-primary py-2 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Book Now
          </a>
        )}
      </div>

      {/* Footer */}
      {(promotion.detailsLink || promotion.toolTips) && (
        <div className="flex flex-col gap-2 border-t border-border bg-muted/35 px-4 py-3">
          {promotion.toolTips && <FeaturesToolTip options={promotion.toolTips} />}
          {promotion.detailsLink && (
            <Link href={promotion.detailsLink} className="w-full">
              <button className="w-full rounded-lg border border-primary py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
                View Deal
              </button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

export default PromotionTile;
