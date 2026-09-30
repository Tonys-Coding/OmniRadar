"use client";

import { useState } from "react";
import { money, monthLabel } from "@/lib/format";
import { useWidth } from "./useWidth";

/**
 * One bar per month (YYYY-MM) with a dashed average line. Hover, tap, or tab to
 * a month to read it in the header; the latest month is selected by default.
 */
export function MonthlyBars({
  data,
  label,
  height = 200,
  note,
}: {
  data: { month: string; amount: number }[];
  /** What the bars measure, for screen readers ("Subscription spending by month"). */
  label: string;
  height?: number;
  /** Extra text after the selected month's value, e.g. "partial month". */
  note?: (month: string) => string | null;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected ?? data.length - 1;
  const current = data[active];
  const max = Math.max(1, ...data.map((d) => d.amount));
  const avg = data.length ? data.reduce((s, d) => s + d.amount, 0) / data.length : 0;
  const plotH = height - 26;
  const slot = data.length ? width / data.length : 0;
  const barW = Math.max(8, Math.min(34, slot * 0.5));
  const avgY = plotH - (avg / max) * plotH;
  const extra = current && note ? note(current.month) : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm" aria-live="polite">
        <span className="font-medium">{current ? monthLabel(current.month, "long") : ""}</span>
        <span className="font-medium tabular">{money(current?.amount)}</span>
        {extra ? <span className="text-muted">{extra}</span> : null}
        <span className="flex items-center gap-1.5 text-muted">
          <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-faint" />
          Average <span className="tabular">{money(avg)}</span>
        </span>
      </div>
      <div ref={ref} style={{ height }} className="w-full">
        {width > 0 ? (
          <svg width={width} height={height} role="group" aria-label={label}>
            {data.map((d, i) => {
              const h = (d.amount / max) * plotH;
              const cx = slot * i + slot / 2;
              return (
                <g
                  key={d.month}
                  role="button"
                  tabIndex={0}
                  aria-pressed={i === active}
                  aria-label={`${monthLabel(d.month, "long")}: ${money(d.amount)}`}
                  onPointerEnter={() => setSelected(i)}
                  onClick={() => setSelected(i)}
                  onFocus={() => setSelected(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(i);
                    }
                  }}
                  className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-brand [&:focus-visible>rect:first-child]:stroke-2"
                >
                  <rect x={slot * i + 1} y={1} width={slot - 2} height={height - 2} rx={12} fill="transparent" />
                  {d.amount > 0 ? (
                    <rect x={cx - barW / 2} y={plotH - h} width={barW} height={Math.max(h, 4)} rx={4} fill="#14A1A5" opacity={i === active ? 1 : 0.45} />
                  ) : (
                    <rect x={cx - barW / 2} y={plotH - 2} width={barW} height={2} rx={1} fill="#121214" opacity={0.12} />
                  )}
                  <text x={cx} y={height - 6} textAnchor="middle" fontSize={12} fill="#121214" fillOpacity={i === active ? 0.9 : 0.5}>
                    {slot >= 34 || (data.length - 1 - i) % 2 === 0 ? monthLabel(d.month) : ""}
                  </text>
                </g>
              );
            })}
            {avg > 0 ? <line x1={0} x2={width} y1={avgY} y2={avgY} stroke="#737380" strokeWidth={1.5} strokeDasharray="5 5" pointerEvents="none" /> : null}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
