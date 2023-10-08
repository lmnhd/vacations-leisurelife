"use client";
// import TypewriterComponent from "typewriter-effect";
import { useAuth } from "@clerk/nextjs";
// import Link from "next/link";
// import { Button } from "@/components/ui/button";
// import heroImage from "@/public/lead-image-64879d5609c5d.jpg";
// import heroImage from "@/public/4-NWesternCaribbeanGalveston.jpg";

import Image from "next/image";
import { cn } from "@/lib/utils";
// import {
//   Pacifico,
//   Prompt,
//   Anton,
//   Black_Ops_One,
//   Archivo_Black,
//   Orbitron,
//   Righteous,
//   Alfa_Slab_One,
// } from "next/font/google";
// const pacifico = Pacifico({ weight: "400", subsets: ["latin"] });
// const prompt = Prompt({ weight: "400", subsets: ["latin"] });
// const anton = Anton({ weight: "400", subsets: ["latin"] });
// const black_ops_one = Black_Ops_One({ weight: "400", subsets: ["latin"] });
// const archivo_black = Archivo_Black({ weight: "400", subsets: ["latin"] });
// const orbitron = Orbitron({ weight: "400", subsets: ["latin"] });
// const righteous = Righteous({ weight: "400", subsets: ["latin"] });
// const alfa_slab_one = Alfa_Slab_One({ weight: "400", subsets: ["latin"] });

import logo from '@/public/DD (1).png'
import Sd_hero_text from "./sd_hero_text";

export const SDLandingHero2 = ({ icon }: { icon: any }) => {
  const { isSignedIn } = useAuth();
  return (
    <div
    //className="flex flex-col justify-start space-y-5 font-bold text-center h-[900px] text-white -mt-9 mx-auto "
    >
      <div
      //className="bg-blue-600 h-[300px] md:h-[600px] lg:h-[600px] xl:h-[600px]  top-0"
      >
        <div className="image-container max-h-[800px] overflow-hidden mix-blend-screen px-10">
          <div className={cn("video-container w-full ")}>
            <iframe src="https://www.youtube.com/embed/_Hdqc-2QHQ0?si=JIVNSckB2qKE5D8&amp;controls=0&autoplay=1&mute=1&playsinline=1&playlist=_Hdqc-2QHQ0&loop=1"></iframe>
          </div>

          <div className="inner-content flex flex-col justify-center ">
            {/* <div className=" flex flex-col  justify-end justify-items-end w-full space-y-4 md:space-y-16 lg:space-y-24 xl:space-y-28 text-4xl font-extrabold sm:text-4xl md:text-6xl lg:text-7xl absolute md:mt-14  z-50 text-center">
              <div></div>
              <h1>Your source for finding</h1>

              <div className="text-transparent bg-clip-text bg-gradient-to-r from-primary-foreground to-primary z-[80]">
                <TypewriterComponent
                  options={{
                    strings: [
                      "Cruise Deals",
                      "Travel Packages",
                      "Themed Cruises",
                      "Group Travel",
                      "Unique Destinations",
                      "Luxury Cruises",
                    ],
                    autoStart: true,
                    loop: true,
                    delay: 20,
                    deleteSpeed: 50,
                  }}
                />
              </div>
              <div className="text-sm font-light md:text-xl text-zinc-100 hidden md:block">
                <p>
                  Leisure Life Vacations is a full service travel agency that
                  specializes in luxury cruises.
                </p>
              </div>
              <div>
                <Link
                  href={"/search"}
                  //</div>href={isSignedIn ? "/search" : "sign-up"}
                >
                  <Button
                    variant="premium"
                    className="p-4 font-semibold rounded-full md:text-lg md:p-6"
                  >
                    Search Cruises
                  </Button>
                </Link>
              </div>
            </div> */}
            <div className="w-full">
              <div
              className="mt-10 z-50 w-[150px] h-[150px] mx-auto md:w-[200px] md:h-[200px] xl:w-[300px] xl:h-[300px]"
              >
                <Image
                alt="logo"
                src={logo.src}
                width={300}
                height={300}
              
                // className="w-12"
                />
              </div>
            </div>
            <div className="-mt-14 md:-mt-0"><Sd_hero_text/></div>
          </div>
          {/* <div className="overlay?"></div> */}
        </div>
      </div>
    </div>
  );
};

