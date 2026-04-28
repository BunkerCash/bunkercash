import Link from "next/link";

export const Footer = () => {
  return (
    <footer className="border-t border-border/50 bg-background/50 mt-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground text-center md:text-left">
            This website is for informational purposes only.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/information"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/imprint"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Imprint
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
