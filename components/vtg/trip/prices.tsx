import React from "react";

export default function Prices({ prices }: {prices:any[]}) {
  return (
    <div className="flex flex-col justify-center pr-4">
      {prices?.length > 0 ? (
        prices.map((comparePricesArr: any[], i: number) => {
          var label = "";
          var trimmedLabel = "";

          return comparePricesArr.map((comparePrice, j) => {
            console.log(comparePrice.label);
            //console.log(comparePrice.label);
            if (
              comparePrice.label.includes("Cheapest") ||
              comparePrice.label.includes("Our ")
            ) {
              trimmedLabel = comparePrice.label
                .replace("Cheapest", "")
                .replace("Our ", "")
                .trim();
              label = comparePrice.label;
              console.log(trimmedLabel);
              return (
                <div
                  //className="grid justify-between grid-flow-col px-2 mb-2 align-text-bottom border-black rounded-sm shadow-sm border-b-3"
                  className="flex items-center justify-center py-2"
                  key={j}
                >
                  <div className="flex items-center w-full space-x-4">
                    <div className="w-2 h-4 bg-primary-foreground"></div>
                    <p className="font-semibold text-muted-foreground ">
                      {trimmedLabel}
                    </p>
                  </div>
                  {/* <Circle/> */}

                  {/* <div>|</div> */}
                  <p className="ml-3 text-sm font-light text-muted-foreground ">
                  starting at  <span className="font-bold text-green-700 ">{comparePrice.amount}</span>
                    {/* {trimmedLabel} */}
                  </p>
                </div>
              );
            }
          });
        })
      ) : (
        <div>Prices Unavailable</div>
      )}
      <p className="w-1/2 mx-auto my-3 text-sm font-semibold text-secondary">
        Prices are in US dollars, per person, based on double occupancy.
      </p>
    </div>
  );
}
