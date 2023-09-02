import React from 'react'

export default function ShipInfo({info}:{info:any}) {
  return (
    <div className='flex flex-wrap '>
        { info.map((item:any, index:number) => {
        return (
          <>
            <div
              className="grid w-full grid-cols-6 gap-2 text-sm border-0 border-gray-200 rounded-sm shadow-sm "
              key={index}
            >
              <p
                
                className=""
              >
                {item.label}
              </p>
              <p className="" >
                {item.value}
              </p>
            </div>
          </>
        );
      })
    }        
    </div>
  )
}
