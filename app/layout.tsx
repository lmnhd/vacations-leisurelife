import "./globals.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { RootLayoutClient } from "./root-layout-client";
import { Dimmer, Loader } from "semantic-ui-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Leisure Life Interactive",
  description:
    "Leisure Life Interactive (a trade name of HALIMEDE LLC) builds interactive group cruise campaigns.",
  metadataBase: new URL("https://leisurelifeinteractive.net"),
  alternates: {
    canonical: "https://leisurelifeinteractive.net",
  },
  openGraph: {
    siteName: "Leisure Life Interactive",
    url: "https://leisurelifeinteractive.net",
    type: "website",
  },
  verification: {
    other: {
      "facebook-domain-verification": "vnj1bmos4yupq8j6qhl5dzenbm98uu",
    },
  },
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
