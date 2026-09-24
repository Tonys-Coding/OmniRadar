"use client";

import { ArrowUpRight, Globe, MapPin } from "lucide-react";
import Link from "next/link";
import { useId, useMemo } from "react";
import { cx } from "@/components/ui";
import type { LocationsResponse } from "@/lib/client/types";
import { money, moneyWhole } from "@/lib/format";
import { MAP_HEIGHT, MAP_WIDTH, mapDots, placePoint } from "@/lib/geo/us";

// Dark "Product Distributor"-style card: hex-dot US map shaded by spending per
// state, glowing markers for top places, white chips on the top two, and a
// frosted list of places.

const BASE_DOT = "#2A2A31";

export function SpendingMap({
  data,
  compact,
  listSize = 5,
  action,
}: {
  data: LocationsResponse;
  compact?: boolean;
  listSize?: number;
  action?: React.ReactNode;
}) {
  const glowId = useId();
  const dots = useMemo(() => mapDots(compact ? 0.72 : 0.6), [compact]);
  const regionTotals = useMemo(() => new Map(data.regions.map((r) => [r.region, r.total])), [data.regions]);
  const maxRegion = Math.max(1, ...data.regions.map((r) => r.total));

  const markers = useMemo(() => {
    const maxPlace = Math.max(1, ...data.places.map((p) => p.total));
    return data.places
      .slice(0, 12)
      .map((p) => ({ p, xy: placePoint(p), weight: Math.sqrt(p.total / maxPlace) }))
      .filter((m): m is { p: (typeof data.places)[number]; xy: [number, number]; weight: number } => m.xy !== null);
  }, [data]);

  const list = [
    ...data.places.slice(0, listSize).map((p) => ({ key: `${p.city}|${p.region}`, label: p.city, sub: p.region ?? p.country ?? "", total: p.total, online: false })),
    ...(data.online.total > 0 ? [{ key: "online", label: "Online", sub: `${data.online.count} purchases`, total: data.online.total, online: true }] : []),
  ];
  const hasData = data.places.length > 0 || data.online.total > 0;

  return (
    <div className="relative overflow-hidden">
      <div className={cx("flex items-center justify-between gap-3", compact ? "mb-2" : "mb-4")}>
        <h2 className="text-[17px] font-medium text-white sm:text-lg">Where you spend</h2>
        {action ?? (
          <Link href="/spending#map" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-white/85 transition-colors hover:bg-white/10">
            See more <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>

      <div className={cx("grid gap-4", compact ? "lg:grid-cols-1" : "md:grid-cols-[minmax(0,260px)_1fr]")}>
        {/* Frosted list of top places (overlaps the map on wide compact cards, like the reference). */}
        <ul
          className={cx(
            "z-10 flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur-md",
            compact && "order-2 lg:absolute lg:bottom-0 lg:left-0 lg:w-[250px]",
          )}
        >
          {hasData ? (
            list.map((row) => (
              <li key={row.key} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 [&>svg]:size-4">
                  {row.online ? <Globe /> : <MapPin />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{row.label}</span>
                  <span className="block truncate text-xs text-white/45">{row.sub}</span>
                </span>
                <span className="text-sm font-medium text-white tabular">{moneyWhole(row.total)}</span>
              </li>
            ))
          ) : (
            <li className="px-3 py-6 text-center text-sm text-white/50">No purchases with a location in this period yet.</li>
          )}
        </ul>

        <div className={cx("relative", compact && "order-1 lg:ml-[200px]")}>
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="h-auto w-full" role="img" aria-label="Map of spending by state">
            <defs>
              <radialGradient id={glowId}>
                <stop offset="0" stopColor="#5B91FF" stopOpacity="0.9" />
                <stop offset="1" stopColor="#5B91FF" stopOpacity="0" />
              </radialGradient>
            </defs>
            {dots.map((d, i) => {
              const total = regionTotals.get(d.state);
              const t = total ? Math.sqrt(total / maxRegion) : 0;
              return (
                <circle
                  key={i}
                  cx={d.x}
                  cy={d.y}
                  r={compact ? 0.25 : 0.21}
                  fill={total ? "#5B91FF" : BASE_DOT}
                  fillOpacity={total ? 0.28 + t * 0.72 : 1}
                />
              );
            })}
            {markers.map(({ p, xy, weight }) => (
              <g key={`${p.city}|${p.region}`}>
                <circle cx={xy[0]} cy={xy[1]} r={0.9 + weight * 1.6} fill={`url(#${glowId})`} />
                <circle cx={xy[0]} cy={xy[1]} r={0.28 + weight * 0.2} fill="#fff" />
              </g>
            ))}
          </svg>
          {/* Chips for the top two places, positioned in % so they track the SVG. */}
          {markers.slice(0, 2).map(({ p, xy }, i) => (
            <div
              key={`chip-${p.city}`}
              className="pointer-events-none absolute flex items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 text-xs whitespace-nowrap text-ink shadow-lg sm:text-[13px]"
              style={{
                left: `${Math.min(Math.max((xy[0] / MAP_WIDTH) * 100, 14), 86)}%`,
                top: `${(xy[1] / MAP_HEIGHT) * 100}%`,
                transform: `translate(-50%, ${i === 0 ? "-135%" : "35%"})`,
              }}
            >
              <span className="font-medium">
                {p.city}
                {p.region ? `, ${p.region}` : ""}
              </span>
              <span className="tabular">{money(p.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
