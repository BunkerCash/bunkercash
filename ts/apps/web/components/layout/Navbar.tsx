"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useWallet } from "@solana/wallet-adapter-react";
import WalletButton from "@/components/wallet/WalletButton";

import { cn } from "@/lib/utils";

const navItems = [
  { label: "Buy Token", path: "/" },
  { label: "Sell Registration", path: "/sell" },
  { label: "Pool Status", path: "/pool" },
  { label: "My Position", path: "/position" },
  { label: "Information", path: "/information" },
];

export const Navbar = () => {
  const pathname = usePathname();
  const { connected } = useWallet();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-lg">B</span>
            </div> */}
            <Image
              src="/logo.svg"
              alt="BunkerCash"
              width={120}
              height={32}
              className="h-8 w-auto"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "nav-link",
                  pathname === item.path && "nav-link-active",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Wallet Button */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex">
              <WalletButton />
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2 text-muted-foreground hover:text-foreground"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-border/50">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "px-4 py-2 rounded-lg transition-colors",
                    pathname === item.path
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <div className="mx-4 mt-2 sm:hidden">
                <WalletButton />
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
