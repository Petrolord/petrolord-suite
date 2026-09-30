// Georeference a scanned map (Contour Map Digitizer, MAP-U1-005,
// 2026-09-30). The first version took the first two control points,
// assumed the scan was square to the map grid (no rotation, no shear),
// and ignored every other point, so a scan a few degrees off true put
// the contours hundreds of metres away with no warning. This fits the
// six-parameter affine transform (Didger's and Surfer's first-order
// "affine") by least squares through every control point, reports the
// residual at each point and their RMS in map units, and refuses points
// that cannot define a plane. Pure, no DOM.

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

/** Control points with numeric pixel and world pairs, in their order. */
export function usableControlPoints(points) {
  return (points || [])
    .map((p, i) => ({ i, px: num(p?.pixel?.[0]), py: num(p?.pixel?.[1]), wx: num(p?.world?.[0]), wy: num(p?.world?.[1]) }))
    .filter((p) => [p.px, p.py, p.wx, p.wy].every(Number.isFinite));
}

/** Solve the 3x3 normal equations by Cramer's rule; null when singular. */
function solve3(m, r) {
  const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
    - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
    + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  const scale = Math.max(...m.flat().map(Math.abs), 1);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12 * scale ** 3) return null;
  return [0, 1, 2].map((k) => det(m.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)))) / d);
}

/**
 * @param {Array<{pixel:[number,number], world:[number|string,number|string]}>} points
 * @returns {{transform:{a,b,c,d,e,f}, pixelToWorld:(px,py)=>[number,number], n:number,
 *   residuals:Array<{index:number, dx:number, dy:number, error:number}>, rms:number,
 *   rotationDeg:number, unitsPerPixel:number, exact:boolean}}
 *   world x = a*px + b*py + c, world y = d*px + e*py + f
 */
export function fitGeoreference(points) {
  const pts = usableControlPoints(points);
  if (pts.length < 3) throw new Error(`Georeferencing needs at least three control points with a pixel and both world coordinates (${pts.length} usable).`);
  // centre the pixels for conditioning
  const mx = pts.reduce((s, p) => s + p.px, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.py, 0) / pts.length;
  const q = pts.map((p) => ({ ...p, u: p.px - mx, v: p.py - my }));
  let suu = 0; let suv = 0; let svv = 0; let su = 0; let sv = 0;
  for (const p of q) { suu += p.u * p.u; suv += p.u * p.v; svv += p.v * p.v; su += p.u; sv += p.v; }
  const M = [[suu, suv, su], [suv, svv, sv], [su, sv, q.length]];
  const rhs = (key) => [q.reduce((s, p) => s + p.u * p[key], 0), q.reduce((s, p) => s + p.v * p[key], 0), q.reduce((s, p) => s + p[key], 0)];
  const X = solve3(M, rhs('wx'));
  const Y = solve3(M, rhs('wy'));
  if (!X || !Y) throw new Error('The control points lie on one line (or two share a pixel), so they cannot place the map. Pick three or more points spread across the scan, not in a row.');
  const [a, b, c0] = X;
  const [d, e, f0] = Y;
  const transform = { a, b, c: c0 - a * mx - b * my, d, e, f: f0 - d * mx - e * my };
  const pixelToWorld = (px, py) => [transform.a * px + transform.b * py + transform.c, transform.d * px + transform.e * py + transform.f];
  const residuals = pts.map((p) => {
    const [x, y] = pixelToWorld(p.px, p.py);
    const dx = p.wx - x; const dy = p.wy - y;
    return { index: p.i, dx, dy, error: Math.hypot(dx, dy) };
  });
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r.error ** 2, 0) / residuals.length);
  // the image x axis, anticlockwise from map east (image y runs down)
  const rotationDeg = (Math.atan2(d, a) * 180) / Math.PI;
  const unitsPerPixel = Math.sqrt(Math.abs(a * e - b * d));
  return { transform, pixelToWorld, n: pts.length, residuals, rms, rotationDeg, unitsPerPixel, exact: pts.length === 3 };
}

/** One line for the panel and the toast. */
export function describeGeoreference(g, unit = 'map units') {
  if (!g) return 'Not georeferenced.';
  const rot = Math.abs(g.rotationDeg) < 0.05 ? 'square to the grid' : `rotated ${g.rotationDeg.toFixed(1)} deg`;
  const fit = g.exact
    ? 'three points fit exactly, so there is no check on a misplaced point: add a fourth'
    : `RMS error ${g.rms.toFixed(1)} ${unit} over ${g.n} points, largest ${Math.max(...g.residuals.map((r) => r.error)).toFixed(1)} ${unit}`;
  return `Affine from ${g.n} control points, ${rot}, ${g.unitsPerPixel.toFixed(2)} ${unit} per pixel; ${fit}.`;
}
