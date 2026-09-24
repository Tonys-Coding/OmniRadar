"use client";

import { useId } from "react";
import { money } from "@/lib/format";
import { useWidth } from "./useWidth";

type Series = { day: number; total: number }[];

/** Running total this month (solid, filled) vs last month (dashed). */
export function CompareLines({ current, previous, height = 220 }: { current: Series; previous: Series; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const gradient = useId();
  const padTop = 16;
  const padBottom = 26;
  const days = 31;
  const max = Math.max(1, ...current.map((p) => p.total), ...previous.map((p) => p.total)) * 1.08;
  const x = (day: number) => ((day - 1) / (days - 1)) * width;
  const y = (v: number) => padTop + (1 - v / max) * (height - padTop - padBottom);
  const path = (s: Series) => s.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.total).toFixed(1)}`).join("");
  const last = current[current.length - 1];

  return (
    <div ref={ref} style={{ height }} className="w-full">
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Spending this month compared with last month">
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#5B91FF" stopOpacity="0.25" />
              <stop offset="1" stopColor="#5B91FF" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={width} y1={y(max * f)} y2={y(max * f)} stroke="#EBEBEF" strokeDasharray="2 4" />
          ))}
          {previous.length > 1 ? <path d={path(previous)} fill="none" stroke="#B9B9C0" strokeWidth={2} strokeDasharray="5 5" /> : null}
          {current.length > 1 ? (
            <>
              <path d={`${path(current)}L${x(last!.day)},${height - padBottom}L0,${height - padBottom}Z`} fill={`url(#${gradient})`} />
              <path d={path(current)} fill="none" stroke="#5B91FF" strokeWidth={2.5} strokeLinejoin="round" />
            </>
          ) : null}
          {last ? (
            <g>
              <circle cx={x(last.day)} cy={y(last.total)} r={5} fill="#fff" stroke="#5B91FF" strokeWidth={2.5} />
              <text x={Math.min(x(last.day) + 8, width - 80)} y={y(last.total) - 10} fontSize={12} fontWeight={500} fill="#121214" className="tabular">
                {money(last.total)}
              </text>
            </g>
          ) : null}
          {[1, 8, 15, 22, 29].map((d) => (
            <text key={d} x={Math.min(Math.max(x(d), 8), width - 8)} y={height - 6} fontSize={11} textAnchor="middle" fill="#8B8B94">
              {d}
            </text>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
