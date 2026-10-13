/**
 * Material Balance Studio, Contacts tab: the animated contact section.
 * Pure functions, jest guarded.
 *
 * The animation plays the series of lib/contactMovement.js (the OWC risen by
 * the net influx, the GOC lowered by the gas-cap expansion of the last run)
 * on a cross-section. It invents nothing: a frame between two timesteps is
 * the straight-line interpolation of the two computed contacts, at the
 * interpolated date, and every frame on a timestep is that timestep's
 * computed contact exactly. The section's depths are true; its shape (a
 * symmetric anticline drawn through the initial contacts) is a schematic,
 * and the panel says so.
 */

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const toMs = (d) => {
  if (!d) return null;
  const t = Date.parse(String(d).length <= 10 ? `${String(d).slice(0, 10)}T00:00:00Z` : String(d));
  return Number.isFinite(t) ? t : null;
};

/**
 * The contacts at a position t along the series (0 = the first timestep,
 * n - 1 = the last); fractional t interpolates between two timesteps.
 * @param {Array<{step:number,date:?string,pressure:?number,owcFt:number,gocFt:?number}>} series
 * @param {number} t
 * @returns {{t:number, step:number, i0:number, i1:number, f:number, owcFt:number, gocFt:?number, pressure:?number, dateMs:?number, onStep:boolean}}
 */
export function frameAt(series, t) {
  const n = series?.length ?? 0;
  if (!n) return null;
  const tc = Math.min(Math.max(finite(t) ? t : 0, 0), n - 1);
  const i0 = Math.floor(tc);
  const i1 = Math.min(i0 + 1, n - 1);
  const f = i1 === i0 ? 0 : tc - i0;
  const a = series[i0];
  const b = series[i1];
  const lerp = (x, y) => (finite(x) && finite(y) ? x + (y - x) * f : (f < 0.5 ? x : y) ?? null);
  const da = toMs(a.date);
  const db = toMs(b.date);
  return {
    t: tc, i0, i1, f,
    step: f === 0 ? a.step : (f < 0.5 ? a.step : b.step),
    owcFt: lerp(a.owcFt, b.owcFt),
    gocFt: a.gocFt == null || b.gocFt == null ? null : lerp(a.gocFt, b.gocFt),
    pressure: lerp(a.pressure, b.pressure),
    dateMs: da != null && db != null ? da + (db - da) * f : da,
    onStep: f === 0,
  };
}

/**
 * The schematic section through the initial contacts, in feet (positive
 * down). An anticline whose crest sits above the GOC (or above the OWC when
 * there is no gas cap) and whose flanks pass below the OWC, with a constant
 * gross thickness. Depth window and ticks are chosen so every contact the
 * series reaches stays inside.
 * @returns {{crestFt:number, flankFt:number, thicknessFt:number, topAt:function(number):number, minFt:number, maxFt:number, ticks:number[]}}
 */
export function sectionGeometry({ initialOwcFt, initialGocFt = null, series = [] }) {
  const owc = initialOwcFt;
  const goc = finite(initialGocFt) ? initialGocFt : null;
  const top = goc ?? owc;
  const column = Math.max(owc - (goc ?? owc), 0);
  const scale = Math.max(column, 60);
  const crestFt = top - Math.max(0.6 * scale, 30);
  const flankFt = owc + Math.max(0.45 * scale, 25);
  const thicknessFt = Math.max(0.55 * (flankFt - crestFt), 40);
  // x in [0, 1]: a cosine anticline, crest at the middle
  const topAt = (x) => crestFt + (flankFt - crestFt) * (0.5 - 0.5 * Math.cos(2 * Math.PI * (x - 0.5)));
  const depths = [crestFt, flankFt + thicknessFt, ...series.flatMap((s) => [s.owcFt, s.gocFt]).filter(finite)];
  const lo = Math.min(...depths);
  const hi = Math.max(...depths);
  const step = niceStep((hi - lo) / 5);
  const minFt = Math.floor((lo - step * 0.3) / step) * step;
  const maxFt = Math.ceil((hi + step * 0.3) / step) * step;
  const ticks = [];
  for (let v = minFt; v <= maxFt + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return { crestFt, flankFt, thicknessFt, topAt, minFt, maxFt, ticks };
}

function niceStep(raw) {
  if (!(raw > 0)) return 10;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/**
 * Where a contact at depth z meets the top of the sand, as x fractions of
 * the section (left and right flank). Null when the contact is above the
 * crest or below the flank.
 */
export function contactExtent(geom, z) {
  if (!finite(z) || z <= geom.crestFt) return null;
  if (z >= geom.flankFt) return [0, 1];
  // invert topAt: z = crest + (flank - crest) * (0.5 - 0.5 cos(2 pi (x - 0.5)))
  const u = (z - geom.crestFt) / (geom.flankFt - geom.crestFt);
  const dx = Math.acos(1 - 2 * u) / (2 * Math.PI);
  return [0.5 - dx, 0.5 + dx];
}

/** Playback: the position after `elapsedMs` of a run that crosses the series in `durationMs`. */
export function playPosition(n, startT, elapsedMs, durationMs) {
  if (!(n > 1)) return 0;
  const t = startT + ((n - 1) * elapsedMs) / Math.max(durationMs, 1);
  return Math.min(t, n - 1);
}
