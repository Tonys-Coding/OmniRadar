"use client";

import { CalendarClock, CalendarRange, ChartPie, CircleCheck, Copy, ExternalLink, Repeat, Scissors, TrendingDown, TrendingUp, Wallet, X } from "lucide-react";
import Link from "next/link";
import { Suspense, useMemo } from "react";
import { AllocationBar } from "@/components/charts/AllocationBar";
import { MonthlyBars } from "@/components/charts/MonthlyBars";
import { PageHeader } from "@/components/shell/PageHeader";
import { StreamMenu } from "@/components/StreamMenu";
import { BigMoney, Button, Card, CardHeader, cx, EmptyState, IconChip, Logo, Pill, Segmented, SelectPill, Skeleton } from "@/components/ui";
import { categoryLabel, colorAt } from "@/lib/categories-ui";
import { useApi } from "@/lib/client/api";
import { useMounted, useQueryState } from "@/lib/client/hooks";
import type { Stream, Subscription, SubscriptionsResponse } from "@/lib/client/types";
import { daysFromToday, dueLabel, FREQUENCY_LABEL, localToday, money, monthLabel, percent, plural, relativeDay, shortDate, tidyName } from "@/lib/format";
import { buildInsights, type Insight, upcomingCharges } from "@/lib/recurring/subscriptions";

const SORTS = [
  { value: "cost", label: "Most expensive" },
  { value: "next", label: "Next charge" },
  { value: "spent", label: "Most spent overall" },
  { value: "newest", label: "Newest first" },
  { value: "name", label: "Name" },
] as const;
type SortValue = (typeof SORTS)[number]["value"];

/** A price change older than this is history, not news. */
const RECENT_CHANGE_DAYS = 120;

const nameOf = (s: Stream) => tidyName(s.merchant_name ?? s.description);
const chargeOf = (s: Stream) => s.last_amount ?? s.average_amount ?? 0;
const chargesLink = (s: Stream) => `/transactions?q=${encodeURIComponent(s.merchant_name ?? s.description)}&range=all`;
const accountOf = (s: Stream) => (s.account ? `${s.account.name}${s.account.mask ? ` ••${s.account.mask}` : ""}` : "Unknown account");
const siteUrl = (w: string) => (w.includes("://") ? w : `https://${w}`);
const siteName = (w: string) =>
  w
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
/** "in 25 days", "tomorrow", "today" */
const whenLabel = (iso: string) => dueLabel(iso).replace(/^Due /, "").replace(/^In /, "in ").toLowerCase();

function Tile({ icon, title, value, sub, loading }: { icon: React.ReactNode; title: string; value: number; sub: React.ReactNode; loading: boolean }) {
  return (
    <Card className="flex flex-col gap-4 sm:gap-6">
      <h2 className="flex items-center gap-2.5 text-[15px] font-medium sm:text-[17px]">
        <span className="hidden sm:contents">
          <IconChip>{icon}</IconChip>
        </span>
        {title}
      </h2>
      {loading ? (
        <Skeleton className="h-10 w-full max-w-36" />
      ) : (
        <div className="min-w-0">
          <BigMoney value={value} className="text-[26px] leading-none sm:text-[34px]" />
          <p className="mt-2 line-clamp-2 text-sm text-muted sm:truncate">{sub}</p>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------------ */
/* Insights                                                                  */
/* ------------------------------------------------------------------------ */

function InsightItem({
  icon,
  tone,
  title,
  children,
  actions,
}: {
  icon: React.ReactNode;
  tone: "warn" | "info" | "good";
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5 py-4 first:pt-1 last:pb-0">
      <span
        aria-hidden="true"
        className={cx(
          "grid size-10 shrink-0 place-items-center rounded-2xl [&>svg]:size-5",
          tone === "warn" ? "bg-danger/10 text-danger" : tone === "good" ? "bg-brand-pale text-brand-deep" : "bg-surface text-ink",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
        {actions ? <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </li>
  );
}

const linkButton = "inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-muted hover:bg-surface hover:text-ink";

function InsightsCard({
  insights,
  stoppedCount,
  planned,
  onPlan,
  onReviewStopped,
  loading,
}: {
  insights: Insight[];
  stoppedCount: number;
  planned: Set<string>;
  onPlan: (id: string) => void;
  onReviewStopped: () => void;
  loading: boolean;
}) {
  const count = insights.length + (stoppedCount ? 1 : 0);
  const planButton = (id: string, label: string) =>
    planned.has(id) ? (
      <Pill tone="brand" className="h-8 px-3">
        <Scissors aria-hidden="true" className="size-3.5" /> In your cancel plan
      </Pill>
    ) : (
      <Button size="sm" variant="secondary" onClick={() => onPlan(id)}>
        <Scissors aria-hidden="true" /> {label}
      </Button>
    );

  return (
    <Card className="md:col-span-2">
      <CardHeader title="Worth a look" action={count ? <Pill tone="light">{plural(count, "thing")}</Pill> : null} />
      {loading ? (
        <Skeleton className="mt-5 h-40 w-full" />
      ) : count === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-3xl bg-surface p-4 text-sm">
          <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-brand-ink" />
          <p>
            <span className="font-medium">All clear.</span>{" "}
            <span className="text-muted">No duplicate services, recent price changes, or yearly renewals in the next 30 days.</span>
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {insights.map((i) => {
            if (i.kind === "duplicate") {
              const subs = i.subs as Subscription[];
              const name = nameOf(subs[0]!);
              const accounts = [...new Set(subs.map(accountOf))];
              const amounts = [...new Set(subs.map((s) => money(chargeOf(s))))];
              const dates = subs.every((s) => s.predicted_next_date) ? [...new Set(subs.map((s) => shortDate(s.predicted_next_date!)))] : [];
              // The copy to cut: the cheapest, or the one charged later when they cost the same.
              const extra = [...subs].sort(
                (a, b) => a.monthly_amount - b.monthly_amount || (b.predicted_next_date ?? "").localeCompare(a.predicted_next_date ?? ""),
              )[0]!;
              return (
                <InsightItem
                  key={`dup-${i.key}`}
                  icon={<Copy />}
                  tone="warn"
                  title={`You may be paying for ${name} ${subs.length === 2 ? "twice" : `${subs.length} times`}`}
                  actions={
                    <>
                      {planButton(extra.id, "Plan to cancel one")}
                      <Link href={chargesLink(subs[0]!)} className={linkButton}>
                        See the charges
                      </Link>
                    </>
                  }
                >
                  {subs.length} {name} subscriptions {accounts.length === 1 ? `on ${accounts[0]}` : `across ${accounts.join(" and ")}`},{" "}
                  {amounts.length === 1 ? `${amounts[0]} each` : amounts.join(" and ")}
                  {dates.length ? `, next due ${dates.join(" and ")}` : ""}. If one is a mistake, cancelling it saves{" "}
                  <span className="font-medium text-ink tabular">{money(i.extra_yearly)}</span> a year.
                </InsightItem>
              );
            }
            if (i.kind === "price_up" || i.kind === "price_down") {
              const s = i.sub as Subscription;
              const up = i.kind === "price_up";
              return (
                <InsightItem
                  key={`price-${s.id}`}
                  icon={up ? <TrendingUp /> : <TrendingDown />}
                  tone={up ? "warn" : "good"}
                  title={`${nameOf(s)} ${up ? "went up" : "got cheaper"} ${percent(Math.abs(i.change.to - i.change.from) / i.change.from)}`}
                  actions={
                    <Link href={chargesLink(s)} className={linkButton}>
                      See the charges
                    </Link>
                  }
                >
                  <span className="tabular">
                    {money(i.change.from)} → {money(i.change.to)}
                  </span>{" "}
                  since {shortDate(i.change.date)}. That’s <span className="font-medium text-ink tabular">{money(up ? i.extra_yearly : i.saved_yearly)}</span>{" "}
                  {up ? "more" : "less"} a year.
                </InsightItem>
              );
            }
            const s = i.sub as Subscription;
            return (
              <InsightItem
                key={`renew-${s.id}`}
                icon={<CalendarClock />}
                tone="info"
                title={`${nameOf(s)} renews ${whenLabel(i.date)}`}
                actions={planButton(s.id, "Plan to cancel")}
              >
                A <span className="font-medium text-ink tabular">{money(i.amount)}</span> {FREQUENCY_LABEL[s.frequency]?.toLowerCase()} charge on{" "}
                {shortDate(i.date)}. If you don’t use it anymore, cancel before then.
              </InsightItem>
            );
          })}
          {stoppedCount ? (
            <InsightItem
              icon={<CalendarRange />}
              tone="info"
              title={`${plural(stoppedCount, "subscription")} stopped charging`}
              actions={
                <Button size="sm" variant="secondary" onClick={onReviewStopped}>
                  Review
                </Button>
              }
            >
              {stoppedCount === 1 ? "It missed" : "They missed"} an expected charge. Check {stoppedCount === 1 ? "it’s" : "they’re"} really cancelled and not
              just moved to another card.
            </InsightItem>
          ) : null}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------------ */
/* Coming up                                                                 */
/* ------------------------------------------------------------------------ */

type Upcoming = { date: string; amount: number; sub: Subscription };

function ComingUp({ upcoming, loading }: { upcoming: Upcoming[]; loading: boolean }) {
  const total = upcoming.reduce((s, c) => s + c.amount, 0);
  const week = upcoming.filter((c) => daysFromToday(c.date) <= 7).reduce((s, c) => s + c.amount, 0);
  const days = [...new Set(upcoming.map((c) => c.date))];

  return (
    <Card className="md:col-span-2 xl:col-span-1">
      <CardHeader title="Next 30 days" action={upcoming.length ? <Pill className="tabular">{money(total)}</Pill> : null} />
      {loading ? (
        <Skeleton className="mt-5 h-40 w-full" />
      ) : upcoming.length ? (
        <>
          <p className="mt-2 text-sm text-muted">
            {plural(upcoming.length, "charge")} · <span className="text-ink tabular">{money(week)}</span> in the next 7 days
          </p>
          <ol className="mt-4 flex flex-col gap-3">
            {days.map((d) => (
              <li key={d} className="flex gap-3">
                <div className="w-16 shrink-0 pt-1.5 text-sm">
                  <p className="font-medium">{shortDate(d)}</p>
                  <p className="text-xs text-muted">{whenLabel(d)}</p>
                </div>
                <ul className="min-w-0 flex-1 rounded-2xl bg-surface px-3 py-1">
                  {upcoming
                    .filter((c) => c.date === d)
                    .map((c) => (
                      <li key={c.sub.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                        <Logo src={c.sub.logo_url} name={nameOf(c.sub)} size={26} />
                        <span className="min-w-0 flex-1 truncate">
                          {nameOf(c.sub)}
                          {c.sub.account?.mask ? <span className="text-muted"> ••{c.sub.account.mask}</span> : null}
                        </span>
                        <span className="font-medium tabular">{money(c.amount)}</span>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-muted">No subscription charges expected in the next 30 days.</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------------ */
/* Subscription rows                                                         */
/* ------------------------------------------------------------------------ */

function SubscriptionRow({
  s,
  color,
  share,
  planned,
  onTogglePlan,
}: {
  s: Subscription;
  color?: string;
  share?: number;
  planned: boolean;
  onTogglePlan: () => void;
}) {
  const name = nameOf(s);
  const change = s.price_change;
  const recentChange = change && daysFromToday(change.date) >= -RECENT_CHANGE_DAYS ? change : null;

  // Laid out by the `.sub-row` grid areas in globals.css (sized to the card).
  return (
    <li className={cx("sub-row py-3.5", planned && "-mx-3 rounded-3xl bg-surface px-3")}>
      <div className="self-start [grid-area:logo] @2xl:self-center">
        <Logo src={s.logo_url} name={name} size={44} />
      </div>

      {/* Name, flags, category, account */}
      <div className="min-w-0 [grid-area:name]">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {color ? <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: color }} /> : null}
          <Link
            href={chargesLink(s)}
            title={`See every ${name} charge`}
            className={cx("min-w-0 truncate font-medium hover:underline hover:underline-offset-2", planned && "line-through decoration-muted")}
          >
            {name}
          </Link>
          {s.duplicate_key ? (
            <Pill tone="danger" className="py-0.5 whitespace-nowrap">
              <Copy aria-hidden="true" className="size-3" /> Possible duplicate
            </Pill>
          ) : null}
          {recentChange ? (
            <Pill tone={recentChange.to > recentChange.from ? "danger" : "brand"} className="py-0.5 whitespace-nowrap">
              {recentChange.to > recentChange.from ? (
                <TrendingUp aria-hidden="true" className="size-3" />
              ) : (
                <TrendingDown aria-hidden="true" className="size-3" />
              )}
              {recentChange.to > recentChange.from ? "Up" : "Down"} {money(Math.abs(recentChange.to - recentChange.from))}
            </Pill>
          ) : null}
        </p>
        <p className="truncate text-sm text-muted" title={`${categoryLabel(s.category_primary)} · ${accountOf(s)}`}>
          {categoryLabel(s.category_primary)} · {accountOf(s)}
        </p>
      </div>

      {/* History: total spent, how long, previous price */}
      <div className="min-w-0 text-sm [grid-area:hist]">
        <p className="truncate">
          <span className="tabular">{money(s.total_spent)}</span> <span className="text-muted">spent · {plural(s.charges.length, "charge")}</span>
        </p>
        <p className="truncate text-muted">
          {FREQUENCY_LABEL[s.frequency]}
          {s.first_date ? ` since ${monthLabel(s.first_date.slice(0, 7))} ’${s.first_date.slice(2, 4)}` : ""}
          {change && !recentChange ? ` · was ${money(change.from)}` : ""}
        </p>
      </div>

      {/* Next charge */}
      <div className="min-w-0 text-sm [grid-area:next]">
        {s.predicted_next_date ? (
          <>
            <p>
              <span className="text-muted @4xl:hidden">Next </span>
              {shortDate(s.predicted_next_date)}
            </p>
            <p className="text-muted">{whenLabel(s.predicted_next_date)}</p>
          </>
        ) : (
          <p className="text-muted">No date yet</p>
        )}
      </div>

      <div className="text-right [grid-area:amount]">
        <p className={cx("font-medium tabular", planned && "line-through decoration-muted")}>{money(chargeOf(s))}</p>
        <p className="text-sm text-muted tabular">
          {s.frequency === "MONTHLY" ? `${money(s.monthly_amount * 12)}/yr` : `${money(s.monthly_amount)}/mo`}
          {share !== undefined ? <span className="hidden @md:inline"> · {percent(share)}</span> : null}
        </p>
      </div>

      <div className="-mr-1.5 flex items-center justify-end [grid-area:actions]">
        <RowActions s={s} planned={planned} onTogglePlan={onTogglePlan} />
      </div>
    </li>
  );
}

function RowActions({ s, planned, onTogglePlan }: { s: Subscription; planned: boolean; onTogglePlan: () => void }) {
  const name = nameOf(s);
  const iconBtn = "grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink [&>svg]:size-4";
  return (
    <>
      <button
        type="button"
        onClick={onTogglePlan}
        aria-pressed={planned}
        aria-label={planned ? `Take ${name} out of the cancel plan` : `Add ${name} to the cancel plan`}
        title={planned ? "Take out of the cancel plan" : "Plan to cancel"}
        className={cx(iconBtn, planned && "bg-ink text-white hover:bg-ink-3 hover:text-white")}
      >
        <Scissors />
      </button>
      {s.website ? (
        <a
          href={siteUrl(s.website)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Manage ${name} on ${siteName(s.website)}`}
          title={`Manage on ${siteName(s.website)}`}
          className={iconBtn}
        >
          <ExternalLink />
        </a>
      ) : null}
      <StreamMenu stream={s} />
    </>
  );
}

/** Stopped or hidden stream: when it last charged, and what it cost in total. */
function CompactRow({ s, stopped }: { s: Stream | Subscription; stopped: boolean }) {
  const name = nameOf(s);
  const spent = "total_spent" in s ? s.total_spent : null;
  return (
    <li className="flex items-center gap-3.5 py-3">
      <Logo src={s.logo_url} name={name} size={40} />
      <div className="min-w-0 flex-1">
        <Link href={chargesLink(s)} className="block truncate font-medium hover:underline hover:underline-offset-2">
          {name}
        </Link>
        <p className="truncate text-sm text-muted">
          {FREQUENCY_LABEL[s.frequency]}
          {s.last_date ? ` · last ${relativeDay(s.last_date)}` : ""}
          {s.account?.mask ? ` · ••${s.account.mask}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="font-medium tabular">{money(chargeOf(s))}</p>
        <p className="text-sm text-muted tabular">{stopped && spent !== null ? `${money(spent)} total` : `${money(s.monthly_amount)}/mo`}</p>
      </div>
      <StreamMenu stream={s} />
    </li>
  );
}

/* ------------------------------------------------------------------------ */
/* Side cards                                                                */
/* ------------------------------------------------------------------------ */

function PlannerCard({
  subs,
  cut,
  onToggle,
  onClear,
  monthlyTotal,
}: {
  subs: Subscription[];
  cut: Set<string>;
  onToggle: (id: string) => void;
  onClear: () => void;
  monthlyTotal: number;
}) {
  const chosen = subs.filter((s) => cut.has(s.id));
  const monthly = chosen.reduce((sum, s) => sum + s.monthly_amount, 0);
  return (
    <Card>
      <CardHeader
        title="Cancel planner"
        icon={
          <IconChip>
            <Scissors />
          </IconChip>
        }
        action={
          chosen.length ? (
            <Button size="sm" variant="ghost" onClick={onClear}>
              Clear
            </Button>
          ) : null
        }
      />
      <div aria-live="polite">
        {chosen.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Tap the scissors on a subscription to see what cancelling it would save. This is only a plan: nothing gets cancelled for you.
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="min-w-0 rounded-3xl bg-brand-pale p-4 text-brand-deep">
                <p className="text-sm">You’d save</p>
                <BigMoney value={monthly * 12} className="text-[26px] leading-tight" />
                <p className="text-xs">a year</p>
              </div>
              <div className="min-w-0 rounded-3xl bg-surface p-4">
                <p className="text-sm text-muted">Per month</p>
                <BigMoney value={monthly} className="text-[26px] leading-tight" />
                <p className="text-xs text-muted">
                  <span className="tabular">{money(Math.max(0, monthlyTotal - monthly))}</span> still to pay
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">
              Over 5 years that’s <span className="font-medium text-ink tabular">{money(monthly * 60)}</span>.
            </p>
            <ul className="mt-3 flex flex-col gap-1">
              {chosen.map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 text-sm">
                  <Logo src={s.logo_url} name={nameOf(s)} size={26} />
                  <span className="min-w-0 flex-1 truncate">
                    {nameOf(s)}
                    {s.account?.mask ? <span className="text-muted"> ••{s.account.mask}</span> : null}
                  </span>
                  <span className="text-muted tabular">{money(s.monthly_amount)}/mo</span>
                  <button
                    type="button"
                    onClick={() => onToggle(s.id)}
                    aria-label={`Take ${nameOf(s)} out of the plan`}
                    className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function CategoryCard({ subs, monthlyTotal }: { subs: Subscription[]; monthlyTotal: number }) {
  const rows = useMemo(() => {
    const map = new Map<string, { label: string; monthly: number; count: number }>();
    for (const s of subs) {
      const key = s.category_primary ?? "OTHER";
      const row = map.get(key) ?? {
        label: categoryLabel(s.category_primary),
        monthly: 0,
        count: 0,
      };
      row.monthly += s.monthly_amount;
      row.count += 1;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.monthly - a.monthly);
  }, [subs]);

  return (
    <Card>
      <CardHeader
        title="By category"
        icon={
          <IconChip>
            <ChartPie />
          </IconChip>
        }
      />
      <AllocationBar label="Monthly subscription cost by category" className="mt-5" values={rows.map((r) => r.monthly)} />
      <ul className="mt-4 flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <li key={r.label} className="flex items-center gap-2.5 text-sm">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: colorAt(i) }} />
            <span className="min-w-0 flex-1 truncate">
              {r.label} <span className="text-muted">· {r.count}</span>
            </span>
            <span className="font-medium tabular">{money(r.monthly)}/mo</span>
            <span className="w-10 text-right text-muted tabular">{percent(monthlyTotal ? r.monthly / monthlyTotal : 0)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------------ */
/* Page                                                                      */
/* ------------------------------------------------------------------------ */

export default function SubscriptionsPage() {
  return (
    <Suspense>
      <Subscriptions />
    </Suspense>
  );
}

function Subscriptions() {
  const { data, isLoading } = useApi<SubscriptionsResponse>("/api/subscriptions");
  const mounted = useMounted();
  const [view, setView] = useQueryState<"stopped" | "hidden">("list", "stopped", ["stopped", "hidden"]);
  const [sort, setSort] = useQueryState<SortValue>(
    "sort",
    "cost",
    SORTS.map((s) => s.value),
  );
  const [account, setAccount] = useQueryState<string>("account", "");
  // The cancel plan lives in the URL (?cut=id,id) so it survives a reload and can be shared with yourself.
  const [cutParam, setCutParam] = useQueryState<string>("cut", "", (v) => /^[\w-]+(,[\w-]+)*$/.test(v));

  const subs = useMemo(() => data?.subscriptions ?? [], [data]);
  const stopped = data?.stopped ?? [];
  const hidden = data?.hidden ?? [];
  const monthlyTotal = data?.totals.monthly ?? 0;

  // Color follows the subscription (its cost rank), not its position after sorting or filtering.
  const colors = useMemo(() => new Map(subs.map((s, i) => [s.id, colorAt(i)])), [subs]);
  const cut = useMemo(() => new Set(cutParam.split(",").filter((id) => subs.some((s) => s.id === id))), [cutParam, subs]);
  const toggleCut = (id: string) => {
    const next = new Set(cut);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCutParam([...next].join(","));
  };

  const accounts = useMemo(() => [...new Map(subs.filter((s) => s.account_id).map((s) => [s.account_id!, accountOf(s)])).entries()], [subs]);
  const shown = useMemo(() => {
    const by: Record<SortValue, (a: Subscription, b: Subscription) => number> = {
      cost: (a, b) => b.monthly_amount - a.monthly_amount,
      next: (a, b) => (a.predicted_next_date ?? "9").localeCompare(b.predicted_next_date ?? "9"),
      spent: (a, b) => b.total_spent - a.total_spent,
      newest: (a, b) => (b.first_date ?? "").localeCompare(a.first_date ?? ""),
      name: (a, b) => nameOf(a).localeCompare(nameOf(b)),
    };
    return subs.filter((s) => !account || s.account_id === account).sort((a, b) => by[sort](a, b) || nameOf(a).localeCompare(nameOf(b)));
  }, [subs, account, sort]);

  // Date-relative pieces use the viewer's clock, so they wait for mount.
  const insights = useMemo(() => (mounted ? buildInsights(subs, localToday()) : []), [subs, mounted]);
  const upcoming = useMemo(() => (mounted ? upcomingCharges(subs, localToday(), 30) : []), [subs, mounted]);

  // Chart from the first month with a charge (at least 6 months shown).
  const history = useMemo(() => {
    const h = data?.history ?? [];
    const first = h.findIndex((m) => m.amount > 0);
    return first === -1 ? h : h.slice(Math.min(first, Math.max(0, h.length - 6)));
  }, [data]);
  const lastYear = (data?.history ?? []).reduce((s, m) => s + m.amount, 0);
  const secondary = view === "stopped" ? stopped : hidden;

  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Everything that charges you on repeat" />
      <div className="mt-5 grid grid-cols-1 gap-4 px-4 sm:px-6 md:grid-cols-2 lg:mt-7 lg:px-8 xl:grid-cols-3">
        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:col-span-2 xl:col-span-3 xl:grid-cols-4">
          <Tile icon={<Repeat />} title="Monthly cost" value={monthlyTotal} sub={plural(data?.totals.count ?? 0, "active subscription")} loading={isLoading} />
          <Tile icon={<CalendarRange />} title="Yearly cost" value={data?.totals.yearly ?? 0} sub="At today’s prices" loading={isLoading} />
          <Tile
            icon={<CalendarClock />}
            title="Due in 30 days"
            value={upcoming.reduce((s, c) => s + c.amount, 0)}
            sub={upcoming[0] ? `Next: ${nameOf(upcoming[0].sub)}, ${whenLabel(upcoming[0].date)}` : "Nothing scheduled"}
            loading={isLoading || !mounted}
          />
          <Tile icon={<Wallet />} title="Last 12 months" value={lastYear} sub="Actually charged for subscriptions" loading={isLoading} />
        </div>

        <InsightsCard
          insights={insights}
          stoppedCount={stopped.length}
          planned={cut}
          loading={isLoading || !mounted}
          onPlan={(id) => !cut.has(id) && toggleCut(id)}
          onReviewStopped={() => {
            setView("stopped");
            document.getElementById("stopped")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <ComingUp upcoming={upcoming} loading={isLoading || !mounted} />

        {/* Active list */}
        <Card className="md:col-span-2">
          <CardHeader title="Active subscriptions" action={data ? <Pill className="tabular">{money(monthlyTotal)}/mo</Pill> : null} />
          {isLoading ? (
            <Skeleton className="mt-5 h-64 w-full" />
          ) : subs.length ? (
            <>
              <AllocationBar label="Monthly cost by subscription" className="mt-5" values={subs.map((s) => s.monthly_amount)} />
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <SelectPill label="Sort subscriptions" value={sort} active={sort !== "cost"} onChange={(v) => setSort(v as SortValue)}>
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </SelectPill>
                {accounts.length > 1 ? (
                  <SelectPill label="Account" value={account} onChange={setAccount}>
                    <option value="">All accounts</option>
                    {accounts.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </SelectPill>
                ) : null}
                {account ? (
                  <span className="text-sm text-muted">
                    {plural(shown.length, "subscription")} ·{" "}
                    <span className="tabular">
                      {money(shown.reduce((s, x) => s + x.monthly_amount, 0))}
                      /mo
                    </span>
                  </span>
                ) : null}
              </div>
              <div className="@container">
                <div aria-hidden="true" className="sub-row mt-4 hidden border-b border-line pb-2 text-xs font-medium text-muted @4xl:grid">
                  <span className="[grid-area:name]">Service</span>
                  <span className="[grid-area:hist]">History</span>
                  <span className="[grid-area:next]">Next charge</span>
                  <span className="text-right [grid-area:amount]">Amount</span>
                </div>
                <ul className="divide-y divide-line">
                  {shown.map((s) => (
                    <SubscriptionRow
                      key={s.id}
                      s={s}
                      color={colors.get(s.id)}
                      share={monthlyTotal ? s.monthly_amount / monthlyTotal : undefined}
                      planned={cut.has(s.id)}
                      onTogglePlan={() => toggleCut(s.id)}
                    />
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <EmptyState icon={<Repeat />} title="No subscriptions detected yet">
              Subscriptions appear after a few months of history. If one is missing or wrong, change it from the menu on any recurring charge.
            </EmptyState>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4 md:col-span-2 md:grid md:grid-cols-2 md:items-start xl:col-span-1 xl:flex xl:items-stretch">
          <PlannerCard subs={subs} cut={cut} onToggle={toggleCut} onClear={() => setCutParam("")} monthlyTotal={monthlyTotal} />
          {subs.length ? <CategoryCard subs={subs} monthlyTotal={monthlyTotal} /> : null}
        </div>

        {/* Spend over time */}
        <Card className="md:col-span-2">
          <CardHeader title="Subscription spending" />
          <p className="mt-2 text-sm text-muted">What subscriptions actually charged each month, including ones that have since stopped.</p>
          <div className="mt-5">
            {isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <MonthlyBars
                data={history}
                label="Subscription spending by month"
                height={220}
                note={(m) => (m === history[history.length - 1]?.month ? "so far this month" : null)}
              />
            )}
          </div>
        </Card>

        {/* Stopped / hidden */}
        <Card className="md:col-span-2 xl:col-span-1">
          <div id="stopped" className="absolute -top-6" aria-hidden="true" />
          <CardHeader
            title={view === "stopped" ? "Possibly cancelled" : "Hidden"}
            action={
              <Segmented
                size="sm"
                label="Which list to show"
                options={[
                  { value: "stopped", label: `Stopped ${stopped.length}` },
                  { value: "hidden", label: `Hidden ${hidden.length}` },
                ]}
                value={view}
                onChange={setView}
              />
            }
          />
          <p className="mt-3 text-sm text-muted">
            {view === "stopped" ? "Subscriptions that haven’t charged when expected. Check they’re really cancelled." : "Charges you marked as not recurring."}
          </p>
          {secondary.length ? (
            <ul className="mt-2 divide-y divide-line">
              {secondary.map((s) => (
                <CompactRow key={s.id} s={s} stopped={view === "stopped"} />
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-muted">
              {view === "stopped"
                ? "Nothing has stopped. A subscription that misses its expected charge shows up here."
                : "Nothing hidden. Use a charge’s menu to hide it when it isn’t really recurring."}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
