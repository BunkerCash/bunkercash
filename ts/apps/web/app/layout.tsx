import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "../index.css";
import { Providers } from "./providers";

const generalSans = localFont({
  src: [
    { path: "../fonts/GeneralSans-Regular.woff2", weight: "400" },
    { path: "../fonts/GeneralSans-Medium.woff2", weight: "500" },
    { path: "../fonts/GeneralSans-Semibold.woff2", weight: "600" },
    { path: "../fonts/GeneralSans-Bold.woff2", weight: "700" },
  ],
  variable: "--font-general-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BunkerCash",
  description: "BunkerCash is an on-chain protocol on Solana.",
  icons: {
    icon: "/icon-favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${generalSans.variable} ${geistMono.variable} font-sans antialiased bg-canvas text-ink`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
