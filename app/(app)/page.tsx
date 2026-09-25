"use client";

import { ArrowRight, CalendarDays, CalendarRange, CreditCard, Landmark, Plus, Receipt, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BankCard } from "@/components/BankCard";
import { BillCard } from "@/components/BillCard";
import { AllocationBar } from "@/components/charts/AllocationBar";
import { AreaChart } from "@/components/charts/AreaChart";
import { BarPairs } from "@/components/charts/BarPairs";
import { Heatmap } from "@/components/charts/Heatmap";
import { SpendingMap } from "@/components/charts/SpendingMap";
import { ConnectBankButton } from "@/components/PlaidConnect";
import { PageHeader } from "@/components/shell/PageHeader";
import { TransactionRow } from "@/components/TransactionRow";
import { BigMoney, Button, Card, CardHeader, cx, EmptyState, IconChip, Pill, Segmented, Skeleton } from "@/components/ui";
import { categoryLabel, colorAt } from "@/lib/categories-ui";
import { api, refreshAll, useApi } from "@/lib/client/api";
import type {
  AccountsResponse,
  BillsResponse,
  CardsResponse,
  DailyResponse,
  LocationsResponse,
  NetWorthResponse,
  Summary,
  TransactionsResponse,
} from "@/lib/client/types";
import { nameOf, useSettings } from "@/lib/client/settings";
import { money, monthLabel, percent, shortDate, timeAgo } from "@/lib/format";
import type { Range } from "@/lib/settings";

const RANGES = ["1W", "1M", "3M", "6M", "1Y", "ALL"] as const;

function StatCard({
  icon,
  title,
  value,
  badge,
  sub,
  loading,
  progress,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  badge?: React.ReactNode;
  sub?: React.ReactNode;
  loading?: boolean;
  /** 0..1+ share of a budget, drawn as a bar. */
  progress?: number | null;
}) {
  return (
    <Card className="flex flex-col justify-between gap-6 xl:col-span-3">
      <h2 className="flex items-center gap-2.5 text-[17px] font-medium">
        <IconChip>{icon}</IconChip>
        {title}
      </h2>
      {loading ? (
        <Skeleton className="h-10 w-40" />
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <BigMoney value={value} className="text-[34px] leading-none" />
            {badge}
          </div>
          {progress !== undefined && progress !== null ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className={cx("h-full rounded-full", progress > 1 ? "bg-danger" : progress > 0.85 ? "bg-ink" : "bg-brand")} style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
          ) : null}
          {sub ? <p className="mt-2 text-sm text-muted">{sub}</p> : null}
        </div>
      )}
    </Card>
  );
}

function BalanceHero() {
  const { settings } = useSettings();
  const [range, setRange] = useState<Range>(settings.default_range);
  const [metric, setMetric] = useState<"cash" | "net_worth">("cash");
  const { data, isLoading } = useApi<NetWorthResponse>(`/api/net-worth?range=${range}`);
  const series = (data?.series ?? []).map((p) => ({ x: p.date, y: p[metric] }));
  const long = range === "6M" || range === "1Y" || range === "ALL";
  const first = series[0]?.y ?? 0;
  const last = series[series.length - 1]?.y ?? 0;
  const change = last - first;

  return (
    <Card dark className="overflow-hidden !pb-3 xl:col-span-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium sm:text-xl">Balance history</h2>
          <Segmented
            dark
            size="sm"
            options={[
              { value: "cash", label: "Cash" },
              { value: "net_worth", label: "Net worth" },
            ]}
            value={metric}
            onChange={setMetric}
          />
        </div>
        <div className="no-scrollbar -mx-1 max-w-full overflow-x-auto px-1">
          <Segmented dark options={RANGES.map((r) => ({ value: r, label: r === "ALL" ? "All" : r }))} value={range} onChange={setRange} />
        </div>
      </div>
      {series.length > 1 ? (
        <p className="mt-2 text-sm text-white/55">
          <span className={cx("font-medium tabular", change >= 0 ? "text-brand-bright" : "text-white")}>
            {change >= 0 ? "+" : "-"}
            {money(Math.abs(change))}
          </span>{" "}
          since {shortDate(series[0]!.x)}
        </p>
      ) : null}
      {isLoading && !data ? (
        <div className="mt-6 h-[260px] animate-pulse rounded-3xl bg-white/5" />
      ) : series.length > 1 ? (
        <AreaChart
          data={series}
          height={280}
          ariaLabel={metric === "cash" ? "Cash balance over time" : "Net worth over time"}
          formatY={money}
          formatX={(x) => shortDate(x)}
          tickLabel={(x) => (long ? monthLabel(x.slice(0, 7)) : shortDate(x))}
        />
      ) : (
        <p className="py-24 text-center text-sm text-white/50">History appears after your first bank sync.</p>
      )}
    </Card>
  );
}

function BalanceCard({ summary }: { summary?: Summary }) {
  const { data } = useApi<AccountsResponse>("/api/accounts");
  const [syncing, setSyncing] = useState(false);
  const accounts = data?.accounts ?? [];
  const cash = accounts.filter((a) => a.type === "depository");
  const net = summary?.this_month.net ?? 0;

  async function sync() {
    setSyncing(true);
    try {
      await api.post("/api/sync");
      await refreshAll();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card className="flex flex-col xl:col-span-3 xl:row-span-2">
      <CardHeader
        title="Current balance"
        action={
          <Button size="sm" onClick={sync} loading={syncing}>
            {syncing ? null : <RefreshCw />} Sync
          </Button>
        }
      />
      {summary ? (
        <>
          <div className="mt-6 flex flex-wrap items-end gap-x-3 gap-y-1">
            <BigMoney value={summary.balances.cash} className="text-[40px] leading-none sm:text-[44px]" />
            <span className={cx("pb-1 text-sm", net >= 0 ? "text-brand-ink" : "text-muted")}>
              {net >= 0 ? "+" : "-"}
              {money(Math.abs(net))} this month
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            <span className="tabular">{money(summary.balances.available)}</span> available to spend
          </p>

          <p className="mt-7 mb-3 text-[15px]">Where it is</p>
          <AllocationBar values={cash.map((a) => Math.max(0, a.current_balance ?? 0))} />
          <ul className="mt-5 flex flex-col gap-3.5">
            {cash.map((a, i) => (
              <li key={a.id} className="flex items-center gap-2.5 text-[15px]">
                <span className="size-3 shrink-0 rounded-[4px]" style={{ background: colorAt(i) }} />
                <span className="min-w-0 flex-1 truncate">
                  {a.name}
                  {a.mask ? <span className="ml-1.5 text-xs text-faint">••{a.mask}</span> : null}
                </span>
                <span className="font-medium tabular">{money(a.current_balance)}</span>
              </li>
            ))}
            <li className="flex items-center gap-2.5 border-t border-line pt-3.5 text-[15px] text-muted">
              <span className="flex-1">Net worth</span>
              <span className="font-medium text-ink tabular">{money(summary.net_worth.net_worth)}</span>
            </li>
          </ul>
          <div className="mt-auto pt-6">
            <Link href="/accounts" className="flex h-13 w-full items-center justify-center rounded-full bg-ink text-[15px] font-medium text-white hover:bg-ink-3">
              Manage accounts
            </Link>
            <p className="mt-2.5 text-center text-xs text-faint">Synced {timeAgo(summary.connections.oldest_sync)}</p>
          </div>
        </>
      ) : (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-12 w-52" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </Card>
  );
}

function CashflowCard({ summary }: { summary?: Summary }) {
  const [period, setPeriod] = useState<"month" | "week">("month");
  const groups =
    period === "month"
      ? (summary?.cashflow ?? []).map((m) => ({ label: monthLabel(m.month), income: m.income, spending: m.spending }))
      : (summary?.this_week.days ?? []).map((d) => ({
          label: new Date(`${d.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2),
          income: d.income,
          spending: d.spending,
        }));
  return (
    <Card className="xl:col-span-4">
      <CardHeader
        title="Income vs spending"
        action={
          <Segmented
            size="sm"
            options={[
              { value: "month", label: "Months" },
              { value: "week", label: "This week" },
            ]}
            value={period}
            onChange={setPeriod}
          />
        }
      />
      <div className="mt-5">{summary ? <BarPairs groups={groups} /> : <Skeleton className="h-52 w-full" />}</div>
    </Card>
  );
}

function CategoryCard({ summary }: { summary?: Summary }) {
  const cats = summary?.this_month.spending_by_category ?? [];
  const top = cats.slice(0, 5);
  const rest = cats.slice(5).reduce((s, c) => s + c.total, 0);
  const total = cats.reduce((s, c) => s + c.total, 0);
  return (
    <Card className="xl:col-span-4">
      <CardHeader
        title="Spending by category"
        action={
          <Link href="/spending" className="text-sm text-muted hover:text-ink">
            View all
          </Link>
        }
      />
      {summary ? (
        cats.length ? (
          <>
            <p className="mt-4 text-sm text-muted">
              {monthLabel(summary.this_month.month, "long")} · <span className="text-ink tabular">{money(total)}</span>
            </p>
            <AllocationBar className="mt-3" values={[...top.map((c) => c.total), rest]} />
            <ul className="mt-5 flex flex-col gap-3">
              {top.map((c, i) => (
                <li key={c.category} className="flex items-center gap-2.5 text-[15px]">
                  <span className="size-3 shrink-0 rounded-[4px]" style={{ background: colorAt(i) }} />
                  <span className="flex-1 truncate">
                    {categoryLabel(c.category)} <span className="text-xs text-faint">{percent(c.total / total)}</span>
                  </span>
                  <span className="font-medium tabular">{money(c.total)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState title="No spending yet this month" />
        )
      ) : (
        <Skeleton className="mt-5 h-48 w-full" />
      )}
    </Card>
  );
}

/** "My Cards": every account as a swipeable card; tap one for details. */
function MyCards() {
  const { data } = useApi<CardsResponse>("/api/cards");
  if (data && data.cards.length === 0) return null;
  return (
    <Card className="overflow-hidden !px-0 md:col-span-2 xl:col-span-12">
      <CardHeader
        className="px-5 sm:px-6"
        title="My Cards"
        icon={
          <span className="grid size-10 place-items-center rounded-full border border-line">
            <CreditCard className="size-[18px]" strokeWidth={1.8} />
          </span>
        }
        action={
          <div className="flex items-center gap-1">
            <Link href="/cards" className="hidden px-3 text-sm text-muted hover:text-ink sm:block">
              View all
            </Link>
            <ConnectBankButton variant="secondary" size="sm">
              <Plus /> Add new
            </ConnectBankButton>
          </div>
        }
      />
      <div className="no-scrollbar mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 sm:scroll-px-6 sm:px-6">
        {data
          ? data.cards.map((c) => (
              <BankCard key={c.id} card={c} href={`/cards?card=${c.id}`} className="w-[min(300px,82vw)] shrink-0 snap-start sm:w-[320px]" />
            ))
          : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="aspect-[1.586/1] w-[min(300px,82vw)] shrink-0 rounded-[22px] sm:w-[320px]" />)}
      </div>
    </Card>
  );
}

function ActivityCard() {
  const { settings } = useSettings();
  const { data } = useApi<DailyResponse>("/api/spending/daily?days=84");
  return (
    <Card className="xl:col-span-4">
      <CardHeader title="Spending activity" action={<Pill>12 weeks</Pill>} />
      {data ? (
        <>
          <p className="mt-4 mb-1 flex items-baseline gap-2">
            <span className="text-[34px] leading-none font-medium tracking-tight tabular">{data.stats.active_days}</span>
            <span className="text-muted">days with spending</span>
          </p>
          <div className="mt-2">
            <Heatmap days={data.days} weekStart={settings.week_start} />
          </div>
        </>
      ) : (
        <Skeleton className="mt-5 h-56 w-full" />
      )}
    </Card>
  );
}

function UpcomingCard() {
  const { data } = useApi<BillsResponse>("/api/bills?days=30");
  return (
    <Card className="overflow-hidden !px-0 xl:col-span-4">
      <CardHeader
        className="px-5 sm:px-6"
        title="Upcoming bills"
        action={
          <Link href="/bills" className="text-sm text-muted hover:text-ink">
            View all
          </Link>
        }
      />
      {data ? (
        <>
          <p className="mt-4 px-5 text-sm text-muted sm:px-6">
            <span className="text-ink tabular">{money(data.totals.amount)}</span> due in the next 30 days · {data.totals.count} charge
            {data.totals.count === 1 ? "" : "s"}
          </p>
          {data.bills.length ? (
            <div className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto px-5 pb-1 sm:px-6">
              {data.bills.map((b, i) => (
                <BillCard key={b.id} bill={b} featured={i === 0} />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing due in the next 30 days" />
          )}
        </>
      ) : (
        <div className="mt-5 flex gap-3 px-6">
          <Skeleton className="h-52 w-52" />
          <Skeleton className="h-52 w-52" />
        </div>
      )}
    </Card>
  );
}

function RecentTransactions() {
  const { data } = useApi<TransactionsResponse>("/api/transactions?limit=6");
  return (
    <Card className="xl:col-span-4">
      <CardHeader
        title="Recent transactions"
        action={
          <Link href="/transactions" className="text-sm text-muted hover:text-ink">
            View all
          </Link>
        }
      />
      <div className="mt-3 flex flex-col">
        {data ? (
          data.transactions.length ? (
            data.transactions.map((t) => <TransactionRow key={t.id} t={t} />)
          ) : (
            <EmptyState icon={<Receipt />} title="No transactions yet" />
          )
        ) : (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="my-2 h-11 w-full" />)
        )}
      </div>
    </Card>
  );
}

function MapCard() {
  const [days, setDays] = useState<"30" | "90" | "365">("90");
  const { data } = useApi<LocationsResponse>(`/api/spending/locations?days=${days}`);
  return (
    <Card dark className="xl:col-span-12">
      {data ? (
        <SpendingMap
          data={data}
          action={
            <Segmented
              dark
              size="sm"
              options={[
                { value: "30", label: "30D" },
                { value: "90", label: "90D" },
                { value: "365", label: "1Y" },
              ]}
              value={days}
              onChange={setDays}
            />
          }
        />
      ) : (
        <div className="h-80 animate-pulse rounded-3xl bg-white/5" />
      )}
    </Card>
  );
}

function ConnectFirstBank() {
  return (
    <Card dark className="relative overflow-hidden xl:col-span-12">
      <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-brand-bright/30 blur-3xl" />
      <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <span className="grid size-12 place-items-center rounded-full bg-white/10">
          <Landmark className="size-5" />
        </span>
        <div className="flex-1">
          <p className="text-lg font-medium">Connect your first bank</p>
          <p className="text-sm text-white/60">Link checking, savings, and cards to fill your dashboard.</p>
        </div>
        <Link href="/accounts" className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-ink">
          <Plus className="size-4" /> Connect a bank <ArrowRight className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { profile } = useSettings();
  const { data: summary, isLoading } = useApi<Summary>("/api/summary?months=6");
  const budget = summary?.budget ?? null;
  const noBanks = summary && summary.connections.total === 0;
  const week = summary?.this_week;
  const month = summary?.this_month;
  const todayVsAvg = summary && summary.today.average_daily_spending > 0 ? summary.today.spending / summary.today.average_daily_spending : null;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${greeting()}, ${nameOf(profile)}`} />
      <div className="mt-5 grid animate-fade-up grid-cols-1 gap-4 px-4 sm:px-6 md:grid-cols-2 lg:mt-7 lg:px-8 xl:grid-cols-12">
        {noBanks ? <ConnectFirstBank /> : null}

        <StatCard
          loading={isLoading}
          icon={<Receipt />}
          title="Today's spending"
          value={summary?.today.spending ?? 0}
          badge={todayVsAvg !== null ? <Pill>{todayVsAvg >= 1 ? `${todayVsAvg.toFixed(1)}× avg` : `${percent(1 - todayVsAvg)} under avg`}</Pill> : null}
          sub={
            summary ? (
              <>
                {summary.today.count} purchase{summary.today.count === 1 ? "" : "s"} · daily avg <span className="tabular">{money(summary.today.average_daily_spending)}</span>
              </>
            ) : null
          }
        />
        <StatCard
          loading={isLoading}
          icon={<CalendarDays />}
          title="This week"
          value={week?.spending ?? 0}
          badge={week ? <Pill tone="brand">+{money(week.income)} in</Pill> : null}
          sub={week ? `Spent since ${shortDate(week.start)}` : null}
        />
        <StatCard
          loading={isLoading}
          icon={<CalendarRange />}
          title="This month"
          value={month?.spending ?? 0}
          progress={budget && month ? month.spending / budget : null}
          badge={
            budget && month ? (
              <Pill tone={month.spending > budget ? "danger" : "dark"}>{percent(month.spending / budget)} of budget</Pill>
            ) : month?.savings_rate !== null && month ? (
              <Pill>{month.savings_rate >= 0 ? `Saved ${percent(month.savings_rate)}` : "Overspent"}</Pill>
            ) : null
          }
          sub={
            month
              ? budget
                ? month.spending > budget
                  ? <><span className="tabular">{money(month.spending - budget)}</span> over your <span className="tabular">{money(budget)}</span> budget</>
                  : <><span className="tabular">{money(budget - month.spending)}</span> left of <span className="tabular">{money(budget)}</span></>
                : <>Spent of <span className="tabular">{money(month.income)}</span> income</>
              : null
          }
        />

        <BalanceCard summary={summary} />
        <BalanceHero />
        <MyCards />

        <ActivityCard />
        <UpcomingCard />
        <RecentTransactions />

        <CashflowCard summary={summary} />
        <CategoryCard summary={summary} />
        <SubscriptionsMini summary={summary} />

        <MapCard />
      </div>
    </>
  );
}

function SubscriptionsMini({ summary }: { summary?: Summary }) {
  const r = summary?.recurring;
  const rows = r
    ? [
        { label: "Subscriptions", value: r.subscriptions_monthly, href: "/subscriptions" },
        { label: "Bills", value: r.bills_monthly, href: "/bills" },
        { label: "Recurring income", value: r.income_monthly, href: "/bills" },
      ]
    : [];
  return (
    <Card className="flex flex-col xl:col-span-4">
      <CardHeader title="Monthly commitments" />
      {r ? (
        <>
          <p className="mt-4 text-sm text-muted">Fixed costs per month</p>
          <BigMoney value={r.subscriptions_monthly + r.bills_monthly} className="mt-1 text-[34px] leading-none" />
          <ul className="mt-6 flex flex-col divide-y divide-line">
            {rows.map((row) => (
              <li key={row.label}>
                <Link href={row.href} className="flex items-center justify-between py-3 text-[15px] hover:text-brand-ink">
                  <span>{row.label}</span>
                  <span className="flex items-center gap-2 font-medium tabular">
                    {money(row.value)}
                    <ArrowRight className="size-4 text-faint" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {r.income_monthly > 0 ? (
            <p className="mt-auto pt-4 text-sm text-muted">
              Fixed costs use <span className="text-ink">{percent((r.subscriptions_monthly + r.bills_monthly) / r.income_monthly)}</span> of recurring income.
            </p>
          ) : null}
        </>
      ) : (
        <Skeleton className="mt-5 h-48 w-full" />
      )}
    </Card>
  );
}
