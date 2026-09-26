"use client";

import { Eye, EyeOff, FlaskConical, Landmark, Plus, RefreshCw, TriangleAlert, Wrench } from "lucide-react";
import { useState } from "react";
import { AllocationBar } from "@/components/charts/AllocationBar";
import { ConnectBankButton, type LinkOutcome } from "@/components/PlaidConnect";
import { PageHeader } from "@/components/shell/PageHeader";
import { BigMoney, Button, Card, CardHeader, cx, EmptyState, ErrorNote, Logo, Pill, Skeleton } from "@/components/ui";
import { colorAt } from "@/lib/categories-ui";
import { api, refreshAll, useApi } from "@/lib/client/api";
import type { Account, AccountsResponse, Item, ItemsResponse, SyncResult } from "@/lib/client/types";
import { money, percent, plural, timeAgo } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  depository: "Cash",
  credit: "Credit cards",
  loan: "Loans",
  investment: "Investments",
  other: "Other",
};

function AccountRow({ a }: { a: Account }) {
  const [busy, setBusy] = useState(false);
  async function toggleHidden() {
    setBusy(true);
    try {
      await api.patch(`/api/accounts/${a.id}`, { is_hidden: !a.is_hidden });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }
  const utilization = a.credit_utilization;
  return (
    <li className={cx("flex items-center gap-3 py-3.5", a.is_hidden && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {a.name}
          {a.mask ? <span className="ml-1.5 text-sm font-normal text-faint">••{a.mask}</span> : null}
        </p>
        <p className="truncate text-sm text-muted">
          <span className="capitalize">{a.subtype ?? a.type}</span>
          {a.type === "depository" && a.available_balance !== null ? ` · ${money(a.available_balance)} available` : ""}
          {a.type === "credit" && a.credit_limit ? ` · ${money(a.credit_limit)} limit` : ""}
        </p>
        {utilization !== null ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface">
              <div
                className={cx("h-full rounded-full", utilization > 0.3 ? "bg-danger" : "bg-brand")}
                style={{ width: `${Math.min(100, utilization * 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted">{percent(utilization)} used</span>
          </div>
        ) : null}
      </div>
      <p className={cx("font-medium tabular", a.is_liability && "text-muted")}>
        {a.is_liability && (a.current_balance ?? 0) > 0 ? "-" : ""}
        {money(Math.abs(a.current_balance ?? 0))}
      </p>
      <button
        onClick={toggleHidden}
        disabled={busy}
        aria-label={a.is_hidden ? `Include ${a.name} in totals` : `Hide ${a.name} from totals`}
        title={a.is_hidden ? "Hidden from totals" : "Hide from totals"}
        className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
      >
        {a.is_hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </li>
  );
}

function InstitutionCard({ item, accounts, onMessage }: { item: Item; accounts: Account[]; onMessage: (m: string) => void }) {
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const name = item.institution_name ?? "Bank";
  const healthy = item.status === "good";

  async function sync() {
    setSyncing(true);
    try {
      const { results } = await api.post<{ results: SyncResult[] }>("/api/sync", { item_id: item.id });
      const r = results[0];
      onMessage(r?.error ? `${name}: ${r.error.message}` : `${name} is up to date (${r?.added ?? 0} new)`);
      await refreshAll();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await api.delete(`/api/items/${item.id}`);
      onMessage(`${name} disconnected and its data deleted`);
      await refreshAll();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3.5">
        <Logo name={name} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium">{name}</p>
          <p className="text-sm text-muted">Synced {timeAgo(item.last_synced_at)}</p>
        </div>
        {healthy ? <Pill tone="brand">Connected</Pill> : <Pill tone="danger">{item.needs_relink ? "Reconnect needed" : "Sync error"}</Pill>}
      </div>

      {!healthy ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-danger/8 p-3 text-sm text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {item.needs_relink
              ? `${name} needs you to sign in again before new data can be imported.`
              : `The last sync failed${item.error_code ? ` (${item.error_code})` : ""}. Try again in a few minutes.`}
          </span>
        </div>
      ) : null}

      <ul className="mt-2 divide-y divide-line">
        {accounts.map((a) => (
          <AccountRow key={a.id} a={a} />
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {item.needs_relink ? (
          <ConnectBankButton itemId={item.id} size="sm" onOutcome={(o) => o && onMessage(o.kind === "error" ? o.message : `${name} reconnected`)}>
            <Wrench /> Fix connection
          </ConnectBankButton>
        ) : (
          <Button size="sm" variant="secondary" onClick={sync} loading={syncing}>
            {syncing ? null : <RefreshCw />} Sync now
          </Button>
        )}
        {confirming ? (
          <>
            <Button size="sm" variant="danger" onClick={remove} loading={removing}>
              Remove {name} and its data
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Remove bank…
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function AccountsPage() {
  const { data: accountsData, isLoading, error, mutate } = useApi<AccountsResponse>("/api/accounts?include_hidden=true");
  const { data: itemsData } = useApi<ItemsResponse>("/api/items");
  const { data: health } = useApi<{ env?: { plaid_env?: string } }>("/api/health");
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [addingTest, setAddingTest] = useState(false);
  const sandbox = health?.env?.plaid_env === "sandbox";

  const items = itemsData?.items ?? [];
  const accounts = accountsData?.accounts ?? [];
  const totals = accountsData?.totals;
  const types = Object.entries(totals?.by_type ?? {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  function outcome(o: LinkOutcome | null) {
    if (!o) return;
    setMessage(o.kind === "error" ? o.message : o.kind === "linked" ? `${o.institution ?? "Your bank"} is connected` : "Connection repaired");
  }

  async function addTestBank() {
    setAddingTest(true);
    setStatus("Linking a sandbox test bank…");
    try {
      await api.post("/api/dev/sandbox-link", {});
      await refreshAll();
      setMessage("Sandbox test bank added");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not add test bank");
    } finally {
      setStatus(null);
      setAddingTest(false);
    }
  }

  return (
    <>
      <PageHeader title="Accounts" subtitle={`${plural(items.length, "connected bank")} · ${plural(accounts.length, "account")}`}>
        <div className="mt-5 flex flex-wrap gap-2">
          <ConnectBankButton onOutcome={outcome} onStatus={setStatus}>
            <Plus /> Connect a bank
          </ConnectBankButton>
          {sandbox ? (
            <Button variant="secondary" onClick={addTestBank} loading={addingTest}>
              {addingTest ? null : <FlaskConical />} Add sandbox test bank
            </Button>
          ) : null}
        </div>
      </PageHeader>

      <div className="mt-5 grid animate-fade-up grid-cols-1 gap-4 px-4 sm:px-6 lg:mt-6 lg:px-8 xl:grid-cols-3">
        {status || message ? (
          <div role="status" className="flex items-center justify-between gap-3 rounded-3xl bg-ink px-5 py-4 text-sm text-white xl:col-span-3">
            <span>{status ?? message}</span>
            {message && !status ? (
              <button className="text-white/60 hover:text-white" onClick={() => setMessage(null)}>
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="xl:col-span-3">
            <ErrorNote error={error} onRetry={() => mutate()} />
          </div>
        ) : null}

        <Card dark className="xl:col-span-3">
          <CardHeader title="Net worth" />
          {totals ? (
            <div className="mt-5 grid gap-6 md:grid-cols-[auto_1fr] md:items-end md:gap-10">
              <div>
                <BigMoney value={totals.net_worth} className="text-[44px] leading-none" />
                <p className="mt-2 text-sm text-white/55">
                  {money(totals.assets)} assets · {money(totals.liabilities)} owed
                </p>
              </div>
              <div>
                <AllocationBar label="Net worth by account type" values={types.map(([, v]) => Math.abs(v))} />
                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  {types.map(([type, v], i) => (
                    <li key={type} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-[3px]" style={{ background: colorAt(i) }} />
                      <span className="text-white/60">{TYPE_LABEL[type] ?? type}</span>
                      <span className="tabular">{money(v)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-5 h-16 animate-pulse rounded-2xl bg-white/5" />
          )}
        </Card>

        {isLoading && !accountsData ? (
          Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-72 w-full rounded-[28px]" />)
        ) : items.length === 0 ? (
          <Card className="xl:col-span-3">
            <EmptyState icon={<Landmark />} title="No banks connected yet">
              Connect Bank of America, Capital One, or any of 10,000+ banks. You sign in on your bank’s own page; OmniRadar never sees your password.
            </EmptyState>
          </Card>
        ) : (
          items.map((item) => (
            <InstitutionCard
              key={item.id}
              item={item}
              accounts={accounts.filter((a) => a.institution?.id === item.id)}
              onMessage={setMessage}
            />
          ))
        )}
      </div>
    </>
  );
}
