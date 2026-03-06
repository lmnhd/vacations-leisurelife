"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Suspense, ReactNode, useEffect, useState } from "react";
import Loading from "./(dashboard)/loading";

import { ModalProvider } from "@/components/modal-provider";
import { ToasterProvider } from "@/components/toaster-provider";
import { CrispProvider } from "@/components/crisp-provider";
import { BookingProvider } from "./contexts/BookingContext";

export function RootLayoutClient({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [shouldMountAppProviders, setShouldMountAppProviders] = useState(false);

  useEffect(() => {
    const isTestRoute = pathname === "/tests" || pathname.startsWith("/tests/");
    setShouldMountAppProviders(!isTestRoute);
  }, [pathname]);

  if (!shouldMountAppProviders) {
    return (
      <Suspense fallback={<Loading />}>{children}</Suspense>
    );
  }

  return (
    <ClerkProvider>
      <CrispProvider />
      <ModalProvider />
      <ToasterProvider />
      <BookingProvider>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </BookingProvider>
    </ClerkProvider>
  );
}
