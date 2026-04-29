import { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed top-0 left-0 right-0 z-[60] flex h-8 items-center justify-center gap-2 border-b border-yellow-500/30 bg-yellow-500/10 px-3 text-center text-[11px] font-medium uppercase tracking-wider text-yellow-300 backdrop-blur-md sm:text-xs">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
        Devnet · early testing only
      </div>
      <Navbar />
      <main className="flex-1 pt-24">{children}</main>
      <Footer />
    </div>
  );
};
