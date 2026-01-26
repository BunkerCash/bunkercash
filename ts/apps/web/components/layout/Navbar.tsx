"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [isConnected, setIsConnected] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-lg">B</span>
            </div>
            <span className="font-semibold text-foreground">Bunker Cash</span>
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
            <Button
              variant={isConnected ? "outline" : "default"}
              size="sm"
              onClick={() => setIsConnected(!isConnected)}
              className="hidden sm:flex"
            >
              <Wallet className="h-4 w-4 mr-2" />
              {isConnected ? "0x7a3...f92" : "Connect Wallet"}
            </Button>

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
              <Button
                variant={isConnected ? "outline" : "default"}
                size="sm"
                onClick={() => setIsConnected(!isConnected)}
                className="mx-4 mt-2 sm:hidden"
              >
                <Wallet className="h-4 w-4 mr-2" />
                {isConnected ? "0x7a3...f92" : "Connect Wallet"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
