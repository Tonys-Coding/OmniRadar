"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { useWidth } from "./useWidth";

export type BarGroup = { label: string; income: number; spending: number };

/** Income (teal) vs spending (ink) side by side for each period. Tab or click a period to read it. */
export function BarPairs({ groups, height = 190 }: { groups: BarGroup[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected ?? groups.length - 1;
  const max = Math.max(1, ...groups.flatMap((g) => [g.income, Math.max(0, g.spending)]));
  const plotH = height - 26;
  const slot = groups.length ? width / groups.length : 0;
  const barW = Math.max(6, Math.min(22, slot * 0.28));
  const current = groups[active];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-brand" />
          <span className="text-muted">Income</span>
          <span className="font-medium tabular">{money(current?.income)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-ink" />
          <span className="text-muted">Spending</span>
          <span className="font-medium tabular">{money(current?.spending)}</span>
        </span>
      </div>
      <div ref={ref} style={{ height }} className="w-full">
        {width > 0 ? (
          <svg width={width} height={height} role="group" aria-label="Income versus spending by period">
            {groups.map((g, i) => {
              const cx = slot * i + slot / 2;
              const hIn = (g.income / max) * plotH;
              const hOut = (Math.max(0, g.spending) / max) * plotH;
              const dim = i !== active ? 0.35 : 1;
              return (
                <g
                  key={g.label + i}
                  role="button"
                  tabIndex={0}
                  aria-pressed={i === active}
                  aria-label={`${g.label}: ${money(g.income)} income, ${money(g.spending)} spending`}
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
                  <rect x={cx - barW - 2} y={plotH - hIn} width={barW} height={Math.max(hIn, 2)} rx={barW / 2} fill="#14A1A5" opacity={dim} />
                  <rect x={cx + 2} y={plotH - hOut} width={barW} height={Math.max(hOut, 2)} rx={barW / 2} fill="#121214" opacity={dim} />
                  <text x={cx} y={height - 6} textAnchor="middle" fontSize={12} fill="#121214" fillOpacity={i === active ? 0.9 : 0.45}>
                    {g.label}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
    </div>
  );
}
