import React from "react";
import Image from "next/image";
import Link from "next/link";
import logo from "@/public/llv logo_color_sept23-3.png";

const FOOTER_LINKS = [
  { label: "Search Cruises", href: "/search" },
  { label: "Deals", href: "#deals" },
  { label: "Contact Us", href: "/contact" },
  { label: "Dashboard", href: "/dashboard" },
];

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-50 border-t border-gray-200 py-10 px-6">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center md:items-start justify-between gap-8">
        {/* Brand */}
        <div className="flex flex-col items-center md:items-start gap-2">
          <div className="relative h-14 w-40">
            <Image
              alt="Leisure Life Vacations Logo"
              src={logo}
              fill
              style={{ objectFit: "contain", objectPosition: "left" }}
            />
          </div>
          <p className="text-xs text-gray-500 font-light tracking-widest uppercase">
            Let Us Make It Happen!
          </p>
        </div>

        {/* Quick Links */}
        <nav className="flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm text-gray-600 hover:text-primary transition-colors font-medium"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="max-w-5xl mx-auto mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
        &copy; {currentYear} Leisure Life Vacations. All rights reserved.
      </div>
    </footer>
  );
}
