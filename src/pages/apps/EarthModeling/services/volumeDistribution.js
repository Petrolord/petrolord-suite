// Volume distribution (Earth Modeling upgrade U2-010, 2026-10-01). The
// fully correlated P90/P50/P10 of T1 shifts every property one way at once;
// a reserves engineer wants percentiles of OUTCOMES. Sampling goes through
// the canonical Suite Monte Carlo module (src/lib/monteCarlo.js, extracted
// from ReservoirCalc Pro's MonteCarloEngine: createCorrelatedSampler,
// mulberry32, basicStats); no sampler lives here (CLAUDE.md rule).
//
// One trial draws, per zone:
//   owcShift, gocShift  metres added to every contact of the zone (blocks
//                       move together); triangular min/mode/max
//   bo, bg              formation volume factors; triangular
//   phiZ, swZ, ntgZ     standard normal z: each property grid shifted by z
//                       kriging standard deviations (all nodes together;
//                       only where the property was kriged)
// and re-runs the volume engine (zoneVolumesWithContacts) on the model's
// own grids; a zone bounded by its closure and spill is re-bounded at the
// shifted contact (Mapping's closure engine). Percentiles follow the
// petroleum convention of basicStats: P90 is the low case (10th
// percentile), P10 the high case. Pure, no I/O; seeded, so a result can be
// reproduced in review.

import { createCorrelatedSampler, mulberry32, basicStats } from '@/lib/monteCarlo';
import { layeredVolumes } from './modelBuild';
import { boundLegByClosure } from './trapBound';

export const MAX_ITERATIONS = 5000;
const QUANTITIES = ['hcpv_m3', 'stoiip_m3', 'giip_m3'];

const tri = (a, m, b) => ({ type: 'triangular', min: a, mode: m, max: b });

/**
 * The distributions of one zone from the dock's settings.
 * @param {object} zone a built zone
 * @param {{owcPlusMinusM?: number, gocPlusMinusM?: number, boPct?: number, bgPct?: number, properties?: boolean}} cfg
 */
export function zoneInputs(zone, cfg = {}) {
  const f = zone.fluids || {};
  const inputs = {};
  const owc = Number(cfg.owcPlusMinusM) || 0;
  const goc = Number(cfg.gocPlusMinusM) || 0;
  if (owc > 0) inputs.owcShift = tri(-owc, 0, owc);
  if (goc > 0) inputs.gocShift = tri(-goc, 0, goc);
  const boPct = Number(cfg.boPct) || 0; const bgPct = Number(cfg.bgPct) || 0;
  if (Number.isFinite(f.bo) && boPct > 0) inputs.bo = tri(f.bo * (1 - boPct / 100), f.bo, f.bo * (1 + boPct / 100));
  if (Number.isFinite(f.bg) && bgPct > 0) inputs.bg = tri(f.bg * (1 - bgPct / 100), f.bg, f.bg * (1 + bgPct / 100));
  if (cfg.properties) {
    // a layered zone varies a property when any of its layers was kriged
    const frames = zone.layers?.length ? zone.layers : [{ variance: zone.variance }];
    for (const k of ['phi', 'sw', 'ntg']) if (frames.some((L) => L.variance?.[k])) inputs[`${k}Z`] = { type: 'normal', mean: 0, stdDev: 1 };
  }
  return inputs;
}

const shiftContact = (c, d) => {
  if (c === null || c === undefined || d === 0) return c;
  if (typeof c === 'number') return c + d;
  return Float64Array.from(c, (v) => (Number.isFinite(v) && v > -1e11 ? v + d : v));
};

/**
 * @param {object} built a built model (zones carry `mc` from buildModel)
 * @param {object} cfg {owcPlusMinusM, gocPlusMinusM, boPct, bgPct, properties, rhoPhiSw, iterations, seed}
 * @param {{onProgress?: Function, signal?: AbortSignal}} [opts]
 * @returns {Promise<{iterations, seed, zones: Array<{name, varying: string[], stats: Object}>}>}
 */
export async function runVolumeDistribution(built, cfg = {}, { onProgress = null, signal = null } = {}) {
  if (!built?.zones?.length) throw new Error('Build the model first; there are no volumes to sample.');
  const iterations = Math.max(50, Math.min(MAX_ITERATIONS, Math.floor(Number(cfg.iterations) || 500)));
  const seed = Math.floor(Number(cfg.seed) || 1);
  const rng = mulberry32(seed);
  const spec = built.specM || built.spec;
  // 3D grid upgrade: ONE draw per trial for the whole model, so zones that share
  // a contact (Ekene Sand Upper, Middle and Lower) move together and the trial's
  // field total is a real outcome. Each zone's FVF moves by the same factor;
  // a zone with no FVF or no contact ignores that draw. Porosity and NTG
  // factors (triangular, +- percent) cover a simulated porosity, which has no
  // kriging variance to shift.
  const zIn = built.zones.map((z) => zoneInputs(z, cfg));
  const pick = (k) => zIn.find((x) => x[k])?.[k];
  const rel = (k, pct) => (zIn.some((x) => x[k]) && pct > 0 ? tri(1 - pct / 100, 1, 1 + pct / 100) : null);
  const inputs = {};
  for (const k of ['owcShift', 'gocShift', 'phiZ', 'swZ', 'ntgZ']) { const v = pick(k); if (v) inputs[k] = v; }
  const boR = rel('bo', Number(cfg.boPct) || 0); if (boR) inputs.bo = boR;
  const bgR = rel('bg', Number(cfg.bgPct) || 0); if (bgR) inputs.bg = bgR;
  const phiPct = Number(cfg.phiPct) || 0; const ntgPct = Number(cfg.ntgPct) || 0;
  if (phiPct > 0) inputs.phiF = tri(1 - phiPct / 100, 1, 1 + phiPct / 100);
  if (ntgPct > 0) inputs.ntgF = tri(1 - ntgPct / 100, 1, 1 + ntgPct / 100);
  const sampler = createCorrelatedSampler({
    inputs, paramOrder: ['owcShift', 'gocShift', 'bo', 'bg', 'phiZ', 'swZ', 'ntgZ', 'phiF', 'ntgF'],
    correlations: Number.isFinite(Number(cfg.rhoPhiSw)) && Number(cfg.rhoPhiSw) !== 0 && inputs.phiZ && inputs.swZ ? [{ a: 'phiZ', b: 'swZ', rho: Number(cfg.rhoPhiSw) }] : [],
    rng,
  });
  const zs = built.zones.map(() => Object.fromEntries(QUANTITIES.map((q) => [q, []])));
  const totals = Object.fromEntries(QUANTITIES.map((q) => [q, []]));
  for (let t = 0; t < iterations; t++) {
    const { values } = sampler.sample();
    const fac = (values.phiF || 1) * (values.ntgF || 1);
    const tot = {};
    for (let i = 0; i < built.zones.length; i++) {
      const zone = built.zones[i];
      const top = built.clamped[i]; const base = built.clamped[i + 1];
      const labels = zone.labels || built.labels || null;
      const zIns = zIn[i];
      const zsh = { phi: zIns.phiZ ? values.phiZ || 0 : 0, sw: zIns.swZ ? values.swZ || 0 : 0, ntg: zIns.ntgZ ? values.ntgZ || 0 : 0 };
      const base0 = zone.mc?.fluids || null;
      let v;
      if (zone.mc?.hasFluids && base0) {
        const fl = { ...base0 };
        if (values.owcShift && zIns.owcShift) {
          if (zone.mc.trap && zone.mc.owcBase) fl.owc = boundLegByClosure(spec, top, shiftContact(zone.mc.owcBase, values.owcShift)).owc;
          else fl.owc = shiftContact(base0.owc, values.owcShift);
        }
        if (values.gocShift && zIns.gocShift) fl.goc = shiftContact(base0.goc, values.gocShift);
        if (Number.isFinite(values.bo) && Number.isFinite(base0.bo) && zIns.bo) fl.bo = base0.bo * values.bo;
        if (Number.isFinite(values.bg) && Number.isFinite(base0.bg) && zIns.bg) fl.bg = base0.bg * values.bg;
        v = layeredVolumes(spec, zone, labels, fl, top, base, { zs: zsh, useContacts: true }).total;
      } else {
        v = layeredVolumes(spec, zone, labels, null, top, base, { zs: zsh, useContacts: false }).total;
      }
      for (const q of QUANTITIES) {
        if (v && Number.isFinite(v[q])) { const x = v[q] * fac; zs[i][q].push(x); tot[q] = (tot[q] || 0) + x; }
      }
    }
    for (const q of QUANTITIES) if (Number.isFinite(tot[q])) totals[q].push(tot[q]);
    if (t % 10 === 9) {
      if (signal?.aborted) throw new Error('Volume distribution cancelled.');
      if (onProgress) onProgress({ fraction: (t + 1) / iterations, label: `trial ${t + 1} of ${iterations}` });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const statsOf = (samples) => {
    const stats = {};
    for (const q of QUANTITIES) if (samples[q].length) { const st = basicStats(samples[q]); stats[q] = { p90: st.p90, p50: st.p50, p10: st.p10, mean: st.mean, min: st.min, max: st.max }; }
    return stats;
  };
  const out = built.zones.map((zone, i) => ({ name: zone.name, varying: Object.keys(zIn[i]).filter((k) => sampler.varKeys.includes(k)).concat(sampler.varKeys.filter((k) => k === 'phiF' || k === 'ntgF')), stats: statsOf(zs[i]) }));
  if (onProgress) onProgress({ fraction: 1, label: 'done' });
  return { iterations, seed, config: { ...cfg }, zones: out, total: { stats: statsOf(totals), samples: totals } };
}
