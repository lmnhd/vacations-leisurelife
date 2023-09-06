import React from 'react'
import { shipLogos, getAllLogos } from '@/app/utils/shiplogos'
import Image from 'next/image'

export default function LogoStrip({size=50}: {size?: number}) {
  return (
    <div className='flex flex-row justify-center border-slate-300 group hover:bg-gray-200 border-2 p-3 gap-4 lg:gap-10 items-center transition-all duration-150 ease-in-out ' >
        {getAllLogos().map((logo: any, index: number) => {
            return (
                <div 
                
                key={index}
                >
                    <Image 
                    alt="logo"
                    src={logo}
                    width={size}
                    height={size}
                    className={`hover:border-2 hover:scale-150 border-red-500 transition-all duration-500 ease-in-out`}
                    
                    />
                </div>
            )
        })}
    </div>
  )
}
