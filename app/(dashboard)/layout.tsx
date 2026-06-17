"use client";

import Navbar from "@/components/navbar";
import Sidebar from "@/components/sidebar";
import { NewsProvider } from "./(routes)/news/newscontext";
import { getApiLimitCount } from "@/lib/api-limit";
import { useState } from "react";
import RSSParser from "rss-parser";

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
 // const apiLImitCount = await getApiLimitCount()

  // These legacy dashboard pages (Promotions, Cruise News, Search, Themed Cruises)
  // were built light-mode-only and mix hardcoded light colors with theme tokens,
  // so they become unreadable when the global theme is dark. Pin this whole section
  // to LIGHT by forcing the `light` class + a light surface here, regardless of the
  // app-wide theme. The new deals system + homepage keep full light/dark support.
  return (
    <div className="light relative h-full bg-background text-foreground">
      <div className="hidden h-full md:flex md:flex-col md:w-60 md:fixed md:inset-y-0  bg-gray-900">
        <Sidebar apiLimitCount={0}/>
      </div>

      <main className="md:pl-60">
        <NewsProvider>
        <Navbar/>
        {children}
        </NewsProvider>

      </main>
    </div>
  );
};

export default DashboardLayout;
