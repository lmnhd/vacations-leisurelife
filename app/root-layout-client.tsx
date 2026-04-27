"use client";

import { Suspense, ReactNode } from "react";
import Loading from "./(dashboard)/loading";

import { ModalProvider } from "@/components/modal-provider";
import { ToasterProvider } from "@/components/toaster-provider";
import { CrispProvider } from "@/components/crisp-provider";
import { BookingProvider } from "./contexts/BookingContext";

export function RootLayoutClient({ children }: { children: ReactNode }) {
  return (
    <>
      <CrispProvider />
      <ModalProvider />
      <ToasterProvider />
      <BookingProvider>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </BookingProvider>
    </>
  );
}
