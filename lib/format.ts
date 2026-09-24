// Display formatting shared by every page.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** $1,234.56 */
export const money = (n: number | null | undefined) => usd.format(n ?? 0);
/** $1,235 */
export const moneyWhole = (n: number | null | undefined) => usdWhole.format(n ?? 0);
/** $1.2K */
export const moneyCompact = (n: number | null | undefined) => usdCompact.format(n ?? 0);

/** Split "$1,234.56" into ["$1,234", ".56"] for big-number styling. */
export function moneyParts(n: number | null | undefined): [string, string] {
  const s = usd.format(n ?? 0);
  const dot = s.lastIndexOf(".");
  return dot === -1 ? [s, ""] : [s.slice(0, dot), s.slice(dot)];
}

/**
 * A transaction amount from the user's point of view: money in is "+$12.00",
 * money out is "-$12.00" (Plaid stores the opposite sign).
 */
export function txnAmount(plaidAmount: number): string {
  return `${plaidAmount < 0 ? "+" : "-"}${usd.format(Math.abs(plaidAmount))}`;
}

export const percent = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? "-" : `${(n * 100).toFixed(digits)}%`;

export const signedPercent = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? "-" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;

const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function daysFromToday(iso: string): number {
  return Math.round((parse(iso).getTime() - parse(localToday()).getTime()) / 86_400_000);
}

/** "Today", "Yesterday", "Tomorrow", "Mon, Sep 22", or "Sep 22, 2025" for other years. */
export function relativeDay(iso: string): string {
  const diff = daysFromToday(iso);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  const d = parse(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", sameYear ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export const shortDate = (iso: string) => parse(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const monthLabel = (yyyyMm: string, style: "short" | "long" = "short") =>
  parse(`${yyyyMm}-01`).toLocaleDateString("en-US", { month: style, ...(style === "long" ? { year: "numeric" } : {}) });

/** "in 3 days", "tomorrow", "today", "2 days ago" */
export function dueLabel(iso: string): string {
  const diff = daysFromToday(iso);
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff > 1) return `In ${diff} days`;
  return diff === -1 ? "Yesterday" : `${-diff} days ago`;
}

export function timeAgo(isoDateTime: string | null): string {
  if (!isoDateTime) return "never";
  const mins = Math.round((Date.now() - new Date(isoDateTime).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  SEMI_MONTHLY: "Twice a month",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Yearly",
  UNKNOWN: "Recurring",
};

/** "Netflix.com 866-579" -> "Netflix.com 866-579" but "OPENAI *CHATGPT SUBSCR" -> "Openai Chatgpt Subscr". */
export function tidyName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/[*#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(text: string): string {
  const words = text.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}
