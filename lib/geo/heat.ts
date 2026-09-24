// "Heat" for the focused-state map view: each dot's blue intensity comes from
// the cities around it, weighted by how much was spent there, so the biggest
// spending spots in the state glow strongest.

export type HeatSource = { xy: [number, number]; weight: number };

/**
 * Intensity (0..1) at a point: the strongest nearby source, with a Gaussian
 * falloff of the given radius (map units). Weights should be 0..1.
 */
export function heatAt(x: number, y: number, sources: HeatSource[], radius: number): number {
  let best = 0;
  const r2 = radius * radius;
  for (const s of sources) {
    const d2 = (s.xy[0] - x) ** 2 + (s.xy[1] - y) ** 2;
    const v = s.weight * Math.exp(-d2 / r2);
    if (v > best) best = v;
  }
  return best;
}

/** Normalize spend to 0..1 within a group (sqrt keeps small spots visible). */
export function heatWeights(totals: number[]): number[] {
  const max = Math.max(0, ...totals);
  return totals.map((t) => (max > 0 ? Math.sqrt(Math.max(0, t) / max) : 0));
}
