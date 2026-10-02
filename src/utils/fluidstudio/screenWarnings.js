/**
 * The warning banner of Fluid Systems Studio in the display units
 * (FLUID-U1; PL3, PL4, RL9). The engine writes its range warnings with
 * oilfield units in the words; the structured flags beside them let the
 * banner say the same in the units the user works in, and add the inputs
 * that leave the range of the fixed correlations (viscosity, gas, water),
 * which the banner did not show before.
 *
 * Pure.
 */
import { correlationRangeWarnings, pbRsBoMethod } from '../fluidStudioCalculations.js';

const fmt = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** An input-scope range flag as a banner sentence in the display unit. */
export function inputFlagText(f, u) {
  if (!f.family) return f.text;
  const d = f.family === 'gor' && u.system === 'si' ? 2 : f.family === 'pressure' ? 0 : 1;
  const show = (v) => fmt(u.show(f.family, v), d);
  if (f.scope === 'result') return `${f.method}: the bubble point ${show(f.value)} ${u.label(f.family)} is outside its published pressure range (${show(f.low)} to ${show(f.high)} ${u.label(f.family)}); the result is extrapolated.`;
  return `${f.method}: ${f.label} ${show(f.value)} ${u.label(f.family)} is outside its published range (${show(f.low)} to ${show(f.high)} ${u.label(f.family)}); the result is extrapolated.`;
}

/**
 * @param {object} results analyzeFluidSystem's result
 * @param {{system: string, show: function, label: function}} u fluidUnits(...)
 * @returns {string[]}
 */
export function screenWarnings(results, u) {
  const meta = results?.meta;
  const all = meta?.warnings ?? [];
  if (!meta?.fluid) return all;
  const flags = (meta.rangeFlags || []).filter((f) => f.scope !== 'table');
  // the engine already words the Pb / Rs / Bo input flags (oilfield units)
  const engineWorded = new Set(correlationRangeWarnings(meta.fluid));
  const prbName = pbRsBoMethod(meta.fluid).label;
  const prbKey = ['standing', 'vasquez_beggs', 'glaso'].includes(meta.fluid.correlations.pb_rs_bo) ? meta.fluid.correlations.pb_rs_bo : 'standing';
  const prbFlagIds = new Set(['rs', 'temp', 'api', 'gasGravity'].map((v) => `${prbKey}:${v}`));
  const out = [];
  for (const w of all) {
    if (u.system === 'si' && engineWorded.has(w)) continue; // re-worded below
    if (u.system === 'si' && w.startsWith(`${prbName} alone puts the bubble point`)) {
      const d = meta.pbDetail;
      out.push(`${prbName} alone puts the bubble point at ${fmt(u.show('pressure', d.correlationPb), 0)} ${u.label('pressure')}. Its Rs is multiplied by ${Number(d.rsScale).toFixed(3)} below the entered bubble point so that Rs, Bo and viscosity are continuous there.`);
      continue;
    }
    out.push(w);
  }
  for (const f of flags) {
    const isPrbInput = f.scope === 'input' && prbFlagIds.has(f.id);
    if (isPrbInput && u.system !== 'si') continue; // the engine sentence is already there
    out.push(inputFlagText(f, u));
  }
  return [...new Set(out)];
}
