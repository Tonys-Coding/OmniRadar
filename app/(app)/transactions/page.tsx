"use client";

import { ArrowDownLeft, ArrowUpRight, Download, Receipt, Scale, Search, TrendingUp, X } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { PageHeader } from "@/components/shell/PageHeader";
import { TransactionColumns, TransactionLine, type RowFilterActions } from "@/components/TransactionLine";
import { BigMoney, Button, cx, EmptyState, ErrorNote, Segmented, SelectPill, Skeleton } from "@/components/ui";
import { CATEGORY_LABEL } from "@/lib/categories-ui";
import { api, useApi } from "@/lib/client/api";
import { useQueryState } from "@/lib/client/hooks";
import type { AccountsResponse, Transaction, TransactionsResponse } from "@/lib/client/types";
import { money, plural, relativeDay, shortDate } from "@/lib/format";

const PAGE = 50;

const RANGES = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "365", label: "Last year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom dates" },
] as const;
type RangeValue = (typeof RANGES)[number]["value"];

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "largest_out", label: "Biggest charges" },
  { value: "largest_in", label: "Biggest deposits" },
] as const;
type SortValue = (typeof SORTS)[number]["value"];

const STATUSES = ["", "pending", "posted"] as const;
type StatusValue = (typeof STATUSES)[number];
const CHANNELS = ["", "online", "in store", "other"] as const;
type ChannelValue = (typeof CHANNELS)[number];

const SPENDING_CATEGORIES = Object.keys(CATEGORY_LABEL).filter((c) => c !== "UNCATEGORIZED");
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isAmount = (v: string) => /^\d+(\.\d{1,2})?$/.test(v);

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Start and end dates (inclusive, viewer's local calendar) for a range choice. */
function rangeDates(range: RangeValue, from: string, to: string): { start?: string; end?: string } {
  const now = new Date();
  switch (range) {
    case "30":
    case "90":
    case "365": {
      const d = new Date(now);
      d.setDate(d.getDate() - (Number(range) - 1));
      return { start: iso(d) };
    }
    case "month":
      return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)) };
    case "last-month":
      return { start: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), end: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "custom":
      return { start: from || undefined, end: to || undefined };
    default:
      return {};
  }
}

/** Min/max amount inputs; applied on Enter or when focus leaves. */
function AmountRange({ min, max, onApply }: { min: string; max: string; onApply: (min: string, max: string) => void }) {
  const [lo, setLo] = useState(min);
  const [hi, setHi] = useState(max);
  const [prev, setPrev] = useState(`${min}|${max}`);
  if (`${min}|${max}` !== prev) {
    setPrev(`${min}|${max}`);
    setLo(min);
    setHi(max);
  }
  const clean = (v: string) => (isAmount(v.trim()) ? v.trim() : "");
  const apply = () => onApply(clean(lo), clean(hi));
  const on = Boolean(min || max);
  const input = "w-16 bg-transparent text-sm tabular outline-none placeholder:text-faint";
  return (
    <form
      className={cx("flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm ring-brand focus-within:ring-2", on ? "bg-brand-pale text-brand-deep" : "bg-surface")}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && apply()}
    >
      <span className="font-medium">$</span>
      <input inputMode="decimal" value={lo} onChange={(e) => setLo(e.target.value)} placeholder="Min" aria-label="Minimum amount" className={input} />
      <span aria-hidden="true" className="text-faint">
        –
      </span>
      <input inputMode="decimal" value={hi} onChange={(e) => setHi(e.target.value)} placeholder="Max" aria-label="Maximum amount" className={input} />
      <button type="submit" className="sr-only">
        Apply amount range
      </button>
    </form>
  );
}

function Stat({ icon, label, children, sub }: { icon: React.ReactNode; label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-3xl bg-surface p-4">
      <p className="flex items-center gap-1.5 text-sm text-muted [&>svg]:size-4">
        {icon} {label}
      </p>
      <div className="mt-1 min-w-0">{children}</div>
      {sub ? <p className="mt-0.5 truncate text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function TransactionsView() {
  // Every filter lives in the URL, so a filtered view can be reloaded or linked.
  const [query, setQuery] = useQueryState<string>("q", "");
  const [direction, setDirection] = useQueryState<"all" | "in" | "out">("direction", "all", ["all", "in", "out"]);
  const [category, setCategory] = useQueryState<string>("category", "", (v) => /^[A-Z_]+$/.test(v));
  const [accountId, setAccountId] = useQueryState<string>("account", "");
  const [range, setRange] = useQueryState<RangeValue>("range", "90", RANGES.map((r) => r.value));
  const [from, setFrom] = useQueryState<string>("from", "", isDay);
  const [to, setTo] = useQueryState<string>("to", "", isDay);
  const [status, setStatus] = useQueryState<StatusValue>("status", "", STATUSES);
  const [channel, setChannel] = useQueryState<ChannelValue>("channel", "", CHANNELS);
  const [min, setMin] = useQueryState<string>("min", "", isAmount);
  const [max, setMax] = useQueryState<string>("max", "", isAmount);
  const [sort, setSort] = useQueryState<SortValue>("sort", "newest", SORTS.map((s) => s.value));
  const [q, setQ] = useState<string>(query);
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: accounts } = useApi<AccountsResponse>("/api/accounts");

  // Follow ?q= when the header search (or a row's merchant) changes it.
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setQ(query);
  }

  // "/" jumps to search, like most list apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /** Filter params shared by the list and the CSV export. */
  const filterParams = useMemo(() => {
    const sp = new URLSearchParams();
    const { start, end } = rangeDates(range, from, to);
    if (query) sp.set("q", query);
    if (direction !== "all") sp.set("direction", direction);
    if (category) sp.set("category", category);
    if (accountId) sp.set("account_id", accountId);
    if (start) sp.set("start", start);
    if (end) sp.set("end", end);
    if (status) sp.set("pending", String(status === "pending"));
    if (channel) sp.set("channel", channel);
    if (min) sp.set("min_amount", min);
    if (max) sp.set("max_amount", max);
    if (sort !== "newest") sp.set("sort", sort);
    return sp.toString();
  }, [query, direction, category, accountId, range, from, to, status, channel, min, max, sort]);

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<TransactionsResponse>(
    (index, prev) => (prev && !prev.has_more ? null : `/api/transactions?limit=${PAGE}&offset=${index * PAGE}${filterParams ? `&${filterParams}` : ""}`),
    (key: string) => api.get<TransactionsResponse>(key),
    { revalidateFirstPage: false },
  );

  const transactions = useMemo(() => data?.flatMap((p) => p.transactions) ?? [], [data]);
  const total = data?.[0]?.total ?? 0;
  const summary = data?.[0]?.summary;
  const hasMore = data?.[data.length - 1]?.has_more ?? false;
  const byDate = sort === "newest" || sort === "oldest";

  // Group by day (date sorts only) with a count and net total per day.
  const groups = useMemo(() => {
    if (!byDate) return [{ date: "", items: transactions, net: 0 }];
    const out: { date: string; items: Transaction[]; net: number }[] = [];
    for (const t of transactions) {
      const last = out[out.length - 1];
      if (last && last.date === t.date) {
        last.items.push(t);
        last.net += -t.amount;
      } else out.push({ date: t.date, items: [t], net: -t.amount });
    }
    return out;
  }, [transactions, byDate]);

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

  const activeFilters = [query, direction !== "all", category, accountId, range !== "90", status, channel, min || max].filter(Boolean).length;

  function clearFilters() {
    setQ("");
    window.history.replaceState(null, "", "/transactions");
  }

  const actions: RowFilterActions = {
    onMerchant: (name) => {
      setQ(name);
      setQuery(name);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onCategory: setCategory,
    onAccount: setAccountId,
  };

  const spanLabel = summary?.first_date && summary.last_date ? `${shortDate(summary.first_date)} – ${shortDate(summary.last_date)}` : null;

  return (
    <>
      <PageHeader hideSearch title="Transactions" subtitle={data ? plural(total, "transaction") : "Loading…"} />

      <div className="mt-5 max-w-[1600px] px-4 sm:px-6 lg:mt-7 lg:px-8">
        {/* Search, direction, sort, export */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            role="search"
            className="flex h-11 items-center gap-2 rounded-full bg-surface px-4 ring-brand focus-within:ring-2 lg:w-[26rem] lg:shrink-0"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q.trim());
            }}
          >
            <Search className="size-4 shrink-0 text-muted" />
            <input
              ref={searchRef}
              type="search"
              name="q"
              autoComplete="off"
              spellCheck={false}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => setQuery(q.trim())}
              placeholder="Search merchant, description, or notes…"
              aria-label="Search transactions"
              aria-keyshortcuts="/"
              className="w-full min-w-0 bg-transparent text-sm outline-none"
            />
            {q ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => (setQ(""), setQuery(""))}
                className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-line hover:text-ink"
              >
                <X className="size-4" />
              </button>
            ) : (
              <kbd className="hidden shrink-0 rounded-md border border-line bg-canvas px-1.5 text-xs text-muted lg:block">/</kbd>
            )}
          </form>
          <div className="flex flex-wrap items-center gap-2 lg:flex-1">
            <Segmented
              label="Money direction"
              options={[
                { value: "all", label: "All" },
                { value: "out", label: "Money out" },
                { value: "in", label: "Money in" },
              ]}
              value={direction}
              onChange={setDirection}
            />
            <SelectPill label="Sort" value={sort} active={sort !== "newest"} onChange={(v) => setSort(v as SortValue)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </SelectPill>
            <a
              href={`/api/export/transactions${filterParams ? `?${filterParams}` : ""}`}
              download
              className="ml-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-medium hover:bg-line"
            >
              <Download className="size-4" /> Export CSV
            </a>
          </div>
        </div>

        {/* Filters */}
        <div className="no-scrollbar -mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
          <SelectPill label="Category" value={category} onChange={setCategory}>
            <option value="">All categories</option>
            {SPENDING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </SelectPill>
          <SelectPill label="Account" value={accountId} onChange={setAccountId}>
            <option value="">All accounts</option>
            {accounts?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.mask ? ` ••${a.mask}` : ""}
              </option>
            ))}
          </SelectPill>
          <SelectPill label="Date range" value={range} active={range !== "90"} onChange={(v) => setRange(v as RangeValue)}>
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </SelectPill>
          {range === "custom" ? (
            <div className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-surface px-4 text-sm">
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="bg-transparent outline-none" />
              <span aria-hidden="true" className="text-faint">
                –
              </span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="bg-transparent outline-none" />
            </div>
          ) : null}
          <SelectPill label="Status" value={status} onChange={(v) => setStatus(v as StatusValue)}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="posted">Posted</option>
          </SelectPill>
          <SelectPill label="Channel" value={channel} onChange={(v) => setChannel(v as ChannelValue)}>
            <option value="">Any channel</option>
            <option value="online">Online</option>
            <option value="in store">In store</option>
            <option value="other">Other</option>
          </SelectPill>
          <AmountRange
            min={min}
            max={max}
            onApply={(lo, hi) => {
              setMin(lo);
              setMax(hi);
            }}
          />
          {activeFilters ? (
            <Button variant="ghost" onClick={clearFilters} className="shrink-0">
              <X /> Clear {plural(activeFilters, "filter")}
            </Button>
          ) : null}
        </div>

        {/* Totals over every matching transaction */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summary ? (
            <>
              <Stat icon={<ArrowDownLeft className="text-brand-ink" />} label="Money in" sub={plural(summary.count_in, "deposit")}>
                <BigMoney value={summary.money_in} className="block text-2xl" />
              </Stat>
              <Stat icon={<ArrowUpRight />} label="Money out" sub={plural(summary.count_out, "charge")}>
                <BigMoney value={summary.money_out} className="block text-2xl" />
              </Stat>
              <Stat icon={<Scale />} label="Net" sub={spanLabel ?? "No transactions"}>
                <span className={cx("flex items-baseline text-2xl", summary.net > 0 && "text-brand-ink")}>
                  <span className="font-medium tabular">{summary.net > 0 ? "+" : summary.net < 0 ? "-" : ""}</span>
                  <BigMoney value={Math.abs(summary.net)} />
                </span>
              </Stat>
              <Stat
                icon={<TrendingUp />}
                label="Largest charge"
                sub={summary.largest_out ? `${summary.largest_out.name} · ${relativeDay(summary.largest_out.date)}` : "No charges"}
              >
                <BigMoney value={summary.largest_out?.amount ?? 0} className="block text-2xl" />
              </Stat>
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-3xl" />)
          )}
        </div>
        {summary?.pending ? <p className="mt-2 text-xs text-faint">Totals include {plural(summary.pending, "pending transaction")}.</p> : null}

        {error ? (
          <div className="mt-6">
            <ErrorNote error={error} onRetry={() => mutate()} />
          </div>
        ) : null}

        {/* List */}
        <div className="mt-6 flex flex-col gap-5">
          {isLoading && !data ? (
            Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)
          ) : transactions.length === 0 ? (
            <EmptyState icon={<Receipt />} title={activeFilters ? "No transactions match these filters" : "No transactions yet"}>
              {activeFilters ? (
                <button onClick={clearFilters} className="text-brand-ink underline-offset-2 hover:underline">
                  Clear filters
                </button>
              ) : (
                "Connect a bank on the Accounts page to import your history."
              )}
            </EmptyState>
          ) : (
            <>
              <TransactionColumns />
              {groups.map((g) => (
                <section
                  key={g.date || "all"}
                  aria-label={g.date ? relativeDay(g.date) : "Transactions"}
                  className="[contain-intrinsic-size:auto_320px] [content-visibility:auto]"
                >
                  {g.date ? (
                    <h2 className="sticky top-0 z-10 -mx-1 flex items-baseline justify-between gap-3 bg-canvas/95 px-1 py-2 text-sm backdrop-blur">
                      <span>
                        <span className="font-medium">{relativeDay(g.date)}</span>
                        <span className="ml-2 text-muted">{plural(g.items.length, "transaction")}</span>
                      </span>
                      <span className={cx("tabular", g.net > 0 ? "text-brand-ink" : "text-muted")}>
                        {g.net > 0 ? "+" : "-"}
                        {money(Math.abs(g.net))}
                      </span>
                    </h2>
                  ) : null}
                  <div className="flex flex-col">
                    {g.items.map((t) => (
                      <TransactionLine key={t.id} t={t} query={query} showDate={!byDate} actions={actions} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
          <div ref={sentinel} />
          {hasMore ? (
            <Button variant="secondary" onClick={() => setSize(size + 1)} loading={isValidating} className="self-center">
              Load more
            </Button>
          ) : transactions.length > PAGE ? (
            <p className="text-center text-xs text-faint">That’s all {plural(total, "transaction")}.</p>
          ) : null}
        </div>
      </div>
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
