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
        <div className="flex items-end gap-8 justify-center shadow-sm">
          <Dialog>
            <DialogTrigger className="bg-primary-foreground text-sm font-extralight p-1 hover:bg-pink-500 hover:text-white text-slate-700">Request Booking</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Are you sure absolutely sure?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. This will permanently delete
                  your account and remove your data from our servers.
                </DialogDescription>
              </DialogHeader>
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
