import React from "react";
import llvLogo from "@/public/llv logo_color_sept23-2.png";
import cbLogo from "@/public/cruise-bros-logo.png";
import Image from "next/image";

export default function Schooldazefooter() {
  return (
    <div className="grid items-center space-y-10 justify-around text-center md:h-48 px-2 text-sm text-white bg-black md:flex-wrap md:items-end md:justify-between md:flex pb-4 ">
      <div className="flex justify-between w-full gap-4 text-xs items-center md:w-5/6 mx-auto">
        <div>
          <p>Sponsored By</p>
          <Image src={llvLogo} alt="LLV Logo" width={130} height={100} />
        </div>
        <div className="flex flex-col gap-2 items-center justify-center">
          <p>&copy;2023 Leisure Life Vacations</p>
          <p>2280 Shepard St. Jacksonville FL</p>
          <p>Contact : {process.env.REACT_APP_LLV_PHONE}</p>
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

      {/* <div className='flex justify-between gap-4 text-xs items-center'>
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
