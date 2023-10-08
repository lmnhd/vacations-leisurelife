import React from "react";
import Seashore1 from "@/public/Cruise Yacht Display Top.jpg";
import Seashore2 from "@/public/Cruise Yacht Display bottom.jpg";
import Image from "next/image";
// import { Pacifico, Prompt,Anton } from "next/font/google";
import { cn } from "@/lib/utils";
// import HomeVideoImage from './HomeVideoImage'
import logo from '@/public/DD (1).png'
import { SDLandingHero2 } from "./sd_hero_2";
import It_banner from "./it_banner";
import Honoring_hbcu from "./honoring_hbcu";

// const pacifico = Pacifico({ weight: "400", subsets: ["latin"] });
// const prompt = Prompt({ weight: "400", subsets: ["latin"] });
// const anton = Anton({ weight: "400", subsets: ["latin"] });
export default function Schooldazehero() {
  
  
  return (
    <div>
      <SDLandingHero2 icon={logo}/>
      
     
      <div className={cn("flex flex-col items-center justify-center lg:grid grid-flow-col lg:items-stretch lg:justify-around gap-0 bg-gradient-to-br from-black via-red-800 to-black")}>
        <Image 
        
        src={Seashore1} 
        alt="seashore" 
       width={550}
         height={500} 
        className="bg-cover rounded-2xl shadow-md"
        />
       
       <Honoring_hbcu/>
       <Image 
        
        src={Seashore2} 
        alt="seashore" 
       width={550}
         height={500} 
        className="bg-cover rounded-2xl shadow-md"
        />
      </div>
      <It_banner/>
      <div
      className="flex-row flex-wrap items-center justify-between hidden w-full gap-5 mx-auto text-center text-yellow-500 bg-black shadow-lg md:flex font-extralight shadow-red-600"
      ><p>#HBCU</p> <p>#90’s</p> <p>#GenX</p> <p>#HipHop</p> <p>#Throwback</p> <p>#MSC</p></div>
      <div className="w-full text-sm font-normal text-center text-yellow-400 bg-gradient-to-br from-black via-red-800 to-black xl:py-8">
        <p>Prices are per-person based on double occupancy</p>
        <p>Deposit of $99.00 per-person due upon booking ($198.00 per-cabin)</p>
        <p>$75 tax not included in price</p>
        <p>
          Prices are subject to change over time so reserve your cabin today!
        </p>
      </div>
    </div>
  );
}
