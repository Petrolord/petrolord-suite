// What the prognosis rests on, said on screen (AppUpgrade PP-U1, PL4).
//
// A pore pressure prognosis is only as good as its trend, its density, its
// datum and its calibration. Before this, the app showed a confident curve
// for any well: the NCT could be the default (never fitted to this well),
// density could be Gardner for most of the hole, an offshore well's log MD
// could be read from the wrong datum, and typed RFT/MDT points were drawn
// but never compared. These pure helpers turn the state into sentences the
// workstation shows under the ribbon.

import { comparesTo, kindOf } from './calibrationImport';

const G_PER_M = 1; // depths are metres here; the caller formats them

/** Deepest depth a velocity trend is sampled to (m below mudline). */
export function trendDepthM(tdMdM, params) {
  const td = Number(tdMdM);
  if (Number.isFinite(td) && td > 0) {
    const top = Number(params?.mudlineMdM) > 0 ? Number(params.mudlineMdM) : (Number(params?.waterDepthM) || 0);
    return Math.min(12000, Math.max(1000, Math.ceil((td - top) / 10) * 10));
  }
  return 6000;
}

/**
 * Measured points against the prognosis: the nearest computed sample
 * within 1.5 steps (or 25 m), else the point is outside the prognosis.
 * @param {{z: number, pMpa: number}[]} calibration depths below mudline (m), MPa
 * @param {number[]} zBmlM computed depths
 * @param {number[]} ppPa computed pore pressure
 */
export function calibrationMisfit(calibration, zBmlM, ppPa, compare = 'pp') {
  // U2-002: pressure points and kicks compare with the pore pressure, leak-off
  // tests with the fracture pressure; mud weights are drawn, never compared
  const pts = (calibration || []).filter((c) => Number.isFinite(c.z) && Number.isFinite(c.pMpa) && comparesTo(c) === compare);
  if (!pts.length || !zBmlM?.length) return { points: [], rmsMpa: null, maxAbsMpa: null, deepestM: null };
  const steps = [];
  for (let i = 1; i < Math.min(zBmlM.length, 50); i++) steps.push(zBmlM[i] - zBmlM[i - 1]);
  const step = steps.length ? Math.max(...steps) : 10;
  const tol = Math.max(1.5 * step, 25 * G_PER_M);
  const points = pts.map((c) => {
    let best = 0;
    for (let i = 1; i < zBmlM.length; i++) if (Math.abs(zBmlM[i] - c.z) < Math.abs(zBmlM[best] - c.z)) best = i;
    const inRange = Math.abs(zBmlM[best] - c.z) <= tol;
    const ppMpa = inRange ? ppPa[best] / 1e6 : null;
    return { z: c.z, measuredMpa: c.pMpa, ppMpa, residualMpa: inRange ? c.pMpa - ppMpa : null, inRange };
  });
  const used = points.filter((p) => p.inRange && Number.isFinite(p.residualMpa));
  const rmsMpa = used.length ? Math.sqrt(used.reduce((a, p) => a + p.residualMpa ** 2, 0) / used.length) : null;
  const maxAbsMpa = used.length ? Math.max(...used.map((p) => Math.abs(p.residualMpa))) : null;
  return { points: points.map((p, k) => ({ ...p, kind: kindOf(pts[k]) })), rmsMpa, maxAbsMpa, deepestM: Math.max(...pts.map((c) => c.z)) };
}

/**
 * The sentences for the notes line, in order of weight.
 * @returns {{key: string, text: string, tone: 'warn'|'info'}[]}
 */
export function inputNotes({
  input, result, params, source = 'well', nctFitted = false, calibration = [], fmtZ = (m) => `${Math.round(m)} m`, fmtP = (mpa) => `${mpa.toFixed(2)} MPa`,
}) {
  const notes = [];
  if (!input || input.error || !result) return notes;
  const wd = Number(params?.waterDepthM) || 0;
  const ml = Number(params?.mudlineMdM) || 0;
  if (source === 'well' && wd > 0 && ml < wd) {
    notes.push({ key: 'datum', tone: 'warn', text: `Mudline MD ${fmtZ(ml)} is shallower than the water depth ${fmtZ(wd)}: the log MD is read as depth below mudline. Offshore, set the mudline MD to the air gap plus the water depth; onshore, set the water depth to 0.` });
  }
  if (input.tvdFrom === 'survey') {
    notes.push({ key: 'tvd', tone: 'info', text: 'Depths are TVD from the deviation survey; published curves sit on the well MD.' });
  }
  const d = input.dropped || {};
  const gaps = (d.dtGaps || 0); const up = (d.upturn || 0); const off = (d.offSurvey || 0);
  if (gaps || up || off) {
    const parts = [];
    if (gaps) parts.push(`${gaps} without sonic`);
    if (up) parts.push(`${up} where the hole turns back up`);
    if (off) parts.push(`${off} above the first survey station`);
    notes.push({ key: 'dropped', tone: 'info', text: `${parts.join(', ')} left out (published as gaps).` });
  }
  if (Array.isArray(result.rhoSource) && result.rhoSource.length) {
    const nLog = result.rhoSource.filter((s) => s === 'log').length;
    const pct = Math.round((100 * nLog) / result.rhoSource.length);
    if (source !== 'well') {
      notes.push({ key: 'density', tone: 'info', text: 'Overburden from Gardner densities on the velocity trend.' });
    } else if (nLog === 0) {
      notes.push({ key: 'density', tone: 'warn', text: 'No density log: the overburden uses Gardner from the sonic throughout.' });
    } else if (pct < 100) {
      notes.push({ key: 'density', tone: pct < 50 ? 'warn' : 'info', text: `Overburden: density log on ${pct}% of samples, Gardner from the sonic on the rest.` });
    }
  }
  if (!nctFitted) {
    notes.push({ key: 'nct', tone: 'warn', text: 'NCT not fitted on this source (project or default values): fit it on shale picks in the NCT view.' });
  }
  const mis = calibrationMisfit(calibration, input.zBmlM, result.porePressurePa);
  if (!mis.points.length) {
    notes.push({ key: 'calibration', tone: 'warn', text: 'Not calibrated: no measured pressures (RFT/MDT, kicks) entered.' });
  } else {
    const out = mis.points.filter((p) => !p.inRange).length;
    const zMax = input.zBmlM[input.zBmlM.length - 1];
    let text = Number.isFinite(mis.rmsMpa)
      ? `Calibration: ${mis.points.length - out} point${mis.points.length - out === 1 ? '' : 's'}, PP misfit RMS ${fmtP(mis.rmsMpa)}, largest ${fmtP(mis.maxAbsMpa)}.`
      : 'Calibration: no point falls within the prognosis.';
    if (out) text += ` ${out} outside the computed depths.`;
    if (mis.deepestM != null && zMax > mis.deepestM + 1) text += ` Below ${fmtZ(mis.deepestM)} the prognosis is extrapolated beyond the deepest point.`;
    notes.push({ key: 'calibration', tone: Number.isFinite(mis.rmsMpa) ? 'info' : 'warn', text });
  }
  // U2-002: leak-off and integrity tests against the fracture pressure
  const lot = calibrationMisfit(calibration, input.zBmlM, result.fracPressurePa, 'fg');
  if (lot.points.length) {
    const inR = lot.points.filter((p) => p.inRange);
    notes.push({
      key: 'lot',
      tone: 'info',
      text: Number.isFinite(lot.rmsMpa)
        ? `LOT/FIT: ${inR.length} test${inR.length === 1 ? '' : 's'} against the fracture pressure, RMS ${fmtP(lot.rmsMpa)} (a FIT is a lower bound on the fracture pressure).`
        : 'LOT/FIT: no test falls within the prognosis.',
    });
  }
  const mw = (calibration || []).filter((c) => comparesTo(c) === 'mw').length;
  if (mw) notes.push({ key: 'mw', tone: 'info', text: `Mud weights used: ${mw} drawn for comparison.` });
  return notes;
}

/**
 * Calibration lines "depth, pressure" in the display units. Comma,
 * semicolon, tab or spaces separate the two numbers; a header line or a
 * line with a comma decimal does not read and is returned in `skipped`.
 * @param {string} text
 * @param {(depth: number, pressure: number) => {z: number, pMpa: number}} convert
 */
export function parseCalibration(text, convert) {
  const points = []; const skipped = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,;\t ]+/).filter(Boolean).map(Number);
    if (parts.length !== 2 || !parts.every(Number.isFinite)) { skipped.push(line); continue; }
    const c = convert(parts[0], parts[1]);
    if (Number.isFinite(c.z) && Number.isFinite(c.pMpa)) points.push(c); else skipped.push(line);
  }
  return { points, skipped };
}
