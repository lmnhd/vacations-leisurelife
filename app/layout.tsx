import "./globals.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { RootLayoutClient } from "./root-layout-client";
import { Dimmer, Loader } from "semantic-ui-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Leisure Life Vacations",
  description: "Your first stop on a fantastic voyage",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
