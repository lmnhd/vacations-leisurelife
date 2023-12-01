
import { User, getAuth } from "@clerk/nextjs/server";
import { Montserrat } from "next/font/google";
import MobileSidebar from "./mobile-sidebar";

import { UserButton, clerkClient, currentUser, auth } from "@clerk/nextjs";
import { Button } from "./ui/button";
import logo from '@/public/llv logo_color_sept23-3.png'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import ManualBooking from '@/app/Booking/ManualBooking'
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

const font = Montserrat({ weight: "600", subsets: ["latin"] });
const ContactNav = async () => {
  const user = await currentUser();
  const Auth = auth();
  return (
    <div className="flex items-center p-4 bg-primary">
      <MobileSidebar />
      <div className="flex justify-between w-full">
      <Link href="/" className="flex items-center">
          <div className="relative flex flex-col items-center justify-center h-20 mr-4 w-52 ">
            <Image  alt="Logo" src={logo} />
            <h1 className={cn("text-sm font-extralight text-primary hidden md:block -mt-7 font-sans", font.className)}>
            LET US MAKE IT HAPPEN!
          </h1>
          </div>
          
      </Link>
        <div>
          {user ? (
            <div className="text-2xl text-green-200 border-primary-foreground font-extralight">
              Hi {user.firstName} !
            </div>
          ) : <Link href={Auth.user?.firstName ? "/dashboard" : "/"}>
          <Button variant="outline" className="rounded-full">
              EXPLORE!
          </Button>
      </Link>}
          <div className="flex items-end justify-center gap-8 shadow-sm ">
          
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactNav;
