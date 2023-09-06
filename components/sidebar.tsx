"use client";

import Image from "next/image";
import Link from "next/link";
import {usePathname} from "next/navigation"
import { Montserrat } from "next/font/google";

import logo from "../public/llv logo_color_sept23-4.png";

import { cn } from "@/lib/utils";
import { LayoutDashboard, Home, BadgeDollarSign, Newspaper,Search, PartyPopper } from "lucide-react";
import { FreeCounter } from "./free-counter";

const montserrat = Montserrat({ weight: "600", subsets: ["latin"] });

const routes = [
  
  {
    label: "Promotions",
    icon: BadgeDollarSign,
    href: "/promotions",
    color: "text-green-500",
  },
  {
    label: "Cruise News",
    icon: Newspaper,
    href: "/news",
    color: "text-orange-500",
  },
  {
    label: "Search Cruises",
    icon: Search,
    href: "/search",
    color: "text-violet-500",
  },
  {
    label: "Themed Cruises",
    icon: PartyPopper,
    href: "/themes",
    color: "text-pink-500",
  },

];
interface SidebarProps {
  apiLimitCount: number;
}
const Sidebar = ({
  apiLimitCount = 0,
 } : SidebarProps) => {
  const pathName = usePathname()
  return (
    <div className="flex flex-col h-full py-4 space-y-4 text-white bg-primary">
      <div className="flex-1 px-1 py-2">
        <Link href="/dashboard" className="flex items-center mb-14">
          <div className="relative  mx-4 text-white">
            <Image  src={logo} alt="logo" width={800} />
            {/* <h1 className={cn("text-2xl font-bold", montserrat.className)}>
              LLV
            </h1> */}
          </div>
        </Link>
        <div className="space-y-1">
          {routes.map((route) => (
            <Link 
            className={cn("text-sm group flex p-3 text-primary-foreground w-full justify-start font-light cursor-pointer hover:text-green-500 hover:bg-white/10 rounded-lg transition-all ease-in-out duration-500 hover:text-lg", pathName === route.href && "bg-white/10")}
            href={route.href} key={route.href}>
              <div className="flex items-center flex-1">
                <route.icon className={cn("w-6 h-6 mr-4", route.color)} />
                {route.label}
              </div>
            </Link>
          ))}
        </div>
      </div>
      {/* <FreeCounter
      apiLimitCount={apiLimitCount}
      /> */}
    </div>
  );
};

export default Sidebar;
