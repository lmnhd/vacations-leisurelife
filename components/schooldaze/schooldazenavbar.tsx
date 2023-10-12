"use client";

//import { Montserrat } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import logo from '@/public/school-cover.jpg'
import llvLogo from '@/public/llv logo_color_sept23-4.png'
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

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

//const font = Montserrat({ weight: "600", subsets: ["latin"] });
const orbitron = Orbitron({ weight: "400", subsets: ["latin"] });
export const Schooldazenavbar = () => {
  const { isSignedIn } = useAuth();

  return (
    <nav className={cn("flex flex-row justify-between p-0 text-black  md:p-4 bg-gradient-to-bl? bg-white from-red-950 via-black to-red-950",orbitron.className)}>
      <p>School Daze</p>
      <p>party@sea &apos;24</p>
      {/* <Link href="/" className="flex flex-col ">
          <div 
          className="flex flex-row  h-20 md:mr-4 bg-opacity-50 rounded-lg bg-blend-color-dodge"
          >
            
            <Image  
            alt="Leisure Life Logo" src={llvLogo} 
            width={150} height={150}
            />
           
          </div>
          
      </Link>
      <Link 
      href="/" 
      className=""
      >
          <div 
          className="flex flex-row h-20 items-end justify-end mr-0 md:mr-4 bg-opacity-50 rounded-lg bg-blend-color-dodge"
          >
            
            
            <Image  
            alt="Logo" src={logo} 
            width={100} height={100}
            />
           
          </div>
          
      </Link> */}
     
    </nav>
  );
};
