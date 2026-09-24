import { ArrowLeftRight, CalendarClock, ChartPie, Landmark, LayoutGrid, Repeat, Settings } from "lucide-react";

export const NAV = [
  { href: "/", label: "Dashboard", short: "Home", icon: LayoutGrid },
  { href: "/transactions", label: "Transactions", short: "Activity", icon: ArrowLeftRight },
  { href: "/spending", label: "Spending", short: "Spending", icon: ChartPie },
  { href: "/subscriptions", label: "Subscriptions", short: "Subs", icon: Repeat },
  { href: "/bills", label: "Bills", short: "Bills", icon: CalendarClock },
  { href: "/accounts", label: "Accounts", short: "Accounts", icon: Landmark },
] as const;

export const SETTINGS_NAV = { href: "/settings", label: "Settings", icon: Settings } as const;

export const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Cookie holding the desktop sidebar state, read by the server layout (no flash). */
export const SIDEBAR_COOKIE = "omni_sidebar";
