"use client";

import {
  BellRing,
  Check,
  Database,
  Download,
  KeyRound,
  Landmark,
  Lock,
  LogOut,
  Palette,
  RefreshCw,
  ShieldCheck,
  Trash,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, PageHeader } from "@/components/shell/PageHeader";
import { signOut } from "@/components/shell/AppShell";
import { Button, Card, cx, Logo, Pill, Segmented, Switch } from "@/components/ui";
import { api, refreshAll, useApi } from "@/lib/client/api";
import { nameOf, useSettings } from "@/lib/client/settings";
import type { ItemsResponse, SyncResult } from "@/lib/client/types";
import { money, timeAgo } from "@/lib/format";
import { RANGES } from "@/lib/settings";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "preferences", label: "Preferences", icon: Palette },
  { id: "alerts", label: "Budget & alerts", icon: BellRing },
  { id: "connections", label: "Connected banks", icon: Landmark },
  { id: "security", label: "Security", icon: KeyRound },
  { id: "data", label: "Data & privacy", icon: Database },
] as const;

function Section({
  id,
  title,
  description,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="scroll-mt-6">
      <div id={id} className="absolute -top-6" />
      <div className="flex items-start gap-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface">
          <Icon className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
      <div className="mt-3 divide-y divide-line">{children}</div>
    </Card>
  );
}

function Row({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

const inputClass = "h-10 rounded-full bg-surface px-4 text-sm outline-none ring-brand transition focus:bg-white focus:ring-2";

/** Dollar amount input that commits on blur or Enter. */
function MoneyInput({ value, onCommit, label, placeholder }: { value: number | null; onCommit: (v: number | null) => void; label: string; placeholder?: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value === null ? "" : String(value));
  }
  function commit() {
    const cleaned = text.replace(/[$,\s]/g, "");
    const n = cleaned === "" ? null : Number(cleaned);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setText(value === null ? "" : String(value));
      return;
    }
    const rounded = n === null ? null : Math.round(n * 100) / 100;
    if (rounded !== value) onCommit(rounded);
  }
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm text-muted">$</span>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className={cx(inputClass, "w-32 pl-8 tabular")}
      />
    </label>
  );
}

function useToast() {
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(t);
  }, [message]);
  const node = message ? (
    <div
      role="status"
      className={cx(
        "fixed bottom-28 left-1/2 z-50 flex -translate-x-1/2 animate-fade-up items-center gap-2 rounded-full px-5 py-3 text-sm text-white shadow-xl lg:bottom-8",
        message.tone === "ok" ? "bg-ink" : "bg-danger",
      )}
    >
      {message.tone === "ok" ? <Check className="size-4" /> : null}
      {message.text}
    </div>
  ) : null;
  return { toast: (text: string, tone: "ok" | "error" = "ok") => setMessage({ text, tone }), node };
}

function ProfileSection({ toast }: { toast: (m: string, t?: "ok" | "error") => void }) {
  const { profile, updateDisplayName } = useSettings();
  const [name, setName] = useState(profile.display_name);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== profile.display_name;

  async function save() {
    setSaving(true);
    try {
      await updateDisplayName(name.trim());
      toast("Profile saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section id="profile" title="Profile" description="How OmniRadar greets you." icon={UserRound}>
      <div className="flex items-center gap-4 py-4">
        <Avatar size={64} />
        <div className="min-w-0">
          <p className="truncate text-lg font-medium">{nameOf(profile)}</p>
          <p className="truncate text-sm text-muted">{profile.email}</p>
        </div>
      </div>
      <Row title="Display name" description="Shown in greetings and your avatar.">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) void save();
          }}
        >
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Display name" className={cx(inputClass, "w-full sm:w-56")} />
          <Button type="submit" disabled={!dirty} loading={saving}>
            Save
          </Button>
        </form>
      </Row>
      <Row title="Email" description="Used to sign in. Change it in Supabase Auth if needed.">
        <span className="text-sm text-muted">{profile.email}</span>
      </Row>
      <Row title="Member since">
        <span className="text-sm text-muted">{new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
      </Row>
    </Section>
  );
}

function PreferencesSection() {
  const { settings, update } = useSettings();
  return (
    <Section id="preferences" title="Preferences" description="Display options for this dashboard." icon={Palette}>
      <Row title="Privacy mode" description="Blur balances and amounts. Hover or tap an amount to peek. Also on the eye button in the header.">
        <Switch checked={settings.privacy_mode} onChange={(v) => update({ privacy_mode: v })} label="Privacy mode" />
      </Row>
      <Row title="Show cents" description={`Example: ${settings.show_cents ? "$1,234.56" : "$1,235"}`}>
        <Switch checked={settings.show_cents} onChange={(v) => update({ show_cents: v })} label="Show cents" />
      </Row>
      <Row title="Week starts on" description="Used for “This week” on the dashboard.">
        <Segmented
          size="sm"
          options={[
            { value: "monday", label: "Monday" },
            { value: "sunday", label: "Sunday" },
          ]}
          value={settings.week_start}
          onChange={(v) => update({ week_start: v })}
        />
      </Row>
      <Row title="Default chart range" description="What the balance history chart opens with.">
        <div className="no-scrollbar max-w-full overflow-x-auto">
          <Segmented
            size="sm"
            options={RANGES.map((r) => ({ value: r, label: r === "ALL" ? "All" : r }))}
            value={settings.default_range}
            onChange={(v) => update({ default_range: v })}
          />
        </div>
      </Row>
    </Section>
  );
}

function AlertsSection({ toast }: { toast: (m: string, t?: "ok" | "error") => void }) {
  const { settings, update } = useSettings();
  const a = settings.alerts;
  const save = (patch: Parameters<typeof update>[0], message = "Saved") =>
    update(patch)
      .then(() => toast(message))
      .catch((e: unknown) => toast(e instanceof Error ? e.message : "Could not save", "error"));

  return (
    <Section id="alerts" title="Budget & alerts" description="Targets and the in-app notifications under the bell." icon={BellRing}>
      <Row title="Monthly spending budget" description="Tracked on the dashboard and Spending page. Leave empty for no budget.">
        <MoneyInput label="Monthly budget" value={settings.monthly_budget} placeholder="None" onCommit={(v) => save({ monthly_budget: v }, v ? `Budget set to ${money(v)}` : "Budget removed")} />
      </Row>
      <Row title="Budget pace" description={settings.monthly_budget ? "Warn when you're on pace to overspend, and when you do." : "Set a budget to use this alert."}>
        <Switch checked={a.budget_pace.enabled} disabled={!settings.monthly_budget} onChange={(v) => save({ alerts: { budget_pace: { enabled: v } } })} label="Budget pace alerts" />
      </Row>
      <Row title="Low balance" description="When a checking or savings account drops below this.">
        <MoneyInput label="Low balance threshold" value={a.low_balance.threshold} onCommit={(v) => save({ alerts: { low_balance: { threshold: v ?? 0 } } })} />
        <Switch checked={a.low_balance.enabled} onChange={(v) => save({ alerts: { low_balance: { enabled: v } } })} label="Low balance alerts" />
      </Row>
      <Row title="Large purchases" description="Any purchase in the last 7 days above this.">
        <MoneyInput label="Large purchase threshold" value={a.large_transaction.threshold} onCommit={(v) => save({ alerts: { large_transaction: { threshold: v ?? 0 } } })} />
        <Switch checked={a.large_transaction.enabled} onChange={(v) => save({ alerts: { large_transaction: { enabled: v } } })} label="Large purchase alerts" />
      </Row>
      <Row title="Bill reminders" description="Remind me before bills and subscriptions charge.">
        <label>
          <span className="sr-only">Days before</span>
          <select
            value={a.bill_reminders.days_before}
            onChange={(e) => save({ alerts: { bill_reminders: { days_before: Number(e.target.value) } } })}
            className={cx(inputClass, "appearance-none pr-8")}
          >
            {[0, 1, 2, 3, 5, 7, 14].map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "Same day" : `${d} day${d === 1 ? "" : "s"} before`}
              </option>
            ))}
          </select>
        </label>
        <Switch checked={a.bill_reminders.enabled} onChange={(v) => save({ alerts: { bill_reminders: { enabled: v } } })} label="Bill reminders" />
      </Row>
    </Section>
  );
}

function ConnectionsSection({ toast }: { toast: (m: string, t?: "ok" | "error") => void }) {
  const { data } = useApi<ItemsResponse>("/api/items");
  const { data: health } = useApi<{ env?: { plaid_env?: string } }>("/api/health");
  const [syncing, setSyncing] = useState(false);
  const items = data?.items ?? [];

  async function syncAll() {
    setSyncing(true);
    try {
      const { results } = await api.post<{ results: SyncResult[] }>("/api/sync");
      const failed = results.filter((r) => r.error).length;
      toast(failed ? `${failed} bank(s) failed to sync` : `Synced ${results.length} bank(s)`, failed ? "error" : "ok");
      await refreshAll();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Section id="connections" title="Connected banks" description="Bank connections through Plaid." icon={Landmark}>
      {items.length ? (
        items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 py-3.5">
            <Logo name={i.institution_name ?? "Bank"} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.institution_name ?? "Bank"}</p>
              <p className="text-sm text-muted">
                {i.accounts.length} account{i.accounts.length === 1 ? "" : "s"} · synced {timeAgo(i.last_synced_at)}
              </p>
            </div>
            {i.status === "good" ? <Pill tone="brand">Connected</Pill> : <Pill tone="danger">Needs attention</Pill>}
          </div>
        ))
      ) : (
        <p className="py-4 text-sm text-muted">No banks connected yet.</p>
      )}
      <Row
        title="Data source"
        description={
          health?.env?.plaid_env === "sandbox"
            ? "Plaid sandbox: test data only. Switch PLAID_ENV to production for real banks."
            : "Plaid production: live data from your banks."
        }
      >
        <Pill tone={health?.env?.plaid_env === "sandbox" ? "light" : "brand"}>{health?.env?.plaid_env ?? "…"}</Pill>
      </Row>
      <div className="flex flex-wrap gap-2 pt-4">
        <Button variant="secondary" onClick={syncAll} loading={syncing} disabled={!items.length}>
          {syncing ? null : <RefreshCw />} Sync all now
        </Button>
        <Link href="/accounts" className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-muted hover:bg-surface hover:text-ink">
          Manage banks
        </Link>
      </div>
    </Section>
  );
}

function SecuritySection({ toast }: { toast: (m: string, t?: "ok" | "error") => void }) {
  const { profile } = useSettings();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mismatch = confirm.length > 0 && next !== confirm;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/settings/password", { current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("Password changed");
    } catch (err) {
      const body = (err as { body?: { details?: { fieldErrors?: Record<string, string[]> } } }).body;
      setError(body?.details?.fieldErrors?.new_password?.[0] ?? (err instanceof Error ? err.message : "Could not change password"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section id="security" title="Security" description="Password and sessions." icon={KeyRound}>
      <form onSubmit={changePassword} className="py-4">
        <p className="font-medium">Change password</p>
        <p className="text-sm text-muted">At least 10 characters with a letter and a number.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input type="password" autoComplete="current-password" required placeholder="Current password" aria-label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
          <input type="password" autoComplete="new-password" required minLength={10} placeholder="New password" aria-label="New password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
          <input
            type="password"
            autoComplete="new-password"
            required
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={cx(inputClass, mismatch && "ring-2 ring-danger")}
          />
        </div>
        {error || mismatch ? <p className="mt-2 text-sm text-danger">{mismatch ? "Passwords don't match" : error}</p> : null}
        <Button type="submit" className="mt-3" loading={saving} disabled={!current || !next || mismatch}>
          Update password
        </Button>
      </form>
      <Row title="Last sign-in" description={profile.last_sign_in_at ? new Date(profile.last_sign_in_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Unknown"}>
        <Button variant="secondary" onClick={() => signOut("local")}>
          <LogOut /> Sign out
        </Button>
      </Row>
      <Row title="Sign out everywhere" description="Ends every session on every device, including this one.">
        <Button variant="secondary" onClick={() => signOut("global")}>
          <Lock /> Sign out all devices
        </Button>
      </Row>
    </Section>
  );
}

function DataSection({ toast }: { toast: (m: string, t?: "ok" | "error") => void }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function deleteAll() {
    setDeleting(true);
    try {
      const { banks_removed } = await api.post<{ banks_removed: number }>("/api/settings/delete-data", { confirm: typed });
      toast(`Deleted all data from ${banks_removed} bank(s)`);
      setConfirming(false);
      setTyped("");
      await refreshAll();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete data", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Section id="data" title="Data & privacy" description="Your data, your copy, your call." icon={Database}>
      <Row title="Export transactions" description="Every transaction as a CSV spreadsheet (money out is negative).">
        <a href="/api/export/transactions" download className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-medium hover:bg-line">
          <Download className="size-4" /> Download CSV
        </a>
      </Row>
      <div className="py-4">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4 text-brand-ink" /> How your data is protected
        </p>
        <ul className="mt-2 space-y-1.5 text-sm text-muted">
          <li>• Bank passwords never touch OmniRadar: you sign in on your bank&apos;s own page through Plaid.</li>
          <li>• Bank access tokens are encrypted (AES-256-GCM) and can&apos;t be read from the browser.</li>
          <li>• Every table is locked to your account with row-level security.</li>
          <li>• Nothing is shared or sold. Data leaves only when you export it.</li>
        </ul>
      </div>
      <div className="py-4">
        <div className="rounded-3xl border border-danger/25 bg-danger/5 p-4">
          <p className="flex items-center gap-2 font-medium text-danger">
            <Trash className="size-4" /> Delete all financial data
          </p>
          <p className="mt-1 text-sm text-muted">
            Disconnects every bank at Plaid and permanently deletes accounts, transactions, recurring charges, and history. Your login and preferences stay.
          </p>
          {confirming ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder='Type "DELETE" to confirm' aria-label="Type DELETE to confirm" className={cx(inputClass, "bg-white sm:w-60")} />
              <Button variant="danger" onClick={deleteAll} loading={deleting} disabled={typed !== "DELETE"}>
                Delete everything
              </Button>
              <Button variant="ghost" onClick={() => (setConfirming(false), setTyped(""))}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="danger" className="mt-3" onClick={() => setConfirming(true)}>
              Delete all data…
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}

export default function SettingsPage() {
  const { toast, node } = useToast();
  return (
    <>
      <PageHeader title="Settings" subtitle="Profile, preferences, alerts, and security" />
      <div className="mt-5 grid animate-fade-up grid-cols-1 gap-4 px-4 sm:px-6 lg:mt-7 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8 xl:max-w-6xl">
        <nav aria-label="Settings sections" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:sticky lg:top-6 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`} className="flex shrink-0 items-center gap-2.5 rounded-full bg-surface px-4 py-2.5 text-sm font-medium whitespace-nowrap hover:bg-line lg:bg-transparent lg:hover:bg-surface">
              <Icon className="size-4 text-muted" />
              {label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-4">
          <ProfileSection toast={toast} />
          <PreferencesSection />
          <AlertsSection toast={toast} />
          <ConnectionsSection toast={toast} />
          <SecuritySection toast={toast} />
          <DataSection toast={toast} />
        </div>
      </div>
      {node}
    </>
  );
}
