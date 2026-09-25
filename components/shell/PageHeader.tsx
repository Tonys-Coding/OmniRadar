"use client";

import { Bell, CalendarClock, Eye, EyeOff, LogOut, Receipt, Search, Settings, Target, TriangleAlert, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { cx, Switch } from "@/components/ui";
import type { Alert } from "@/lib/alerts";
import { useApi } from "@/lib/client/api";
import { nameOf, useSettings } from "@/lib/client/settings";
import type { ItemsResponse } from "@/lib/client/types";
import { initials, timeAgo } from "@/lib/format";
import { signOut } from "./AppShell";

function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={cx("flex h-11 items-center gap-2.5 rounded-full bg-surface px-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/transactions?q=${encodeURIComponent(q.trim())}` : "/transactions");
      }}
    >
      <Search className="size-[18px] shrink-0 text-ink" strokeWidth={1.8} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search transactions"
        aria-label="Search transactions"
        className="w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-ink/70"
      />
    </form>
  );
}

const SEEN_KEY = "omniradar.seenAlerts";
function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

const ALERT_ICON = {
  connection: TriangleAlert,
  low_balance: Wallet,
  large_transaction: Receipt,
  bill_due: CalendarClock,
  budget: Target,
} as const;

function Notifications() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const { data } = useApi<{ alerts: Alert[] }>("/api/alerts", { refreshInterval: 5 * 60_000 });
  const alerts = data?.alerts ?? [];
  const unread = alerts.filter((a) => !seen.includes(a.id));

  // Seen ids are a per-browser convenience; read after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser storage
    setSeen(readSeen());
  }, []);

  function markAllRead() {
    const ids = alerts.map((a) => a.id);
    setSeen(ids);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
    } catch {
      // storage unavailable: unread dot just comes back next visit
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread.length ? ` (${unread.length} unread)` : ""}`}
        aria-expanded={open}
        className="relative grid size-11 place-items-center rounded-full bg-surface transition-colors hover:bg-line"
      >
        <Bell className="size-[19px]" strokeWidth={1.8} />
        {unread.length > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-brand-ink px-1 text-[10px] font-medium text-white ring-2 ring-canvas">
            {unread.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[340px] max-w-[calc(100vw-24px)] animate-fade-up rounded-3xl border border-line bg-canvas p-2 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <p className="text-sm font-medium">Notifications</p>
            {unread.length ? (
              <button onClick={markAllRead} className="text-xs text-muted hover:text-ink">
                Mark all read
              </button>
            ) : null}
          </div>
          {alerts.length === 0 ? <p className="px-3 py-5 text-sm text-muted">You&apos;re all caught up.</p> : null}
          <div className="max-h-[60dvh] overflow-y-auto">
            {alerts.map((a) => {
              const Icon = ALERT_ICON[a.kind];
              return (
                <Link key={a.id} href={a.href} onClick={close} className="flex items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-surface">
                  <span
                    className={cx(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                      a.severity === "critical" ? "bg-danger/10 text-danger" : a.severity === "warning" ? "bg-ink text-white" : "bg-brand-pale text-brand-deep",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      {a.title}
                      {!seen.includes(a.id) ? <span className="size-1.5 shrink-0 rounded-full bg-brand" /> : null}
                    </span>
                    <span className="block text-muted">{a.body}</span>
                  </span>
                </Link>
              );
            })}
          </div>
          <Link href="/settings#alerts" onClick={close} className="mt-1 block rounded-2xl px-3 py-2 text-center text-xs text-muted hover:bg-surface hover:text-ink">
            Alert settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function PrivacyToggle() {
  const { settings, update } = useSettings();
  const on = settings.privacy_mode;
  return (
    <button
      onClick={() => update({ privacy_mode: !on })}
      aria-label={on ? "Show amounts" : "Hide amounts"}
      aria-pressed={on}
      title={on ? "Privacy mode on: amounts hidden" : "Hide amounts"}
      className={cx("hidden size-11 place-items-center rounded-full transition-colors sm:grid", on ? "bg-ink text-white" : "bg-surface hover:bg-line")}
    >
      {on ? <EyeOff className="size-[19px]" strokeWidth={1.8} /> : <Eye className="size-[19px]" strokeWidth={1.8} />}
    </button>
  );
}

export function Avatar({ size = 44, className }: { size?: number; className?: string }) {
  const { profile } = useSettings();
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className={cx("grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-ink to-brand-deep font-medium text-white", className)}
    >
      {initials(nameOf(profile))}
    </span>
  );
}

/** Quick profile modal: who you are, privacy switch, link to full settings. */
function ProfileMenu() {
  const { profile, settings, update } = useSettings();
  const { data: items } = useApi<ItemsResponse>("/api/items");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const banks = items?.items ?? [];
  const lastSync = banks.map((i) => i.last_synced_at).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Profile" aria-expanded={open} aria-haspopup="dialog" className="rounded-full">
        <Avatar />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Profile"
          className="absolute right-0 z-50 mt-2 w-[320px] max-w-[calc(100vw-24px)] animate-fade-up overflow-hidden rounded-[28px] border border-line bg-canvas shadow-2xl shadow-black/15"
        >
          <div className="relative bg-ink p-5 text-white">
            <div className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-brand-bright/35 blur-3xl" />
            <button onClick={close} aria-label="Close" className="absolute top-3 right-3 grid size-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
              <X className="size-4" />
            </button>
            <div className="relative flex items-center gap-3.5">
              <Avatar size={52} />
              <div className="min-w-0">
                <p className="truncate text-lg font-medium">{nameOf(profile)}</p>
                <p className="truncate text-sm text-white/55">{profile.email}</p>
              </div>
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl bg-white/8 px-3 py-2">
                <p className="text-white/50">Banks</p>
                <p className="mt-0.5 text-sm font-medium">{banks.length} connected</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-3 py-2">
                <p className="text-white/50">Last sync</p>
                <p className="mt-0.5 text-sm font-medium">{timeAgo(lastSync)}</p>
              </div>
            </div>
          </div>
          <div className="p-2">
            <label className="flex cursor-pointer items-center justify-between rounded-2xl px-3 py-3 hover:bg-surface">
              <span className="flex items-center gap-3 text-sm">
                <EyeOff className="size-4 text-muted" /> Hide amounts
              </span>
              <Switch checked={settings.privacy_mode} onChange={(v) => update({ privacy_mode: v })} label="Hide amounts" />
            </label>
            <Link
              href="/settings"
              onClick={close}
              className="mt-1 flex h-12 items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-white hover:bg-ink-3"
            >
              <Settings className="size-4" /> Account settings
            </Link>
            <button
              onClick={() => signOut()}
              className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm text-muted hover:bg-surface hover:text-ink"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Page title row with global search, notifications, and the profile menu. */
export function PageHeader({
  title,
  subtitle,
  children,
  hideSearch,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  /** For pages with their own search box (Transactions). */
  hideSearch?: boolean;
}) {
  return (
    <header className="px-4 pt-[max(16px,env(safe-area-inset-top))] sm:px-6 lg:px-8 lg:pt-7">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <LogoMark className="size-9 text-logo-navy lg:hidden" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] leading-tight font-medium tracking-tight sm:text-[34px]">{title}</h1>
          {subtitle ? <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p> : null}
        </div>
        {hideSearch ? null : <SearchBox className="hidden w-72 md:flex xl:w-80" />}
        <PrivacyToggle />
        <Notifications />
        <ProfileMenu />
      </div>
      {hideSearch ? null : <SearchBox className="mt-4 md:hidden" />}
      {children}
    </header>
  );
}
