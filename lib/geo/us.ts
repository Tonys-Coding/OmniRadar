// A stylized dot-matrix map of the contiguous United States.
//
// Not cartographically precise (the user asked for "doesn't have to be a real
// map"): a simplified outline filled with a hex grid of dots, each dot
// assigned to the nearest state centroid.

/** Simplified contiguous-US outline as [lon, lat], clockwise from the NW. */
const OUTLINE: [number, number][] = [
  [-124.7, 48.4], [-122.8, 49.0], [-95.2, 49.0], [-94.8, 49.4], [-89.6, 48.0], [-84.8, 46.5],
  [-82.5, 45.3], [-82.4, 43.0], [-83.1, 42.3], [-82.7, 41.7], [-79.0, 42.9], [-79.2, 43.4],
  [-76.3, 44.2], [-74.7, 45.0], [-71.5, 45.0], [-70.8, 45.4], [-69.2, 47.4], [-68.2, 47.3],
  [-67.8, 45.7], [-67.0, 44.8], [-68.5, 44.3], [-70.2, 43.6], [-70.8, 42.9], [-70.0, 41.8],
  [-71.2, 41.5], [-72.9, 41.2], [-74.0, 40.6], [-74.0, 39.7], [-74.9, 38.9], [-75.1, 38.5],
  [-75.9, 37.2], [-76.0, 36.9], [-75.5, 35.3], [-76.8, 34.7], [-77.9, 33.9], [-79.2, 33.2],
  [-80.9, 32.1], [-81.4, 30.7], [-81.0, 29.2], [-80.1, 26.9], [-80.1, 25.8], [-80.4, 25.2],
  [-81.1, 25.2], [-81.8, 26.1], [-82.7, 27.7], [-82.8, 28.9], [-83.7, 29.9], [-84.9, 29.7],
  [-86.5, 30.4], [-88.0, 30.7], [-89.6, 30.2], [-89.2, 29.0], [-90.5, 29.1], [-91.8, 29.5],
  [-93.8, 29.7], [-94.8, 29.3], [-96.6, 28.3], [-97.4, 27.4], [-97.2, 25.9], [-99.1, 26.4],
  [-99.5, 27.5], [-101.4, 29.8], [-102.4, 29.8], [-103.1, 29.0], [-104.5, 29.6], [-106.5, 31.8],
  [-108.2, 31.8], [-108.2, 31.3], [-111.1, 31.3], [-114.8, 32.5], [-117.1, 32.5], [-118.4, 33.7],
  [-120.6, 34.6], [-121.9, 36.6], [-122.5, 37.8], [-123.8, 39.8], [-124.4, 40.4], [-124.2, 42.0],
  [-124.1, 43.7], [-124.0, 46.2], [-124.7, 48.4],
];

/** Approximate geographic centers [lat, lon] (contiguous states + DC). */
export const STATE_CENTROIDS: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AZ: [34.3, -111.7], AR: [34.9, -92.4], CA: [37.2, -119.5], CO: [39.0, -105.5],
  CT: [41.6, -72.7], DE: [39.0, -75.5], DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.7, -83.4],
  ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.1, -93.5], KS: [38.5, -98.4],
  KY: [37.5, -85.3], LA: [31.1, -92.0], ME: [45.4, -69.2], MD: [39.0, -76.8], MA: [42.3, -71.8],
  MI: [43.3, -84.5], MN: [46.3, -94.3], MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [47.0, -109.6],
  NE: [41.5, -99.8], NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.2, -74.7], NM: [34.4, -106.1],
  NY: [42.9, -75.5], NC: [35.6, -79.4], ND: [47.5, -100.5], OH: [40.3, -82.8], OK: [35.6, -97.5],
  OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [33.9, -80.9], SD: [44.4, -100.2],
  TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7], VT: [44.1, -72.7], VA: [37.5, -78.8],
  WA: [47.4, -120.5], WV: [38.6, -80.6], WI: [44.6, -89.9], WY: [43.0, -107.6],
};

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "Washington, DC", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

export const stateName = (code: string | null) => (code ? (STATE_NAMES[code] ?? code) : "Unknown");

const COS_LAT = Math.cos((38 * Math.PI) / 180);
const LON0 = -125;
const LAT0 = 49.6;

/** Equirectangular projection scaled for mid-latitudes. */
export function project(lat: number, lon: number): [number, number] {
  return [(lon - LON0) * COS_LAT, LAT0 - lat];
}

const OUTLINE_XY = OUTLINE.map(([lon, lat]) => project(lat, lon));
export const MAP_WIDTH = Math.max(...OUTLINE_XY.map((p) => p[0])) + 0.6;
export const MAP_HEIGHT = Math.max(...OUTLINE_XY.map((p) => p[1])) + 0.6;

function inside([x, y]: [number, number]): boolean {
  let hit = false;
  for (let i = 0, j = OUTLINE_XY.length - 1; i < OUTLINE_XY.length; j = i++) {
    const [xi, yi] = OUTLINE_XY[i]!;
    const [xj, yj] = OUTLINE_XY[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const CENTROIDS_XY = Object.entries(STATE_CENTROIDS).map(([code, [lat, lon]]) => [code, project(lat, lon)] as const);

function nearestState([x, y]: [number, number]): string {
  let best = "";
  let bestD = Infinity;
  for (const [code, [cx, cy]] of CENTROIDS_XY) {
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestD) [best, bestD] = [code, d];
  }
  return best;
}

export type MapDot = { x: number; y: number; state: string };

const cache = new Map<number, MapDot[]>();

/** Hex grid of dots inside the outline, each tagged with its (approximate) state. */
export function mapDots(spacing = 0.62): MapDot[] {
  const cached = cache.get(spacing);
  if (cached) return cached;
  const dots: MapDot[] = [];
  const rowH = spacing * 0.866;
  for (let row = 0, y = 0.3; y < MAP_HEIGHT; row++, y += rowH) {
    for (let x = (row % 2) * (spacing / 2) + 0.3; x < MAP_WIDTH; x += spacing) {
      if (inside([x, y])) dots.push({ x, y, state: nearestState([x, y]) });
    }
  }
  cache.set(spacing, dots);
  return dots;
}

export type Box = { x: number; y: number; w: number; h: number };

/** Bounding box of a state's dots (null for states off the contiguous map). */
export function stateBox(code: string): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of mapDots(0.4)) {
    if (d.state !== code) continue;
    minX = Math.min(minX, d.x);
    minY = Math.min(minY, d.y);
    maxX = Math.max(maxX, d.x);
    maxY = Math.max(maxY, d.y);
  }
  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/**
 * Where to draw a place: its own coordinates when Plaid has them, otherwise
 * its state's center nudged by a stable per-city offset so cities in the same
 * state don't stack. Returns null outside the contiguous US.
 */
export function placePoint(p: { city: string; region: string | null; lat: number | null; lon: number | null }): [number, number] | null {
  if (p.lat !== null && p.lon !== null) {
    const xy = project(p.lat, p.lon);
    return inside(xy) ? xy : null;
  }
  const center = p.region ? STATE_CENTROIDS[p.region] : undefined;
  if (!center) return null;
  const a = hash(p.city.toLowerCase()) * Math.PI * 2;
  const r = 0.35 + hash(`${p.city}!`) * 0.75;
  return project(center[0] + Math.sin(a) * r * 0.8, center[1] + Math.cos(a) * r);
}

/** A state's center in map coordinates (null for states off the contiguous map). */
export function stateCenter(code: string): [number, number] | null {
  const c = STATE_CENTROIDS[code];
  return c ? project(c[0], c[1]) : null;
}
