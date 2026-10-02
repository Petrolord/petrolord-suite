// Wet background trend on the intercept-gradient crossplot (U2-002,
// 2026-10-01). The classes are read against the local brine trend, as
// Hampson-Russell and RokDoc do: the well's own logs, with the hydrocarbon
// taken out where the SW log shows any, are blocked, every block boundary
// gives an (A, B) point, and the fluid line is fitted through the origin
// (engines avoTrend). An interface's anomaly is its signed distance from
// that line. When the well cannot give a fit (too few interfaces) the line
// is Castagna, Swan and Foster's (1998) for the window's mean Vs/Vp, and
// the panel says which it drew. Pure.

import {
  blockLogs, interfacePoints, fitFluidLine, distanceFromLine, backgroundSlope,
} from '../engine/avoTrend';
import { substituteZone } from './scenario';

export const DEFAULT_TREND = Object.freeze({ on: true, windowM: 150, blockM: 5 });
export const MIN_INTERFACES = 8;

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};

/**
 * The window's logs with brine in the pores: where the well has an SW log
 * (and fluid A reads it), each sample goes from its logged saturation to
 * brine through the same Gassmann the Fluids panel runs; samples the engine
 * leaves (outside the limits, gaps) stay in situ. With no SW log nothing is
 * substituted, and the result says so.
 * @returns {{vp: number[], vs: number[], rho: number[], usedSwLog: boolean, substituted: number}}
 */
export function wetLogs(model, indices, scenario, rock) {
  const usedSwLog = !!model.sw && scenario?.fluidA?.swFromLog !== false;
  if (!usedSwLog) return { vp: model.vp, vs: model.vs, rho: model.rho, usedSwLog: false, substituted: 0 };
  const toBrine = {
    ...scenario,
    fluidA: { ...scenario.fluidA, swFromLog: true },
    fluidB: { sw: 1, hc: scenario.fluidA.hc },
  };
  const sub = substituteZone(model, indices, toBrine, rock);
  let changed = 0;
  const pickKey = (key) => Array.from(model[key], (v, i) => (Number.isFinite(sub[key][i]) ? sub[key][i] : v));
  for (const i of indices) if (Number.isFinite(sub.vp[i]) && model.sw[i] < 1 && Math.abs(sub.vp[i] - model.vp[i]) > 1e-9) changed += 1;
  return { vp: pickKey('vp'), vs: pickKey('vs'), rho: pickKey('rho'), usedSwLog: true, substituted: changed };
}

/**
 * The wet trend over a depth window.
 * @param {Object} model SI well model
 * @param {{fromMd: number, toMd: number}} window metres MD
 * @param {{blockM?: number}} [opts]
 * @returns {{line: {slope: number, n?: number, rmsDistance?: number}, source: 'fit'|'castagna',
 *   points: Array<{a: number, b: number, md: number}>, castagnaSlope: number, vsVp: number,
 *   blockM: number, blocks: number, usedSwLog: boolean, substituted: number, reason: ?string} | {error: string}}
 */
export function wetTrend(model, { fromMd, toMd }, scenario, rock, { blockM = DEFAULT_TREND.blockM } = {}) {
  const indices = [];
  for (let i = 0; i < model.depth.length; i++) if (model.depth[i] >= fromMd && model.depth[i] <= toMd) indices.push(i);
  if (indices.length < 4) return { error: 'The trend window holds fewer than four samples.' };
  let wet;
  try { wet = wetLogs(model, indices, scenario, rock); } catch (e) { return { error: e.message }; }
  const steps = [];
  for (let k = 1; k < indices.length; k++) steps.push(model.depth[indices[k]] - model.depth[indices[k - 1]]);
  const step = median(steps);
  const blockSamples = Math.max(1, Math.round((blockM > 0 ? blockM : DEFAULT_TREND.blockM) / (step > 0 ? step : 1)));
  const blocks = blockLogs(wet.vp, wet.vs, wet.rho, indices, blockSamples);
  if (blocks.length < 2) return { error: 'The trend window has fewer than two usable blocks of Vp, Vs and density.' };
  const points = interfacePoints(blocks).map((p) => ({ a: p.a, b: p.b, md: model.depth[p.at] }));
  const vsVp = blocks.reduce((s, b) => s + b.vs / b.vp, 0) / blocks.length;
  const castagnaSlope = backgroundSlope(vsVp);
  const base = {
    points, castagnaSlope, vsVp, blockM: blockSamples * step, blocks: blocks.length, usedSwLog: wet.usedSwLog, substituted: wet.substituted,
  };
  if (points.length < MIN_INTERFACES) {
    return { ...base, line: { slope: castagnaSlope }, source: 'castagna', reason: `only ${points.length} interface${points.length === 1 ? '' : 's'} in the window (a fit needs ${MIN_INTERFACES})` };
  }
  try {
    return { ...base, line: fitFluidLine(points), source: 'fit', reason: null };
  } catch (e) {
    return { ...base, line: { slope: castagnaSlope }, source: 'castagna', reason: e.message };
  }
}

/** Castagna's line for one Vs/Vp, for manual halfspaces (no logs to fit). */
export function castagnaTrend(vs, vp) {
  if (!(vs > 0) || !(vp > vs)) return null;
  return { line: { slope: backgroundSlope(vs / vp) }, source: 'castagna', vsVp: vs / vp, castagnaSlope: backgroundSlope(vs / vp), points: [], reason: 'manual halfspaces: no logs to fit' };
}

/** Signed distance of an interface from the trend (negative: the hydrocarbon side of a falling line). */
export const anomaly = (a, b, trend) => (trend?.line && Number.isFinite(a) && Number.isFinite(b) ? distanceFromLine(a, b, trend.line) : NaN);
