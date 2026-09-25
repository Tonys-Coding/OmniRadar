"use client";

import { ArrowRight, CreditCard, Info, Plus, Receipt, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BankCard, cardStatus, NetworkLogo } from "@/components/BankCard";
import { ConnectBankButton, type LinkOutcome } from "@/components/PlaidConnect";
import { PageHeader } from "@/components/shell/PageHeader";
import { TransactionRow } from "@/components/TransactionRow";
import { BigMoney, Card, CardHeader, cx, EmptyState, ErrorNote, Skeleton, Switch } from "@/components/ui";
import { NETWORKS } from "@/lib/cards";
import { api, refreshAll, useApi } from "@/lib/client/api";
import type { BankCardData, CardsResponse, TransactionsResponse } from "@/lib/client/types";
import { money, percent, timeAgo } from "@/lib/format";
import type { CardNetwork } from "@/lib/supabase/database.types";

const SUBTYPE_LABEL: Record<string, string> = { "credit card": "Credit card", cd: "CD", hsa: "HSA" };
const kindLabel = (c: BankCardData) =>
  c.subtype ? (SUBTYPE_LABEL[c.subtype] ?? c.subtype.charAt(0).toUpperCase() + c.subtype.slice(1)) : c.type;

function Totals({ cards }: { cards: BankCardData[] }) {
  const visible = cards.filter((c) => !c.is_hidden);
  const cash = visible.filter((c) => c.type === "depository").reduce((s, c) => s + (c.current_balance ?? 0), 0);
  const available = visible
    .filter((c) => c.type === "depository")
    .reduce((s, c) => s + (c.available_balance ?? c.current_balance ?? 0), 0);
  const credit = visible.filter((c) => c.type === "credit");
  const owed = credit.reduce((s, c) => s + Math.max(0, c.current_balance ?? 0), 0);
  const limit = credit.reduce((s, c) => s + (c.figures.secondary?.value ?? 0), 0);
  const stats = [
    { label: "Cash across accounts", value: <BigMoney value={cash} className="text-[22px] leading-none sm:text-[28px]" /> },
    credit.length
      ? { label: "Owed on credit cards", value: <BigMoney value={owed} className="text-[22px] leading-none sm:text-[28px]" /> }
      : { label: "Available to spend", value: <BigMoney value={available} className="text-[22px] leading-none sm:text-[28px]" /> },
    credit.length && limit
      ? { label: "Credit used", value: <span className="text-[22px] leading-none sm:text-[28px] font-medium tabular">{percent(owed / limit)}</span> }
      : { label: "Accounts", value: <span className="text-[22px] leading-none sm:text-[28px] font-medium tabular">{visible.length}</span> },
  ];
  return (
    <Card dark className="xl:col-span-12">
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-6">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-sm text-white/55">{s.label}</dt>
            <dd className="mt-2">{s.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-[15px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  );
}

function NetworkPicker({ card, locked }: { card: BankCardData; locked: boolean }) {
  const [saving, setSaving] = useState<CardNetwork | "auto" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = card.card_network ?? "auto";

  async function choose(value: CardNetwork | "auto") {
    if (value === current) return;
    setSaving(value);
    setError(null);
    try {
      await api.patch(`/api/accounts/${card.id}`, { card_network: value === "auto" ? null : value });
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  }

  const options: { value: CardNetwork | "auto"; label: React.ReactNode; name: string }[] = [
    { value: "auto", name: "Automatic", label: "Auto" },
    ...NETWORKS.map((n) => ({ value: n.value, name: n.label, label: <NetworkLogo network={n.value} className="text-ink" /> })),
  ];
  return (
    <div>
      <p className="text-[15px] font-medium">Card network</p>
      <p className="mt-0.5 text-sm text-muted">
        {locked
          ? "Available after the database update above."
          : card.card_network
          ? "You picked this network."
          : card.network
            ? `Guessed from the bank and account name. Pick one if it's wrong.`
            : "Unknown for this bank. Pick one to show its logo."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Card network">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={current === o.value}
            aria-label={o.name}
            title={o.name}
            disabled={locked || saving !== null}
            onClick={() => choose(o.value)}
            className={cx(
              "grid h-10 min-w-14 place-items-center rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-60",
              current === o.value ? "border-ink bg-surface" : "border-line hover:border-faint",
              saving === o.value && "animate-pulse",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function Details({ card, setupNeeded }: { card: BankCardData; setupNeeded: boolean }) {
  const [busy, setBusy] = useState(false);
  const { data: recent } = useApi<TransactionsResponse>(`/api/transactions?account_id=${card.id}&limit=5`);
  const status = cardStatus(card);
  const { utilization } = card.figures;

  async function toggleHidden(include: boolean) {
    setBusy(true);
    try {
      await api.patch(`/api/accounts/${card.id}`, { is_hidden: !include });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title={card.name} action={<span className="text-sm text-muted">{kindLabel(card)}</span>} />
        {status.tone === "warn" ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-danger/8 p-3 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {card.institution?.name ?? "This bank"} needs attention, so these numbers may be out of date.{" "}
              <Link href="/accounts" className="font-medium underline underline-offset-2">
                Fix it on Accounts
              </Link>
            </span>
          </div>
        ) : null}
        <dl className="mt-3 divide-y divide-line">
          <Row label="Bank">{card.institution?.name ?? "-"}</Row>
          {card.official_name && card.official_name !== card.name ? <Row label="Official name">{card.official_name}</Row> : null}
          <Row label={card.type === "credit" ? "Card ending in" : "Account ending in"}>{card.mask ?? "-"}</Row>
          <Row label={card.type === "credit" ? "Balance owed" : "Current balance"}>
            <span className="tabular">{money(card.current_balance)}</span>
          </Row>
          {card.available_balance !== null ? (
            <Row label={card.type === "credit" ? "Available credit" : "Available to spend"}>
              <span className="tabular">{money(card.available_balance)}</span>
            </Row>
          ) : null}
          {card.type === "credit" && card.figures.secondary ? (
            <Row label="Credit limit">
              <span className="tabular">{money(card.figures.secondary.value)}</span>
            </Row>
          ) : null}
          {utilization !== null ? (
            <Row label="Credit used">
              <span className={cx(utilization > 0.3 && "text-danger")}>{percent(utilization)}</span>
            </Row>
          ) : null}
          <Row label="Last synced">{timeAgo(card.institution?.last_synced_at ?? null)}</Row>
        </dl>

        <div className="mt-2 flex items-center justify-between gap-4 border-t border-line pt-4">
          <div>
            <p className="text-[15px] font-medium">Include in totals</p>
            <p className="text-sm text-muted">Hidden accounts are left out of balances and net worth.</p>
          </div>
          <Switch checked={!card.is_hidden} onChange={toggleHidden} disabled={busy} label="Include in totals" />
        </div>

        {card.has_card || card.card_network ? (
          <div className="mt-4 border-t border-line pt-4">
            <NetworkPicker card={card} locked={setupNeeded} />
          </div>
        ) : null}

        <p className="mt-5 flex gap-2 rounded-2xl bg-surface p-3 text-xs text-muted">
          <Info className="mt-px size-3.5 shrink-0" />
          <span>
            {card.type === "credit"
              ? "The last 4 digits are what your bank reports for this card."
              : "The last 4 digits are from your account number, which differs from your debit card's number."}{" "}
            OmniRadar never receives expiration dates or security codes.
          </span>
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Recent activity"
          action={
            <Link href={`/transactions?account=${card.id}`} className="flex items-center gap-1 text-sm text-muted hover:text-ink">
              View all <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <div className="mt-3 flex flex-col">
          {recent ? (
            recent.transactions.length ? (
              recent.transactions.map((t) => <TransactionRow key={t.id} t={t} />)
            ) : (
              <EmptyState icon={<Receipt />} title="No transactions on this account yet" />
            )
          ) : (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="my-2 h-11 w-full" />)
          )}
        </div>
      </Card>
    </div>
  );
}

function CardsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data, error, isLoading, mutate } = useApi<CardsResponse>("/api/cards?include_hidden=true");
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const cards = data?.cards ?? [];
  const selectedId = params.get("card");
  const selected = cards.find((c) => c.id === selectedId) ?? cards[0];
  const banks = new Set(cards.map((c) => c.institution?.id)).size;

  function select(id: string) {
    router.replace(`${pathname}?card=${id}`, { scroll: false });
  }

  function outcome(o: LinkOutcome | null) {
    if (!o) return;
    setMessage(o.kind === "error" ? o.message : o.kind === "linked" ? `${o.institution ?? "Your bank"} is connected` : "Connection repaired");
  }

  return (
    <>
      <PageHeader title="Cards" subtitle={data ? `${cards.length} account${cards.length === 1 ? "" : "s"} across ${banks} bank${banks === 1 ? "" : "s"}` : "Your accounts as cards"}>
        <div className="mt-5">
          <ConnectBankButton onOutcome={outcome} onStatus={setStatus}>
            <Plus /> Add new
          </ConnectBankButton>
        </div>
      </PageHeader>

      <div className="mt-5 grid animate-fade-up grid-cols-1 gap-4 px-4 sm:px-6 lg:mt-6 lg:px-8 xl:grid-cols-12">
        {status || message ? (
          <div className="flex items-center justify-between gap-3 rounded-3xl bg-ink px-5 py-4 text-sm text-white xl:col-span-12">
            <span>{status ?? message}</span>
            {message && !status ? (
              <button className="text-white/60 hover:text-white" onClick={() => setMessage(null)}>
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="xl:col-span-12">
            <ErrorNote error={error} onRetry={() => mutate()} />
          </div>
        ) : null}
        {data?.setup_needed ? (
          <div className="flex items-start gap-2.5 rounded-3xl bg-brand-pale px-5 py-4 text-sm text-brand-deep xl:col-span-12">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              One database update is pending: run <code className="font-medium break-all">supabase/migrations/20260925000000_card_branding.sql</code> in the Supabase SQL Editor to
              enable bank colors, logos, and picking a card network.
            </span>
          </div>
        ) : null}

        {isLoading && !data ? (
          <>
            <Skeleton className="h-28 w-full rounded-[28px] xl:col-span-12" />
            <div className="grid gap-4 sm:grid-cols-2 xl:col-span-7">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="aspect-[1.586/1] w-full rounded-[22px]" />
              ))}
            </div>
          </>
        ) : cards.length === 0 ? (
          <Card className="xl:col-span-12">
            <EmptyState icon={<CreditCard />} title="No cards yet">
              Connect a bank and each checking, savings, and credit card account shows up here as a card.
            </EmptyState>
          </Card>
        ) : (
          <>
            <Totals cards={cards} />
            <section aria-label="Cards" className="min-w-0 xl:col-span-7">
              <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-1 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0">
                {cards.map((c) => (
                  <BankCard
                    key={c.id}
                    card={c}
                    selected={c.id === selected?.id}
                    onSelect={() => select(c.id)}
                    className="w-[86%] shrink-0 snap-center sm:w-auto"
                  />
                ))}
              </div>
              <p className="mt-1 text-center text-xs text-faint sm:hidden">Swipe for more · tap a card for details</p>
            </section>
            <div className="min-w-0 xl:col-span-5">{selected ? <Details key={selected.id} card={selected} setupNeeded={data?.setup_needed ?? false} /> : null}</div>
          </>
        )}
      </div>
    </>
  );
}

export default function CardsPage() {
  return (
    <Suspense>
      <CardsView />
    </Suspense>
  );
}
