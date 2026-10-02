// What Rock Physics takes from the other Geoscience apps (U2-009, U2-011,
// 2026-10-01), so the same well tells one story across the Suite:
//
// - Petrophysics Studio's mineral model publishes its solved fractions as
//   V_<MINERAL> curves (provenance operation 'mineral-model'). They are
//   BULK volume fractions (they sum to one with the model's porosity), so
//   the solid's share of each mineral is V_i / sum(V). K_min per sample is
//   the Voigt-Reuss-Hill mix of those shares.
// - Pore Pressure Studio publishes PP (pore pressure) on its own depth grid;
//   its mean over the zone can fill the Batzle-Wang pore pressure.
// - Petrophysics' saturation-height link reads a SCAL Studio project and
//   gives Sw at each sample from its height above the free-water level;
//   fluid B can follow it, so "what if the contact moved" is one number.
//
// Pure except saturationHeightSw, which loads the Petrophysics module on
// demand (it brings SCAL Studio's engine with it).

import { MINERALS, mixMinerals } from '../engine/minerals';
import { ppfgUnit } from '@/lib/ppfgUnits';

export const PETRO_ENGINE = 'petrophysics-studio';
export const PP_ENGINE = 'pore-pressure-studio';

// Minerals the Petrophysics model offers that the Rock Physics table does
// not carry: Rock Physics Handbook mineral table values (Pa, kg/m3).
export const EXTRA_MINERALS = Object.freeze({
  anhydrite: Object.freeze({ k: 56.1e9, mu: 29.1e9, rho: 2980 }),
  halite: Object.freeze({ k: 24.8e9, mu: 14.9e9, rho: 2160 }),
});

const base = (m) => String(m || '').toUpperCase().split(':')[0];
const own = (table, key) => Object.prototype.hasOwnProperty.call(table, key);
/** Elastic constants of a mineral key, or null when Rock Physics has none. */
export const mineralModuli = (key) => (own(MINERALS, key) ? MINERALS[key] : own(EXTRA_MINERALS, key) ? EXTRA_MINERALS[key] : null);

/**
 * The mineral-fraction curves Petrophysics Studio published on this well.
 * When several runs exist the newest is taken.
 * @returns {Array<{key: string, log: Object, known: boolean}>}
 */
export function mineralModelLogs(logs) {
  const rows = (logs || []).filter((l) => l?.provenance?.computed === true && l.provenance.engine === PETRO_ENGINE
    && l.provenance.operation === 'mineral-model' && /^V_[A-Z0-9_]+$/.test(base(l.mnemonic)) && !/_CUM$/.test(base(l.mnemonic)));
  const newest = new Map();
  for (const l of rows) {
    const b = base(l.mnemonic);
    const prev = newest.get(b);
    if (!prev || String(l.created_at || '') > String(prev.created_at || '')) newest.set(b, l);
  }
  return [...newest.entries()].map(([b, log]) => {
    const key = b.slice(2).toLowerCase();
    return { key, log, known: !!mineralModuli(key) };
  });
}

/**
 * The fractions as a set the sampler can read.
 * @param {Array<{key: string, data: ArrayLike<number>}>} entries
 */
export function buildMineralSet(entries) {
  const usable = entries.filter((e) => e.data && mineralModuli(e.key));
  return {
    keys: usable.map((e) => e.key),
    unknown: entries.filter((e) => !mineralModuli(e.key)).map((e) => e.key),
    data: Object.fromEntries(usable.map((e) => [e.key, e.data])),
    n: usable.length ? usable[0].data.length : 0,
  };
}

/**
 * K_min (Pa) at one sample from the published fractions: the solid's
 * shares (V_i over their sum), Voigt-Reuss-Hill. NaN when a fraction is
 * missing, negative beyond rounding, or the minerals sum to nothing; and
 * when the model holds a mineral Rock Physics has no modulus for (its
 * share cannot be left out without changing the answer).
 */
export function kminFromFractions(set, i) {
  if (!set || !set.keys.length || set.unknown.length) return NaN;
  let sum = 0;
  const parts = [];
  for (const key of set.keys) {
    const v = set.data[key][i];
    if (!Number.isFinite(v) || v < -0.02) return NaN;
    const f = Math.max(0, v);
    sum += f;
    parts.push({ key, f });
  }
  if (!(sum > 0.05)) return NaN;
  return mixMinerals(parts.filter((p) => p.f > 0).map((p) => ({ ...mineralModuli(p.key), frac: p.f / sum }))).k;
}

/** The pore-pressure curve to read: Pore Pressure Studio's own PP first, else any PP curve in a pressure unit. */
export function porePressureLog(logs) {
  const pp = (logs || []).filter((l) => base(l.mnemonic) === 'PP' && ppfgUnit(l.unit));
  const own2 = pp.filter((l) => l.provenance?.engine === PP_ENGINE)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return own2[0] || pp[0] || null;
}

/**
 * Mean pore pressure over a zone from a PP curve on its own depth grid.
 * @param {Object} log registry row (start_md_m, stop_md_m, step_m, n_samples, unit)
 * @param {ArrayLike<number>} data its samples
 * @param {{top_md_m: number, base_md_m: number}} zone
 * @param {(md: number) => number} [tvdBelowRkb] needed when the curve is a mud weight or a gradient
 * @returns {{ok: true, mpa: number, n: number, unit: string, source: string} | {ok: false, reason: string}}
 */
export function zonePorePressure(log, data, zone, tvdBelowRkb = null) {
  const u = ppfgUnit(log?.unit);
  if (!u) return { ok: false, reason: `The PP curve's unit "${log?.unit || ''}" is not a pressure.` };
  if (!zone) return { ok: false, reason: 'Pick a zone first.' };
  const n = data.length;
  const start = Number(log.start_md_m);
  const step = Number.isFinite(Number(log.step_m)) && Number(log.step_m) > 0
    ? Number(log.step_m) : (n > 1 ? (Number(log.stop_md_m) - start) / (n - 1) : NaN);
  if (!Number.isFinite(start) || !(step > 0)) return { ok: false, reason: 'The PP curve has no depth grid.' };
  if (u.needsTvd && !tvdBelowRkb) return { ok: false, reason: `The PP curve is in ${u.unit} (${u.kind === 'emw' ? 'a mud weight' : 'a gradient'}); it needs the well's survey to become a pressure.` };
  let sum = 0; let count = 0;
  for (let i = 0; i < n; i++) {
    const md = start + i * step;
    if (md < zone.top_md_m || md > zone.base_md_m) continue;
    const v = data[i];
    if (!Number.isFinite(v) || v <= -999 || Math.abs(v) >= 9e29) continue;
    const mpa = u.toMpa(v, u.needsTvd ? tvdBelowRkb(md) : undefined);
    if (Number.isFinite(mpa) && mpa > 0) { sum += mpa; count += 1; }
  }
  if (!count) return { ok: false, reason: 'The PP curve has no values inside the zone.' };
  const fromPp = log.provenance?.engine === PP_ENGINE;
  return {
    ok: true,
    mpa: sum / count,
    n: count,
    unit: u.unit,
    source: fromPp ? `Pore Pressure Studio PP (${log.provenance?.params?.method || log.description || 'published'}), mean of ${count} samples in the zone`
      : `PP curve ${log.mnemonic} (${log.unit}), mean of ${count} samples in the zone`,
  };
}

/**
 * Sw at each sample from a SCAL Studio saturation-height function, through
 * Petrophysics Studio's own reader (PETRO-U2-010), so the two apps agree.
 * @param {{payload: Object, depth: ArrayLike<number>, well: Object, fwlTvdssM?: ?number}} p
 * @returns {Promise<{ok: true, data: Float64Array, fwlTvdssM: number, name: string, n: number} | {ok: false, reason: string}>}
 */
export async function saturationHeightSw({ payload, depth, well, fwlTvdssM = null }) {
  const { shmFromScalProject, shmCurve } = await import('@/pages/apps/PetrophysicsStudio/services/saturationHeight');
  const shm = shmFromScalProject(payload);
  if (!shm.ok) return { ok: false, reason: shm.errors?.[0] || 'No saturation-height function in this project.' };
  const r = shmCurve({ shm, depth, well, fwlTvdssM, rock: 'project' });
  if (!r.ok) return { ok: false, reason: r.reason };
  let n = 0;
  for (let i = 0; i < r.data.length; i++) if (Number.isFinite(r.data[i])) n += 1;
  if (!n) return { ok: false, reason: 'The saturation-height function gave no value on this well (check the survey and the free-water level).' };
  return { ok: true, data: r.data, fwlTvdssM: r.fwlTvdssM, name: shm.name, n };
}
