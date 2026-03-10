"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, Lock, Square, Wallet, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const navItems = [
  {
    href: "/dashboard",
    label: "Event Log",
    icon: Zap,
    iconColor: "text-yellow-400",
  },
  {
    href: "/dashboard/purchase-limits",
    label: "Purchase Limits",
    icon: Lock,
    iconColor: "text-orange-400",
  },
  {
    href: "/dashboard/claims",
    label: "Claims",
    icon: Square,
    iconColor: "text-neutral-400",
  },
  {
    href: "/dashboard/settlement",
    label: "Settlement",
    icon: CalendarCheck,
    iconColor: "text-blue-400",
  },
  {
    href: "/dashboard/master-ops",
    label: "Master Ops",
    icon: Wallet,
    iconColor: "text-emerald-400",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] min-h-screen bg-[#0d0d0d] border-r border-neutral-800/60 flex flex-col shrink-0">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#00FFB2] flex items-center justify-center text-black font-bold text-xs">
            BC
          </div>
          <div>
            <div className="font-semibold text-sm text-white leading-tight">
              Bunker Cash
            </div>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
              Admin
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-neutral-800/50 text-white"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800/30"
              )}
            >
              <item.icon
                className={cn("w-4 h-4", item.iconColor)}
                strokeWidth={2}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-4 pb-5">
        <WalletMultiButton
          style={{
            width: "100%",
            height: "38px",
            fontSize: "13px",
            fontWeight: 500,
            borderRadius: "8px",
            background: "transparent",
            border: "1px solid #27272a",
            color: "#d4d4d8",
            justifyContent: "center",
            padding: "0 12px",
          }}
        />
      </div>
    </aside>
  );
}
