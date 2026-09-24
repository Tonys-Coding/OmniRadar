"use client";

import { Logo, cx } from "@/components/ui";
import { categoryLabel } from "@/lib/categories-ui";
import type { Transaction } from "@/lib/client/types";
import { relativeDay, tidyName, txnAmount } from "@/lib/format";

export function TransactionRow({
  t,
  onClick,
  showDate = true,
  compact,
}: {
  t: Transaction;
  onClick?: () => void;
  showDate?: boolean;
  compact?: boolean;
}) {
  const incoming = t.amount < 0;
  const name = tidyName(t.merchant_name ?? t.name);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-3.5 rounded-2xl text-left",
        onClick && "-mx-2 px-2 py-2 transition-colors hover:bg-surface",
        !onClick && "py-2",
      )}
    >
      <Logo src={t.logo_url} name={name} size={compact ? 40 : 44} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          {t.pending ? <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted uppercase">Pending</span> : null}
        </span>
        <span className="block truncate text-sm text-muted">
          {categoryLabel(t.category_primary)}
          {t.accounts?.mask ? ` · ••${t.accounts.mask}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={cx("block font-medium tabular", incoming && "text-brand")}>{txnAmount(t.amount)}</span>
        {showDate ? <span className="block text-sm text-muted">{relativeDay(t.date)}</span> : null}
      </span>
    </Tag>
  );
}
