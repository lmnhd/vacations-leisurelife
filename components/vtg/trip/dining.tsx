import Image from 'next/image';
import React from 'react'

export default function Dining({data}:{data:any}) {
  return (
    <div>
        <div>
        {data.map((item:any, index:number) => {
                return (
                  <>
                    <div
                      className="w-full gap-4 mb-4 border-2 border-gray-200 rounded-sm shadow-sm md:grid md:grid-cols-2"
                      key={index}
                    >
                      <div className="p-2 mx-auto bg-blue-200">
                        <Image
                        alt={item.category}
                        width={500}
                        height={500}  
                        
                        src={item.image} />
                      </div>
                      <div
                        className="text-sm"
                        dangerouslySetInnerHTML={{ __html: item.textHTML }}
                      >
                        {/* <Typography 
                        className="pb-2 text-blue-700 border-b-2"
                        variant="h3">{item.category}</Typography> */}
                        {/* <Typography variant="h6">{item.description}</Typography> */}
                      </div>
                    </div>
                  </>
                );
              })}
        </div>
    </div>
  )
}
