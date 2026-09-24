"use client";

import { ArrowDownLeft, ArrowUpRight, Receipt, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { PageHeader } from "@/components/shell/PageHeader";
import { Sheet } from "@/components/Sheet";
import { TransactionRow } from "@/components/TransactionRow";
import { BigMoney, Button, cx, EmptyState, ErrorNote, Logo, Pill, Segmented, Skeleton } from "@/components/ui";
import { CATEGORY_LABEL, categoryLabel, detailedLabel } from "@/lib/categories-ui";
import { api, refreshAll, useApi } from "@/lib/client/api";
import type { AccountsResponse, Transaction, TransactionsResponse } from "@/lib/client/types";
import { money, relativeDay, tidyName } from "@/lib/format";

const PAGE = 50;
const RANGES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "all", label: "All" },
] as const;
type RangeValue = (typeof RANGES)[number]["value"];

const SPENDING_CATEGORIES = Object.keys(CATEGORY_LABEL).filter((c) => c !== "UNCATEGORIZED");

function localDate(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "h-10 appearance-none rounded-full py-0 pr-9 pl-4 text-sm font-medium outline-none",
          value ? "bg-ink text-white" : "bg-surface text-ink",
        )}
      >
        {children}
      </select>
      <span className={cx("pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs", value ? "text-white" : "text-muted")}>▾</span>
    </label>
  );
}

function TransactionDetail({ t, onClose }: { t: Transaction; onClose: () => void }) {
  const [notes, setNotes] = useState(t.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const name = tidyName(t.merchant_name ?? t.name);
  const incoming = t.amount < 0;

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/api/transactions/${t.id}`, { notes: notes.trim() || null });
      setSaved(true);
      await refreshAll();
    } finally {
      setSaving(false);
    }
  }

  const rows: [string, React.ReactNode][] = [
    ["Date", relativeDay(t.date)],
    ["Account", t.accounts ? `${t.accounts.name}${t.accounts.mask ? ` ••${t.accounts.mask}` : ""}` : "-"],
    ["Category", `${categoryLabel(t.category_primary)} · ${detailedLabel(t.category_primary, t.category_detailed)}`],
    ["Channel", t.payment_channel ? t.payment_channel.replace(/^\w/, (c) => c.toUpperCase()) : "-"],
    ["Status", t.pending ? "Pending" : "Posted"],
    ["Bank description", <span key="d" className="break-all">{t.name}</span>],
  ];

  return (
    <Sheet open onClose={onClose} title="Transaction">
      <div className="flex flex-col items-center text-center">
        <Logo src={t.logo_url} name={name} size={64} />
        <p className="mt-3 text-lg font-medium">{name}</p>
        <p className={cx("mt-1 text-[40px] leading-none font-medium tracking-tight tabular", incoming && "text-brand")}>
          {incoming ? "+" : "-"}
          {money(Math.abs(t.amount))}
        </p>
        {t.pending ? <Pill tone="light" className="mt-3">Pending</Pill> : null}
      </div>
      <dl className="mt-7 divide-y divide-line rounded-3xl bg-surface px-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-3 text-sm">
            <dt className="shrink-0 text-muted">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <label className="mt-6 block text-sm font-medium" htmlFor="notes">
        Notes
      </label>
      <textarea
        id="notes"
        value={notes}
        maxLength={500}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        placeholder="Add a note, e.g. split with roommate"
        className="mt-2 h-24 w-full resize-none rounded-3xl bg-surface p-4 text-sm outline-none ring-brand focus:ring-2"
      />
      <Button onClick={save} loading={saving} disabled={notes === (t.notes ?? "")} className="mt-3 w-full" size="lg">
        {saved ? "Saved" : "Save note"}
      </Button>
    </Sheet>
  );
}

function TransactionsView() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [accountId, setAccountId] = useState("");
  const [range, setRange] = useState<RangeValue>("90");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const { data: accounts } = useApi<AccountsResponse>("/api/accounts");

  // Follow ?q= when the header search is used while already on this page.
  const urlQ = params.get("q") ?? "";
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    setQ(urlQ);
    setQuery(urlQ);
  }

  const baseQuery = useMemo(() => {
    const sp = new URLSearchParams({ limit: String(PAGE) });
    if (query) sp.set("q", query);
    if (direction !== "all") sp.set("direction", direction);
    if (category) sp.set("category", category);
    if (accountId) sp.set("account_id", accountId);
    if (range !== "all") sp.set("start", localDate(Number(range) - 1));
    return sp.toString();
  }, [query, direction, category, accountId, range]);

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<TransactionsResponse>(
    (index, prev) => (prev && !prev.has_more ? null : `/api/transactions?${baseQuery}&offset=${index * PAGE}`),
    (key: string) => api.get<TransactionsResponse>(key),
    { revalidateFirstPage: false },
  );

  const transactions = useMemo(() => data?.flatMap((p) => p.transactions) ?? [], [data]);
  const total = data?.[0]?.total ?? 0;
  const hasMore = data?.[data.length - 1]?.has_more ?? false;

  // Group by day with a net total per day.
  const groups = useMemo(() => {
    const out: { date: string; items: Transaction[]; net: number }[] = [];
    for (const t of transactions) {
      const last = out[out.length - 1];
      if (last && last.date === t.date) {
        last.items.push(t);
        last.net += -t.amount;
      } else out.push({ date: t.date, items: [t], net: -t.amount });
    }
    return out;
  }, [transactions]);

  // Infinite scroll.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && hasMore && !isValidating) setSize((s) => s + 1);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, isValidating, setSize]);

  const filtered = Boolean(query || category || accountId || direction !== "all");
  const pageIn = transactions.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const pageOut = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  function clearFilters() {
    setQ("");
    setQuery("");
    setDirection("all");
    setCategory("");
    setAccountId("");
    router.replace("/transactions");
  }

  return (
    <>
      <PageHeader hideSearch title="Transactions" subtitle={data ? `${total.toLocaleString()} transactions` : "Loading…"} />

      <div className="mt-5 max-w-5xl px-4 sm:px-6 lg:mt-7 lg:px-8">
        {/* Filters */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            className="flex h-11 items-center gap-2 rounded-full bg-surface px-4 lg:w-80 lg:shrink-0"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q.trim());
            }}
          >
            <Search className="size-4 shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => setQuery(q.trim())}
              placeholder="Search merchant or description"
              aria-label="Search transactions"
              className="w-full min-w-0 bg-transparent text-sm outline-none"
            />
            {q ? (
              <button type="button" aria-label="Clear search" onClick={() => (setQ(""), setQuery(""))}>
                <X className="size-4 text-muted" />
              </button>
            ) : null}
          </form>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <Segmented
              options={[
                { value: "all", label: "All" },
                { value: "out", label: "Money out" },
                { value: "in", label: "Money in" },
              ]}
              value={direction}
              onChange={setDirection}
            />
            <Select label="Category" value={category} onChange={setCategory}>
              <option value="">All categories</option>
              {SPENDING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
            <Select label="Account" value={accountId} onChange={setAccountId}>
              <option value="">All accounts</option>
              {accounts?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.mask ? ` ••${a.mask}` : ""}
                </option>
              ))}
            </Select>
            <Select label="Date range" value={range} onChange={(v) => setRange(v as RangeValue)}>
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            {filtered ? (
              <Button variant="ghost" onClick={clearFilters} className="shrink-0">
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {/* Loaded totals */}
        {transactions.length ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-3xl bg-surface p-4">
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <ArrowDownLeft className="size-4 text-brand" /> Money in
              </p>
              <BigMoney value={pageIn} className="mt-1 block text-2xl" />
            </div>
            <div className="rounded-3xl bg-surface p-4">
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <ArrowUpRight className="size-4" /> Money out
              </p>
              <BigMoney value={pageOut} className="mt-1 block text-2xl" />
            </div>
            {hasMore ? <p className="col-span-2 -mt-1 text-xs text-faint">Totals for the {transactions.length} transactions loaded so far</p> : null}
          </div>
        ) : null}

        {error ? (
          <div className="mt-6">
            <ErrorNote error={error} onRetry={() => mutate()} />
          </div>
        ) : null}

        {/* List */}
        <div className="mt-6 flex flex-col gap-6">
          {isLoading && !data ? (
            Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)
          ) : groups.length === 0 ? (
            <EmptyState icon={<Receipt />} title={filtered ? "No transactions match these filters" : "No transactions yet"}>
              {filtered ? (
                <button onClick={clearFilters} className="text-brand underline-offset-2 hover:underline">
                  Clear filters
                </button>
              ) : (
                "Connect a bank on the Accounts page to import your history."
              )}
            </EmptyState>
          ) : (
            groups.map((g) => (
              <section key={g.date} aria-label={relativeDay(g.date)}>
                <h3 className="sticky top-0 z-10 -mx-1 flex justify-between bg-canvas/95 px-1 py-2 text-sm backdrop-blur">
                  <span className="font-medium">{relativeDay(g.date)}</span>
                  <span className={cx("tabular", g.net > 0 ? "text-brand" : "text-muted")}>
                    {g.net > 0 ? "+" : "-"}
                    {money(Math.abs(g.net))}
                  </span>
                </h3>
                <div className="flex flex-col">
                  {g.items.map((t) => (
                    <TransactionRow key={t.id} t={t} showDate={false} onClick={() => setSelected(t)} />
                  ))}
                </div>
              </section>
            ))
          )}
          <div ref={sentinel} />
          {hasMore ? (
            <Button variant="secondary" onClick={() => setSize(size + 1)} loading={isValidating} className="self-center">
              Load more
            </Button>
          ) : null}
        </div>
      </div>

      {selected ? <TransactionDetail key={selected.id} t={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsView />
    </Suspense>
  );
}
