// Builds the background map shapes (all of Canada and its large lakes) embedded in daybook.html.
// Data: Natural Earth via the world-atlas npm package (public domain); lakes from @geo-maps/earth-lakes-10km (© OpenStreetMap contributors, ODbL).
// Usage: npm i world-atlas@2 topojson-client@3 && npm pack @geo-maps/earth-lakes-10km && tar xzf geo-maps-earth-lakes-10km-*.tgz && node build-map.mjs
import { readFileSync, writeFileSync } from "fs";
import { feature } from "topojson-client";
// Map window: southern Canada, BC coast to Newfoundland. x = longitude, y = -latitude.
const W = -142, E = -51, S = 40, N = 84, PAD = 2;
const inBox = ([x, y]) => x > W - PAD && x < E + PAD && y > S - PAD && y < N + PAD;
// Clip a ring to the padded box (Sutherland–Hodgman), so shapes stay closed at the edges.
function clipRing(ring) {
  const edges = [[(p) => p[0] >= W - PAD, (a, b) => { const t = (W - PAD - a[0]) / (b[0] - a[0]); return [W - PAD, a[1] + t * (b[1] - a[1])]; }],
                 [(p) => p[0] <= E + PAD, (a, b) => { const t = (E + PAD - a[0]) / (b[0] - a[0]); return [E + PAD, a[1] + t * (b[1] - a[1])]; }],
                 [(p) => p[1] >= S - PAD, (a, b) => { const t = (S - PAD - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), S - PAD]; }],
                 [(p) => p[1] <= N + PAD, (a, b) => { const t = (N + PAD - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), N + PAD]; }]];
  let out = ring;
  for (const [inside, cut] of edges) {
    const input = out; out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[(i + input.length - 1) % input.length], b = input[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) return null;
  }
  return out;
}
function simplify(pts, tol) {   // Douglas–Peucker
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let idx = -1, max = tol;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len; if (d > max) { max = d; idx = i; } }
    if (idx >= 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s / 2); };
function toPath(polys, tol, minArea) {
  let d = "";
  for (const poly of polys) for (const ring0 of poly) {
    if (!ring0.some(inBox)) continue;
    const c = clipRing(ring0.slice(0, -1)); if (!c || c.length < 3) continue;
    // A closed ring starts and ends at the same point, so simplify it as two open halves.
    const h = Math.floor(c.length / 2), r = [...simplify(c.slice(0, h + 1), tol).slice(0, -1), ...simplify([...c.slice(h), c[0]], tol)];
    if (r.length < 4 || area(r) < minArea) continue;
    d += "M" + r.slice(0, -1).map(([x, y]) => `${x.toFixed(2)} ${(-y).toFixed(2)}`).join("L") + "Z";
  }
  return d;
}
const topo = JSON.parse(readFileSync("node_modules/world-atlas/countries-50m.json"));
const fc = feature(topo, topo.objects.countries);
const geom = (name) => { const g = fc.features.find((f) => f.properties.name === name).geometry; return g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]; };
const canada = toPath(geom("Canada"), .1, .08);
const usa = "";
const lakesGeo = JSON.parse(readFileSync("package/map.geo.json"));
let lakePolys = [];
for (const g of lakesGeo.geometries) lakePolys.push(...(g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]));
const lakes = toPath(lakePolys, .07, .15);
const out = { viewBox: `${W} ${-N} ${E - W} ${N - S}`, canada, usa, lakes };
writeFileSync("map-full.json", JSON.stringify(out));
console.log("viewBox", out.viewBox, "| bytes: canada", canada.length, "usa", usa.length, "lakes", lakes.length);
