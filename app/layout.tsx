"use client";

import "./globals.css";

import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import Loading from "./(dashboard)/loading";

import { ModalProvider } from "@/components/modal-provider";
import { ToasterProvider } from "@/components/toaster-provider";
import { CrispProvider } from "@/components/crisp-provider";
import { BookingProvider } from "./contexts/BookingContext";
import { Dimmer, Loader } from "semantic-ui-react";
//import 'semantic-ui-css/semantic.min.css'

const inter = Inter({ subsets: ["latin"] });

// Note: Metadata is exported from this client component, which is allowed in Next.js for root layout
export const metadata = {
  title: "Leisure Life Vacations",
  description: "Your first stop on a fantastic voyage",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  
  return (
    <ClerkProvider>
      <html lang="en">
        <CrispProvider />
        <body className={inter.className}>
          <ModalProvider />
          <ToasterProvider />
          <BookingProvider>
            <Suspense fallback={<Loading />}>{children}</Suspense>
          </BookingProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
