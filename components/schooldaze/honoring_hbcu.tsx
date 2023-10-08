import React from "react";

import { cn } from "@/lib/utils";
import Image from "next/image";
import hbcu from "@/public/Copy-of-Untitled-Design.jpg";

import { 
  // Pacifico, 
  // Prompt, 
  // Anton, 
  // Black_Ops_One, 
   //Archivo_Black, 
   Orbitron, 
  // Righteous, 
  //Alfa_Slab_One,  
} from "next/font/google";
// const pacifico = Pacifico({ weight: "400", subsets: ["latin"] });
// const prompt = Prompt({ weight: "400", subsets: ["latin"] });
// const anton = Anton({ weight: "400", subsets: ["latin"] });
// const black_ops_one = Black_Ops_One({ weight: "400", subsets: ["latin"] });
// const archivo_black = Archivo_Black({ weight: "400", subsets: ["latin"] });
 const orbitron = Orbitron({ weight: "400", subsets: ["latin"] });
// const righteous = Righteous({ weight: "400", subsets: ["latin"] });
//const alfa_slab_one = Alfa_Slab_One({ weight: "400", subsets: ["latin"] });
export default function Honoring_hbcu() {
  return (
    <div className=" bg-gradient-to-br from-yellow-700 via-yellow-500 to-yellow-700 flex flex-col items-center  justify-center py-10 rounded-2xl shadow-md max-w-[550px] ">
        <div>
            <p
            className={cn("text-6xl text-center text-black font-extralight   ",orbitron.className)}
            >HONORING HBCUs</p>
        </div>
      <div className=" mix-blend-multiply h-full">
          <Image  src={hbcu} alt="seashore" width={500} height={500} />
      </div>
    </div>
  );
}
