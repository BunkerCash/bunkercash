import Link from "next/link";

export const Footer = () => {
  return (
    <footer className="flex-none border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3.5 px-6 pb-[84px] pt-[18px] desk:pb-[18px] max-[839px]:px-4">
        <span className="text-[12.5px] text-ink-3">
          BunkerCash — informational interface for the BunkerCash protocol on
          Solana.
        </span>
        <span className="flex gap-5 text-[12.5px]">
          <Link
            href="/information"
            className="text-ink-2 no-underline hover:text-ink hover:no-underline"
          >
            Terms
          </Link>
          <Link
            href="/imprint"
            className="text-ink-2 no-underline hover:text-ink hover:no-underline"
          >
            Imprint
          </Link>
          <Link
            href="/support"
            className="text-ink-2 no-underline hover:text-ink hover:no-underline"
          >
            Support
          </Link>
        </span>
      </div>
    </footer>
  );
};
