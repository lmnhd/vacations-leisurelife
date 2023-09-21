"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import LLVCard from "../../../../public/leisure_life_card.png"
import {ArrowRight,Music4, LayoutDashboard,MessageSquare,ImageIcon, Home, BadgeDollarSign, Newspaper,Search, PartyPopper } from "lucide-react";
import Image from "next/image";
import LogoStrip from "@/components/logoStrip";

const tools = [
  // {
  //   label: "Conversation",
  //   icon: Home,
  //   color: "text-violet-500",
  //   bgColor: "bg-violet-500/10",
  //   href: "/conversation",
  // },
  // {
  //   label: "Code",
  //   icon: Home,
  //   color: "text-green-500",
  //   bgColor: "bg-green-500/10",
  //   href: "/code",
  // },
  // {
  //   label: "Image",
  //   icon: ImageIcon,
  //   color: "text-red-500",
  //   bgColor: "bg-red-500/10",
  //   href: "/image",
  // },
  // {
  //   label: "Music",
  //   icon: Music4,
  //   color: "text-blue-500",
  //   bgColor: "bg-blue-500/10",
  //   href: "/music",
  // },
  {
    label: "Search Cruises",
    icon: Search,
    color: "text-purple-500",
    bgColor: "bg-violet-500/10",
    href: "/search",
  },
  {
    label: "Promotions",
    icon: BadgeDollarSign,
    color: "text-green-500",
    bgColor: "bg-violet-500/10",
    href: "/promotions",
  },
  {
    label: "Cruise News",
    icon: Newspaper,
    color: "text-orange-500",
    bgColor: "bg-violet-500/10",
    href: "/news",
  },
  {
    label: "Specialty/Themed Cruises",
    icon: Newspaper,
    color: "text-pink-500",
    bgColor: "bg-violet-500/10",
    href: "/themes",
  },
  
];
export default function DashBoardPage() {
  const router = useRouter();
  return (
    <div>
      <div className="mb-8 space-y-4">
        <h2 className="text-2xl font-bold text-center mt-10 md:text-4xl">
          Let us help you find the perfect cruise!
        </h2>
        <Image src={LLVCard} alt="LLV Card" width={500} height={500} />
        <p className="text-sm font-light text-center text-muted-foreground md:text-lg">
          Here are some options to help you get started...
        </p>
      </div>
      <div className="px-4 space-y-4 md:px-20 lg:px-32 my-12">
        {tools.map((tool) => (
          <Card
            onClick={() => router.push(tool.href)}
            className="flex items-center justify-between p-4 transition cursor-pointer border-black/5 hover:shadow-md"
            key={tool.href}
          >
            <div className="flex items-center gap-x-4">
              <div className={cn("p-2 w-fit rounded-md", tool.bgColor)}>
                <tool.icon className={cn("w-8 h-8", tool.color)} />
              </div>
              <div className="font-semibold">{tool.label}</div>
              
            </div>
            <ArrowRight className="w-5 h-5" />
          </Card>
        ))}
      </div>
      <LogoStrip size={300}/>
    </div>
  );
}
