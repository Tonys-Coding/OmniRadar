// Calendar-date helpers for "YYYY-MM-DD" strings (what Plaid and Postgres `date` use).
// All math is done in UTC so results never shift with the server's timezone.

const DAY_MS = 86_400_000;

export function parseDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's date in the server's local timezone, as YYYY-MM-DD. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  return formatDate(new Date(parseDate(iso).getTime() + days * DAY_MS));
}

/** Add calendar months, clamping to the end of shorter months (Jan 31 + 1 = Feb 28/29). */
export function addMonths(iso: string, months: number): string {
  const d = parseDate(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return formatDate(target);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDate(toIso).getTime() - parseDate(fromIso).getTime()) / DAY_MS);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
