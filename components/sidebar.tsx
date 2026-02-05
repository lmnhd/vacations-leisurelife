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
    label: "Home",
    icon: Home,
    href: "/",
    color: "text-yellow-500",
  },
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
  const phoneNumber = process.env.NEXT_PUBLIC_LLV_PHONE
  return (
    <div className="flex flex-col h-full py-6 text-white border-r shadow-2xl bg-gradient-to-t from-slate-900 via-primary/40 to-primary shadow-primary/30 border-white/10">
      <div className="flex-1 px-4 py-3">
        <Link href="/" className="flex items-center gap-3 mb-12">
          <div className="relative text-white">
            <Image src={logo} alt="LLV" width={160} className="drop-shadow-[0_10px_35px_rgba(0,0,0,0.7)]" />
          </div>
        </Link>
        <div className="space-y-2">
          {routes.map((route) => {
            const isActive = pathName === route.href;
            return (
              <Link
                href={route.href}
                key={route.href}
                className={cn(
                  "group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition-all duration-300 ease-in-out hover:border-white/40",
                  isActive && "bg-white/15 border-white/40"
                )}
              >
                <div className="flex items-center">
                  <span
                    className={cn(
                      "mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 shadow-lg shadow-black/40 transition-colors duration-300",
                      isActive ? "bg-gradient-to-br from-primary to-amber-400 text-white" : "text-white/80"
                    )}
                    aria-hidden
                  >
                    <route.icon className={cn("h-5 w-5 transition-colors duration-300", route.color)} />
                  </span>
                  <div className="flex items-center justify-between flex-1">
                    <span className="text-sm font-medium tracking-wide text-white">{route.label}</span>
                    {isActive && (
                      <span className="w-12 h-2 rounded-full bg-gradient-to-r from-amber-300 to-pink-500" aria-hidden />
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      <div className="px-4 pt-4 pb-6 border-t border-white/10">
        <p className="text-xs uppercase tracking-[0.4em] text-white/60">Need Help?</p>
        {phoneNumber ? (
          <p className="text-sm font-light leading-relaxed text-white/80">
            Call the concierge at <span className="font-semibold text-amber-300">{phoneNumber}</span>
          </p>
        ) : (
          <p className="text-sm font-light leading-relaxed text-white/80">
            Start a chat via the floating helper so we can guide you live.
          </p>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
