import React from "react";
import Image from "next/image";
import Link from "next/link";
import logo from "@/public/llv logo_color_sept23-3.png";

const FOOTER_LINKS = [
  { label: "Deals", href: "/#deals" },
  { label: "Specials", href: "/#deals" },
  { label: "Contact Us", href: "/contact" },
];

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/35 px-6 py-10">
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
          <p className="text-xs font-light uppercase tracking-widest text-muted-foreground">
            Let Us Make It Happen!
          </p>
        </div>

        {/* Quick Links */}
        <nav className="flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mx-auto mt-8 max-w-5xl border-t border-border pt-6 text-center text-xs text-muted-foreground">
        &copy; {currentYear} Leisure Life Vacations. All rights reserved.
      </div>
    </footer>
  );
}
