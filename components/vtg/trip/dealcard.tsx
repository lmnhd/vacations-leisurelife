import React from 'react'

export default function DealCard({data}:{data:any}) {
  return (
    <div className="z-10 flex flex-col justify-center gap-4 bg-blue-200 ship-image-text">
          <h2 className="text-4xl font-bold">{data.mainInfo.shipName}</h2>
          <h2 className="text-2xl font-semibold text-primary">
            {data.mainInfo.dealName}
          </h2>
          <div className="p-4 ">
          <h2 className="font-bold">Destination</h2>
          {data.itinerary.dates.map((date: any, index: any) => {
            if (
              date.location !== "At Sea" &&
              index !== 0 &&
              index !== data.itinerary.dates.length - 1
            ) {
              return (
                <>
                  <p className="">- {date.location} -</p>
                </>
              );
            }
          })}
        </div>
        </div>
  )
}
