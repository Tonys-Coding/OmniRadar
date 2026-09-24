import { createHash } from "node:crypto";
import { addDays, addMonths, daysBetween } from "@/lib/dates";
import { classifyStream } from "@/lib/finance/categories";
import type { StreamDirection, StreamFrequency } from "@/lib/supabase/database.types";
import type { StreamInsert } from "./types";

// Local recurring-transaction detector. Used when Plaid's recurring endpoint is
// unavailable (it is a separately billed add-on in production).
//
// Groups transactions by account + direction + normalized merchant, then looks
// for a steady interval between dates and a reasonably stable amount.

export type DetectInput = {
  plaid_transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name: string | null;
  category_primary: string | null;
  category_detailed: string | null;
  pending: boolean;
};

type Band = {
  frequency: StreamFrequency;
  min: number;
  max: number;
  minCount: number;
  next: (lastDate: string) => string;
};

const BANDS: Band[] = [
  { frequency: "WEEKLY", min: 5, max: 9, minCount: 4, next: (d) => addDays(d, 7) },
  { frequency: "BIWEEKLY", min: 12, max: 16, minCount: 3, next: (d) => addDays(d, 14) },
  { frequency: "SEMI_MONTHLY", min: 12, max: 18, minCount: 4, next: (d) => addDays(d, 15) },
  { frequency: "MONTHLY", min: 26, max: 35, minCount: 3, next: (d) => addMonths(d, 1) },
  { frequency: "QUARTERLY", min: 84, max: 98, minCount: 3, next: (d) => addMonths(d, 3) },
  { frequency: "ANNUALLY", min: 350, max: 380, minCount: 2, next: (d) => addMonths(d, 12) },
];

/** Share of intervals that must fall inside the frequency band. */
const INTERVAL_REGULARITY = 0.75;
/** Share of amounts that must be within AMOUNT_TOLERANCE of the median. */
const AMOUNT_REGULARITY = 0.6;
const AMOUNT_TOLERANCE = 0.5;
const LOOKBACK_DAYS = 400;

export function merchantKey(t: Pick<DetectInput, "merchant_name" | "name">): string {
  return (t.merchant_name ?? t.name)
    .toLowerCase()
    .replace(/[^a-z& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 4)
    .join(" ");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mostCommon<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) [best, bestCount] = [v, c];
  return best;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function pickBand(intervals: number[], count: number): Band | undefined {
  const med = median(intervals);
  const fits = (band: Band) =>
    count >= band.minCount &&
    intervals.filter((i) => i >= band.min && i <= band.max).length / intervals.length >= INTERVAL_REGULARITY;

  // Biweekly (exactly every 14 days) vs semi-monthly (1st & 15th: gaps of 13-17)
  // overlap; the median gap separates them.
  if (med >= 12 && med <= 18) {
    const biweekly = BANDS[1]!;
    const semiMonthly = BANDS[2]!;
    if (med <= 14.5 && fits(biweekly)) return biweekly;
    return fits(semiMonthly) ? semiMonthly : undefined;
  }
  return BANDS.find((band) => med >= band.min && med <= band.max && fits(band));
}

export function detectRecurring(transactions: DetectInput[], userId: string, asOf: string): StreamInsert[] {
  const since = addDays(asOf, -LOOKBACK_DAYS);
  const groups = new Map<string, DetectInput[]>();
  for (const t of transactions) {
    if (t.pending || t.amount === 0 || t.date < since) continue;
    const direction: StreamDirection = t.amount > 0 ? "outflow" : "inflow";
    const key = `${t.account_id}|${direction}|${merchantKey(t)}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const streams: StreamInsert[] = [];
  for (const [key, group] of groups) {
    // One charge per day at most (split tenders, retries, etc.)
    const byDate = new Map<string, DetectInput>();
    for (const t of group.sort((a, b) => a.date.localeCompare(b.date))) byDate.set(t.date, t);
    const series = [...byDate.values()];
    if (series.length < 2) continue;

    const intervals = series.slice(1).map((t, i) => daysBetween(series[i]!.date, t.date));
    const band = pickBand(intervals, series.length);
    if (!band) continue;

    const amounts = series.map((t) => Math.abs(t.amount));
    const medAmount = median(amounts);
    const stable = amounts.filter((a) => Math.abs(a - medAmount) <= medAmount * AMOUNT_TOLERANCE).length;
    if (stable / amounts.length < AMOUNT_REGULARITY) continue;

    const first = series[0]!;
    const last = series[series.length - 1]!;
    const direction: StreamDirection = last.amount > 0 ? "outflow" : "inflow";
    const primary = mostCommon(series.map((t) => t.category_primary));
    const detailed = mostCommon(series.map((t) => t.category_detailed));
    const predicted = band.next(last.date);
    const grace = Math.max(5, Math.round(band.min / 2));

    streams.push({
      user_id: userId,
      account_id: last.account_id,
      stream_key: `local:${createHash("sha256").update(key).digest("hex").slice(0, 32)}`,
      source: "local",
      direction,
      kind: classifyStream(direction, primary, detailed),
      description: last.merchant_name ?? last.name,
      merchant_name: last.merchant_name,
      category_primary: primary,
      category_detailed: detailed,
      frequency: band.frequency,
      first_date: first.date,
      last_date: last.date,
      predicted_next_date: predicted,
      average_amount: round2(amounts.reduce((sum, a) => sum + a, 0) / amounts.length),
      last_amount: round2(Math.abs(last.amount)),
      is_active: daysBetween(predicted, asOf) <= grace,
      transaction_ids: series.map((t) => t.plaid_transaction_id),
    });
  }
  return streams;
}
