import React from "react";
import "@/app/(landing)/landing.css";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  // Pacifico,
  // Prompt,
  // Anton,
  // Black_Ops_One,
  // Archivo_Black,
  // Orbitron,
  // Righteous,
  Alfa_Slab_One,
  // Codystar,
  Ranga
} from "next/font/google";
import TypewriterComponent from "typewriter-effect";
// const pacifico = Pacifico({ weight: "400", subsets: ["latin"] });
// const prompt = Prompt({ weight: "400", subsets: ["latin"] });
// const anton = Anton({ weight: "400", subsets: ["latin"] });
// const black_ops_one = Black_Ops_One({ weight: "400", subsets: ["latin"] });
// const archivo_black = Archivo_Black({ weight: "400", subsets: ["latin"] });
// const orbitron = Orbitron({ weight: "400", subsets: ["latin"] });
// const righteous = Righteous({ weight: "400", subsets: ["latin"] });
const alfa_slab_one = Alfa_Slab_One({ weight: "400", subsets: ["latin"] });
// const codystar = Codystar({ weight: "400", subsets: ["latin"] });
const ranga = Ranga({ weight: "400", subsets: ["latin"] });

export default function Sd_hero_text() {
  return (
    <div
      className={cn(
        " w-full rounded-md py-20 px-6   shadow-sm bg-gradient-to-b from-red-700/5  via-red-500/20 to-red-700/5"
      )}
    >
      <div className="flex flex-col items-start md:w-5/6 gap-0 xl:gap-10">
        <p className={cn("font-sans text-4xl text-center text-yellow-400 font-bold shadow-sm md:hidden md:mr-auto md:text-4xl",alfa_slab_one.className)}>
          Join us for a SCHOOL-DAZE
        </p>
        <h1
          className={cn(
            "hidden font-bold  md:block md:mr-auto md:text-5xl xl:text-7xl text-yellow-400 uppercase",
            alfa_slab_one.className
          )}
        >
          Join us for a SCHOOL-DAZE
        </h1>
        <h1
          className={cn(
            "font-sans text-3xl font-extrabold text-center text-white md:text-black md:ml-auto md:text-6xl xl:text-8xl md:text-right bg-gradient-to-b from-red-700/5  via-red-500/20 to-red-700/0 md:py-6 shadow-red-500 shadow-lg? rounded-3xl px-6 ",
            ranga.className
          )}
        >
          THROWBACK COLLEGE EXPERIENCE!
        </h1>
        <div className={cn('ml-auto text-3xl md:text-4xl xl:text-6xl  text-red-500 text-center',alfa_slab_one.className)}>
          <h1>With... </h1>

          <div className="text-transparent bg-clip-text bg-gradient-to-r from-red-500   to-yellow-500 z-[80]">
            <TypewriterComponent
              options={{
                strings: [
                  "ENRICHMENT",
                  "PERFORMANCES",
                  "SCHOOL PRIDE EVENTS",
                  "THROWBACK PARTIES",
                  "BEACH PARTY",
                  
                ],
                autoStart: true,
                loop: true,
                delay: 20,
                deleteSpeed: 50,
              }}
            />
          </div>
        </div>
        {/* <h2
                  className={cn(
                    "font-sans text-center text-red-800 uppercase text-md md:text-4xl md:text-left",
                    prompt.className
                  )}
                >
                  with enrichment, performances & school pride events!
                </h2> */}
      </div>
    </div>
  );
}
