"use client";

import { useMemo, useState } from "react";
import type { DayTotal } from "@/lib/client/types";
import { money, relativeDay } from "@/lib/format";

// Daily spending calendar, styled after the "Trading Activity" grid:
// gray = light day, blues = moderate, ink = heavy.

const LEVELS = ["#EDEDF0", "#C9D8FF", "#5B91FF", "#121214"];
const WEEKDAYS_MON = ["M", "T", "W", "T", "F", "S", "S"];
const WEEKDAYS_SUN = ["S", "M", "T", "W", "T", "F", "S"];

function level(value: number, thresholds: number[]) {
  if (value <= 0) return 0;
  if (value <= thresholds[0]!) return 1;
  if (value <= thresholds[1]!) return 2;
  return 3;
}

export function Heatmap({ days, weekStart = "monday" }: { days: DayTotal[]; weekStart?: "monday" | "sunday" }) {
  const WEEKDAYS = weekStart === "sunday" ? WEEKDAYS_SUN : WEEKDAYS_MON;
  const [hover, setHover] = useState<DayTotal | null>(null);

  const { weeks, thresholds, months } = useMemo(() => {
    // Pad the start so each column is one week (Mon..Sun or Sun..Sat).
    const first = days[0] ? new Date(`${days[0].date}T12:00:00`) : new Date();
    const lead = weekStart === "sunday" ? first.getDay() : (first.getDay() + 6) % 7;
    const cells: (DayTotal | null)[] = [...Array<null>(lead).fill(null), ...days];
    const cols: (DayTotal | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));

    const spent = days.map((d) => d.spending).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p: number) => spent[Math.floor(p * (spent.length - 1))] ?? 0;
    const labels = cols.map((col, i) => {
      const firstDay = col.find(Boolean);
      if (!firstDay) return "";
      const month = new Date(`${firstDay.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" });
      const prev = cols[i - 1]?.find(Boolean);
      const prevMonth = prev ? new Date(`${prev.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" }) : "";
      return month !== prevMonth ? month : "";
    });
    return { weeks: cols, thresholds: [q(0.4), q(0.8)], months: labels };
  }, [days, weekStart]);

  return (
    <div>
      <p className="mb-3 h-5 text-sm text-muted" aria-live="polite">
        {hover ? (
          <>
            <span className="text-ink">{relativeDay(hover.date)}</span> · {money(hover.spending)}
            {hover.count ? ` across ${hover.count} purchase${hover.count === 1 ? "" : "s"}` : ""}
          </>
        ) : (
          "Hover a day to see what you spent"
        )}
      </p>
      <div className="flex gap-1.5">
        <div className="grid grid-rows-7 gap-1.5 pr-1 text-[10px] text-faint">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="flex items-center leading-none">
              {i % 2 === 0 ? d : ""}
            </span>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
          {weeks.map((col, c) => (
            <div key={c} className="grid grid-rows-7 gap-1.5">
              {Array.from({ length: 7 }, (_, r) => {
                const d = col[r];
                if (!d) return <span key={r} className="aspect-square" />;
                return (
                  <span
                    key={r}
                    onPointerEnter={() => setHover(d)}
                    onPointerDown={() => setHover(d)}
                    title={`${d.date}: ${money(d.spending)}`}
                    className="aspect-square rounded-[4px] transition-transform hover:scale-110 sm:rounded-md"
                    style={{ background: LEVELS[level(d.spending, thresholds)] }}
                  />
                );
              })}
            </div>
          ))}
          {months.map((m, c) => (
            <span key={`m${c}`} className="text-[11px] whitespace-nowrap text-muted" style={{ gridColumn: c + 1, gridRow: 2 }}>
              {m}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted">
        Less
        {LEVELS.map((c) => (
          <span key={c} className="size-3 rounded-[3px]" style={{ background: c }} />
        ))}
        More
      </div>
    </div>
  );
}
