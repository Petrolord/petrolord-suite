// Saturation-height link with SCAL Studio (AppUpgrade PETRO-U2-010,
// 2026-09-29). SCAL Studio fits a Leverett J function from core capillary
// pressure and saves it with the fluid gradients and the free-water level
// (FWL). This module reads such a saved project and turns it into water
// saturation at every log sample from its height above the FWL, so the log
// Sw and the capillary-pressure Sw sit side by side on the tracks and a
// reviewer sees where they agree.
//
// The chain is SCAL Studio's own engine, run backwards by bisection:
//   Sw -> J(Sw) (makeJFunction) -> Pc = J x sigma cos(theta) / (0.21645
//   sqrt(k / phi)) (pcFromJ, Leverett 1941) -> h = Pc / (0.4335 (gamma_w -
//   gamma_hc)) (heightFromPc, psi per ft of water)
// and the saturation at a height is the Sw whose forward height matches.
// Nothing here restates the J, Pc or height formulas.

import { makeJFunction, pcFromJ, heightFromPc } from '@/utils/scalCalculations';
import { buildJSpec, buildReservoirProps } from '@/contexts/ScalStudioContext';
import { makeDepthFrame } from '../../WellDataManager/engine/checkshots';

const M_PER_FT = 0.3048;
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

/**
 * The J spec, rock, fluids and FWL of a saved SCAL Studio project (its
 * inputs_data, schema 1), through SCAL Studio's own buildJSpec and
 * buildReservoirProps: manual power law, or the geometric-mean J of the
 * included samples with its power-law fit.
 * @returns {{ok: boolean, errors?: string[], name?: string, jSpec?: Object, reservoir?: Object, fluids?: Object, fwlTvdssM?: ?number}}
 */
export function shmFromScalProject(payload) {
  if (!payload || !payload.capillary) return { ok: false, errors: ['This SCAL Studio project has no capillary-pressure set-up.'] };
  // SCAL Studio's own builders: the J spec and the rock exactly as SCAL shows them
  const { jSpec, error } = buildJSpec(payload.capillary, payload.samples || []);
  if (!jSpec) return { ok: false, errors: [error || 'No J function in this project.'] };
  const { props: reservoir, error: rockError } = buildReservoirProps(payload.capillary.reservoir || {});
  if (!reservoir) return { ok: false, errors: [rockError] };
  const h = payload.height || {};
  const fluids = { gammaW: num(h.gammaW), gammaHc: num(h.gammaHc) };
  if (!(fluids.gammaW > fluids.gammaHc)) return { ok: false, errors: ['The project needs a water gradient above the hydrocarbon gradient.'] };
  const fwlFt = num(h.fwl_tvdss);
  return { ok: true, name: payload.name || 'SCAL project', jSpec, reservoir, fluids, fwlTvdssM: Number.isFinite(fwlFt) ? fwlFt * M_PER_FT : null };
}

/** Height above the FWL (ft) at which SCAL Studio's chain gives this Sw. */
function heightAt(jSpec, reservoir, fluids, Sw) {
  const pc = pcFromJ(jSpec, reservoir, { n: 1, SwMin: Sw, SwMax: Sw });
  if (!pc.ok || !pc.rows.length) return NaN;
  return heightFromPc(pc.rows[0].Pc_psi, fluids);
}

/**
 * Water saturation at a height above the free-water level.
 * @param {number} hFt height above the FWL, ft (0 or below: 1)
 * @returns {number} Sw in the J function's domain
 */
export function swAtHeight(jSpec, reservoir, fluids, hFt) {
  if (!Number.isFinite(hFt)) return NaN;
  if (hFt <= 0) return 1;
  const { domain } = makeJFunction(jSpec);
  let lo = domain.SwMin + 1e-9;
  let hi = domain.SwMax;
  const hLo = heightAt(jSpec, reservoir, fluids, lo);
  if (!(hFt < hLo)) return lo;           // above the highest height the curve reaches: irreducible
  const hHi = heightAt(jSpec, reservoir, fluids, hi);
  if (hFt <= hHi) return hi;              // within the threshold height
  for (let it = 0; it < 80; it++) {       // height falls as Sw rises
    const mid = (lo + hi) / 2;
    if (heightAt(jSpec, reservoir, fluids, mid) > hFt) lo = mid; else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

/**
 * SW_SHM on the well's samples.
 * @param {Object} p
 * @param {Object} p.shm shmFromScalProject result
 * @param {ArrayLike<number>} p.depth MD, m
 * @param {Object} p.well registry row (deviation, kb_m) for TVDSS
 * @param {?number} [p.fwlTvdssM] override of the project's FWL (m TVDSS)
 * @param {'project'|'logs'} [p.rock] k and phi from the project (one rock) or per sample from KPERM and PHIE
 * @param {{PHIE?: ArrayLike<number>, KPERM?: ArrayLike<number>}} [p.outputs]
 * @returns {{ok: boolean, reason?: string, data?: Float64Array, fwlTvdssM?: number}}
 */
export function shmCurve({ shm, depth, well, fwlTvdssM = null, rock = 'project', outputs = {} }) {
  if (!shm?.ok) return { ok: false, reason: shm?.errors?.[0] || 'No saturation-height function.' };
  const fwl = Number.isFinite(fwlTvdssM) ? fwlTvdssM : shm.fwlTvdssM;
  if (!Number.isFinite(fwl)) return { ok: false, reason: 'No free-water level: the SCAL project has none; type one.' };
  const frame = makeDepthFrame({ deviation: well?.deviation, kbM: well?.kb_m ?? 0, tdMdM: well?.td_md_m });
  const n = depth.length;
  const data = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let tvdss;
    try { tvdss = frame.mdToTvdss(depth[i]).tvdss; } catch { continue; }
    const hFt = (fwl - tvdss) / M_PER_FT;
    let reservoir = shm.reservoir;
    if (rock === 'logs') {
      const k = outputs.KPERM?.[i]; const phi = outputs.PHIE?.[i];
      if (!(k > 0) || !(phi > 0 && phi < 1)) continue;
      reservoir = { ...shm.reservoir, k_md: k, phi };
    }
    data[i] = swAtHeight(shm.jSpec, reservoir, shm.fluids, hFt);
  }
  return { ok: true, data, fwlTvdssM: fwl };
}

/** Per zone: mean log Sw, mean SHM Sw and their difference over samples with both. */
export function shmZoneComparison({ depth, sw, swShm, zones = [] }) {
  const out = {};
  for (const z of zones) {
    let a = 0; let b = 0; let n = 0;
    for (let i = 0; i < depth.length; i++) {
      if (depth[i] < z.top_md_m || depth[i] > z.base_md_m) continue;
      const x = Math.min(1, Math.max(0, sw?.[i])); const y = swShm?.[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      a += x; b += y; n += 1;
    }
    out[z.id] = n ? { n, logSw: a / n, shmSw: b / n, diff: a / n - b / n } : { n: 0 };
  }
  return out;
}

export const SHM_TEMPLATE_ID = 'saturation-height';

/** A user layout: GR, porosity, and the Sw track with the log Sw and SW_SHM side by side. */
export function ensureShmTemplate(layouts, newId) {
  const existing = layouts.templates.find((t) => t.id === SHM_TEMPLATE_ID);
  if (existing) return layouts.activeTemplateId === SHM_TEMPLATE_ID ? layouts : { ...layouts, activeTemplateId: SHM_TEMPLATE_ID };
  const template = {
    id: SHM_TEMPLATE_ID, name: 'Log Sw and saturation-height', builtin: false,
    tracks: [
      { id: newId('trk'), title: 'GR (API)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 150, curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }], fills: [] },
      { id: newId('trk'), title: 'Porosity (v/v)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 0.4, curves: [{ source: 'output:PHIE', label: 'φe', color: '#0891b2' }], fills: [] },
      {
        id: newId('trk'), title: 'Sw (v/v)', type: 'curves', width: 1.4, scale: 'linear', min: 0, max: 1,
        curves: [
          { source: 'output:SW', label: 'Sw', color: '#2563eb' },
          { source: 'output:SW_SHM', label: 'Sw from saturation-height', color: '#b45309', style: 'dash' },
        ],
        fills: [],
      },
    ],
  };
  return { ...layouts, templates: [...layouts.templates, template], activeTemplateId: SHM_TEMPLATE_ID };
}
