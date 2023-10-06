import React from "react";
import Seashore from "@/public/SQUAR STILL.png";
import Image from "next/image";
export default function Schooldazehero() {
  // #GenX
  // #GenerationX
  // #HipHop
  // #90’s
  // #Late-80’s
  // #HBCU
  // #Throwback
  // "Black College Alumni Weekend at Sea....
  // Join us for a SCHOOL-DAZE ...THROWBACK COLLEGE EXPERIENCE
  // with enrichment, performances & school pride events!
  // IB Interior Bella 199
  // IR2 Deluxe Interior 229
  // OB Ocean View Bella 259
  // OR1 Deluxe Ocean View 279
  // BB Balcony Bella 319
  // BR2 Deluxe Balcony 359
  return (
    <div>
      <div className="flex flex-col items-center px-10 mx-auto py-4  space-y-3 shadow-sm bg-gradient-to-b? from-black  via-yellow-500 to-black">
        <p className="font-sans text-xl font-normal text-black shadow-sm md:hidden md:mr-auto md:text-4xl"
        >
          Join us for a SCHOOL-DAZE
        </p>
        <h1 className="hidden font-sans text-xl font-bold text-black md:block md:mr-auto md:text-5xl text-primary">
          Join us for a SCHOOL-DAZE ...
        </h1>
        <h1 className="font-sans text-2xl font-semibold text-center text-black md:ml-auto md:text-4xl md:text-right ">
          THROWBACK COLLEGE EXPERIENCE
        </h1>
        <h2 className="font-sans text-center uppercase text-md md:text-2xl md:text-left text-primary">
          with enrichment, performances & school pride events!
        </h2>
      </div>
     
      <div className="grid-cols-2 bg-black md:grid">
        <Image src={Seashore} alt="seashore" width={700} height={700} 
        className="flex items-center justify-center"
        />
        <div className="flex flex-col items-center justify-around w-5/6 mx-auto space-y-1 shadow-sm ">
          <div className="flex flex-col justify-center w-full pt-4 text-center text-yellow-500 border-b-2 md:text-2xl border-gray-500/40 md:pb-6 sm:py-3 ">
            <p>NOVEMBER 21, 2024</p>
            <p>3 NIGHTS</p>

            <p>ONBOARD THE MSC SEASHORE</p>
          </div>
          <div className="font-sans text-2xl text-center font-extralight text-primary">
                <p>*PORT CANAVERAL, FL</p>
                <p>*NASSAU, OCEAN CAY</p>
              </div>
          <div className="flex flex-col pb-4 ">
             
              <div className="text-lg text-white">
                <h2 className="my-2 font-normal">Cabin Prices</h2>
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
      <div
      className="flex-row flex-wrap items-center justify-between hidden w-full gap-5 mx-auto text-center text-yellow-500 bg-black md:flex font-extralight"
      ><p>#HBCU</p> <p>#90’s</p> <p>#GenX</p> <p>#HipHop</p> <p>#Throwback</p> <p>#MSC</p></div>
      <div className="w-full text-sm text-center bg-white font-extralight">
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
