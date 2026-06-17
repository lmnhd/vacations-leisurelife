"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Sidebar from "@/components/sidebar";

// NOTE: this component must render the SAME tree on server and client. A previous
// `if (!isMounted) return null` gate removed this whole subtree during SSR, which
// shifted every subsequent Radix useId() — causing the Dialog (Request Booking)
// aria-controls hydration mismatch in the navbar. Render unconditionally; the
// trigger is already md:hidden so it only shows on mobile.
const MobileSidebar = () => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant={"ghost"} size={"icon"} className="md:hidden">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <Sidebar apiLimitCount={0}/>
      </SheetContent>
    </Sheet>
  );
};

export default MobileSidebar;
