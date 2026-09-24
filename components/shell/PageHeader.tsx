"use client";

import { Bell, CalendarClock, LogOut, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/client/api";
import type { BillsResponse, ItemsResponse } from "@/lib/client/types";
import { dueLabel, initials, money, tidyName } from "@/lib/format";
import { cx } from "@/components/ui";
import { signOut, useUser } from "./AppShell";
import { BrandMark } from "./BrandMark";

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside]);
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

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const { data: bills } = useApi<BillsResponse>("/api/bills?days=3");
  const { data: items } = useApi<ItemsResponse>("/api/items");
  const broken = items?.items.filter((i) => i.status !== "good") ?? [];
  const due = bills?.bills ?? [];
  const count = broken.length + due.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${count ? ` (${count})` : ""}`}
        aria-expanded={open}
        className="relative grid size-11 place-items-center rounded-full bg-surface transition-colors hover:bg-line"
      >
        <Bell className="size-[19px]" strokeWidth={1.8} />
        {count > 0 ? <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-brand ring-2 ring-surface" /> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-24px)] animate-fade-up rounded-3xl border border-line bg-canvas p-2 shadow-xl shadow-black/10">
          <p className="px-3 pt-2 pb-1 text-sm font-medium">Notifications</p>
          {count === 0 ? <p className="px-3 py-4 text-sm text-muted">You&apos;re all caught up.</p> : null}
          {broken.map((i) => (
            <Link
              key={i.id}
              href="/accounts"
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-surface"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              <span className="text-sm">
                <span className="font-medium">{i.institution_name ?? "A bank"}</span> needs to be reconnected
              </span>
            </Link>
          ))}
          {due.map((b) => (
            <Link
              key={b.id}
              href="/bills"
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-surface"
            >
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand" />
              <span className="flex-1 text-sm">
                <span className="font-medium">{tidyName(b.merchant_name ?? b.description)}</span>{" "}
                <span className="text-muted">{dueLabel(b.predicted_next_date!).toLowerCase()}</span>
              </span>
              <span className="text-sm font-medium tabular">{money(b.expected_amount)}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Avatar() {
  const { email } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-brand to-navy text-sm font-medium text-white"
      >
        {initials(email.split("@")[0] ?? "")}
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-64 animate-fade-up rounded-3xl border border-line bg-canvas p-2 shadow-xl shadow-black/10">
          <p className="truncate px-3 pt-2 pb-2 text-sm text-muted">{email}</p>
          <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm hover:bg-surface">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Page title row with global search, notifications, and account menu. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="px-4 pt-[max(16px,env(safe-area-inset-top))] sm:px-6 lg:px-8 lg:pt-7">
      <div className="flex items-center gap-3">
        <BrandMark className="size-9 lg:hidden" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] leading-tight font-medium tracking-tight sm:text-[34px]">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <SearchBox className="hidden w-80 md:flex" />
        <Notifications />
        <Avatar />
      </div>
      <SearchBox className="mt-4 md:hidden" />
      {children}
    </header>
  );
}
