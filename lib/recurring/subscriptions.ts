import { addDays, daysBetween } from "@/lib/dates";
import { MONTHLY_FACTOR } from "@/lib/finance/categories";
import type { StreamFrequency } from "@/lib/supabase/database.types";
import { occurrences } from "./occurrences";

// Subscription insights: price changes, likely duplicates, spend history, and
// what's coming up. Pure and browser-safe (the Subscriptions page uses some of it).

/** One past charge of a subscription. `amount` is positive (money out). */
export type Charge = { date: string; amount: number };

export type PriceChange = { from: number; to: number; date: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A change smaller than this is noise (tax rounding, FX), not a new price. */
const MIN_CHANGE_ABS = 0.5;
const MIN_CHANGE_PCT = 0.03;
const changed = (a: number, b: number) => Math.abs(a - b) >= Math.max(MIN_CHANGE_ABS, a * MIN_CHANGE_PCT);

/**
 * The most recent price change: the run of charges at today's price, and the
 * price just before it. A single odd charge between two at the same price (a
 * prorated or refunded month) is a blip, not a change. Charges must be sorted
 * oldest first.
 */
export function priceChange(charges: Charge[]): PriceChange | null {
  if (charges.length < 2) return null;
  const latest = charges[charges.length - 1]!.amount;
  let start = charges.length - 1;
  while (start > 0 && !changed(charges[start - 1]!.amount, latest)) start--;
  if (start === 0) return null;
  const before = charges[start - 1]!.amount;
  const blip = start >= 2 && !changed(charges[start - 2]!.amount, latest);
  return blip ? null : { from: round2(before), to: round2(charges[start]!.amount), date: charges[start]!.date };
}

/** "OPENAI *CHATGPT SUBSCR" and "OpenAI ChatGPT" -> "openai chatgpt": letters only, first two words. */
export function serviceKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

type Named = { id: string; merchant_name: string | null; description: string };

/**
 * Subscriptions that look like the same service charged more than once (two
 * plans, two cards, or a family and a personal plan). Returns id -> group key,
 * only for groups with at least two members.
 */
export function findDuplicates(subs: Named[]): Map<string, string> {
  const groups = new Map<string, string[]>();
  for (const s of subs) {
    const key = serviceKey(s.merchant_name ?? s.description);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), s.id]);
  }
  const out = new Map<string, string>();
  for (const [key, ids] of groups) if (ids.length > 1) for (const id of ids) out.set(id, key);
  return out;
}

/** Total charged per calendar month for the `months` months ending with `endMonth` (YYYY-MM), oldest first. */
export function monthlySpend(charges: Charge[], endMonth: string, months = 12): { month: string; amount: number }[] {
  const [y, m] = endMonth.split("-").map(Number) as [number, number];
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (months - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
  const totals = new Map(keys.map((k) => [k, 0]));
  for (const c of charges) {
    const k = c.date.slice(0, 7);
    if (totals.has(k)) totals.set(k, totals.get(k)! + c.amount);
  }
  return keys.map((month) => ({ month, amount: round2(totals.get(month)!) }));
}

type Schedulable = { frequency: StreamFrequency; last_date: string | null; predicted_next_date: string | null; last_amount: number | null; average_amount: number | null };

/** Expected charges from `today` through `days` days out, soonest first. */
export function upcomingCharges<T extends Schedulable>(subs: T[], today: string, days: number): { date: string; amount: number; sub: T }[] {
  const end = addDays(today, days);
  return subs
    .flatMap((sub) =>
      occurrences(sub, today, end)
        .filter((o) => !o.paid)
        .map((o) => ({ date: o.date, amount: sub.last_amount ?? sub.average_amount ?? 0, sub })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

export type InsightSub = Named &
  Schedulable & {
    monthly_amount: number;
    price_change: PriceChange | null;
    duplicate_key: string | null;
  };

export type Insight =
  | { kind: "duplicate"; key: string; subs: InsightSub[]; extra_yearly: number }
  | { kind: "price_up"; sub: InsightSub; change: PriceChange; extra_yearly: number }
  | { kind: "price_down"; sub: InsightSub; change: PriceChange; saved_yearly: number }
  | { kind: "renewal"; sub: InsightSub; date: string; amount: number };

/** How recent a price change must be to call it out. */
const PRICE_CHANGE_DAYS = 120;
/** How far ahead to warn about a big, infrequent (quarterly or yearly) charge. */
const RENEWAL_DAYS = 30;

/**
 * Things worth a look, most money first: duplicate services, recent price
 * increases (and cuts), and quarterly or yearly renewals coming up.
 */
export function buildInsights(subs: InsightSub[], today: string): Insight[] {
  const out: Insight[] = [];

  const groups = new Map<string, InsightSub[]>();
  for (const s of subs) if (s.duplicate_key) groups.set(s.duplicate_key, [...(groups.get(s.duplicate_key) ?? []), s]);
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    // Keeping the most expensive one, the rest is the extra.
    const monthly = group.map((s) => s.monthly_amount).sort((a, b) => b - a);
    out.push({ kind: "duplicate", key, subs: group, extra_yearly: round2(monthly.slice(1).reduce((a, b) => a + b, 0) * 12) });
  }

  for (const s of subs) {
    const c = s.price_change;
    if (!c || daysBetween(c.date, today) > PRICE_CHANGE_DAYS) continue;
    const yearly = round2(Math.abs(c.to - c.from) * MONTHLY_FACTOR[s.frequency] * 12);
    out.push(c.to > c.from ? { kind: "price_up", sub: s, change: c, extra_yearly: yearly } : { kind: "price_down", sub: s, change: c, saved_yearly: yearly });
  }

  for (const s of subs) {
    if ((s.frequency !== "ANNUALLY" && s.frequency !== "QUARTERLY") || !s.predicted_next_date) continue;
    const days = daysBetween(today, s.predicted_next_date);
    if (days >= 0 && days <= RENEWAL_DAYS) out.push({ kind: "renewal", sub: s, date: s.predicted_next_date, amount: s.last_amount ?? s.average_amount ?? 0 });
  }

  const weight = (i: Insight) =>
    i.kind === "duplicate" || i.kind === "price_up" ? i.extra_yearly : i.kind === "renewal" ? i.amount : -1 / (1 + i.saved_yearly);
  return out.sort((a, b) => weight(b) - weight(a));
}
