"use client";

import { Montserrat } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import logo from '@/public/school-cover.jpg'

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const font = Montserrat({ weight: "600", subsets: ["latin"] });

export const Schooldazenavbar = () => {
  const { isSignedIn } = useAuth();

  return (
    <nav className="flex flex-col items-center justify-center p-4 bg-gradient-to-bl? bg-black from-red-950 via-black to-red-950">
      <Link href="/" className="flex flex-col ">
          <div 
          className="flex flex-row items-center justify-between h-20 gap-2 mr-4 bg-opacity-50 rounded-lg bg-blend-color-dodge"
          >
            <Image  
            alt="Logo" src={logo} 
            width={150} height={150}
            />
            {/* <h1 className={cn("md:text-xs font-extralight text-red-500   font-sans", font.className)}>
            REUNION PARTY AT SEA!
          </h1> */}
          </div>
          
      </Link>
      <div className="flex items-center gap-x-2">
    {/* <Link href={isSignedIn ? "/dashboard" : "sign-up"}>
        <Button variant="outline" className="rounded-full">
            Let&apos;s Go!
        </Button>
    </Link> */}
      </div>
    </nav>
  );
};
