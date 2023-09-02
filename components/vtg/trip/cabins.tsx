import Image from 'next/image';
import React from 'react'

export default function Cabins({cabins}:{cabins:any}) {
  return (
    <div>
        <div>
        {cabins.map((item:any, index:number) => {
                return (
                  <>
                    <div
                      className="w-full gap-4 mb-4 border-2 border-gray-200 rounded-sm shadow-sm md:grid md:grid-cols-2"
                      key={index}
                    >
                      <div>
                        <Image 
                        alt={item.category}
                        src={item.img} 
                        width={500}
                        height={500}
                        />
                      </div>
                      <div>
                        <h2
                          className="pb-2 text-xl font-bold border-b-2 text-primary"
                          
                        >
                          {item.category}
                        </h2>
                        <p >{item.description}</p>
                      </div>
                    </div>
                  </>
                );
              })}
        </div>
    </div>
  )
}
