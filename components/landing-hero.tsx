"use client";
import TypewriterComponent from "typewriter-effect";
import Link from "next/link";
import { Button } from "./ui/button";
import "@/app/(landing)/landing.css";
import Image from "next/image";

const HERO_IMAGE_URL =
  "https://images.unsplash.com/photo-1548574505-5e239809ee19?auto=format&fit=crop&w=2070&q=80";

export const LandingHero = () => {
  return (
    <div>
      <div className="image-container max-h-[800px] overflow-hidden">
        <Image
          alt="Luxury cruise ship on turquoise waters"
          width={2070}
          height={800}
          src={HERO_IMAGE_URL}
          priority
        />

        {/* Layered gradient overlay — light at top-center, deep at bottom */}
        <div
          className="overlay"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.78) 100%)",
          }}
        />

        {/* Hero content */}
        <div className="inner-content">
          <div className="flex flex-col items-center justify-end w-full h-full pb-10 md:pb-16 px-4 space-y-4 md:space-y-6 text-center z-50">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white drop-shadow-lg">
              Your source for finding
            </h1>

            <div className="text-transparent bg-clip-text bg-gradient-to-r from-primary-foreground to-primary text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold z-[80]">
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

            <p className="text-sm md:text-xl text-zinc-100 max-w-xl">
              Leisure Life Vacations is a full service travel agency that
              specializes in luxury cruises.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Link href="/search">
                <Button
                  variant="premium"
                  className="p-4 font-semibold rounded-full md:text-lg md:p-6"
                >
                  Search Cruises
                </Button>
              </Link>
              <a href="#deals">
                <Button
                  variant="outline"
                  className="p-4 font-semibold rounded-full md:text-lg md:p-6 bg-transparent text-white border-white/70 hover:bg-white/10"
                >
                  View Deals ↓
                </Button>
              </a>
            </div>

            <p className="text-xs md:text-sm text-zinc-300 pt-1">
              Trusted by thousands of travelers since 2009
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
{
  /* <div className="flex flex-col justify-start space-y-5 font-bold text-center h-[900px] text-white -mt-9 mx-auto ">
     
     <div className=" flex flex-col  justify-end justify-items-end w-full space-y-4 md:space-y-16 lg:space-y-24 xl:space-y-28 text-4xl font-extrabold sm:text-4xl md:text-6xl lg:text-7xl absolute md:mt-14  z-50 text-center">
     
     <div></div>
      <h1>Your source for finding</h1>

      <div className="text-transparent bg-clip-text bg-gradient-to-r from-primary-foreground to-primary ">
        <TypewriterComponent
          options={{
            strings: [
              "Cruise Deals",
              "Travel Packages",
              "Themed Cruises",
              "Group Cruises",
              "Luxury Cruises",
            ],
            autoStart: true,
            loop: true,
            delay: 50,
            deleteSpeed: 50,
          }}
        />
      </div>
      <div className="text-sm font-light md:text-xl text-zinc-100 hidden md:block">
        <p>
          Leisure Life Vacations is a full service travel agency that
          specializes in all-inclusive vacation cruises.
        </p>
      </div>
      <div>
        <Link href={isSignedIn ? "/dashboard" : "sign-up"}>
          <Button
            variant="premium"
            className="p-4 font-semibold rounded-full md:text-lg md:p-6"
          >
            Search Cruises
          </Button>
        </Link>
      </div>
    </div>
    <div className="bg-blue-600 h-[300px] md:h-[600px] lg:h-[600px] xl:h-[600px]  top-0">
      <div className="md:h-[700px] lg:h-[800px] xl:h-[850px] h-[300px] overflow-hidden absolute ">
        <Image alt="2 ships" width={2000} height={800} src={heroImage} />
      </div>
    </div>
  </div> */
}
