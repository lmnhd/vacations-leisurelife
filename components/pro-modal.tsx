"use client";
import {Music4, ImageIcon, Home, BadgeDollarSign, Newspaper,Search, PartyPopper, Check, Zap } from "lucide-react";
import { useProModal } from "@/app/hooks/use-pro-modal";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { useState } from "react";

const tools = [
    {
      label: "Conversation",
      icon: Home,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
     
    },
    {
      label: "Code",
      icon: Home,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      
    },
    {
      label: "Image",
      icon: ImageIcon,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      
    },
    {
      label: "Music",
      icon: Music4,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      
    },
    {
      label: "Promotions",
      icon: BadgeDollarSign,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
      
    },
    {
      label: "Cruise News",
      icon: Newspaper,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
      
    },
    {
      label: "Search Cruises",
      icon: Search,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
      
    },
  ];
  

export const ProModal = () => {
  const proModal = useProModal();
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={proModal.isOpen} onOpenChange={proModal.onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex justify-center items-center flex-col gap-y-4 pb-2">
            
            <div className="flex items-center gap-x-2 font-bold py-1">
            Upgrade to Pro
            <Badge variant="premium" className="uppercase text-sm py-1">
                PRO
            </Badge>
            </div>
           
          </DialogTitle>
          <DialogDescription className="text-center pt-2 space-y-2 text-zinc-900 font-medium">
            {tools.map((tool) => (
                <Card
                key={tool.label}
                className="p-3 border-black/5 flex items-center justify-between"
                >
                    <div className={cn("p-2 w-fit rounded-md", tool.bgColor)}>
                        <tool.icon className={cn("w-6 h-6", tool.color)}/>
                    </div>
                    <div className="font-semibold text-sm">
                        {tool.label}
                    </div>
                    <Check className="text-primary w-5 h-5"/>
                </Card>
            ))}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
            <Button
            size="lg"
            variant="premium"
            className="w-full"
            disabled={loading}
            >
                Upgrade
                <Zap className="w-4 h-4 ml-2 fill-white"/>
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
