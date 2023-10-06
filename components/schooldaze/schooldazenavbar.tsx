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
    <nav className="p-4 flex flex-col items-center bg-black justify-center">
      <Link href="/" className="flex flex-col ">
          <div 
          className="flex flex-row h-20 mr-4 items-center justify-between gap-2"
          >
            <Image  
            alt="Logo" src={logo} 
            width={150} height={150}
            />
            <h1 className={cn("text-2xl font-extralight text-primary   font-sans", font.className)}>
            HBCU PARTY AT SEA!
          </h1>
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
