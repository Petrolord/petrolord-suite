// Z units at the interpretation import door (SEIS-U1-009, -010). Pure.
//
// Horizon and fault files carry TWT in milliseconds (Petrel, Charisma,
// IESX) or in seconds (OpendTect and Kingdom exports can write either).
// Read as milliseconds, a horizon at 1.234 s lands at sample 0.3 of the
// volume, the top of the section, and still reports "picks placed".
// Surfaces in depth come in metres or feet; the registry keeps the unit.

/** Largest |z| a TWT in seconds can plausibly have (20 s of record). */
export const MAX_SECONDS = 20;

const live = (z) => Number.isFinite(z) && Math.abs(z) < 1e29;

/** 's' when every live z fits in 20 s (no real horizon sits in the first
 *  20 ms), else 'ms'. */
export function detectTimeUnit(zs) {
  let n = 0;
  let max = 0;
  for (const z of zs || []) {
    if (!live(z)) continue;
    n += 1;
    const a = Math.abs(z);
    if (a > max) max = a;
  }
  return n > 0 && max <= MAX_SECONDS ? 's' : 'ms';
}

export const TIME_SCALE = Object.freeze({ ms: 1, s: 1000 });

/** A grid's live values times `scale`, nulls kept. */
export function scaleLive(z, scale) {
  if (scale === 1) return z;
  const out = new Float32Array(z.length);
  for (let i = 0; i < z.length; i++) out[i] = live(z[i]) ? z[i] * scale : z[i];
  return out;
}

/** Surface domain choices at the import door. */
export const SURFACE_Z_CHOICES = Object.freeze([
  { key: 'twt_ms', label: 'TWT (ms)', domain: 'twt', zUnit: 'ms', scale: 1 },
  { key: 'twt_s', label: 'TWT (s)', domain: 'twt', zUnit: 'ms', scale: 1000 },
  { key: 'depth_m', label: 'Depth (m)', domain: 'depth', zUnit: 'm', scale: 1 },
  { key: 'depth_ft', label: 'Depth (ft)', domain: 'depth', zUnit: 'ft', scale: 1 },
]);
export const surfaceZChoice = (key) => SURFACE_Z_CHOICES.find((c) => c.key === key) || SURFACE_Z_CHOICES[0];
