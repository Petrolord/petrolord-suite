// The pore pressure prognosis at the wellsite (upgrade U2-008): the PP, FP
// and OBG curves Pore Pressure Studio publishes to the registry (pipeline
// pp-1.x, or any registry curve of those mnemonics with a readable unit)
// are loaded with the prognosis and read here by their declared unit
// through the one Suite door, src/lib/ppfgUnits.js. A mud weight or a
// gradient converts at the TVD below the rotary table from the survey in
// use. The mud window at the bit compares the mud weight in use (the
// latest data row) with the prognosis. It presents; it decides nothing. Pure.

import { ppfgUnit, emwKgM3, unreadableUnitReason } from '@/lib/ppfgUnits';
import { mdToTvd } from '@/lib/wellsite/depth';

export const PPFG = Object.freeze(['PP', 'FP', 'OBG']);
const MAX_POINTS = 400;

/** A registry curve thinned for the prognosis row (at most 400 points, nulls dropped). */
export function thinCurve(log, values) {
  const n = log.n_samples;
  const step = Math.max(1, Math.ceil(n / MAX_POINTS));
  const md = []; const v = [];
  for (let i = 0; i < n; i += step) { const x = values[i]; if (Number.isFinite(x)) { md.push(Number((log.start_md_m + i * log.step_m).toFixed(3))); v.push(Number(Number(x).toPrecision(7))); } }
  return { unit: log.unit || null, log_id: log.id, pipeline: (log.provenance && log.provenance.pipeline_version) || null, project_id: (log.provenance && log.provenance.project_id) || null, md_m: md, values: v };
}

/** The prognosis pressure_curves object from registry logs (latest readable curve per mnemonic; unreadable units named). */
export async function pressureCurvesFrom(logs, download) {
  const skipped = []; const picked = {};
  for (const l of logs || []) {
    const m = String(l.mnemonic || '').toUpperCase();
    if (!PPFG.includes(m)) continue;
    if (!ppfgUnit(l.unit)) { skipped.push(unreadableUnitReason(l)); continue; }
    picked[m] = l;
  }
  const curves = {};
  for (const m of Object.keys(picked)) curves[m] = thinCurve(picked[m], await download(picked[m]));
  if (!Object.keys(curves).length && !skipped.length) return null;
  return { source: 'geo_wells_logs', loaded_at: new Date().toISOString(), curves, skipped };
}

const sample = (c, mdM) => {
  const md = c.md_m; const n = md.length;
  if (!n || mdM < md[0] || mdM > md[n - 1]) return null;
  let i = 1;
  while (i < n - 1 && md[i] < mdM) i += 1;
  const f = (mdM - md[i - 1]) / (md[i] - md[i - 1] || 1);
  return c.values[i - 1] + f * (c.values[i] - c.values[i - 1]);
};

/** Pressures (MPa) and equivalent mud weights (kg/m3) of the prognosis at a depth. */
export function pressureAt(pressureCurves, mdM, ctx) {
  if (!pressureCurves || !pressureCurves.curves || !Number.isFinite(mdM)) return null;
  const tvdM = ctx && Number.isFinite(ctx.kbElevM) ? mdToTvd(mdM, ctx).tvdM : mdM;
  const out = { mdM, tvdM };
  let any = false;
  for (const m of PPFG) {
    const c = pressureCurves.curves[m];
    const conv = c ? ppfgUnit(c.unit) : null;
    const raw = c && conv ? sample(c, mdM) : null;
    const mpa = raw == null ? null : conv.toMpa(raw, tvdM);
    const key = m.toLowerCase();
    out[`${key}Mpa`] = Number.isFinite(mpa) ? mpa : null;
    out[`${key}EmwKgM3`] = Number.isFinite(mpa) ? emwKgM3(mpa, tvdM) : null;
    if (Number.isFinite(mpa)) any = true;
  }
  return any ? out : null;
}

/** The mud weight in use at or just above a depth: the deepest data row at or above it with an ECD or a mud weight in. */
export function mudWeightInUse(points, mdM) {
  let best = null;
  for (const p of points || []) {
    if (p.mdM > mdM + 1e-6) break;
    const v = p.values;
    if (Number.isFinite(v.ecd)) best = { kgM3: v.ecd, source: 'ECD', mdM: p.mdM };
    else if (Number.isFinite(v.mw)) best = { kgM3: v.mw, source: 'mud weight in', mdM: p.mdM };
  }
  return best;
}

/**
 * The mud window at the bit: the prognosis, the mud weight in use and where it sits.
 * @returns {{ at, mw, state: 'no_prognosis'|'no_mud_weight'|'inside'|'below_pore'|'above_fracture', overPoreKgM3, underFracKgM3, text }}
 */
export function mudWindowAtBit({ pressureCurves, bitMdM, ctx, points, fmtMw = (kg) => `${(kg / 1000).toFixed(2)} sg` }) {
  const at = pressureAt(pressureCurves, bitMdM, ctx);
  if (!at || (at.ppEmwKgM3 == null && at.fpEmwKgM3 == null)) return { at: null, mw: null, state: 'no_prognosis', text: pressureCurves && pressureCurves.curves && Object.keys(pressureCurves.curves).length ? 'The pressure prognosis does not reach the bit depth.' : 'No pressure prognosis is loaded. Publish one from Pore Pressure Studio, then Load from registry on Tops.' };
  const mw = mudWeightInUse(points, bitMdM);
  const prog = `Prognosis at the bit: pore pressure ${at.ppEmwKgM3 != null ? fmtMw(at.ppEmwKgM3) : 'n/a'}, fracture ${at.fpEmwKgM3 != null ? fmtMw(at.fpEmwKgM3) : 'n/a'} (equivalent mud weight at ${at.tvdM.toFixed(0)} m TVD below KB).`;
  if (!mw) return { at, mw: null, state: 'no_mud_weight', text: `${prog} No mud weight is on record at this depth: import the mudlogging data or type a row.` };
  const over = at.ppEmwKgM3 != null ? mw.kgM3 - at.ppEmwKgM3 : null;
  const under = at.fpEmwKgM3 != null ? at.fpEmwKgM3 - mw.kgM3 : null;
  let state = 'inside';
  if (over != null && over < 0) state = 'below_pore'; else if (under != null && under < 0) state = 'above_fracture';
  const head = `${prog} ${mw.source === 'ECD' ? 'ECD' : 'Mud weight in'} ${fmtMw(mw.kgM3)}`;
  const text = state === 'below_pore' ? `${head}: ${fmtMw(-over)} below the prognosed pore pressure. An indication to check against gas, flow and the driller.`
    : state === 'above_fracture' ? `${head}: ${fmtMw(-under)} above the prognosed fracture pressure. An indication to check against losses and the driller.`
      : `${head}: ${over != null ? `${fmtMw(over)} over the prognosed pore pressure` : 'no pore pressure prognosis'}${under != null ? `, ${fmtMw(under)} under the prognosed fracture pressure` : ''}.`;
  return { at, mw, state, overPoreKgM3: over, underFracKgM3: under, text };
}

/** Prognosis curves as EMW against depth for the strip log (kg/m3). */
export function pressureEmwSeries(pressureCurves, ctx) {
  const out = { pp: [], fp: [], obg: [] };
  if (!pressureCurves || !pressureCurves.curves) return out;
  for (const m of PPFG) {
    const c = pressureCurves.curves[m];
    if (!c) continue;
    for (const mdM of c.md_m) { const a = pressureAt({ curves: { [m]: c } }, mdM, ctx); const v = a && a[`${m.toLowerCase()}EmwKgM3`]; if (Number.isFinite(v)) out[m.toLowerCase()].push({ mdM, v }); }
  }
  return out;
}
