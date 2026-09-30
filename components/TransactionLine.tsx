"use client";

import { CircleDot, Globe, MapPin, Pencil, Store } from "lucide-react";
import { useState } from "react";
import { cx, Logo } from "@/components/ui";
import { categoryLabel, detailedLabel } from "@/lib/categories-ui";
import { api, refreshAll } from "@/lib/client/api";
import type { Transaction } from "@/lib/client/types";
import { relativeDay, shortDate, tidyName, txnAmount } from "@/lib/format";

/** Filters a row can apply when one of its details is clicked. */
export type RowFilterActions = {
  onMerchant: (name: string) => void;
  onCategory: (category: string) => void;
  onAccount: (accountId: string) => void;
};

const CHANNEL: Record<string, { label: string; icon: typeof Globe }> = {
  online: { label: "Online", icon: Globe },
  "in store": { label: "In store", icon: Store },
  other: { label: "Other", icon: CircleDot },
};

/** Wraps case-insensitive matches of `query` in <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, from)) {
    if (i > from) parts.push(text.slice(from, i));
    parts.push(
      <mark key={i} className="rounded-sm bg-brand-pale text-brand-deep">
        {text.slice(i, i + q.length)}
      </mark>,
    );
    from = i + q.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

function hostname(url: string) {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Inline note editor: click to edit, Enter or leaving the field saves, Escape cancels. */
function NoteCell({ t }: { t: Transaction }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(t.notes ?? "");
  const [saved, setSaved] = useState<string | null>(t.notes);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const merchant = tidyName(t.merchant_name ?? t.name);

  // Follow the note when it changes elsewhere (another tab, a refresh), unless mid-edit.
  const [prevNotes, setPrevNotes] = useState(t.notes);
  if (t.notes !== prevNotes) {
    setPrevNotes(t.notes);
    if (!editing) {
      setSaved(t.notes);
      setDraft(t.notes ?? "");
    }
  }

  async function save() {
    const next = draft.trim() || null;
    setEditing(false);
    if (next === saved) return;
    setStatus("saving");
    try {
      await api.patch(`/api/transactions/${t.id}`, { notes: next });
      setSaved(next);
      setStatus("idle");
      void refreshAll();
    } catch {
      setStatus("error");
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={500}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(saved ?? "");
            setEditing(false);
          }
        }}
        placeholder="Add a note, e.g. split with roommate…"
        aria-label={`Note for ${merchant}`}
        className="h-8 w-full min-w-0 rounded-xl bg-surface px-3 text-sm outline-none ring-brand focus:ring-2"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cx(
        "group/note flex min-w-0 max-w-full items-center gap-1.5 rounded-lg py-0.5 text-left text-sm",
        saved ? "text-ink" : "text-faint hover:text-ink",
      )}
      title={saved ?? "Add a note"}
      aria-label={saved ? `Edit note for ${merchant}: ${saved}` : `Add a note for ${merchant}`}
    >
      {saved ? (
        <>
          <span className="line-clamp-2 min-w-0">{saved}</span>
          <Pencil aria-hidden="true" className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/note:opacity-100 group-focus-visible/note:opacity-100" />
        </>
      ) : (
        <>
          <Pencil aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{status === "saving" ? "Saving…" : "Add note"}</span>
        </>
      )}
      {status === "error" ? <span className="shrink-0 text-xs text-danger">Couldn’t save</span> : null}
    </button>
  );
}

/**
 * One transaction with every detail visible (no side panel): merchant, bank
 * description, category, account, channel, location, note, status, and amount.
 * Laid out by the `.txn-row` grid in globals.css (stacked on phones, one row on wide screens).
 */
export function TransactionLine({
  t,
  query,
  showDate,
  actions,
}: {
  t: Transaction;
  query: string;
  /** Show the date in the row (when the list isn't grouped by day). */
  showDate?: boolean;
  actions: RowFilterActions;
}) {
  const incoming = t.amount < 0;
  const name = tidyName(t.merchant_name ?? t.name);
  const description = t.name && tidyName(t.name) !== name ? t.name : null;
  const channel = t.payment_channel ? CHANNEL[t.payment_channel] : undefined;
  const ChannelIcon = channel?.icon;
  const place = [t.location?.city, t.location?.region].filter(Boolean).join(", ");
  const detail = t.category_detailed ? detailedLabel(t.category_primary, t.category_detailed) : null;
  const authorizedEarlier = t.authorized_date && t.authorized_date !== t.date;

  return (
    <div className="txn-row border-b border-line py-3 last:border-b-0">
      <div className="[grid-area:logo]">
        <Logo src={t.logo_url} name={name} size={40} />
      </div>

      {/* Merchant + bank description */}
      <div className="min-w-0 [grid-area:merchant]">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => actions.onMerchant(name)}
            title={`Show all transactions from ${name}`}
            className="min-w-0 truncate text-left font-medium hover:underline hover:underline-offset-2"
          >
            <Highlight text={name} query={query} />
          </button>
          {t.pending ? <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">Pending</span> : null}
        </div>
        {description ? (
          <p className="truncate text-xs text-faint" title={description}>
            <Highlight text={description} query={query} />
          </p>
        ) : null}
      </div>

      {/* Category */}
      <div className="min-w-0 [grid-area:category]">
        <button
          type="button"
          onClick={() => t.category_primary && actions.onCategory(t.category_primary)}
          disabled={!t.category_primary}
          title={t.category_primary ? `Show only ${categoryLabel(t.category_primary)}` : undefined}
          className="max-w-full truncate rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-ink hover:bg-line disabled:hover:bg-surface"
        >
          {categoryLabel(t.category_primary)}
        </button>
        {detail && detail !== categoryLabel(t.category_primary) ? <p className="mt-0.5 hidden truncate text-xs text-muted md:block">{detail}</p> : null}
      </div>

      {/* Account */}
      <div className="min-w-0 text-right [grid-area:account] md:text-left">
        {t.accounts ? (
          <button
            type="button"
            onClick={() => actions.onAccount(t.account_id)}
            title={`Show only ${t.accounts.name}`}
            className="max-w-full truncate text-left text-sm hover:underline hover:underline-offset-2"
          >
            <span className="hidden md:inline">{t.accounts.name}</span>
            {t.accounts.mask ? <span className="text-muted md:ml-1">••{t.accounts.mask}</span> : null}
          </button>
        ) : (
          <span className="text-sm text-faint">Unknown account</span>
        )}
        <p className="hidden truncate text-xs capitalize text-muted md:block">{t.accounts?.type ?? ""}</p>
      </div>

      {/* Channel, location, website */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted [grid-area:details] md:block md:space-y-0.5">
        {channel && ChannelIcon ? (
          <p className="flex items-center gap-1.5">
            <ChannelIcon aria-hidden="true" className="size-3.5 shrink-0" />
            {channel.label}
          </p>
        ) : null}
        {place ? (
          <p className="flex min-w-0 items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{place}</span>
          </p>
        ) : t.website ? (
          <a
            href={t.website.includes("://") ? t.website : `https://${t.website}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-1.5 hover:text-ink hover:underline hover:underline-offset-2"
          >
            <Globe aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{hostname(t.website)}</span>
          </a>
        ) : null}
      </div>

      {/* Note */}
      <div className="min-w-0 [grid-area:note]">
        <NoteCell t={t} />
      </div>

      {/* Amount + status */}
      <div className="text-right [grid-area:amount]">
        <p className={cx("font-medium tabular", incoming && "text-brand-ink")}>{txnAmount(t.amount)}</p>
        <p className="text-xs text-muted">
          {showDate ? relativeDay(t.date) : t.pending ? "Pending" : "Posted"}
          {authorizedEarlier ? <span className="hidden xl:inline"> · auth {shortDate(t.authorized_date!)}</span> : null}
        </p>
      </div>
    </div>
  );
}

/** Column labels matching the wide `.txn-row` layout. */
export function TransactionColumns() {
  return (
    <div aria-hidden="true" className="txn-row hidden border-b border-line pb-2 text-xs font-medium text-muted xl:grid">
      <span className="[grid-area:merchant]">Merchant</span>
      <span className="[grid-area:category]">Category</span>
      <span className="[grid-area:account]">Account</span>
      <span className="[grid-area:details]">Channel &amp; place</span>
      <span className="[grid-area:note]">Note</span>
      <span className="text-right [grid-area:amount]">Amount</span>
    </div>
  );
}
