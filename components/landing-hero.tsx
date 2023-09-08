"use client";
import TypewriterComponent from "typewriter-effect";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "./ui/button";
import heroImage from "@/public/passport-2714675_1920.jpg";
// import heroImage from "@/public/4-NWesternCaribbeanGalveston.jpg";
import "@/app/(landing)/landing.css";
import Image from "next/image";

export const LandingHero = () => {
  const { isSignedIn } = useAuth();
  return (
    <div
    //className="flex flex-col justify-start space-y-5 font-bold text-center h-[900px] text-white -mt-9 mx-auto "
    >
      <div
      //className="bg-blue-600 h-[300px] md:h-[600px] lg:h-[600px] xl:h-[600px]  top-0"
      >
        <div
          className="image-container max-h-[800px] overflow-hidden "
          //className="md:h-[700px] lg:h-[800px] xl:h-[850px] h-[300px] overflow-hidden absolute "
        >
          <Image alt="2 ships" width={2000} height={800} src={heroImage} />
         
          <div className="inner-content ">
            <div className=" flex flex-col  justify-end justify-items-end w-full space-y-4 md:space-y-16 lg:space-y-24 xl:space-y-28 text-4xl font-extrabold sm:text-4xl md:text-6xl lg:text-7xl absolute md:mt-14  z-50 text-center">
              <div></div>
              <h1>Your source for finding</h1>

              <div className="text-transparent bg-clip-text bg-gradient-to-r from-primary-foreground to-primary z-[80]">
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
                  specializes in luxury cruises.
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
          </div>
          <div className="overlay">
            
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
