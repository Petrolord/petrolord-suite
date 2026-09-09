// Axis scale and tick helpers shared by the crossplot canvases (moved out
// of Crossplot.jsx in PT10b so the depth density plot uses the same pair
// and the two families of plot agree on every tick).

/** Domain -> pixel scale over `span`, optionally log10 and reversed; `inv` goes back. */
export function makeScale(domain, span, log, reverse) {
  const [d0, d1] = domain;
  const l0 = log ? Math.log10(d0) : d0;
  const l1 = log ? Math.log10(d1) : d1;
  const fwd = (v) => {
    const lv = log ? (v > 0 ? Math.log10(v) : NaN) : v;
    const f = (lv - l0) / (l1 - l0);
    return (reverse ? 1 - f : f) * span;
  };
  const inv = (px) => {
    let f = px / span;
    if (reverse) f = 1 - f;
    const lv = l0 + f * (l1 - l0);
    return log ? 10 ** lv : lv;
  };
  return { fwd, inv };
}

/** Decade ticks for a log domain; 1-2-5 ticks (about six) for a linear one. */
export function ticksFor(domain, log) {
  if (log) {
    const out = [];
    for (let e = Math.ceil(Math.log10(domain[0])); 10 ** e <= domain[1] * 1.0001; e++) out.push(10 ** e);
    return out;
  }
  const span = domain[1] - domain[0];
  if (!(span > 0)) return [];
  const raw = span / 6;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = raw / mag >= 5 ? 5 * mag : raw / mag >= 2 ? 2 * mag : mag;
  const out = [];
  for (let v = Math.ceil(domain[0] / step) * step; v <= domain[1] + 1e-9; v += step) out.push(v);
  return out;
}

export const fmtTick = (v) => (Math.abs(v) >= 1000 ? String(v) : String(Number(v.toPrecision(3))));
