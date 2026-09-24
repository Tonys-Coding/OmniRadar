"use client";

import { CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { BillCard } from "@/components/BillCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { StreamMenu } from "@/components/StreamMenu";
import { BigMoney, Card, CardHeader, cx, EmptyState, IconChip, Logo, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/client/api";
import type { BillsResponse, RecurringResponse, Stream } from "@/lib/client/types";
import { addDays, addMonths } from "@/lib/dates";
import { daysFromToday, FREQUENCY_LABEL, money, moneyWhole, relativeDay, tidyName } from "@/lib/format";
import { occurrences } from "@/lib/recurring/occurrences";

type CalendarEntry = { stream: Stream; paid: boolean; amount: number };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MonthCalendar({ streams }: { streams: Stream[] }) {
  const [month, setMonth] = useState(() => `${todayIso().slice(0, 7)}-01`);
  const [picked, setPicked] = useState<string | null>(null);
  const today = todayIso();
  const end = addDays(addMonths(month, 1), -1);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const s of streams) {
      for (const o of occurrences(s, month, end)) {
        const list = map.get(o.date) ?? [];
        list.push({ stream: s, paid: o.paid, amount: s.last_amount ?? s.average_amount ?? 0 });
        map.set(o.date, list);
      }
    }
    return map;
  }, [streams, month, end]);

  const lead = (new Date(`${month}T12:00:00`).getDay() + 6) % 7; // Monday-first
  const days = Array.from({ length: Number(end.slice(8, 10)) }, (_, i) => addDays(month, i));
  const outTotal = [...byDay.values()].flat().filter((e) => e.stream.direction === "outflow").reduce((s, e) => s + e.amount, 0);
  const inTotal = [...byDay.values()].flat().filter((e) => e.stream.direction === "inflow").reduce((s, e) => s + e.amount, 0);
  const pickedEntries = picked ? (byDay.get(picked) ?? []) : [];

  return (
    <Card className="xl:col-span-8">
      <CardHeader
        title={new Date(`${month}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        action={
          <div className="flex gap-1.5">
            <button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} className="grid size-9 place-items-center rounded-full bg-surface hover:bg-line">
              <ChevronLeft className="size-4" />
            </button>
            <button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} className="grid size-9 place-items-center rounded-full bg-surface hover:bg-line">
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />
      <p className="mt-2 text-sm text-muted">
        <span className="text-ink tabular">{money(outTotal)}</span> going out ·{" "}
        <span className="text-brand tabular">{money(inTotal)}</span> coming in
      </p>
      <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs text-muted sm:gap-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} className="pb-1">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead${i}`} />
        ))}
        {days.map((d) => {
          const entries = byDay.get(d) ?? [];
          const out = entries.filter((e) => e.stream.direction === "outflow").reduce((s, e) => s + e.amount, 0);
          return (
            <button
              key={d}
              onClick={() => setPicked(d === picked ? null : d)}
              className={cx(
                "flex aspect-square flex-col items-center justify-between rounded-xl p-1 text-ink transition-colors sm:aspect-auto sm:h-[76px] sm:rounded-2xl sm:p-2",
                d === picked ? "bg-ink text-white" : entries.length ? "bg-surface hover:bg-line" : "hover:bg-surface",
                d === today && d !== picked && "ring-2 ring-brand",
              )}
            >
              <span className={cx("text-xs sm:text-sm", d < today && d !== picked && "text-muted")}>{Number(d.slice(8))}</span>
              {out > 0 ? <span className="hidden text-[11px] font-medium tabular sm:block">{moneyWhole(out)}</span> : null}
              <span className="flex gap-0.5">
                {entries.slice(0, 3).map((e, i) => (
                  <span key={i} className={cx("size-1.5 rounded-full", e.stream.direction === "inflow" ? "bg-brand" : d === picked ? "bg-white" : "bg-ink")} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {picked ? (
        <div className="mt-5 rounded-3xl bg-surface p-4">
          <p className="mb-2 text-sm font-medium">{relativeDay(picked)}</p>
          {pickedEntries.length ? (
            <ul className="flex flex-col gap-2">
              {pickedEntries.map((e) => (
                <li key={e.stream.id} className="flex items-center gap-3 text-sm">
                  <Logo src={e.stream.logo_url} name={e.stream.merchant_name ?? e.stream.description} size={32} />
                  <span className="flex-1 truncate">{tidyName(e.stream.merchant_name ?? e.stream.description)}</span>
                  {e.paid ? <Check className="size-4 text-success" aria-label="Paid" /> : null}
                  <span className={cx("font-medium tabular", e.stream.direction === "inflow" && "text-brand")}>
                    {e.stream.direction === "inflow" ? "+" : ""}
                    {money(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing scheduled.</p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

export default function BillsPage() {
  const { data: upcoming, isLoading } = useApi<BillsResponse>("/api/bills?days=60");
  const { data: recurring } = useApi<RecurringResponse>("/api/recurring");
  const streams = (recurring?.streams ?? []).filter((s) => s.effective_kind !== "transfer" && s.effective_kind !== "other");

  const bills = upcoming?.bills ?? [];
  const dueIn = (days: number) => bills.filter((b) => daysFromToday(b.predicted_next_date!) <= days).reduce((s, b) => s + b.expected_amount, 0);
  const groups = [
    { label: "This week", items: bills.filter((b) => daysFromToday(b.predicted_next_date!) <= 7) },
    { label: "Next 30 days", items: bills.filter((b) => daysFromToday(b.predicted_next_date!) > 7 && daysFromToday(b.predicted_next_date!) <= 30) },
    { label: "Later", items: bills.filter((b) => daysFromToday(b.predicted_next_date!) > 30) },
  ].filter((g) => g.items.length);
  const monthlyFixed = streams.filter((s) => s.direction === "outflow").reduce((s, x) => s + x.monthly_amount, 0);

  return (
    <>
      <PageHeader title="Bills" subtitle="Upcoming charges and paydays" />
      <div className="mt-5 grid animate-fade-up grid-cols-1 gap-4 px-4 sm:px-6 md:grid-cols-3 lg:mt-7 lg:px-8 xl:grid-cols-12">
        {[
          { icon: <CalendarClock />, title: "Due in 7 days", value: dueIn(7) },
          { icon: <CalendarDays />, title: "Due in 30 days", value: dueIn(30) },
          { icon: <Wallet />, title: "Fixed costs / month", value: monthlyFixed },
        ].map((c) => (
          <Card key={c.title} className="flex flex-col gap-6 xl:col-span-4">
            <h2 className="flex items-center gap-2.5 text-[17px] font-medium">
              <IconChip>{c.icon}</IconChip>
              {c.title}
            </h2>
            {isLoading ? <Skeleton className="h-10 w-36" /> : <BigMoney value={c.value} className="text-[34px] leading-none" />}
          </Card>
        ))}

        {bills.length ? (
          <Card dark className="overflow-hidden !px-0 md:col-span-3 xl:col-span-12">
            <CardHeader className="px-5 sm:px-6" title="Coming up" />
            <div className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto px-5 sm:px-6">
              {bills.slice(0, 10).map((b) => (
                <BillCard key={b.id} bill={b} />
              ))}
            </div>
          </Card>
        ) : null}

        <MonthCalendar streams={streams} />

        <Card className="md:col-span-3 xl:col-span-4">
          <CardHeader title="Next 60 days" />
          {isLoading ? (
            <Skeleton className="mt-5 h-64 w-full" />
          ) : groups.length ? (
            groups.map((g) => (
              <section key={g.label} className="mt-5">
                <h3 className="mb-1 text-sm text-muted">{g.label}</h3>
                <ul className="divide-y divide-line">
                  {g.items.map((b) => {
                    const name = tidyName(b.merchant_name ?? b.description);
                    return (
                      <li key={b.id} className="flex items-center gap-3 py-2.5">
                        <Logo src={b.logo_url} name={name} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{name}</p>
                          <p className={cx("truncate text-sm", b.overdue ? "text-danger" : "text-muted")}>
                            {relativeDay(b.predicted_next_date!)} · {FREQUENCY_LABEL[b.frequency]}
                          </p>
                        </div>
                        <span className="font-medium tabular">{money(b.expected_amount)}</span>
                        <StreamMenu stream={b} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          ) : (
            <EmptyState icon={<CalendarClock />} title="No bills detected yet">
              Bills and subscriptions appear once a few months of history are imported.
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
