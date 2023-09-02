import React from 'react'
import { Clock } from 'lucide-react'
import Image from 'next/image'

export default function Itinerary({dates,itineraryMap}:{dates:any[],itineraryMap:string}) {
  return (
    <div 
    className="flex flex-col items-center space-y-4 border-0 border-red-500 wrapper1"
    >
        {itineraryMap && <div>
            <Image
            alt='itinerary map'
            src={itineraryMap}
            width={500}
            height={500}
            />
        </div>}
        <div
        className="flex flex-wrap items-center border-0 border-red-500 wrapper1"
        //className="flex flex-wrap justify-between p-4 space-x-4 text-sm"
        >
          {/* <h2 className="font-bold text-center text-primary">Itinerary</h2> */}
          {dates.map((date: any, index: any) => {
            return (
        
              <div key={index}>
                  <div
                  className="flex flex-col items-center w-40 h-56 grid-flow-row px-3 mt-4 space-y-6 shadow-sm border-x-2 item"
                  >
                    <Clock size={16} className='my-4'/>
                    {date.time ? <p>{date.time}</p> : <p>---</p>}
                    <div className="flex flex-col space-x-2 text-center h-14">
                      <p className="relative font-semibold ">{date.location.trim()}</p>
                      
                    </div>
                    <div className="flex flex-col space-x-2 text-center">
                      <p className="text-xs">{date.date}</p>
                    </div>
                    
                  </div>
                  
              </div>
            )
          })}
        </div>
      </div>
  )
}
