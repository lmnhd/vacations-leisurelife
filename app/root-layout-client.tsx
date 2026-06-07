"use client";

import { Suspense, ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import Loading from "./(dashboard)/loading";

import { ModalProvider } from "@/components/modal-provider";
import { ToasterProvider } from "@/components/toaster-provider";
import { BookingProvider } from "./contexts/BookingContext";

export function RootLayoutClient({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <ModalProvider />
      <ToasterProvider />
      <BookingProvider>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </BookingProvider>
    </ThemeProvider>
  );
}
