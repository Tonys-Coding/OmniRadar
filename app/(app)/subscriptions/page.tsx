"use client";

import { CalendarRange, Repeat, Sparkles } from "lucide-react";
import { Suspense } from "react";
import { AllocationBar } from "@/components/charts/AllocationBar";
import { PageHeader } from "@/components/shell/PageHeader";
import { StreamMenu } from "@/components/StreamMenu";
import { BigMoney, Card, CardHeader, cx, EmptyState, IconChip, Logo, Pill, Segmented, Skeleton } from "@/components/ui";
import { colorAt } from "@/lib/categories-ui";
import { useApi } from "@/lib/client/api";
import { useQueryState } from "@/lib/client/hooks";
import type { RecurringResponse, Stream, SubscriptionsResponse } from "@/lib/client/types";
import { dueLabel, FREQUENCY_LABEL, money, percent, plural, relativeDay, shortDate, tidyName } from "@/lib/format";

function SubscriptionRow({ s, share, color }: { s: Stream; share?: number; color?: string }) {
  const name = tidyName(s.merchant_name ?? s.description);
  return (
    <li className="flex items-center gap-3.5 py-3">
      <Logo src={s.logo_url} name={name} size={46} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium">
          {color ? <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} /> : null}
          <span className="truncate">{name}</span>
        </p>
        <p className="truncate text-sm text-muted">
          {FREQUENCY_LABEL[s.frequency]}
          {s.is_active && s.predicted_next_date ? ` · next ${shortDate(s.predicted_next_date)}` : s.last_date ? ` · last ${relativeDay(s.last_date)}` : ""}
          {s.account?.mask ? ` · ••${s.account.mask}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="font-medium tabular">{money(s.last_amount ?? s.average_amount)}</p>
        <p className="text-sm text-muted tabular">
          {s.frequency === "MONTHLY" ? (share !== undefined ? percent(share) : "per month") : `${money(s.monthly_amount)}/mo`}
        </p>
      </div>
      <StreamMenu stream={s} />
    </li>
  );
}

export default function SubscriptionsPage() {
  return (
    <Suspense>
      <Subscriptions />
    </Suspense>
  );
}

function Subscriptions() {
  const { data, isLoading } = useApi<SubscriptionsResponse>("/api/subscriptions");
  const [view, setView] = useQueryState<"inactive" | "hidden">("list", "inactive", ["inactive", "hidden"]);
  const { data: all } = useApi<RecurringResponse>("/api/recurring?direction=outflow&include_inactive=true&include_ignored=true");

  const subs = data?.subscriptions ?? [];
  const totals = data?.totals;
  const next = [...subs].filter((s) => s.predicted_next_date).sort((a, b) => a.predicted_next_date!.localeCompare(b.predicted_next_date!))[0];
  const inactive = (all?.streams ?? []).filter((s) => !s.is_active && !s.is_ignored && s.effective_kind === "subscription");
  const hidden = (all?.streams ?? []).filter((s) => s.is_ignored);
  const secondary = view === "inactive" ? inactive : hidden;

  return (
    <>
      <PageHeader title="Subscriptions" subtitle="Everything that charges you on repeat" />
      <div className="mt-5 grid grid-cols-1 gap-4 px-4 sm:px-6 md:grid-cols-3 lg:mt-7 lg:px-8">
        {[
          { icon: <Repeat />, title: "Monthly cost", value: totals?.monthly, sub: plural(totals?.count ?? 0, "active subscription") },
          { icon: <CalendarRange />, title: "Yearly cost", value: totals?.yearly, sub: "At today’s prices" },
          {
            icon: <Sparkles />,
            title: "Next charge",
            value: next ? (next.last_amount ?? next.average_amount ?? 0) : 0,
            sub: next ? `${tidyName(next.merchant_name ?? next.description)} · ${dueLabel(next.predicted_next_date!).toLowerCase()}` : "Nothing scheduled",
          },
        ].map((c) => (
          <Card key={c.title} className="flex flex-col gap-6">
            <h2 className="flex items-center gap-2.5 text-[17px] font-medium">
              <IconChip>{c.icon}</IconChip>
              {c.title}
            </h2>
            {isLoading ? (
              <Skeleton className="h-10 w-36" />
            ) : (
              <div>
                <BigMoney value={c.value ?? 0} className="text-[34px] leading-none" />
                <p className="mt-2 truncate text-sm text-muted">{c.sub}</p>
              </div>
            )}
          </Card>
        ))}

        <Card className="md:col-span-3 xl:col-span-2">
          <CardHeader title="Active subscriptions" action={totals ? <Pill className="tabular">{money(totals.monthly)}/mo</Pill> : null} />
          {isLoading ? (
            <Skeleton className="mt-5 h-64 w-full" />
          ) : subs.length ? (
            <>
              <AllocationBar label="Monthly cost by subscription" className="mt-5" values={subs.map((s) => s.monthly_amount)} />
              <ul className="mt-3 divide-y divide-line">
                {subs.map((s, i) => (
                  <SubscriptionRow key={s.id} s={s} share={totals?.monthly ? s.monthly_amount / totals.monthly : undefined} color={colorAt(i)} />
                ))}
              </ul>
            </>
          ) : (
            <EmptyState icon={<Repeat />} title="No subscriptions detected yet">
              Subscriptions appear after a few months of history. If one is missing or wrong, change it from the menu on any recurring charge.
            </EmptyState>
          )}
        </Card>

        <Card className="md:col-span-3 xl:col-span-1">
          <CardHeader
            title={view === "inactive" ? "Possibly cancelled" : "Hidden"}
            action={
              <Segmented
                size="sm"
                label="Which list to show"
                options={[
                  { value: "inactive", label: `Stopped ${inactive.length}` },
                  { value: "hidden", label: `Hidden ${hidden.length}` },
                ]}
                value={view}
                onChange={setView}
              />
            }
          />
          <p className="mt-3 text-sm text-muted">
            {view === "inactive"
              ? "Subscriptions that haven’t charged when expected. Check they’re really cancelled."
              : "Charges you marked as not recurring."}
          </p>
          {secondary.length ? (
            <ul className={cx("mt-2 divide-y divide-line")}>
              {secondary.map((s) => (
                <SubscriptionRow key={s.id} s={s} />
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-muted">
              {view === "inactive"
                ? "Nothing has stopped. A subscription that misses its expected charge shows up here."
                : "Nothing hidden. Use a charge’s menu to hide it when it isn’t really recurring."}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
