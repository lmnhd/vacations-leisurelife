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
    <div className="flex flex-col bg-white rounded-xl shadow-md w-80 border border-gray-100 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 overflow-hidden">

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
          <div className="absolute top-3 right-3 bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full shadow-md leading-tight text-center">
            <div>${cleanPrice}</div>
            <div className="font-normal opacity-80">{priceSuffix}</div>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-gray-900 text-base mb-0.5">{promotion.header1}</h3>
        {promotion.header2 && (
          <p className="text-xs font-medium text-primary/80 mb-2 line-clamp-1">
            {promotion.header2}
          </p>
        )}
        <p className="text-sm text-gray-600 line-clamp-3 flex-1">{promotion.description}</p>

        {promotion.bookButton && (
          <button className="mt-4 w-full py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
            Book Now
          </button>
        )}
      </div>

      {/* Footer */}
      {(promotion.detailsLink || promotion.toolTips) && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 flex flex-col gap-2">
          {promotion.toolTips && <FeaturesToolTip options={promotion.toolTips} />}
          {promotion.detailsLink && (
            <Link href={promotion.detailsLink} className="w-full">
              <button className="w-full py-2 text-sm font-semibold text-primary border border-primary rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors">
                More Details
              </button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

export default PromotionTile;
