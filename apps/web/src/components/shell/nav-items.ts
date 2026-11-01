import { CalendarDays, CircleUser, House, Refrigerator, ShoppingCart, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile tab bar. */
  shortLabel: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Home", shortLabel: "Home", icon: House },
  { href: "/kitchen", label: "My Kitchen", shortLabel: "Kitchen", icon: Refrigerator },
  { href: "/plan", label: "Meal Plan", shortLabel: "Plan", icon: CalendarDays },
  { href: "/grocery", label: "Grocery List", shortLabel: "Grocery", icon: ShoppingCart },
  { href: "/profile", label: "Profile", shortLabel: "Profile", icon: CircleUser },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
