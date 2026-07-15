export type NavItem = {
  label: string;
  href: string;
  /** Additional pathnames that keep this item highlighted. */
  match: string[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", match: ["/"] },
  { label: "Trade", href: "/buy", match: ["/buy", "/sell"] },
  { label: "Wallet", href: "/wallet", match: ["/wallet"] },
  { label: "Pool", href: "/pool", match: ["/pool"] },
  { label: "Learn", href: "/information", match: ["/information"] },
];

export function isNavActive(item: NavItem, pathname: string | null): boolean {
  return pathname != null && item.match.includes(pathname);
}
