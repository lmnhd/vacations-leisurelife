"use client";

import React from "react";
import { CreditCard, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import PreRegisterForm2 from "@/components/contactforms/preRegisterForm2";
import { Button } from "@/components/ui/button";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { monoton, orbitron, prompt } from "@/lib/fonts";
import Quicksignup from "@/components/contactforms/quicksignup";

export default function Contact() {
  const DialogClose = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Close>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
  >(({ className, ...props }, ref) => (
    <DialogPrimitive.Close ref={ref} {...props} />
  ));
  DialogClose.displayName = DialogPrimitive.Title.displayName;
  return (
    <div>
      <h1 className="mt-20 mb-20 text-5xl font-bold text-center text-pink-600">
        Contact us today,We&apos;ll make it happen!
      </h1>
      <div className="flex flex-wrap items-center justify-center">
        <div className="flex items-center">
          <Dialog modal>
            <DialogTrigger
              className={cn(
                "hover:bg-gradient-to-tr from-blue-500 via-sky-400-500 to-blue-400 text-3xl text-center rounded-xl p-12 h-52 border-black border-2 hover:text-yellow-400  mx-auto ",
                monoton.className
              )}
            >
              <PhoneCall className="inline-block w-20 h-24 mr-2" />
              Request Agent
            </DialogTrigger>
            <DialogContent size={"full"} className="w-[600px] bg-black">
              <Quicksignup />
            </DialogContent>
          </Dialog>
        </div>
        {/* <div className="flex items-center">
          <Dialog modal>
            <DialogTrigger
              className={cn(
                "hover:bg-gradient-to-tr from-blue-500 via-sky-400-500 to-blue-400 text-3xl text-center rounded-xl p-12 h-52 border-black border-2 hover:text-yellow-400  mx-auto ",
                monoton.className
              )}
            >
              <CreditCard className="inline-block w-20 h-24 mr-2" />
              Register Now
            </DialogTrigger>
            <DialogContent size={"extra-large"} className="bg-black ">
              <DialogClose asChild>
                        <Button className="top-0 mt-20 text-2xl text-white">EXIT</Button>
                      </DialogClose>
              <PreRegisterForm2
                closeButton={
                  <DialogClose asChild>
                    <Button className="top-0 w-full mb-2 text-xl text-white bg-slate-800">
                      EXIT
                    </Button>
                  </DialogClose>
                }
              />

              <DialogFooter>

              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div> */}
      </div>
    </div>
  );
}
