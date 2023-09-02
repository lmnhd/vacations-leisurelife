import Image from 'next/image';
import React from 'react'

export default function Photos({photos}: {photos: any}) {
  return (
    <div>
        <div>
        {photos.map((item:any, index:any) => {
                return (
                  <>
                    <div
                      className="flex flex-col w-full gap-4 mx-auto mb-4 border-2 border-gray-200 rounded-sm shadow-sm md:max-w-1/2 md:w-2/3"
                      key={index}
                    >
                      <Image 
                        alt='ship photo'
                        width={1000}
                        height={500}
                        quality={100}
                        

                      src={item.src} />
                      <p className="mb-3 text-xl font-bold align-middle">
                        {item.caption}
                      </p>
                      
                    </div>
                  </>
                );
              })}
        </div>
    </div>
  )
}
