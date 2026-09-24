import { addDays, parseDate } from "@/lib/dates";
import { classifyCashflow, type CashflowTxn } from "./aggregate";

// Pure analytics over loaded transactions (dashboard, spending page, map).
// Sign convention (Plaid): positive amount = money out, negative = money in.

export type PlaidLocation = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  lat?: number | null;
  lon?: number | null;
} | null;

export type AnalyticsTxn = CashflowTxn & {
  merchant_name: string | null;
  logo_url: string | null;
  payment_channel: string | null;
  location: PlaidLocation;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export type DayTotal = { date: string; spending: number; income: number; count: number };

/** Spending and income per calendar day from `from` to `to` inclusive. */
export function dailyTotals(txns: CashflowTxn[], from: string, to: string, incomeIds: ReadonlySet<string> = new Set()): DayTotal[] {
  const days = new Map<string, DayTotal>();
  for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, { date: d, spending: 0, income: 0, count: 0 });
  for (const t of txns) {
    const day = days.get(t.date);
    if (!day) continue;
    const kind = classifyCashflow(t, incomeIds);
    if (kind === "income") day.income -= t.amount;
    else if (kind === "spending") {
      day.spending += t.amount;
      if (t.amount > 0) day.count++;
    }
  }
  return [...days.values()].map((d) => ({ ...d, spending: round2(d.spending), income: round2(d.income) }));
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const dow = parseDate(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

export type MerchantTotal = { merchant: string; logo_url: string | null; total: number; count: number; category: string | null };

/** Biggest merchants by spending (refunds net out). */
export function topMerchants(txns: AnalyticsTxn[], limit = 10, incomeIds: ReadonlySet<string> = new Set()): MerchantTotal[] {
  const totals = new Map<string, MerchantTotal>();
  for (const t of txns) {
    if (classifyCashflow(t, incomeIds) !== "spending") continue;
    const merchant = t.merchant_name ?? t.name;
    const key = merchant.toLowerCase();
    const entry = totals.get(key) ?? { merchant, logo_url: null, total: 0, count: 0, category: t.category_primary };
    entry.total += t.amount;
    if (t.amount > 0) entry.count++;
    entry.logo_url ??= t.logo_url;
    totals.set(key, entry);
  }
  return [...totals.values()]
    .map((m) => ({ ...m, total: round2(m.total) }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export type LocationTotal = {
  city: string;
  region: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  total: number;
  count: number;
};

export type LocationBreakdown = {
  places: LocationTotal[];
  regions: { region: string; total: number; count: number }[];
  online: { total: number; count: number };
  unknown: { total: number; count: number };
};

/**
 * Spending grouped by where it happened. Online purchases and purchases
 * without a city are reported separately.
 */
export function spendingByLocation(txns: AnalyticsTxn[], incomeIds: ReadonlySet<string> = new Set()): LocationBreakdown {
  const places = new Map<string, LocationTotal>();
  const regions = new Map<string, { region: string; total: number; count: number }>();
  const online = { total: 0, count: 0 };
  const unknown = { total: 0, count: 0 };

  for (const t of txns) {
    if (classifyCashflow(t, incomeIds) !== "spending" || t.amount <= 0) continue;
    const city = t.location?.city?.trim();
    if (!city) {
      const bucket = t.payment_channel === "online" ? online : unknown;
      bucket.total += t.amount;
      bucket.count++;
      continue;
    }
    const region = t.location?.region?.trim().toUpperCase() || null;
    const key = `${city.toLowerCase()}|${region}`;
    const place = places.get(key) ?? {
      city,
      region,
      country: t.location?.country ?? null,
      lat: t.location?.lat ?? null,
      lon: t.location?.lon ?? null,
      total: 0,
      count: 0,
    };
    place.total += t.amount;
    place.count++;
    place.lat ??= t.location?.lat ?? null;
    place.lon ??= t.location?.lon ?? null;
    places.set(key, place);

    if (region) {
      const r = regions.get(region) ?? { region, total: 0, count: 0 };
      r.total += t.amount;
      r.count++;
      regions.set(region, r);
    }
  }

  const byTotal = <T extends { total: number }>(list: T[]) =>
    list.map((x) => ({ ...x, total: round2(x.total) })).sort((a, b) => b.total - a.total);
  return {
    places: byTotal([...places.values()]),
    regions: byTotal([...regions.values()]),
    online: { ...online, total: round2(online.total) },
    unknown: { ...unknown, total: round2(unknown.total) },
  };
}

/** Running total of spending per day of month (for "this month vs last month"). */
export function cumulativeByDay(days: DayTotal[]): { day: number; total: number }[] {
  let running = 0;
  return days.map((d) => {
    running += d.spending;
    return { day: Number(d.date.slice(8, 10)), total: round2(running) };
  });
}
