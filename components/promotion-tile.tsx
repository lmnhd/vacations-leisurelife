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
  return (
    <div className="flex flex-col duration-300 ease-linear bg-white rounded-lg shadow w-80 justify-stretch hover:-translate-y-3 hover:transition-all hover:scale-y-100 border-primary-foreground hover:shadow-2xl ">
      <div className="relative ">
        {/* Image Slider */}
        <div className="image-container">
          {/* Single Slide */}
          <div className="relative h-56">
            <img
              src={promotion.imageSrc}
              alt={promotion.alt}
              className="object-cover w-full h-full shadow"
            />
            {(promotion.day || promotion.port) && (
              <div className="absolute bottom-0 left-0 w-full p-1 text-white duration-200 ease-in-out bg-gray-700/30 hover:bg-gradient-to-r hover:from-primary/30 hover:via-violet-600/30 hover:to-primary-foreground/30 hover:transition-all ">
                <div>{promotion.day ? promotion.day : <br />}</div>
                <div>{promotion.port ? promotion.port : <br />}</div>
              </div>
            )}
          </div>
          {/* Add more slides as needed */}
        </div>
        {/* Pagination, Navigation, etc. */}
      </div>

      <div className="p-4">
        {/* Content goes here */}
        <h3 className="mb-1 font-bold">{promotion.header1}</h3>
        {promotion.header2 ? (
          <h5 className="w-full h-10 overflow-hidden text-sm font-extralight bg-gray-50">
            {promotion.header2}
          </h5>
        ) : (
          <br />
        )}
        <p className="h-24 overflow-hidden">{promotion.description}</p>
        <div className="flex items-center justify-between mt-4">
          {/* {promotion.price && ( */}
          <div>
            {promotion.price?.perPerson && (
              <div>
                <span className="text-lg font-bold">
                  ${promotion.price?.perPerson.replace('$', "")}
                </span>{" "}
                per person
              </div>
            )}
            {promotion.price?.perCabin && (
              <div>
                <span className="text-lg font-bold">
                  ${promotion.price?.perCabin.replace('$', "")}
                </span>{" "}
                per cabin
              </div>
            )}
          </div>
          {/* )} */}
          {promotion.bookButton ? (
            <button className="flex flex-col items-center justify-center w-24 px-4 py-2 text-center text-white bg-blue-500 rounded h-14 hover:bg-blue-600">
              Book Now
            </button>
          ) : (
            <div className="w-24 opacity-0 h-14">---</div>
          )}
        </div>
      </div>
      
      {(promotion.detailsLink || promotion.toolTips ) && (
        <div className="h-20 bg-gray-100 border-t ">
            
          {/* Footer Content */}
          {promotion.toolTips ? <FeaturesToolTip options={promotion.toolTips}  /> : <br />}
         {(promotion.detailsLink) && <Link href={promotion.detailsLink}>
           <button className="h-10 text-blue-500 hover:underline">
              More Details
            </button>
         </Link>}
        </div>
      )}
    </div>
  );
};

export default PromotionTile;
