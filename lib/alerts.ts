import { addDays } from "@/lib/dates";
import type { Settings } from "@/lib/settings";

// In-app alerts for the notification bell, driven by the user's settings.

export type Alert = {
  /** Stable id so the browser can remember what has been seen. */
  id: string;
  kind: "connection" | "low_balance" | "large_transaction" | "bill_due" | "budget";
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  href: string;
  amount?: number;
  date?: string;
};

export type AlertInputs = {
  today: string;
  settings: Settings;
  items: { id: string; institution_name: string | null; status: string }[];
  accounts: { id: string; name: string; mask: string | null; type: string; current_balance: number | null; available_balance: number | null }[];
  /** Recent outflows already filtered to real spending. */
  recentSpending: { id: string; name: string; amount: number; date: string }[];
  bills: { id: string; name: string; amount: number; due: string }[];
  month: { spending: number; dayOfMonth: number; daysInMonth: number };
};

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function buildAlerts(input: AlertInputs): Alert[] {
  const { settings, today } = input;
  const a = settings.alerts;
  const alerts: Alert[] = [];

  for (const item of input.items) {
    if (item.status === "good") continue;
    alerts.push({
      id: `connection:${item.id}:${item.status}`,
      kind: "connection",
      severity: "critical",
      title: `${item.institution_name ?? "A bank"} needs attention`,
      body: item.status === "error" ? "The last sync failed." : "Sign in again to keep your data updating.",
      href: "/accounts",
    });
  }

  if (a.low_balance.enabled) {
    for (const acct of input.accounts) {
      if (acct.type !== "depository") continue;
      const balance = acct.available_balance ?? acct.current_balance;
      if (balance === null || balance >= a.low_balance.threshold) continue;
      alerts.push({
        id: `low:${acct.id}:${today}`,
        kind: "low_balance",
        severity: "warning",
        title: `Low balance in ${acct.name}${acct.mask ? ` ••${acct.mask}` : ""}`,
        body: `${usd(balance)} available, below your ${usd(a.low_balance.threshold)} alert.`,
        href: "/accounts",
        amount: balance,
      });
    }
  }

  if (a.large_transaction.enabled) {
    for (const t of input.recentSpending) {
      if (t.amount < a.large_transaction.threshold) continue;
      alerts.push({
        id: `large:${t.id}`,
        kind: "large_transaction",
        severity: "info",
        title: `Large purchase: ${t.name}`,
        body: `${usd(t.amount)}, above your ${usd(a.large_transaction.threshold)} alert.`,
        href: `/transactions?q=${encodeURIComponent(t.name)}`,
        amount: t.amount,
        date: t.date,
      });
    }
  }

  if (a.bill_reminders.enabled) {
    const until = addDays(today, a.bill_reminders.days_before);
    for (const b of input.bills) {
      if (b.due < today || b.due > until) continue;
      alerts.push({
        id: `bill:${b.id}:${b.due}`,
        kind: "bill_due",
        severity: "info",
        title: `${b.name} ${b.due === today ? "is due today" : "is due soon"}`,
        body: `${usd(b.amount)} expected on ${b.due}.`,
        href: "/bills",
        amount: b.amount,
        date: b.due,
      });
    }
  }

  const budget = settings.monthly_budget;
  if (a.budget_pace.enabled && budget && budget > 0) {
    const { spending, dayOfMonth, daysInMonth } = input.month;
    const projected = (spending / Math.max(1, dayOfMonth)) * daysInMonth;
    if (spending > budget) {
      alerts.push({
        id: `budget:over:${today.slice(0, 7)}`,
        kind: "budget",
        severity: "critical",
        title: "Over your monthly budget",
        body: `${usd(spending)} spent of ${usd(budget)}.`,
        href: "/spending",
        amount: spending,
      });
    } else if (dayOfMonth >= 5 && projected > budget * 1.05) {
      alerts.push({
        id: `budget:pace:${today.slice(0, 7)}`,
        kind: "budget",
        severity: "warning",
        title: "On pace to exceed your budget",
        body: `Projected ${usd(projected)} this month vs ${usd(budget)} budget.`,
        href: "/spending",
        amount: projected,
      });
    }
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((x, y) => rank[x.severity] - rank[y.severity]);
}
