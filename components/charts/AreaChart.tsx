"use client";

import { useId, useMemo, useState } from "react";
import { useWidth } from "./useWidth";

export type AreaPoint = { x: string; y: number };

type Props = {
  data: AreaPoint[];
  height?: number;
  formatY: (y: number) => string;
  formatX: (x: string) => string;
  /** Tick label for the x axis (e.g. month name). */
  tickLabel: (x: string) => string;
  /** Dark card (hero) or light card. */
  dark?: boolean;
  ariaLabel: string;
};

const PAD_TOP = 64;
const PAD_BOTTOM = 34;

/**
 * Responsive area chart with a hover/touch readout, styled after the
 * "Portfolio performance" reference: white line, fading fill, pill tooltip.
 */
export function AreaChart({ data, height = 280, formatY, formatX, tickLabel, dark = true, ariaLabel }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const geo = useMemo(() => {
    if (data.length === 0 || width === 0) return null;
    const ys = data.map((d) => d.y);
    let min = Math.min(...ys);
    let max = Math.max(...ys);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
    const plotH = height - PAD_TOP - PAD_BOTTOM;
    const x = (i: number) => (data.length === 1 ? width / 2 : (i / (data.length - 1)) * width);
    const y = (v: number) => PAD_TOP + (1 - (v - min) / (max - min)) * plotH;
    const pts = data.map((d, i) => [x(i), y(d.y)] as const);
    const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
    const area = `${line}L${width},${height - PAD_BOTTOM}L0,${height - PAD_BOTTOM}Z`;

    // ~6 ticks at label changes (e.g. first day of each month), else evenly spaced.
    const ticks: { i: number; label: string }[] = [];
    const want = Math.max(2, Math.min(6, Math.floor(width / 90)));
    const labels = data.map((d) => tickLabel(d.x));
    const changes = labels.map((l, i) => (i === 0 || l !== labels[i - 1] ? i : -1)).filter((i) => i >= 0);
    const source = changes.length >= 2 && changes.length <= want * 2 ? changes : Array.from({ length: want }, (_, k) => Math.round((k / (want - 1)) * (data.length - 1)));
    const step = Math.ceil(source.length / want);
    for (let k = 0; k < source.length; k += step) ticks.push({ i: source[k]!, label: labels[source[k]!]! });
    return { pts, line, area, ticks, x };
  }, [data, width, height, tickLabel]);

  const active = hover ?? data.length - 1;
  const point = geo?.pts[active];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!geo || data.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
  }

  // Keyboard: ←/→ step through points (Shift = a week), Home/End jump to the ends.
  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    const last = data.length - 1;
    const from = hover ?? last;
    const step = e.shiftKey ? 7 : 1;
    const next =
      e.key === "ArrowLeft" ? from - step : e.key === "ArrowRight" ? from + step : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setHover(Math.max(0, Math.min(last, next)));
  }

  const ink = dark ? "#ffffff" : "#121214";
  const tooltipText = data[active] ? `${formatY(data[active].y)}` : "";
  const tooltipDate = data[active] ? formatX(data[active].x) : "";
  const tipW = Math.max(tooltipText.length, tooltipDate.length) * 7.4 + 28;
  const tipX = point ? Math.min(Math.max(point[0] - tipW / 2, 4), width - tipW - 4) : 0;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {geo && point ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${ariaLabel}, ${formatX(data[0]!.x)} to ${formatX(data[data.length - 1]!.x)}. Use the arrow keys to read values.`}
          tabIndex={0}
          className="touch-pan-y overflow-visible rounded-2xl focus-visible:outline-offset-4"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={ink} stopOpacity={dark ? 0.32 : 0.14} />
              <stop offset="100%" stopColor={ink} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={geo.area} fill={`url(#${gradientId})`} />
          <path d={geo.line} fill="none" stroke={ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          <line x1={point[0]} x2={point[0]} y1={point[1]} y2={height - PAD_BOTTOM} stroke={ink} strokeOpacity={0.5} strokeWidth={1} />
          <circle cx={point[0]} cy={point[1]} r={9} fill={ink} fillOpacity={0.18} />
          <circle cx={point[0]} cy={point[1]} r={5} fill={dark ? "#121214" : "#fff"} stroke={ink} strokeWidth={2} />

          <g transform={`translate(${tipX},${Math.max(point[1] - 62, 2)})`}>
            <rect width={tipW} height={44} rx={22} fill={dark ? "#fff" : "#121214"} />
            <text x={tipW / 2} y={19} textAnchor="middle" fontSize={13} fontWeight={500} fill={dark ? "#121214" : "#fff"} className="tabular">
              {tooltipText}
            </text>
            <text x={tipW / 2} y={34} textAnchor="middle" fontSize={10.5} fill={dark ? "#121214" : "#fff"} fillOpacity={0.6}>
              {tooltipDate}
            </text>
          </g>

          {geo.ticks.map((t) => (
            <text
              key={t.i}
              x={Math.min(Math.max(geo.x(t.i), 14), width - 14)}
              y={height - 10}
              textAnchor="middle"
              fontSize={12}
              fill={ink}
              fillOpacity={0.55}
            >
              {t.label}
            </text>
          ))}
        </svg>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {hover !== null ? `${tooltipDate}: ${tooltipText}` : ""}
      </p>
    </div>
  );
}
