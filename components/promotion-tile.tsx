import React from "react";
import FeaturesToolTip from "./featurestooltip";
import { ToolTipsProps } from "./featurestooltip";

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
    <div className="flex flex-col w-80 justify-stretch bg-white shadow hover:-translate-y-3 hover:transition-all duration-300 ease-linear hover:scale-y-100  border-primary-foreground hover:shadow-2xl rounded-lg ">
      <div className="relative ">
        {/* Image Slider */}
        <div className="image-container">
          {/* Single Slide */}
          <div className="relative h-56">
            <img
              src={promotion.imageSrc}
              alt={promotion.alt}
              className="w-full shadow h-full object-cover"
            />
            {(promotion.day || promotion.port) && (
              <div className="absolute bottom-0 left-0 p-1 bg-gray-700/30 hover:bg-gradient-to-r hover:from-primary/30 hover:via-violet-600/30 hover:to-primary-foreground/30 text-white w-full hover:transition-all ease-in-out duration-200 ">
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
        <h3 className="font-bold  mb-1">{promotion.header1}</h3>
        {promotion.header2 ? (
          <h5 className="font-extralight bg-gray-50 w-full text-sm h-6">
            {promotion.header2}
          </h5>
        ) : (
          <br />
        )}
        <p className="h-24 overflow-hidden">{promotion.description}</p>
        <div className="flex justify-between items-center mt-4">
          {/* {promotion.price && ( */}
          <div>
            {promotion.price?.perPerson && (
              <div>
                <span className="font-bold text-lg">
                  ${promotion.price?.perPerson}
                </span>{" "}
                per person
              </div>
            )}
            {promotion.price?.perCabin && (
              <div>
                <span className="font-bold text-lg">
                  ${promotion.price?.perCabin}
                </span>{" "}
                per cabin
              </div>
            )}
          </div>
          {/* )} */}
          {promotion.bookButton ? (
            <button className="flex flex-col items-center justify-center bg-blue-500 text-white text-center px-4 h-14 w-24 py-2 rounded hover:bg-blue-600">
              Book Now
            </button>
          ) : (
            <div className="opacity-0 h-14 w-24">---</div>
          )}
        </div>
      </div>
      
      {(promotion.detailsLink || promotion.toolTips ) && (
        <div className="border-t  bg-gray-100 h-20 ">
            
          {/* Footer Content */}
          {promotion.toolTips ? <FeaturesToolTip options={promotion.toolTips}  /> : <br />}
         {(promotion.detailsLink) && <button className="text-blue-500 h-10 hover:underline">
            More Details
          </button>}
        </div>
      )}
    </div>
  );
};

export default PromotionTile;
