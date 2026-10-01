// Sw from a SCAL saturation-height function (Earth Modeling upgrade U2-002,
// 2026-10-01; T1 E2, finding EM-U1-020). A zone-average Sw ignores the
// transition zone: near the free-water level (FWL) the rock holds more
// water than at the crest. SCAL Studio fits a Leverett J function and saves
// it with the fluid gradients and the FWL; Petrophysics Studio
// (services/saturationHeight.js, PETRO-U2-010) reads that saved project and
// inverts SCAL's chain for Sw at a height above the FWL. Earth Modeling
// does the same per node.
//
// The page resolves the saved project through Petrophysics'
// shmFromScalProject (the J spec, rock and fluids exactly as SCAL builds
// them) before the build; this module stays pure so it runs in the build
// worker. Speed: a model has a million node samples, so Sw(h) is read
// from SCAL Studio's own forward profile (swVsHeight: Sw -> J -> Pc -> h on
// a fine Sw grid, monotone) by interpolation instead of a bisection per
// sample. The gate holds the table to Petrophysics' swAtHeight (1e-4) and
// to its published hand example.
//
// Per node the zone's hydrocarbon leg runs from the top down to the
// contact (the OWC, or the FWL when no OWC is typed); Sw is the mean of
// Sw(h) over that leg at 24 midpoint samples, h = (FWL - depth) in feet.
// Rock: the project's porosity and permeability, or each node's modelled
// porosity through the Leverett scaling (h at a given Sw grows with
// sqrt(phi) at fixed k), which the gate checks against swAtHeight run with
// that porosity.

import { swVsHeight, makeJFunction } from '@/utils/scalCalculations';
import { isNull } from '@/lib/gridding/gridmath';
import { NULL_VALUE } from '@/lib/gridding/numeric';

const M_PER_FT = 0.3048;
export const SHM_SAMPLES = 24;

/**
 * Sw against height from SCAL Studio's forward chain.
 * @param {{jSpec, reservoir, fluids}} shm a shmFromScalProject result
 * @returns {{h: Float64Array, sw: Float64Array, swMin: number, swMax: number}}
 */
export function shmTable(shm, n = 4000) {
  const { domain } = makeJFunction(shm.jSpec);
  const lo = domain.SwMin + 1e-9;
  const hi = domain.SwMax;
  const prof = swVsHeight(shm.jSpec, shm.reservoir, shm.fluids, { n, SwMin: lo, SwMax: hi });
  if (!prof.ok) throw new Error(`The saturation-height function could not be evaluated: ${(prof.errors || []).join(' ')}`);
  const rows = prof.rows.filter((r) => Number.isFinite(r.h_ft) && Number.isFinite(r.Sw));
  return { h: Float64Array.from(rows, (r) => r.h_ft), sw: Float64Array.from(rows, (r) => r.Sw), swMin: lo, swMax: hi };
}

/** Sw at a height above the FWL (ft) from the table; 1 at or below the FWL. */
export function swFromTable(t, hFt) {
  if (!Number.isFinite(hFt)) return NaN;
  if (hFt <= 0) return 1;
  const { h, sw } = t;
  if (hFt <= h[0]) return sw[0];                 // within the threshold height
  if (hFt >= h[h.length - 1]) return sw[sw.length - 1]; // higher than the curve reaches
  let a = 0; let b = h.length - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (h[m] <= hFt) a = m; else b = m; }
  const f = (hFt - h[a]) / (h[b] - h[a] || 1);
  return sw[a] + f * (sw[b] - sw[a]);
}

/**
 * Sw per node from the saturation-height function.
 * @param {Object} p
 * @param {{nx, ny}} p.spec
 * @param {ArrayLike<number>} p.top zone top, m positive down
 * @param {ArrayLike<number>} p.base zone base, m positive down
 * @param {?Float64Array} p.contact the OWC per node (NaN: none); the FWL stands in where none
 * @param {{jSpec, reservoir, fluids}} p.shm
 * @param {number} p.fwlM free-water level, m TVDSS
 * @param {'project'|'model'} [p.rock]
 * @param {?ArrayLike<number>} [p.phi] modelled porosity per node (rock 'model')
 * @returns {{sw: Float64Array, nodes: number, transitionNodes: number}}
 */
export function shmSwGrid({ spec, top, base, contact = null, shm, fwlM, rock = 'project', phi = null }) {
  if (!Number.isFinite(fwlM)) throw new Error('Sw from saturation-height needs a free-water level: the SCAL project has none, so type one in the dock.');
  const n = spec.nx * spec.ny;
  const table = shmTable(shm);
  const phiRef = Number(shm.reservoir?.phi);
  const sw = new Float64Array(n).fill(NULL_VALUE);
  let nodes = 0; let transitionNodes = 0;
  const swIrr = table.sw[table.sw.length - 1];
  for (let j = 0; j < n; j++) {
    const t = top[j]; const b = base[j];
    if (isNull(t) || isNull(b)) continue;
    const c = contact && Number.isFinite(contact[j]) ? Math.min(contact[j], fwlM) : fwlM;
    const bottom = Math.min(b, c);
    // scale heights for the node's porosity (Leverett: h at fixed Sw ~ sqrt(phi))
    let scale = 1;
    if (rock === 'model' && phi && Number.isFinite(phi[j]) && phi[j] > 0 && phiRef > 0) scale = Math.sqrt(phiRef / phi[j]);
    if (!(bottom > t)) { sw[j] = 1; nodes += 1; continue; }
    let s = 0;
    for (let k = 0; k < SHM_SAMPLES; k++) {
      const d = t + ((k + 0.5) / SHM_SAMPLES) * (bottom - t);
      s += swFromTable(table, ((fwlM - d) / M_PER_FT) * scale);
    }
    sw[j] = s / SHM_SAMPLES;
    nodes += 1;
    if (sw[j] > swIrr + 0.01) transitionNodes += 1;
  }
  return { sw, nodes, transitionNodes };
}
