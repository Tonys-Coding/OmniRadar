"use client";

import { ArrowLeft, Globe, LocateFixed, MapPin, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cx, Segmented } from "@/components/ui";
import type { LocationsResponse } from "@/lib/client/types";
import { money, moneyWhole } from "@/lib/format";
import { heatAt, heatWeights, type HeatSource } from "@/lib/geo/heat";
import { MAP_HEIGHT, MAP_WIDTH, mapDots, placePoint, stateAt, stateBox, stateCenter, stateName } from "@/lib/geo/us";
import { boxOf, clampView, fitBox, fullView, lerpView, zoomAt, zoomOf, type Bounds, type View } from "@/lib/geo/viewport";
import { useWidth } from "./useWidth";

// Interactive hex-dot spending map ("Product Distributor" style):
//   * zoom: +/- buttons, pinch, Ctrl/⌘ + scroll, double-click
//   * pan: drag (on phones, once zoomed in, so the page still scrolls at 1x)
//   * States view shades states by spending; Cities view shows a marker per city
//   * click a state (map or list) to zoom in and list its cities
//   * labels and dot density adapt to the zoom level

const BOUNDS: Bounds = { width: MAP_WIDTH, height: MAP_HEIGHT, maxZoom: 10 };
const BASE_DOT = "#2A2A31";
/** Dots of the selected state that are far from any city: a lifted gray so the shape reads. */
const FOCUS_BODY = "#353A4A";
const ASPECT = MAP_WIDTH / MAP_HEIGHT;

type Mode = "states" | "cities";
type Target = { kind: "state" | "place"; key: string };
type Hover = Target | null;
type Gesture = {
  startView: View;
  startX: number;
  startY: number;
  moved: boolean;
  target: Target | null;
  pinchDist?: number;
  pinchCenter?: [number, number];
};

function targetOf(el: EventTarget | null): Target | null {
  const node = el instanceof Element ? el : null;
  const place = node?.closest("[data-place]")?.getAttribute("data-place");
  if (place) return { kind: "place", key: place };
  const state = node?.closest("[data-state]")?.getAttribute("data-state");
  return state ? { kind: "state", key: state } : null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function MapButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-full border border-white/10 bg-ink/70 text-white backdrop-blur transition-colors hover:bg-white/15 disabled:opacity-30 [&>svg]:size-4"
    >
      {children}
    </button>
  );
}

/** Pinned under the list: where the money went, or the selected state's stats. */
function MapSummary({ data, focus }: { data: LocationsResponse; focus: string | null }) {
  const inPerson = data.places.reduce((sum, p) => sum + p.total, 0);
  if (focus) {
    const state = data.regions.find((r) => r.region === focus);
    const cities = data.places.filter((p) => p.region === focus);
    const top = cities[0];
    const share = inPerson > 0 && state ? state.total / inPerson : 0;
    return (
      <div className="mt-2 rounded-2xl bg-white/[0.06] p-3.5 text-white">
        <p className="text-xs text-white/50">{stateName(focus)} summary</p>
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-white/45">Share of in-person</p>
            <p className="font-medium tabular">{Math.round(share * 100)}%</p>
          </div>
          <div>
            <p className="text-white/45">Purchases</p>
            <p className="font-medium tabular">{state?.count ?? 0}</p>
          </div>
          <div className="col-span-2">
            <p className="text-white/45">Top city</p>
            <p className="truncate font-medium">
              {top ? (
                <>
                  {top.city} · <span className="tabular">{money(top.total)}</span>
                </>
              ) : (
                "-"
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }
  const parts = [
    { label: "In person", value: inPerson, color: "#5B91FF" },
    { label: "Online", value: data.online.total, color: "#A8C4FF" },
    { label: "No location", value: data.unknown.total, color: "#4A4A55" },
  ];
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  return (
    <div className="mt-2 rounded-2xl bg-white/[0.06] p-3.5 text-white">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-white/50">Where the money went</p>
        <p className="text-sm font-medium tabular">{moneyWhole(total)}</p>
      </div>
      <div className="mt-2.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) =>
          p.value > 0 ? <div key={p.label} style={{ flexGrow: p.value, flexBasis: 0, background: p.color }} /> : null,
        )}
      </div>
      <ul className="mt-2.5 space-y-1.5 text-xs">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <span className="flex-1 text-white/60">{p.label}</span>
            <span className="text-white/45 tabular">{total > 0 ? Math.round((p.value / total) * 100) : 0}%</span>
            <span className="w-16 text-right font-medium tabular">{moneyWhole(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SpendingMap({ data, action, listSize = 6 }: { data: LocationsResponse; action?: React.ReactNode; listSize?: number }) {
  const glowId = useId();
  const [mode, setMode] = useState<Mode>("states");
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setViewState] = useState<View>(() => fullView(BOUNDS));
  const [hover, setHover] = useState<Hover>(null);
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef(view);
  const anim = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  const animateTo = useCallback(
    (target: View) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      const from = viewRef.current;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 380);
        setView(lerpView(from, target, t));
        anim.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      anim.current = requestAnimationFrame(step);
    },
    [setView],
  );
  useEffect(() => () => void (anim.current && cancelAnimationFrame(anim.current)), []);

  // ---- data -------------------------------------------------------------
  const markers = useMemo(() => {
    const max = Math.max(1, ...data.places.map((p) => p.total));
    return data.places.map((p) => ({ p, key: `${p.city}|${p.region ?? ""}`, xy: placePoint(p), weight: Math.sqrt(p.total / max) }));
  }, [data.places]);
  const regionTotals = useMemo(() => new Map(data.regions.map((r) => [r.region, r])), [data.regions]);
  const citiesPerRegion = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data.places) if (p.region) m.set(p.region, (m.get(p.region) ?? 0) + 1);
    return m;
  }, [data.places]);
  const maxRegion = Math.max(1, ...data.regions.map((r) => r.total));

  // A new period (30D / 90D / 1Y) resets any drill-down.
  const [prevData, setPrevData] = useState(data);
  if (prevData !== data) {
    setPrevData(data);
    setFocus(null);
    setSelected(null);
  }

  // ---- view helpers -----------------------------------------------------
  const zoom = zoomOf(view, BOUNDS);
  const zoomed = zoom > 1.01;
  const height = width / ASPECT;
  const unit = view.w / Math.max(1, width); // map units per screen pixel

  function toMap(clientX: number, clientY: number): [number, number] {
    const rect = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return [v.x + ((clientX - rect.left) / rect.width) * v.w, v.y + ((clientY - rect.top) / rect.height) * v.h];
  }
  const toScreen = (x: number, y: number): [number, number] => [((x - view.x) / view.w) * width, ((y - view.y) / view.h) * height];

  function zoomButton(factor: number) {
    const v = viewRef.current;
    animateTo(zoomAt(v, factor, v.x + v.w / 2, v.y + v.h / 2, BOUNDS));
  }

  function focusState(code: string) {
    setFocus(code);
    setSelected(null);
    const box = stateBox(code);
    if (box) animateTo(fitBox(box, BOUNDS, 0.25));
  }

  function selectPlace(key: string) {
    const m = markers.find((x) => x.key === key);
    if (!m) return;
    setSelected(key);
    if (m.p.region) setFocus(m.p.region);
    if (m.xy) animateTo(fitBox({ x: m.xy[0], y: m.xy[1], w: 0, h: 0 }, BOUNDS, 0, MAP_WIDTH / 5));
  }

  function reset() {
    setFocus(null);
    setSelected(null);
    animateTo(fullView(BOUNDS));
  }

  function fitSpending() {
    const pts = markers.filter((m) => m.xy && (!focus || m.p.region === focus)).map((m) => m.xy!);
    const box = boxOf(pts);
    animateTo(box ? fitBox(box, BOUNDS, 0.35, MAP_WIDTH / 6) : fullView(BOUNDS));
  }

  function activate(t: Target) {
    if (t.kind === "state") {
      if (regionTotals.has(t.key) || citiesPerRegion.has(t.key)) focusState(t.key);
    } else selectPlace(t.key);
  }

  // ---- gestures ---------------------------------------------------------
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (anim.current) cancelAnimationFrame(anim.current);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone (e.g. lifted before capture): nothing to track.
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { startView: viewRef.current, startX: e.clientX, startY: e.clientY, moved: false, target: targetOf(e.target) };
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      gesture.current = {
        ...gesture.current,
        moved: true,
        startView: viewRef.current,
        pinchDist: dist(a, b),
        pinchCenter: toMap((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!pointers.current.has(e.pointerId) || !g) {
      // Plain hover (mouse). Cities come from the marker under the cursor;
      // states from the map position, so gaps between dots don't flicker.
      if (e.pointerType !== "mouse") return;
      const place = targetOf(e.target);
      let next: Hover = place?.kind === "place" ? place : null;
      if (!next) {
        const [mx, my] = toMap(e.clientX, e.clientY);
        const state = stateAt(mx, my);
        next = state ? { kind: "state", key: state } : null;
      }
      setHover((prev) => (prev?.kind === next?.kind && prev?.key === next?.key ? prev : next));
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && g.pinchDist && g.pinchCenter) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      setView(zoomAt(g.startView, dist(a, b) / g.pinchDist, g.pinchCenter[0], g.pinchCenter[1], BOUNDS));
      return;
    }
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    setHover(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const v = g.startView;
    setView(clampView({ ...v, x: v.x - (dx / rect.width) * v.w, y: v.y - (dy / rect.height) * v.h }, BOUNDS));
  }

  function endPointer(e: React.PointerEvent<SVGSVGElement>, cancelled: boolean) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) {
      if (!cancelled && g && !g.moved && g.target) activate(g.target);
      gesture.current = null;
    } else if (g) {
      // One finger lifted from a pinch: continue as a pan from here.
      const [rest] = [...pointers.current.values()] as [{ x: number; y: number }];
      gesture.current = { startView: viewRef.current, startX: rest.x, startY: rest.y, moved: true, target: null };
    }
  }

  // Ctrl/⌘ + wheel zooms (this is also what a trackpad pinch sends); plain
  // scrolling keeps scrolling the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const v = viewRef.current;
      const cxm = v.x + ((e.clientX - rect.left) / rect.width) * v.w;
      const cym = v.y + ((e.clientY - rect.top) / rect.height) * v.h;
      setView(zoomAt(v, Math.exp(-e.deltaY * 0.01), cxm, cym, BOUNDS));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [setView, width]);

  // ---- render data ------------------------------------------------------
  const spacing = zoom < 1.8 ? 0.6 : zoom < 3.5 ? 0.36 : 0.22;
  const radius = spacing * 0.36;
  const dots = useMemo(() => {
    const pad = spacing * 2;
    return mapDots(spacing).filter(
      (d) => d.x >= view.x - pad && d.x <= view.x + view.w + pad && d.y >= view.y - pad && d.y <= view.y + view.h + pad,
    );
  }, [spacing, view]);

  // Selected state: blue concentrates around its cities, stronger where more was spent.
  const focusHeat = useMemo(() => {
    if (!focus) return null;
    const inState = markers.filter((m) => m.xy && m.p.region === focus);
    const weights = heatWeights(inState.map((m) => m.p.total));
    const sources: HeatSource[] = inState.map((m, i) => ({ xy: m.xy!, weight: weights[i]! }));
    const box = stateBox(focus);
    const radius = box ? Math.min(1.6, Math.max(0.45, Math.min(box.w, box.h) * 0.15)) : 0.8;
    return { sources, radius };
  }, [focus, markers]);

  function dotStyle(state: string, x: number, y: number): { fill: string; opacity: number } {
    if (focusHeat) {
      if (state !== focus) return { fill: BASE_DOT, opacity: 1 };
      const heat = heatAt(x, y, focusHeat.sources, focusHeat.radius);
      return heat < 0.1 ? { fill: FOCUS_BODY, opacity: 1 } : { fill: "#5B91FF", opacity: 0.22 + heat * 0.78 };
    }
    const r = regionTotals.get(state);
    if (!r) return { fill: BASE_DOT, opacity: 1 };
    const t = Math.sqrt(r.total / maxRegion);
    return { fill: "#5B91FF", opacity: mode === "cities" ? 0.16 + t * 0.3 : 0.3 + t * 0.7 };
  }

  const showMarkers = mode === "cities" || focus !== null;
  const visibleMarkers = markers.filter((m) => m.xy && (focus ? m.p.region === focus : mode === "cities"));

  // Chips: more labels as you zoom in, skipping any that would overlap.
  type Chip = { key: string; title: string; amount: number; x: number; y: number; w: number; below: boolean; active: boolean };
  type Candidate = Omit<Chip, "x" | "y" | "w" | "below"> & { xy: [number, number] };
  const chips: Chip[] = [];
  const small = width < 520;
  if (width > 0) {
    const candidates: Candidate[] = [];
    if (showMarkers) {
      for (const m of visibleMarkers)
        candidates.push({ key: m.key, title: m.p.region ? `${m.p.city}, ${m.p.region}` : m.p.city, amount: m.p.total, xy: m.xy!, active: m.key === selected });
    } else {
      for (const r of data.regions) {
        const c = stateCenter(r.region);
        if (c) candidates.push({ key: r.region, title: small ? r.region : stateName(r.region), amount: r.total, xy: c, active: false });
      }
    }
    candidates.sort((a, b) => Number(b.active) - Number(a.active) || b.amount - a.amount);
    const base = showMarkers ? [3, 6, 12] : [4, 8, 14];
    const tier = base[zoom < 1.5 ? 0 : zoom < 3 ? 1 : 2]!;
    const limit = small ? Math.ceil(tier / 2) : tier;
    // Reserve the control column (top right) and zoom readout (bottom left).
    const placed: { l: number; t: number; r: number; b: number }[] = [
      { l: width - 52, t: 0, r: width, b: 176 },
      { l: 0, t: height - 36, r: Math.min(width, 340), b: height },
    ];
    for (const c of candidates) {
      if (chips.length >= limit) break;
      const [sx, sy] = toScreen(c.xy[0], c.xy[1]);
      if (sx < 0 || sx > width || sy < 0 || sy > height) continue;
      const w = (c.title.length + money(c.amount).length) * (small ? 6.2 : 7) + 34;
      // Flip below the point near the top edge; keep the chip inside the frame.
      const below = sy < 44;
      const cxClamped = Math.min(Math.max(sx, w / 2 + 4), width - w / 2 - 4);
      const rect = below
        ? { l: cxClamped - w / 2, t: sy + 8, r: cxClamped + w / 2, b: sy + 40 }
        : { l: cxClamped - w / 2, t: sy - 40, r: cxClamped + w / 2, b: sy - 8 };
      if (placed.some((p) => rect.l < p.r && rect.r > p.l && rect.t < p.b && rect.b > p.t)) continue;
      placed.push(rect);
      chips.push({ key: c.key, title: c.title, amount: c.amount, active: c.active, x: cxClamped, y: sy, w, below });
    }
  }

  // Tooltip text.
  let tooltip: string | null = null;
  if (hover?.kind === "state") {
    const r = regionTotals.get(hover.key);
    const n = citiesPerRegion.get(hover.key) ?? 0;
    tooltip = r
      ? `${stateName(hover.key)} · ${money(r.total)} · ${plural(r.count, "purchase")} · ${plural(n, "city", "cities")}`
      : `${stateName(hover.key)} · no spending`;
  } else if (hover?.kind === "place") {
    const m = markers.find((x) => x.key === hover.key);
    if (m) tooltip = `${m.p.city}${m.p.region ? `, ${m.p.region}` : ""} · ${money(m.p.total)} · ${plural(m.p.count, "purchase")}`;
  }

  // Side list.
  const listPlaces = data.places.filter((p) => !focus || p.region === focus);
  const focusTotal = focus ? regionTotals.get(focus) : null;
  const hasData = data.places.length > 0 || data.online.total > 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-medium text-white sm:text-lg">Where you spend</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            dark
            size="sm"
            options={[
              { value: "states", label: "States" },
              { value: "cities", label: "Cities" },
            ]}
            value={mode}
            onChange={setMode}
          />
          {action}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr]">
        {/* Frosted list: states, or cities (all or within the focused state). */}
        <div className="order-2 flex min-w-0 flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur-md md:order-1 md:max-h-[520px]">
          <div className="flex items-center gap-2 px-2 pt-1 pb-2">
            {focus ? (
              <button onClick={reset} aria-label="Back to all states" className="grid size-7 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
                <ArrowLeft className="size-3.5" />
              </button>
            ) : null}
            <p className="min-w-0 flex-1 truncate text-sm text-white/80">
              {focus ? stateName(focus) : mode === "states" ? "Top states" : "Top cities"}
            </p>
            {focusTotal ? <span className="text-sm font-medium text-white tabular">{moneyWhole(focusTotal.total)}</span> : null}
          </div>
          <ul className="flex max-h-[340px] min-h-0 flex-col gap-1.5 overflow-y-auto md:max-h-none md:flex-1">
            {!hasData ? (
              <li className="px-3 py-6 text-center text-sm text-white/50">No purchases with a location in this period yet.</li>
            ) : !focus && mode === "states" ? (
              data.regions.slice(0, listSize + 2).map((r) => (
                <li key={r.region}>
                  <button
                    onClick={() => focusState(r.region)}
                    onMouseEnter={() => setHover(null)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/10"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-medium text-white/85">{r.region}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{stateName(r.region)}</span>
                      <span className="block truncate text-xs text-white/45">
                        {plural(citiesPerRegion.get(r.region) ?? 0, "city", "cities")} · {plural(r.count, "purchase")}
                      </span>
                    </span>
                    <span className="text-sm font-medium text-white tabular">{moneyWhole(r.total)}</span>
                  </button>
                </li>
              ))
            ) : (
              listPlaces.slice(0, focus ? 30 : listSize + 2).map((p) => {
                const key = `${p.city}|${p.region ?? ""}`;
                return (
                  <li key={key}>
                    <button
                      onClick={() => selectPlace(key)}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                        key === selected ? "border-brand/60 bg-brand/15" : "border-white/8 bg-white/[0.03] hover:bg-white/10",
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/80">
                        <MapPin className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{p.city}</span>
                        <span className="block truncate text-xs text-white/45">
                          {p.region ?? p.country ?? ""} · {plural(p.count, "purchase")}
                        </span>
                      </span>
                      <span className="text-sm font-medium text-white tabular">{moneyWhole(p.total)}</span>
                    </button>
                  </li>
                );
              })
            )}
            {!focus && data.online.total > 0 ? (
              <li className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/80">
                  <Globe className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-white">Online</span>
                  <span className="block text-xs text-white/45">{plural(data.online.count, "purchase")}</span>
                </span>
                <span className="text-sm font-medium text-white tabular">{moneyWhole(data.online.total)}</span>
              </li>
            ) : null}
          </ul>
          {hasData ? <MapSummary data={data} focus={focus} /> : null}
        </div>

        {/* Map */}
        <div ref={wrapRef} className="relative order-1 min-w-0 overflow-hidden rounded-3xl md:order-2">
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            className={cx("block h-auto w-full select-none", zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
            style={{ touchAction: zoomed ? "none" : "pan-y", aspectRatio: `${ASPECT}` }}
            role="img"
            aria-label="Interactive map of spending by state and city"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endPointer(e, false)}
            onPointerCancel={(e) => endPointer(e, true)}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={(e) => {
              const [mx, my] = toMap(e.clientX, e.clientY);
              animateTo(zoomAt(viewRef.current, 2, mx, my, BOUNDS));
            }}
          >
            <defs>
              <radialGradient id={glowId}>
                <stop offset="0" stopColor="#5B91FF" stopOpacity="0.9" />
                <stop offset="1" stopColor="#5B91FF" stopOpacity="0" />
              </radialGradient>
            </defs>
            {dots.map((d, i) => {
              const { fill, opacity } = dotStyle(d.state, d.x, d.y);
              return <circle key={i} cx={d.x} cy={d.y} r={radius} data-state={d.state} fill={fill} fillOpacity={opacity} />;
            })}
            {showMarkers
              ? visibleMarkers.map((m) => {
                  const [x, y] = m.xy!;
                  const active = m.key === selected;
                  return (
                    <g key={m.key} data-place={m.key}>
                      <circle cx={x} cy={y} r={(10 + m.weight * 18) * unit} fill={`url(#${glowId})`} />
                      <circle cx={x} cy={y} r={(3.5 + m.weight * 4.5) * unit} fill="#fff" stroke={active ? "#5B91FF" : "none"} strokeWidth={3 * unit} />
                      {/* generous invisible hit area for fingers */}
                      <circle cx={x} cy={y} r={14 * unit} fill="transparent" />
                    </g>
                  );
                })
              : null}
          </svg>

          {/* Chips (HTML so text stays crisp at any zoom). */}
          {chips.map((c) => (
            <div
              key={c.key}
              className={cx(
                "pointer-events-none absolute flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg transition-opacity sm:text-[13px]",
                c.active ? "bg-brand text-white" : "bg-white text-ink",
              )}
              style={{ left: c.x, top: c.y, transform: c.below ? "translate(-50%, 10px)" : "translate(-50%, calc(-100% - 10px))" }}
            >
              <span className="font-medium">{c.title}</span>
              <span className="tabular">{money(c.amount)}</span>
            </div>
          ))}

          <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex max-w-[calc(100%-56px)] items-center gap-1.5">
            <span className="shrink-0 rounded-full bg-ink/70 px-2 py-1 text-[11px] text-white/60 backdrop-blur [font-variant-numeric:tabular-nums]">
              {zoom.toFixed(1)}×
            </span>
            <span
              aria-live="polite"
              className={cx(
                "truncate rounded-full border border-white/10 bg-ink/80 px-3 py-1 text-xs text-white backdrop-blur transition-opacity duration-150",
                tooltip ? "opacity-100" : "opacity-0",
              )}
            >
              <span className="tabular">{tooltip ?? " "}</span>
            </span>
          </div>

          {/* Controls */}
          <div className="absolute top-2 right-2 flex flex-col gap-1.5">
            <MapButton label="Zoom in" disabled={zoom >= BOUNDS.maxZoom - 0.01} onClick={() => zoomButton(1.8)}>
              <Plus />
            </MapButton>
            <MapButton label="Zoom out" disabled={!zoomed} onClick={() => zoomButton(1 / 1.8)}>
              <Minus />
            </MapButton>
            <MapButton label="Fit to my spending" disabled={markers.every((m) => !m.xy)} onClick={() => fitSpending()}>
              <LocateFixed />
            </MapButton>
            <MapButton label="Reset map" disabled={!zoomed && !focus} onClick={() => reset()}>
              <RotateCcw />
            </MapButton>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-white/40">Drag to pan · pinch, double-click, or Ctrl/⌘ + scroll to zoom · click a state to see its cities</p>
    </div>
  );
}
