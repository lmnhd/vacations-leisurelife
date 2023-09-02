
import { User, getAuth } from "@clerk/nextjs/server";
import MobileSidebar from "./mobile-sidebar";
import { UserButton, clerkClient, currentUser } from "@clerk/nextjs";

const Navbar = async () => {
  const user: User | null = await currentUser();
  return (
    <div className="flex items-center p-4 bg-primary">
      <MobileSidebar />
      <div className="flex justify-between w-full">
        {user && <div
        className="text-lg font-semibold text-primary-foreground"
        >Hello { user.firstName}!</div>}
        <UserButton afterSignOutUrl="/"/>

        

      </div>
    </div>
  );
};

export default Navbar;
