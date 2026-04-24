"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Zap,
  Lock,
  Square,
  Wallet,
  Globe,
  Percent,
  Coins,
  MessageSquareMore,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminWalletButton } from "@/components/admin-wallet-button";

const navItems = [
  {
    href: "/dashboard",
    label: "Event Log",
    icon: Zap,
    iconColor: "text-yellow-400",
  },
  {
    href: "/dashboard/mint-setup",
    label: "Mint Setup",
    icon: Coins,
    iconColor: "text-[#00FFB2]",
  },
  {
    href: "/dashboard/purchase-limits",
    label: "Purchase Limits",
    icon: Lock,
    iconColor: "text-orange-400",
  },
  {
    href: "/dashboard/claims",
    label: "Requests",
    icon: Square,
    iconColor: "text-neutral-400",
  },
  {
    href: "/dashboard/master-ops",
    label: "Master Ops",
    icon: Wallet,
    iconColor: "text-emerald-400",
  },
  {
    href: "/dashboard/geoblocking",
    label: "Geoblocking",
    icon: Globe,
    iconColor: "text-red-400",
  },
  {
    href: "/dashboard/support-requests",
    label: "Support",
    icon: MessageSquareMore,
    iconColor: "text-cyan-300",
  },
  {
    href: "/dashboard/fees",
    label: "Fees",
    icon: Percent,
    iconColor: "text-blue-400",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] min-h-screen bg-[#0d0d0d] border-r border-neutral-800/60 flex flex-col shrink-0">
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#00FFB2] flex items-center justify-center text-black font-bold text-xs">
            BC
          </div>
          <div>
            <div className="font-semibold text-sm text-white leading-tight">
              BunkerCash
            </div>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
              Admin
            </span>
          </div>
        </div>
      </div>

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

      <div className="px-4 pb-5">
        <AdminWalletButton
          style={{
            width: "100%",
            height: "38px",
            fontSize: "13px",
            fontWeight: 500,
            borderRadius: "8px",
            background: "transparent",
            border: "1px solid #27272a",
            color: "#d4d4d8",
            padding: "0 12px",
          }}
        />
      </div>
    </aside>
  );
}
