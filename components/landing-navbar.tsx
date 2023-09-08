"use client";

import { Montserrat } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import logo from '@/public/llv logo_color_sept23-3.png'

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const font = Montserrat({ weight: "600", subsets: ["latin"] });

export const LandingNavbar = () => {
  const { isSignedIn } = useAuth();

  return (
    <nav className="p-4 bg-transparent flex items-center justify-between">
      <Link href="/" className="flex items-center">
          <div className="flex flex-col relative h-20 w-52 mr-4 justify-center items-center ">
            <Image  alt="Logo" src={logo} />
            <h1 className={cn("text-sm font-extralight text-primary hidden md:block -mt-7 font-sans", font.className)}>
            LET US MAKE IT HAPPEN!
          </h1>
          </div>
          
      </Link>
      <div className="flex items-center gap-x-2">
    <Link href={isSignedIn ? "/dashboard" : "sigh-up"}>
        <Button variant="outline" className="rounded-full">
            Let&apos;s Go!
        </Button>
    </Link>
      </div>
    </nav>
  );
};
