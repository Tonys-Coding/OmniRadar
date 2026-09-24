"use client";

import { ChevronLeft, ChevronRight, Gauge, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CompareLines } from "@/components/charts/CompareLines";
import { Heatmap } from "@/components/charts/Heatmap";
import { SpendingMap } from "@/components/charts/SpendingMap";
import { PageHeader } from "@/components/shell/PageHeader";
import { BigMoney, Card, CardHeader, cx, EmptyState, IconChip, Logo, Pill, Segmented, Skeleton } from "@/components/ui";
import { categoryLabel, colorAt } from "@/lib/categories-ui";
import { useApi } from "@/lib/client/api";
import { useSettings } from "@/lib/client/settings";
import type { BreakdownResponse, DailyResponse, LocationsResponse } from "@/lib/client/types";
import { addMonths } from "@/lib/dates";
import { money, monthLabel, percent, signedPercent, tidyName } from "@/lib/format";

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SpendingPage() {
  const { settings } = useSettings();
  const budget = settings.monthly_budget;
  const [month, setMonth] = useState(currentMonth);
  const [mapDays, setMapDays] = useState<"30" | "90" | "365">("90");
  const { data, isLoading } = useApi<BreakdownResponse>(`/api/spending/breakdown?month=${month}`);
  const { data: daily } = useApi<DailyResponse>("/api/spending/daily?days=182");
  const { data: places } = useApi<LocationsResponse>(`/api/spending/locations?days=${mapDays}`);

  const isCurrent = month === currentMonth();
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const daysElapsed = isCurrent ? new Date().getDate() : daysInMonth;
  const dailyAvg = data ? data.total / daysElapsed : 0;
  const projected = isCurrent ? dailyAvg * daysInMonth : null;
  const maxCat = Math.max(1, ...(data?.categories.map((c) => c.total) ?? []));

  return (
    <>
      <PageHeader title="Spending" subtitle="Where your money goes">
        <div className="mt-5 inline-flex items-center gap-1 rounded-full bg-surface p-1">
          <button aria-label="Previous month" onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))} className="grid size-9 place-items-center rounded-full hover:bg-line">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-36 text-center text-sm font-medium">{monthLabel(month, "long")}</span>
          <button
            aria-label="Next month"
            disabled={isCurrent}
            onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}
            className="grid size-9 place-items-center rounded-full hover:bg-line disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </PageHeader>

      <div className="mt-5 grid animate-fade-up grid-cols-1 gap-4 px-4 sm:px-6 md:grid-cols-3 lg:mt-6 lg:px-8 xl:grid-cols-12">
        {[
          {
            icon: <Receipt />,
            title: "Spent",
            value: data?.total ?? 0,
            badge:
              data && data.change !== null ? (
                <Pill tone={data.change > 0 ? "dark" : "brand"}>
                  {data.change > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {signedPercent(data.change)} vs {monthLabel(addMonths(`${month}-01`, -1).slice(0, 7))}
                </Pill>
              ) : null,
          },
          { icon: <Gauge />, title: "Daily average", value: dailyAvg, badge: <Pill tone="light">{daysElapsed} days</Pill> },
          {
            icon: <TrendingUp />,
            title: isCurrent ? "Projected month" : "Last month",
            value: projected ?? data?.previous_total ?? 0,
            badge: isCurrent ? (
              budget ? (
                <Pill tone={(projected ?? 0) > budget ? "danger" : "brand"}>
                  {(projected ?? 0) > budget ? `${money((projected ?? 0) - budget)} over budget` : "within budget"}
                </Pill>
              ) : (
                <Pill tone="light">at this pace</Pill>
              )
            ) : null,
          },
        ].map((c) => (
          <Card key={c.title} className="flex flex-col gap-6 xl:col-span-4">
            <h2 className="flex items-center gap-2.5 text-[17px] font-medium">
              <IconChip>{c.icon}</IconChip>
              {c.title}
            </h2>
            {isLoading && !data ? (
              <Skeleton className="h-10 w-40" />
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                <BigMoney value={c.value} className="text-[34px] leading-none" />
                {c.badge}
              </div>
            )}
          </Card>
        ))}

        <Card className="md:col-span-3 xl:col-span-7">
          <CardHeader title="Month to date" />
          <div className="mt-2 mb-4 flex gap-5 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-5 rounded bg-brand" /> {monthLabel(month, "long")}
            </span>
            <span className="flex items-center gap-2 text-muted">
              <span className="h-0.5 w-5 rounded border-t-2 border-dashed border-faint" /> Previous month
            </span>
          </div>
          {data ? <CompareLines current={data.running.current} previous={data.running.previous} /> : <Skeleton className="h-56 w-full" />}
        </Card>

        <Card className="md:col-span-3 xl:col-span-5">
          <CardHeader title="Top merchants" />
          {data ? (
            data.merchants.length ? (
              <ol className="mt-3 flex flex-col">
                {data.merchants.slice(0, 7).map((m, i) => {
                  const name = tidyName(m.merchant);
                  return (
                    <li key={m.merchant}>
                      <Link href={`/transactions?q=${encodeURIComponent(m.merchant)}`} className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface">
                        <span className="w-4 text-sm text-faint tabular">{i + 1}</span>
                        <Logo src={m.logo_url} name={name} size={38} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{name}</span>
                          <span className="block truncate text-sm text-muted">
                            {m.count} purchase{m.count === 1 ? "" : "s"} · {categoryLabel(m.category)}
                          </span>
                        </span>
                        <span className="font-medium tabular">{money(m.total)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState title="No spending this month" />
            )
          ) : (
            <Skeleton className="mt-4 h-64 w-full" />
          )}
        </Card>

        <Card className="md:col-span-3 xl:col-span-7">
          <CardHeader title="Categories" action={data ? <span className="text-sm text-muted tabular">{money(data.total)}</span> : null} />
          {data ? (
            data.categories.length ? (
              <ul className="mt-5 flex flex-col gap-4">
                {data.categories.map((c, i) => {
                  const change = c.previous_total > 0 ? (c.total - c.previous_total) / c.previous_total : null;
                  return (
                    <li key={c.category}>
                      <Link href={`/transactions?category=${c.category}`} className="group block">
                        <div className="flex items-baseline justify-between gap-3 text-[15px]">
                          <span className="flex items-center gap-2.5">
                            <span className="size-3 rounded-[4px]" style={{ background: colorAt(i) }} />
                            <span className="group-hover:text-brand">{categoryLabel(c.category)}</span>
                            <span className="text-xs text-faint">{percent(c.share)}</span>
                          </span>
                          <span className="flex items-baseline gap-3">
                            {change !== null ? (
                              <span className={cx("text-xs tabular", change > 0 ? "text-ink" : "text-brand")}>
                                {change > 0 ? "▲" : "▼"} {percent(Math.abs(change))}
                              </span>
                            ) : (
                              <span className="text-xs text-faint">new</span>
                            )}
                            <span className="font-medium tabular">{money(c.total)}</span>
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
                          <div className="h-full rounded-full" style={{ width: `${(c.total / maxCat) * 100}%`, background: colorAt(i) }} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="No spending this month" />
            )
          ) : (
            <Skeleton className="mt-5 h-64 w-full" />
          )}
        </Card>

        <Card className="md:col-span-3 xl:col-span-5">
          <CardHeader title="Spending activity" action={<Pill>26 weeks</Pill>} />
          <div className="mt-4">{daily ? <Heatmap days={daily.days} weekStart={settings.week_start} /> : <Skeleton className="h-48 w-full" />}</div>
          {daily ? (
            <p className="mt-4 text-sm text-muted">
              {money(daily.stats.total)} over {daily.stats.active_days} days with spending · biggest day {money(daily.stats.max)}
            </p>
          ) : null}
        </Card>

        <Card dark className="scroll-mt-6 md:col-span-3 xl:col-span-12">
          <div id="map" />
          {places ? (
            <SpendingMap
              data={places}
              listSize={8}
              action={
                <Segmented
                  dark
                  size="sm"
                  options={[
                    { value: "30", label: "30D" },
                    { value: "90", label: "90D" },
                    { value: "365", label: "1Y" },
                  ]}
                  value={mapDays}
                  onChange={setMapDays}
                />
              }
            />
          ) : (
            <div className="h-80 animate-pulse rounded-3xl bg-white/5" />
          )}
          {places && places.unknown.total > 0 ? (
            <p className="mt-4 text-xs text-white/40">
              {money(places.unknown.total)} across {places.unknown.count} purchases had no location from the bank.
            </p>
          ) : null}
        </Card>
      </div>
    </>
  );
}
