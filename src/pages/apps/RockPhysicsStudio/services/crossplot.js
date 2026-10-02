// Acoustic impedance against Vp/Vs (U2-001, 2026-10-01): the picture a
// quantitative interpreter draws first. The zone's samples in situ and
// fluid substituted, coloured by a third curve, over two template lines
// from the engines (templates.js): the critical-porosity sand line for
// brine and for fluid B at the scenario's conditions and mineral, and the
// mudrock line with Gardner density. Pure; SI in, SI out (the panel
// converts impedance to the display units).

import { brine } from '../engine/fluids';
import { mixMinerals } from '../engine/minerals';
import { sandLine, mudrockLine, CRITICAL_POROSITY_SANDSTONE } from '../engine/templates';
import { sideFluid, mixingOf } from './scenario';
import { acousticImpedance, vpVs } from './elastic';

export const CROSSPLOT_MAX_POINTS = 1500;

export const COLOR_KEYS = Object.freeze([
  { key: 'sw', label: 'Sw', curve: 'sw' },
  { key: 'vsh', label: 'VSH', curve: 'vsh' },
  { key: 'phi', label: 'Porosity', curve: 'phi' },
  { key: 'depth', label: 'Depth', curve: 'depth' },
]);

/** The colour keys this well can offer (depth always; the rest when the curve exists). */
export const availableColorKeys = (model) => COLOR_KEYS.filter((c) => c.key === 'depth' || !!model?.[c.curve]);

/**
 * The zone's samples as crossplot points.
 * @param {Object} model SI well model
 * @param {number[]} indices zone sample indices
 * @param {{vp: ArrayLike<number>, vs: ArrayLike<number>, rho: ArrayLike<number>}} sub substituteZone output (NaN where not substituted)
 * @param {string} colorBy one of COLOR_KEYS
 * @returns {{inSitu: Array, substituted: Array, total: number, step: number, colorRange: ?[number, number]}}
 *   every point is {ai, vpvs, md, c}; `step` is the thinning (every step-th zone sample)
 */
export function crossplotPoints(model, indices, sub, colorBy = 'depth', maxPoints = CROSSPLOT_MAX_POINTS) {
  const curve = COLOR_KEYS.find((c) => c.key === colorBy)?.curve || 'depth';
  const src = model[curve] || null;
  const step = Math.max(1, Math.ceil(indices.length / maxPoints));
  const inSitu = [];
  const substituted = [];
  let lo = Infinity; let hi = -Infinity;
  for (let k = 0; k < indices.length; k += step) {
    const i = indices[k];
    const c = src ? src[i] : NaN;
    const ai = acousticImpedance(model.vp[i], model.rho[i]);
    const r = vpVs(model.vp[i], model.vs[i]);
    if (Number.isFinite(ai) && Number.isFinite(r)) {
      inSitu.push({ ai, vpvs: r, md: model.depth[i], c });
      if (Number.isFinite(c)) { lo = Math.min(lo, c); hi = Math.max(hi, c); }
    }
    const aiB = acousticImpedance(sub.vp[i], sub.rho[i]);
    const rB = vpVs(sub.vp[i], sub.vs[i]);
    if (Number.isFinite(aiB) && Number.isFinite(rB)) substituted.push({ ai: aiB, vpvs: rB, md: model.depth[i], c });
  }
  return { inSitu, substituted, total: indices.length, step, colorRange: lo <= hi ? [lo, hi] : null };
}

/** Low (blue) to high (red) through grey, for a value in [lo, hi]. */
export function scaleColor(value, range) {
  if (!Number.isFinite(value) || !range) return '#64748b';
  const [lo, hi] = range;
  const t = hi > lo ? Math.min(1, Math.max(0, (value - lo) / (hi - lo))) : 0.5;
  const mix = (a, b) => Math.round(a + (b - a) * t);
  // #1d4ed8 (blue) to #dc2626 (red)
  return `rgb(${mix(29, 220)}, ${mix(78, 38)}, ${mix(216, 38)})`;
}

const PHI_STEP = 0.0025;
const PHI_MARKS = [0.1, 0.2, 0.3];

/**
 * The template lines at the scenario's conditions.
 * @returns {{mineral: {k, mu, rho}, phic: number, brine: Array, fluidB: ?Array, fluidBLabel: ?string,
 *   mudrock: Array, marks: Array<{ai, vpvs, label}>, error: ?string}}
 */
export function templateLines(scenario, rock, { phic = CRITICAL_POROSITY_SANDSTONE } = {}) {
  const out = { mineral: null, phic, brine: [], fluidB: null, fluidBLabel: null, mudrock: [], marks: [], error: null };
  try {
    const entries = Object.entries(rock.minerals || {}).filter(([, f]) => f > 0).map(([name, frac]) => ({ name, frac }));
    const total = entries.reduce((s, e) => s + e.frac, 0);
    if (!(total > 0)) throw new Error('Mineral fractions are all zero.');
    const mineral = mixMinerals(entries.map((e) => ({ ...e, frac: e.frac / total })));
    const override = parseFloat(rock.kminOverrideGPa);
    if (Number.isFinite(override) && override > 0) mineral.k = override * 1e9;
    out.mineral = mineral;
    const cond = scenario.conditions;
    const phis = [];
    for (let p = 0; p < phic - 1e-9; p += PHI_STEP) phis.push(Number(p.toFixed(4)));
    const br = brine(cond.tC, cond.pMPa, cond.salinity);
    out.brine = sandLine(mineral, br, phis, phic);
    const flB = sideFluid(cond, scenario.fluidB, mixingOf(scenario));
    if (scenario.fluidB.sw < 1) {
      out.fluidB = sandLine(mineral, flB, phis, phic);
      out.fluidBLabel = flB.label;
    }
    for (const line of [out.brine, out.fluidB].filter(Boolean)) {
      for (const p of line) {
        if (PHI_MARKS.some((m) => Math.abs(m - p.phi) < 1e-9)) out.marks.push({ ai: p.ai, vpvs: p.vpvs, label: `φ ${p.phi.toFixed(2)}` });
      }
    }
    out.mudrock = mudrockLine(1600, 6000, 220);
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

/**
 * Axis domains from the points, padded, and the template lines cut to them
 * (a line through the mineral point would otherwise squash the data).
 */
export function crossplotDomain(points, pad = 0.15) {
  const all = [...points.inSitu, ...points.substituted];
  if (!all.length) return null;
  // a tight cluster still gets room for the template lines around it: at
  // least 0.5 of Vp/Vs and 40 percent of the mean impedance
  const ext = (key, minSpan) => {
    let lo = Infinity; let hi = -Infinity;
    for (const p of all) { lo = Math.min(lo, p[key]); hi = Math.max(hi, p[key]); }
    const span = hi - lo || Math.abs(hi) * 0.1 || 1;
    lo -= pad * span; hi += pad * span;
    const want = minSpan(0.5 * (lo + hi));
    if (hi - lo < want) { const mid = 0.5 * (lo + hi); lo = mid - want / 2; hi = mid + want / 2; }
    return [lo, hi];
  };
  return { ai: ext('ai', (mid) => 0.4 * Math.abs(mid)), vpvs: ext('vpvs', () => 0.5) };
}

export const clipLine = (line, domain) => (line || []).filter((p) => p.ai >= domain.ai[0] && p.ai <= domain.ai[1] && p.vpvs >= domain.vpvs[0] && p.vpvs <= domain.vpvs[1]);
