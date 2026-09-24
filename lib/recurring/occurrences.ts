import { addDays, addMonths } from "@/lib/dates";
import type { StreamFrequency } from "@/lib/supabase/database.types";

// Project a recurring stream's charge dates into a window (bills calendar).

const STEP: Record<StreamFrequency, (d: string, n: number) => string> = {
  WEEKLY: (d, n) => addDays(d, 7 * n),
  BIWEEKLY: (d, n) => addDays(d, 14 * n),
  SEMI_MONTHLY: (d, n) => addDays(d, 15 * n),
  MONTHLY: (d, n) => addMonths(d, n),
  QUARTERLY: (d, n) => addMonths(d, 3 * n),
  ANNUALLY: (d, n) => addMonths(d, 12 * n),
  UNKNOWN: (d, n) => addMonths(d, n),
};

export type Occurrence = { date: string; paid: boolean };

/**
 * Dates in [from, to] when a stream charged (up to its last charge, `paid`)
 * or is expected to charge (from the predicted next date onward).
 */
export function occurrences(
  stream: { frequency: StreamFrequency; last_date: string | null; predicted_next_date: string | null },
  from: string,
  to: string,
): Occurrence[] {
  const out: Occurrence[] = [];
  const step = STEP[stream.frequency];
  if (stream.last_date) {
    // Walk back from the last known charge for past dates in the window.
    for (let n = 0; n < 60; n++) {
      const d = step(stream.last_date, -n);
      if (d < from) break;
      if (d <= to) out.push({ date: d, paid: true });
    }
  }
  const anchor = stream.predicted_next_date;
  if (anchor) {
    for (let n = 0; n < 60; n++) {
      const d = step(anchor, n);
      if (d > to) break;
      if (d >= from && !out.some((o) => o.date === d)) out.push({ date: d, paid: false });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
