import { CalendarDays, ChefHat, CircleUser, House, PiggyBank, Refrigerator, ShoppingCart, Tag, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile tab bar. */
  shortLabel: string;
  icon: LucideIcon;
  /** Other paths that highlight this item. */
  also?: string[];
  /** Sidebar only — phones keep exactly five tabs (Profile moves to the top bar). */
  desktopOnly?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Home", shortLabel: "Home", icon: House },
  { href: "/kitchen", label: "My Kitchen", shortLabel: "Kitchen", icon: Refrigerator },
  { href: "/plan", label: "Meal Plan", shortLabel: "Plan", icon: CalendarDays, also: ["/recipes"] },
  { href: "/recipes", label: "Recipes", shortLabel: "Recipes", icon: ChefHat, desktopOnly: true },
  { href: "/specials", label: "Specials", shortLabel: "Specials", icon: Tag },
  { href: "/grocery", label: "Grocery List", shortLabel: "Grocery", icon: ShoppingCart, also: ["/savings", "/cart"] },
  { href: "/savings", label: "Savings", shortLabel: "Savings", icon: PiggyBank, desktopOnly: true },
  { href: "/profile", label: "Profile", shortLabel: "Profile", icon: CircleUser, desktopOnly: true },
];

function matches(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** On desktop each item matches its own path; on phones "Plan" also covers recipes. */
export function isActive(pathname: string, item: NavItem, surface: "desktop" | "mobile"): boolean {
  if (matches(pathname, item.href)) return true;
  return surface === "mobile" && (item.also ?? []).some((p) => matches(pathname, p));
}
