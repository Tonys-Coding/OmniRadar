import { describe, expect, it } from "vitest";
import { MAP_HEIGHT, MAP_WIDTH, stateBox } from "@/lib/geo/us";
import { boxOf, clampView, fitBox, fullView, zoomAt, zoomOf } from "@/lib/geo/viewport";

const b = { width: 40, height: 20, maxZoom: 8 };

describe("map viewport", () => {
  it("clamps zoom between 1x and max", () => {
    expect(clampView({ x: 5, y: 5, w: 80, h: 40 }, b)).toEqual(fullView(b));
    expect(zoomOf(clampView({ x: 0, y: 0, w: 1, h: 0.5 }, b), b)).toBe(8);
  });

  it("keeps the point under the cursor fixed while zooming", () => {
    const v = zoomAt(fullView(b), 2, 10, 5, b);
    expect(v).toEqual({ x: 5, y: 2.5, w: 20, h: 10 });
    // (10, 5) sits at the same relative position before and after.
    expect((10 - v.x) / v.w).toBeCloseTo(10 / 40);
    expect((5 - v.y) / v.h).toBeCloseTo(5 / 20);
  });

  it("zooming back out returns to the full map", () => {
    const zoomed = zoomAt(fullView(b), 4, 30, 10, b);
    expect(zoomAt(zoomed, 0.1, 30, 10, b)).toEqual(fullView(b));
  });

  it("limits panning past the edges", () => {
    const v = clampView({ x: 100, y: -100, w: 10, h: 5 }, b);
    expect(v.x).toBeCloseTo(40 - 10 * 0.85);
    expect(v.y).toBeCloseTo(-5 * 0.15);
  });

  it("fits a box with the map's aspect ratio", () => {
    const v = fitBox({ x: 10, y: 5, w: 4, h: 4 }, b, 0.25);
    expect(v.w / v.h).toBeCloseTo(2);
    expect(v.x + v.w / 2).toBeCloseTo(12);
    expect(v.y + v.h / 2).toBeCloseTo(7);
    expect(v.h).toBeGreaterThanOrEqual(4 * 1.5 - 1e-9);
  });

  it("computes bounding boxes and real state bounds", () => {
    expect(boxOf([])).toBeNull();
    expect(boxOf([[1, 2], [5, 3], [2, 8]])).toEqual({ x: 1, y: 2, w: 4, h: 6 });
    const tx = stateBox("TX")!;
    const me = stateBox("ME")!;
    expect(tx.x).toBeLessThan(me.x); // Texas is west of Maine
    expect(tx.y + tx.h).toBeGreaterThan(me.y + me.h); // and further south
    expect(tx.x + tx.w).toBeLessThanOrEqual(MAP_WIDTH);
    expect(tx.y + tx.h).toBeLessThanOrEqual(MAP_HEIGHT);
    expect(stateBox("AK")).toBeNull();
  });
});
