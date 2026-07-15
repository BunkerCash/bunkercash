import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Standard content column: max width, gutters and vertical rhythm. */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-6 pb-16 pt-8 max-[839px]:gap-4 max-[839px]:px-4 max-[839px]:pb-12 max-[839px]:pt-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
