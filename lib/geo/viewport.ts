import type { Box } from "./us";

// Zoom/pan math for the map's SVG viewBox. A view is a box in map units with
// the same aspect ratio as the full map, so the SVG never changes size.

export type View = Box;

export type Bounds = { width: number; height: number; maxZoom: number };

export const aspectOf = (b: Bounds) => b.width / b.height;
export const zoomOf = (view: View, b: Bounds) => b.width / view.w;
export const fullView = (b: Bounds): View => ({ x: 0, y: 0, w: b.width, h: b.height });

/** Keep the zoom within [1, maxZoom] and don't let the map drift out of sight. */
export function clampView(view: View, b: Bounds): View {
  const w = Math.min(b.width, Math.max(b.width / b.maxZoom, view.w));
  const h = w / aspectOf(b);
  if (w >= b.width) return fullView(b);
  // Allow a little overscroll past the edges (15% of the view).
  const x = Math.min(b.width - w * 0.85, Math.max(-w * 0.15, view.x));
  const y = Math.min(b.height - h * 0.85, Math.max(-h * 0.15, view.y));
  return { x, y, w, h };
}

/** Zoom by `factor` (>1 = in) keeping the map point (cx, cy) fixed on screen. */
export function zoomAt(view: View, factor: number, cx: number, cy: number, b: Bounds): View {
  const w = view.w / factor;
  const h = w / aspectOf(b);
  return clampView({ x: cx - (cx - view.x) * (w / view.w), y: cy - (cy - view.y) * (h / view.h), w, h }, b);
}

/** View that fits a box with padding (fraction of the box size), keeping the aspect ratio. */
export function fitBox(box: Box, b: Bounds, padding = 0.3, minWidth = b.width / b.maxZoom): View {
  const aspect = aspectOf(b);
  const bw = Math.max(box.w * (1 + padding * 2), minWidth);
  const bh = box.h * (1 + padding * 2);
  const w = Math.max(bw, bh * aspect);
  const h = w / aspect;
  return clampView({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h }, b);
}

/** Bounding box of points (null when empty). */
export function boxOf(points: [number, number][]): Box | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Interpolate between two views (for animated zooms). */
export function lerpView(a: View, b: View, t: number): View {
  const e = 1 - (1 - t) ** 3; // ease-out cubic
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e, h: a.h + (b.h - a.h) * e };
}
