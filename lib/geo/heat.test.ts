import { describe, expect, it } from "vitest";
import { heatAt, heatWeights } from "@/lib/geo/heat";

describe("state focus heat", () => {
  const sources = [
    { xy: [0, 0] as [number, number], weight: 1 },
    { xy: [10, 0] as [number, number], weight: 0.25 },
  ];

  it("is strongest at the biggest city and fades with distance", () => {
    expect(heatAt(0, 0, sources, 1)).toBeCloseTo(1);
    expect(heatAt(10, 0, sources, 1)).toBeCloseTo(0.25);
    const near = heatAt(0.5, 0, sources, 1);
    const far = heatAt(2, 0, sources, 1);
    expect(near).toBeGreaterThan(far);
    expect(heatAt(5, 5, sources, 1)).toBeLessThan(0.01);
  });

  it("normalizes spend within the state, keeping small cities visible", () => {
    expect(heatWeights([400, 100, 0])).toEqual([1, 0.5, 0]);
    expect(heatWeights([])).toEqual([]);
    expect(heatWeights([0, 0])).toEqual([0, 0]);
  });
});
