
import { Montserrat } from "next/font/google";
import MobileSidebar from "./mobile-sidebar";
import { Button } from "./ui/button";
import logo from '@/public/llv logo_color_sept23-3.png'
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import ManualBooking from '@/app/Booking/ManualBooking'
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

const font = Montserrat({ weight: "600", subsets: ["latin"] });

const ContactNav = () => {
  return (
    <div className="flex items-center p-4 bg-primary">
      <MobileSidebar />
      <div className="flex justify-between w-full">
        <Link href="/" className="flex items-center">
          <div className="relative flex flex-col items-center justify-center h-20 mr-4 w-52 ">
            <Image alt="Logo" src={logo} />
            <h1 className={cn("text-sm font-extralight text-primary hidden md:block -mt-7 font-sans", font.className)}>
              LET US MAKE IT HAPPEN!
            </h1>
          </div>
        </Link>
        <div>
          <Link href="/dashboard">
            <Button variant="outline" className="rounded-full">
              EXPLORE!
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ContactNav;
