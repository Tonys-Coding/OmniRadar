"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";
import { api } from "@/lib/client/api";
import { cx } from "@/components/ui";
import { BrandMark } from "./BrandMark";
import { isActive, NAV } from "./nav";

const UserContext = createContext<{ email: string }>({ email: "" });
export const useUser = () => useContext(UserContext);

export async function signOut() {
  await api.post("/api/auth/logout").catch(() => undefined);
  // Full reload on purpose: drops every cached response from the old session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}

function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-3 hidden h-[calc(100dvh-24px)] w-[84px] shrink-0 flex-col items-center py-5 lg:flex">
      <Link href="/" aria-label="OmniRadar home">
        <BrandMark className="size-12" />
      </Link>
      <nav className="mt-auto mb-auto flex flex-col gap-3" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              title={label}
              className={cx(
                "grid size-12 place-items-center rounded-full transition-colors",
                active ? "bg-white text-ink" : "bg-ink-3 text-white/70 hover:bg-white/15 hover:text-white",
              )}
            >
              <Icon className="size-5" strokeWidth={1.8} />
            </Link>
          );
        })}
      </nav>
      <button
        onClick={signOut}
        aria-label="Sign out"
        title="Sign out"
        className="grid size-12 place-items-center rounded-full bg-ink-3 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
      >
        <LogOut className="size-5" strokeWidth={1.8} />
      </button>
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

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <UserContext.Provider value={{ email }}>
      <div className="min-h-dvh bg-ink lg:flex lg:gap-1 lg:p-3 lg:pl-1">
        <Sidebar />
        <main className="min-h-dvh min-w-0 flex-1 bg-canvas pb-28 lg:min-h-[calc(100dvh-24px)] lg:rounded-[var(--radius-canvas)] lg:pb-8">
          {children}
        </main>
        <MobileNav />
      </div>
    </UserContext.Provider>
  );
}
