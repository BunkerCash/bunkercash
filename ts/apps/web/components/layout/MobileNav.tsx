"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavActive } from "./nav";

/** Fixed bottom navigation for small screens. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-[65] grid grid-cols-5 border-t border-line bg-surface px-2 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 desk:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-[3px] rounded-lg no-underline transition-colors hover:no-underline",
              active ? "text-ink" : "text-ink-3",
            )}
          >
            <span
              className={cn(
                "h-[2.5px] w-4 rounded-sm bg-mint transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <span className="text-[11px] font-semibold">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
