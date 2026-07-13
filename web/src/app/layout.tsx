import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MegaJackpot — The $2.05B On-Chain Lottery",
  description:
    "The world's largest lottery. Deposit ETH, your win chance equals your exact share of the pool. Withdraw anytime before lock-in. Provably fair via Chainlink VRF.",
  openGraph: {
    title: "MegaJackpot — The $2.05B On-Chain Lottery",
    description:
      "One wallet wins $2.05 billion. Odds exactly proportional to your deposit, fully on-chain, withdraw anytime before lock-in.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MegaJackpot — The $2.05B On-Chain Lottery",
    description: "One wallet wins $2.05 billion. Provably fair, fully on-chain.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
