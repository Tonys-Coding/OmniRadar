"use client";

import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import { SettingsProvider, useSettings } from "@/lib/client/settings";
import type { Profile, Settings } from "@/lib/settings";
import { isActive, NAV, SETTINGS_NAV, SIDEBAR_COOKIE } from "./nav";

export async function signOut(scope: "local" | "global" = "local") {
  await api.post("/api/auth/logout", { scope }).catch(() => undefined);
  // Full reload on purpose: drops every cached response from the old session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}

function NavLink({
  href,
  label,
  icon: Icon,
  expanded,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  expanded: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={expanded ? undefined : label}
      aria-current={active ? "page" : undefined}
      title={expanded ? undefined : label}
      className={cx(
        "flex h-12 items-center rounded-full transition-colors",
        expanded ? "w-full gap-3 px-3.5" : "w-12 justify-center",
        active ? "bg-white text-ink" : "bg-ink-3 text-white/70 hover:bg-white/15 hover:text-white",
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.8} />
      {expanded ? <span className="truncate text-[15px] font-medium">{label}</span> : null}
    </Link>
  );
}

function Sidebar({ initialExpanded }: { initialExpanded: boolean }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(initialExpanded);
  const { profile } = useSettings();

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "expanded" : "collapsed"}; path=/; max-age=31536000; samesite=lax`;
  }

  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;
  return (
    <aside
      className={cx(
        "sticky top-3 hidden h-[calc(100dvh-24px)] shrink-0 flex-col py-5 transition-[width] duration-200 lg:flex",
        expanded ? "w-[232px] items-stretch px-3" : "w-[84px] items-center",
      )}
    >
      <div className={cx("flex items-center", expanded ? "justify-between pl-1" : "flex-col gap-4")}>
        <Link href="/" aria-label="OmniRadar home" className="flex items-center text-white">
          {expanded ? <Logo tone="dark" className="text-[21px]" /> : <LogoMark title={null} className="size-11" />}
        </Link>
        <button
          onClick={toggle}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={expanded}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="grid size-9 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ToggleIcon className="size-[18px]" strokeWidth={1.8} />
        </button>
      </div>

      <nav className="my-auto flex flex-col gap-3" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.href} {...item} expanded={expanded} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      <div className="flex flex-col gap-3">
        <NavLink {...SETTINGS_NAV} expanded={expanded} active={isActive(pathname, SETTINGS_NAV.href)} />
        <button
          onClick={() => signOut()}
          aria-label="Sign out"
          title={expanded ? undefined : "Sign out"}
          className={cx(
            "flex h-12 items-center rounded-full bg-ink-3 text-white/70 transition-colors hover:bg-white/15 hover:text-white",
            expanded ? "w-full gap-3 px-3.5" : "w-12 justify-center",
          )}
        >
          <LogOut className="size-5 shrink-0" strokeWidth={1.8} />
          {expanded ? (
            <span className="min-w-0 text-left">
              <span className="block text-[15px] font-medium">Sign out</span>
              <span className="block truncate text-xs text-white/40">{profile.email}</span>
            </span>
          ) : null}
        </button>
      </div>
    </aside>
  );
}

function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 flex justify-between rounded-full bg-ink/95 p-1.5 shadow-2xl shadow-black/30 backdrop-blur lg:hidden"
    >
      {NAV.map(({ href, short, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-medium transition-colors",
              active ? "bg-white text-ink" : "text-white/60",
            )}
          >
            <Icon className="size-[18px]" strokeWidth={1.9} />
            {short}
          </Link>
        );
      })}
    </nav>
  );
}

function Frame({ sidebarExpanded, children }: { sidebarExpanded: boolean; children: React.ReactNode }) {
  const { settings } = useSettings();
  return (
    <div className={cx("min-h-dvh bg-ink lg:flex lg:gap-1 lg:p-3 lg:pl-1", settings.privacy_mode && "privacy")}>
      <a
        href="#main"
        className="fixed top-3 left-3 z-[60] -translate-y-20 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-ink shadow-lg focus-visible:translate-y-0"
      >
        Skip to content
      </a>
      <Sidebar initialExpanded={sidebarExpanded} />
      <main id="main" tabIndex={-1} className="min-h-dvh outline-none min-w-0 flex-1 bg-canvas pb-28 lg:min-h-[calc(100dvh-24px)] lg:rounded-[var(--radius-canvas)] lg:pb-8">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}

export function AppShell({
  initial,
  sidebarExpanded,
  children,
}: {
  initial: { profile: Profile; settings: Settings };
  sidebarExpanded: boolean;
  children: React.ReactNode;
}) {
  return (
    <SettingsProvider initial={initial}>
      <Frame sidebarExpanded={sidebarExpanded}>{children}</Frame>
    </SettingsProvider>
  );
}
