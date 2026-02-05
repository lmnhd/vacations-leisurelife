"use client";

import Navbar from "@/components/navbar";
import Sidebar from "@/components/sidebar";
import { NewsProvider } from "./(routes)/news/newscontext";
import { getApiLimitCount } from "@/lib/api-limit";
import { useState } from "react";
import RSSParser from "rss-parser";

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
 // const apiLImitCount = await getApiLimitCount()

  return (
    <div className="relative h-full">
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
