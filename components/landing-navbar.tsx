"use client";

import { Montserrat } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import logo from '@/public/llv logo_color_sept23-3.png'

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const font = Montserrat({ weight: "600", subsets: ["latin"] });

const NAV_LINKS = [
  { label: "Deals", href: "#deals" },
  { label: "Search", href: "/search" },
  { label: "Contact", href: "/contact" },
];

export const LandingNavbar = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-[100] p-4 flex items-center justify-between transition-all duration-300",
        scrolled
          ? "backdrop-blur-md bg-white/80 border-b border-gray-200/60 shadow-sm"
          : "bg-transparent"
      )}
    >
      <Link href="/" className="flex items-center">
        <div className="flex flex-col relative h-16 w-44 mr-4 justify-center items-center">
          <Image alt="Leisure Life Vacations Logo" src={logo} />
          <span
            className={cn(
              "text-xs font-extralight text-primary hidden md:block -mt-5 font-sans",
              font.className
            )}
          >
            LET US MAKE IT HAPPEN!
          </span>
        </div>
      </Link>

      <div className="flex items-center gap-x-6">
        <div className="hidden md:flex items-center gap-x-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={cn(
                "text-sm font-semibold transition-colors duration-200",
                scrolled ? "text-gray-700 hover:text-primary" : "text-white/90 hover:text-white"
              )}
            >
              {link.label}
            </a>
          ))}
        </div>
        <Link href="/dashboard">
          <Button variant="premium" className="rounded-full font-semibold px-5">
            Let&apos;s Go!
          </Button>
        </Link>
      </div>
    </nav>
  );
};
