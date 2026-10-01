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
import { zoneVolumes, zoneVolumesWithContacts } from '../engine/volumes';
import { shiftProps } from './modelBuild';
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
    for (const k of ['phi', 'sw', 'ntg']) if (zone.variance?.[k]) inputs[`${k}Z`] = { type: 'normal', mean: 0, stdDev: 1 };
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
  const out = [];
  const totalWork = iterations * built.zones.length;
  let done = 0;
  for (let i = 0; i < built.zones.length; i++) {
    const zone = built.zones[i];
    const top = built.clamped[i]; const base = built.clamped[i + 1];
    const labels = zone.labels || built.labels || null;
    const inputs = zoneInputs(zone, cfg);
    const sampler = createCorrelatedSampler({
      inputs, paramOrder: ['owcShift', 'gocShift', 'bo', 'bg', 'phiZ', 'swZ', 'ntgZ'],
      correlations: Number.isFinite(Number(cfg.rhoPhiSw)) && Number(cfg.rhoPhiSw) !== 0 ? [{ a: 'phiZ', b: 'swZ', rho: Number(cfg.rhoPhiSw) }] : [],
      rng,
    });
    const base0 = zone.mc?.fluids || null;
    const samples = Object.fromEntries(QUANTITIES.map((q) => [q, []]));
    for (let t = 0; t < iterations; t++) {
      const { values } = sampler.sample();
      const props = shiftProps(zone, { phi: values.phiZ || 0, sw: values.swZ || 0, ntg: values.ntgZ || 0 });
      let v;
      if (zone.mc?.hasFluids && base0) {
        const fl = { ...base0 };
        if (values.owcShift) {
          if (zone.mc.trap && zone.mc.owcBase) fl.owc = boundLegByClosure(spec, top, shiftContact(zone.mc.owcBase, values.owcShift)).owc;
          else fl.owc = shiftContact(base0.owc, values.owcShift);
        }
        if (values.gocShift) fl.goc = shiftContact(base0.goc, values.gocShift);
        if (Number.isFinite(values.bo)) fl.bo = values.bo;
        if (Number.isFinite(values.bg)) fl.bg = values.bg;
        v = zoneVolumesWithContacts(spec, top, base, labels, props, fl).total;
      } else {
        v = zoneVolumes(spec, zone.thickness, labels, props).total;
      }
      for (const q of QUANTITIES) if (v && Number.isFinite(v[q])) samples[q].push(v[q]);
      done += 1;
      if (t % 50 === 49) {
        if (signal?.aborted) throw new Error('Volume distribution cancelled.');
        if (onProgress) onProgress({ fraction: done / totalWork, label: `${zone.name}: trial ${t + 1} of ${iterations}` });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    const stats = {};
    for (const q of QUANTITIES) if (samples[q].length) { const s = basicStats(samples[q]); stats[q] = { p90: s.p90, p50: s.p50, p10: s.p10, mean: s.mean, min: s.min, max: s.max }; }
    out.push({ name: zone.name, varying: sampler.varKeys, stats });
  }
  if (onProgress) onProgress({ fraction: 1, label: 'done' });
  return { iterations, seed, config: { ...cfg }, zones: out };
}
