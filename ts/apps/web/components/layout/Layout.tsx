import { ReactNode } from "react";
import { EnvNotice } from "./EnvNotice";
import { SiteHeader } from "./SiteHeader";
import { StatusRail } from "./StatusRail";
import { MobileNav } from "./MobileNav";
import { Footer } from "./Footer";
import { ConnectWalletModal } from "@/components/wallet/ConnectWalletModal";
import { Disclaimer } from "@/components/design/Disclaimer";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="flex min-h-screen flex-col text-[14.5px] leading-normal">
      <Disclaimer />
      <EnvNotice />
      <div className="sticky top-0 z-[60] flex-none">
        <SiteHeader />
        <StatusRail />
      </div>
      <main className="flex-1 animate-fade-in">{children}</main>
      <Footer />
      <MobileNav />
      <ConnectWalletModal />
    </div>
  );
};
