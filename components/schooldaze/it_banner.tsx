import { cn } from '@/lib/utils'
import React from 'react'
import itineraryIMG from '@/public/UTIB.jpg'

import { 
  // Pacifico, 
  Prompt, 
  // Anton, 
  // Black_Ops_One, 
  // Archivo_Black, 
  // Orbitron, 
  Righteous, 
  Alfa_Slab_One,  } from "next/font/google";
import Image from 'next/image';
// const pacifico = Pacifico({ weight: "400", subsets: ["latin"] });
const prompt = Prompt({ weight: "400", subsets: ["latin"] });
// const anton = Anton({ weight: "400", subsets: ["latin"] });
// const black_ops_one = Black_Ops_One({ weight: "400", subsets: ["latin"] });
// const archivo_black = Archivo_Black({ weight: "400", subsets: ["latin"] });
// const orbitron = Orbitron({ weight: "400", subsets: ["latin"] });
const righteous = Righteous({ weight: "400", subsets: ["latin"] });
const alfa_slab_one = Alfa_Slab_One({ weight: "400", subsets: ["latin"] });
export default function It_banner() {
  return (
    <div className="flex flex-col items-center justify-around w-full md:px-20 mx-auto space-y-1 shadow-sm bg-gradient-to-bl from-black/20 via-red-800/20 to-black/20 it-banner">
    <div className="flex flex-col justify-center w-full pt-4 text-center text-yellow-500 border-b-2 md:text-2xl border-red-500/40 md:pb-6 sm:py-3 ">
      <p
      className={cn("text-3xl md:text-6xl text-center my-3 text-red-600",alfa_slab_one.className)}
      >90’s flavor…HBCU style</p>
      <div className={cn("text-3xl font-bold",prompt.className)}>
        <p >NOVEMBER 21, 2024</p>
        <p>3 NIGHTS</p>
      </div>

      <p className={cn('text-2xl text-white md:text-yellow-500',righteous.className)}>ONBOARD THE MSC SEASHORE</p>
    </div>
    <div className={cn("font-sans text-3xl w-full text-center font-normal  text-red-600",righteous.className)}>
          <p>*PORT CANAVERAL, FL</p>
          <p>*NASSAU, OCEAN CAY</p>
        </div>
        <Image
        alt='itinerary'
        src={itineraryIMG}
        width={500}
        height={500}
        className='bg-black rounded-2xl mix-blend-overlay ml-auto'
        />
    <div className={cn("flex flex-col w-full pb-4 text-yellow-500")}>
       
        <div className="text-lg ">
          <h2 className="my-2 font-normal grid grid-rows-3">Cabin Prices</h2>
          <div className=''>
              <div className="flex flex-row justify-between w-full gap-4">
                <p>Interior (Bella)</p>
                <p className="font-semibold">$199.00</p>
              </div>
              <div className="flex flex-row justify-between w-full gap-4">
                <p>Deluxe Interior</p>
                <p className="font-semibold">$229.00</p>
              </div>
              <div className="flex flex-row justify-between w-full gap-4">
                <p>Ocean View (Bella)</p>
                <p className="font-semibold">$259.00</p>
              </div>
              <div className="flex flex-row justify-between w-full gap-4">
                <p>Deluxe Ocean View</p>
                <p className="font-semibold">$279.00</p>
              </div>
              <div className="flex flex-row justify-between w-full gap-4">
                <p>Balcony (Bella)</p>
                <p className="font-semibold">$319.00</p>
              </div>
              <div className="flex flex-row justify-between w-full gap-4">
                <p>Deluxe Balcony</p>
                <p className="font-semibold">$359.00</p>
              </div>
              
          </div>
        </div>
       
    </div>
  </div>
  )
}
