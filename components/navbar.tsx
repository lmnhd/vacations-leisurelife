import { User, getAuth } from "@clerk/nextjs/server";
import MobileSidebar from "./mobile-sidebar";
import { UserButton, clerkClient, currentUser } from "@clerk/nextjs";
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

const Navbar = async () => {
  const user: User | null = await currentUser();
  return (
    <div className="flex items-center p-4 bg-primary">
      <MobileSidebar />
      <div className="flex justify-between w-full">
        {user && (
          <div className="text-2xl border-primary-foreground  font-extralight  text-green-200">
            Hi {user.firstName} !
          </div>
        )}
        <div className="flex items-end gap-8 justify-center shadow-sm ">
          <Dialog modal  >
            <DialogTrigger className="bg-primary-foreground text-sm font-extralight p-1 hover:bg-pink-500 hover:text-white text-slate-700 overflow-auto">Request Booking</DialogTrigger>
            <DialogContent  className="h-screen w-[600px] max-w-[1200px] overflow-auto">
              <DialogHeader>
                <DialogTitle>Booking Information</DialogTitle>
                <DialogDescription>
                  Please provide us with your booking information and we will get back to you as soon as possible.
                </DialogDescription>
                
              </DialogHeader>
              <ManualBooking />
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
