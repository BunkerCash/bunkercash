import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { AuthProvider } from "@/lib/auth";
import { SolanaProvider } from "@/providers/SolanaProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BunkerCash Admin",
  description: "Admin dashboard for BunkerCash",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <SolanaProvider>
          <AuthProvider>{children}</AuthProvider>
        </SolanaProvider>
      </body>
    </html>
  );
}
