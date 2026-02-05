"use client";

import MobileSidebar from "./mobile-sidebar";
import { UserButton, clerkClient, useUser } from "@clerk/nextjs";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import ManualBooking from '@/app/Booking/ManualBooking'
import { Quicksand } from "next/font/google";
import Quicksignup from "./contactforms/quicksignup";

const Navbar = () => {
  const { user } = useUser();
  return (
    <div className="flex items-center p-4 bg-primary">
      <MobileSidebar />
      <div className="flex justify-between w-full">
        {user && (
          <div className="text-2xl border-primary-foreground  font-extralight  text-green-200">
            Hi {user.firstName} !
          </div>
        )}
        <div 
        className="flex items-end gap-8 justify-center shadow-sm "
        >
          <Dialog modal >
            <DialogTrigger className="bg-primary-foreground text-sm font-extralight p-1 hover:bg-pink-500 hover:text-white text-slate-700 overflow-auto">Request Booking</DialogTrigger>
            <DialogContent  
            size={"full"}
            color={"blue"}
            className="flex h-screen bg-primary/20 items-center justify-center "
            >
             
              <Quicksignup/>
            </DialogContent>
          </Dialog>

          {/* <Button className="bg-primary-foreground text-sm font-extralight p-1 hover:bg-pink-500 hover:text-white text-slate-700">
            Request Booking
          </Button> */}
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </div>
  );
};

export default Navbar;
