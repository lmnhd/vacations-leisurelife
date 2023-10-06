import React from "react";
import llvLogo from "@/public/llv logo_color_sept23-2.png";
import cbLogo from "@/public/cruise-bros-logo.png";
import Image from "next/image";

export default function Schooldazefooter() {
  return (
    <div className="grid items-center justify-around h-48 px-2 pb-4 space-y-10 text-sm text-center text-white bg-black border-t-2 md:h-32 md:flex-wrap md:items-end md:justify-between md:flex border-primary/20 ">
      <div className="flex items-center justify-between w-full gap-4 mx-auto text-xs md:w-5/6">
        <div>
          <p>Sponsored By</p>
          <Image src={llvLogo} alt="LLV Logo" width={130} height={100} />
        </div>
        <div className="flex flex-col items-center justify-center gap-2">
          <p>&copy;2023 Leisure Life Vacations</p>
          <p>2280 Shepard St. Jacksonville, FL. 32211</p>
          <p>Contact : admin@LeisureLifeVacations.net</p>
          <p>{process.env.REACT_APP_LLV_PHONE}</p>
        </div>
        <div>
          <p>Powered By</p>
          <Image
            src={cbLogo}
            alt="Cruise Brothers Logo"
            width={130}
            height={100}
          />
        </div>
      </div>

      {/* <div className='flex items-center justify-between gap-4 text-xs'>
        <p>Powered By</p>
            <Image
            src={cbLogo}
            alt='Cruise Brothers Logo'
            width={130}
            height={100}
            />
        </div> */}
    </div>
  );
}
