import Link from "next/link";
import { Disclaimer } from "@/components/design/Disclaimer";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Disclaimer />
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="font-mono text-[80px] font-bold leading-none text-mint max-[839px]:text-[56px]">
            404
          </span>
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <p className="max-w-sm text-[14px] leading-relaxed text-ink-3">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </p>
          <Link
            href="/"
            className="h-10 rounded-lg bg-mint-btn px-5 text-[13.5px] font-semibold leading-10 text-mint-ink no-underline transition-colors hover:bg-mint-btn-h"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
