"use client";

import { Logo, cx } from "@/components/ui";
import type { Bill } from "@/lib/client/types";
import { daysFromToday, dueLabel, FREQUENCY_LABEL, moneyParts, shortDate, tidyName } from "@/lib/format";

/** Dark upcoming-charge card, styled after the "Trending" stock cards. */
export function BillCard({ bill, featured }: { bill: Bill; featured?: boolean }) {
  const name = tidyName(bill.merchant_name ?? bill.description);
  const days = bill.predicted_next_date ? daysFromToday(bill.predicted_next_date) : 0;
  const [whole, cents] = moneyParts(bill.expected_amount);
  // Progress through the billing cycle, for the little meter.
  const cycle = { WEEKLY: 7, BIWEEKLY: 14, SEMI_MONTHLY: 15, MONTHLY: 30, QUARTERLY: 91, ANNUALLY: 365, UNKNOWN: 30 }[bill.frequency];
  const progress = Math.min(1, Math.max(0.04, 1 - days / cycle));

  return (
    <article
      className={cx(
        "relative flex w-[208px] shrink-0 snap-start flex-col rounded-[24px] p-4 text-white",
        featured ? "bg-ink" : "bg-ink-2",
      )}
    >
      <div className="flex items-center gap-3">
        <Logo src={bill.logo_url} name={name} size={40} dark />
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-xs text-white/50">{FREQUENCY_LABEL[bill.frequency]}</p>
        </div>
      </div>
      <p className="mt-6 text-[28px] leading-none font-medium tracking-tight tabular">
        {whole}
        <span className="text-lg text-white/70">{cents}</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className={cx("mt-2 flex justify-between text-xs", bill.overdue ? "text-danger" : "text-white/60")}>
        <span>{bill.predicted_next_date ? dueLabel(bill.predicted_next_date) : ""}</span>
        <span>{bill.predicted_next_date ? shortDate(bill.predicted_next_date) : ""}</span>
      </p>
    </article>
  );
}
