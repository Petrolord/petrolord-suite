// Curve preparation for Pore Pressure Studio (P3): registry logs ->
// the SI arrays the engine consumes (depth m below mudline, transit
// time us/m, bulk density kg/m3 nullable per sample). Unit
// conversions live HERE, at the UI edge (lasImport precedent) — the
// engine only ever sees SI.

import { normalizeInputCurve } from '../../../../components/wells/curveUnits';
import { makeDepthFrame } from '../../../../../packages/engines/engines/welldata/checkshots';

/**
 * The well's depth frame (deviation survey + KB) for MD -> TVD, or null
 * when the well has no survey (vertical: MD = TVD). PP-U1-002.
 */
export function wellDepthFrame(well) {
  const dev = Array.isArray(well?.deviation) ? well.deviation : [];
  if (dev.length < 2) return null;
  try {
    const frame = makeDepthFrame({ deviation: dev, kbM: well.kb_m ?? 0, tdMdM: well.td_md_m ?? null });
    return frame.isVertical ? null : frame;
  } catch { return null; }
}

// engine inputs <- registry mnemonics (base name, ':n' duplicate
// suffixes ignored; first match wins — the PetroWorkstation pattern)
export const CURVE_ALIASES = {
  DEPT: ['DEPT', 'DEPTH', 'MD'],
  DT: ['DT', 'DTC', 'AC', 'DTCO'],
  RHOB: ['RHOB', 'DEN', 'ZDEN'],
  // U2-001: deep resistivity for resistivity Eaton (the WDM import kind guesses)
  RES: ['RT', 'RDEEP', 'RD', 'ILD', 'RILD', 'LLD', 'RLLD', 'AT90', 'AF90', 'RLA5', 'HDRS', 'RDEP', 'RESD', 'RES', 'M2R9'],
};

export function mapLogs(logs) {
  const byBase = new Map();
  for (const log of logs) {
    const base = log.mnemonic.toUpperCase().split(':')[0];
    if (!byBase.has(base)) byBase.set(base, log);
  }
  const mapped = {};
  for (const [key, aliases] of Object.entries(CURVE_ALIASES)) {
    const hit = aliases.find((a) => byBase.has(a));
    mapped[key] = hit ? byBase.get(hit) : null;
  }
  return mapped;
}

const FT = 0.3048;

/** Sonic slowness -> us/m (US/F converted; US/M passed through). */
export function slownessToUsPerM(value, unit) {
  const u = (unit || '').toUpperCase();
  if (u.includes('US/F') || u === 'USEC/FT' || u === 'US/FT') return value / FT;
  return value;
}

/** Bulk density -> kg/m3 (G/C3 and G/CC converted; KG/M3 passed through). */
export function densityToKgM3(value, unit) {
  const u = (unit || '').toUpperCase();
  if (u.includes('KG')) return value;
  return value * 1000.0; // G/C3, G/CC, GM/CC — the LAS-world default
}

// ---- input curves (PP-U1-004, hostile file set) -------------------------------
// The registry keeps curves as imported. A vendor null the file did not
// declare (-999.25 written as -999), a density in kg/m3 with no unit or an
// unknown spelling, or a sonic in us/ft under an unknown spelling reached
// the engine as data: one -999 sample threw the whole well, and RHOB 2400
// read as g/cc became 2,400,000 kg/m3 (overburden 1000x). The Petrophysics
// normaliser (curveUnits.js, the unit family table shared with Rock
// Physics) decides and says what it did; pore pressure adds one rule of its
// own: a sonic with no known unit whose median is below 160 can only be
// us/ft (no rock is that fast in us/m).

/** Below this median a unit-less sonic is read as us/ft. */
export const DT_US_PER_FT_MEDIAN_MAX = 160;

function median(values) {
  const xs = [];
  for (const v of values || []) if (Number.isFinite(v)) xs.push(v);
  if (!xs.length) return NaN;
  xs.sort((a, b) => a - b);
  return xs[Math.floor((xs.length - 1) / 2)];
}

/**
 * Raw registry samples -> SI-ready curves, with a sentence per decision.
 * @param {{depth: ArrayLike<number>, dt: ArrayLike<number>, rho?: ?ArrayLike<number>,
 *   dtLog?: {mnemonic?: string, unit?: string}, rhoLog?: ?{mnemonic?: string, unit?: string}}} raw
 * @returns {{depth: number[], dt: number[], rho: ?number[], units: {DT: string, RHOB: ?string}, notes: string[]}}
 *   dt in us/m, rho in g/cc (or null), nulls as NaN
 */
export function normalizePpCurves({ depth, dt, rho = null, dtLog = null, rhoLog = null }) {
  const notes = [];
  const d = normalizeInputCurve('DT', dtLog || { mnemonic: 'DT' }, Float64Array.from(dt, (v) => (v == null ? NaN : v)));
  notes.push(...d.notes);
  let dtOut = Array.from(d.data);
  if (d.decision?.reason === 'unknown') {
    const med = median(dtOut);
    if (med < DT_US_PER_FT_MEDIAN_MAX) {
      dtOut = dtOut.map((v) => (Number.isFinite(v) ? v / FT : v));
      notes.push(`${dtLog?.mnemonic || 'DT'} has no known unit${dtLog?.unit ? ` (${dtLog.unit})` : ''} and its values sit near ${Math.round(med)}, which only us/ft can mean: converted to us/m.`);
    } else {
      notes.push(`${dtLog?.mnemonic || 'DT'} has no known unit${dtLog?.unit ? ` (${dtLog.unit})` : ''}; its values sit near ${Math.round(med)} and are read as us/m.`);
    }
  }
  let rhoOut = null;
  if (rho) {
    const r = normalizeInputCurve('RHOB', rhoLog || { mnemonic: 'RHOB' }, Float64Array.from(rho, (v) => (v == null ? NaN : v)));
    notes.push(...r.notes);
    rhoOut = Array.from(r.data);
  }
  return {
    depth: Array.from(depth),
    dt: dtOut,
    rho: rhoOut,
    units: { DT: 'US/M', RHOB: rho ? 'G/C3' : null },
    notes,
  };
}

// ---- resistivity (U2-001) ------------------------------------------------------
const RES_NULLS = [-999, -999.25, -9999, -99999, -999.2500];
const OHMM = /^(OHMM|OHM\.?M|OHM-M|OHM\*M|OHM_M|OHM M|Ω\.?M|Ω·M|OHMS?\/?M?)$/i;
const MMHO = /^(MMHO\/M|MS\/M|MMHOS\/M)$/i;

/**
 * Deep resistivity -> ohm.m with each decision said. Vendor nulls and
 * values at or below zero are gaps; a conductivity in mS/m (mmho/m)
 * becomes 1000 / C; an unknown unit is read as ohm.m and said.
 * @returns {{res: number[], notes: string[]}}
 */
export function normalizeResistivity(values, log = {}) {
  const notes = [];
  const unit = String(log.unit || '').trim().replace(/\s+/g, ' ');
  const name = log.mnemonic || 'RT';
  let nulls = 0;
  const conductivity = MMHO.test(unit);
  const res = Array.from(values || [], (v) => {
    if (v == null || !Number.isFinite(v) || RES_NULLS.some((n) => Math.abs(v - n) < 1e-6) || !(v > 0)) { nulls += 1; return NaN; }
    return conductivity ? 1000 / v : v;
  });
  if (conductivity) notes.push(`${name} is a conductivity in ${unit}: read as resistivity 1000 / C in ohm.m.`);
  else if (unit && !OHMM.test(unit.replace(/\s/g, ''))) notes.push(`${name} has the unit ${unit}, which is not ohm.m; its values are read as ohm.m.`);
  else if (!unit) notes.push(`${name} has no unit; its values are read as ohm.m.`);
  if (nulls) notes.push(`${nulls} ${name} sample${nulls === 1 ? '' : 's'} with nulls or values at or below zero left out.`);
  return { res, notes };
}

/**
 * Registry curves -> computeProfile input. Depth is the registry MD below
 * the rotary table (RKB). PP-U1-002: with a depth frame (the well's
 * deviation survey and KB through the canonical welldata frame), each MD
 * becomes TVD and the depth below mudline is TVD minus the mudline's TVD,
 * so a deviated well is computed at its true vertical depth; with no
 * frame the well is vertical (MD = TVD). Samples above the mudline are
 * dropped; DT gaps (null/NaN) are dropped WITH their depth (the engine is
 * strict); RHOB gaps stay null per sample (the engine's Gardner fallback
 * records provenance); samples where the hole turns back up (TVD no
 * longer increasing) are dropped and counted. `mdM` keeps each kept
 * sample's MD so publishing puts every value back at its own depth
 * (PP-U1-001).
 */
export function buildProfileInput({ depth, dt, rho, res = null, shale = null }, units, { mudlineMdM = 0, frame = null, needs = 'dt' } = {}) {
  // U2-001: resistivity Eaton keeps the samples with a resistivity; the sonic
  // is then optional per sample where a density gives the overburden
  const byRes = needs === 'res';
  if (byRes && (!depth || !res || depth.length !== res.length)) {
    throw new Error('This well has no resistivity curve on its depth (RT, ILD, LLD, AT90 ...): resistivity Eaton needs one.');
  }
  if (!depth || !dt || depth.length !== dt.length) {
    throw new Error('Depth and sonic curves must be present and equal length.');
  }
  if (rho && rho.length !== depth.length) {
    throw new Error('Density curve length must match depth.');
  }
  const tvdAt = (md) => (frame ? frame.mdToPosition(md).tvd : md);
  let mudlineTvd = mudlineMdM;
  if (frame) {
    try { mudlineTvd = tvdAt(mudlineMdM); } catch { mudlineTvd = mudlineMdM; }
  }
  const zBmlM = [];
  const mdM = [];
  const dtUsPerM = [];
  const rhoKgM3 = [];
  const resOhmM = [];
  const shaleOut = []; // U2-005: the shale indicator on the kept samples
  const dropped = { aboveMudline: 0, dtGaps: 0, upturn: 0, offSurvey: 0, resGaps: 0, noDensity: 0 };
  let deepest = -Infinity;
  for (let i = 0; i < depth.length; i++) {
    const md = depth[i];
    if (!Number.isFinite(md)) { dropped.dtGaps += 1; continue; }
    let tvd;
    try { tvd = tvdAt(md); } catch { dropped.offSurvey += 1; continue; }
    const z = tvd - mudlineTvd;
    const dtv = dt[i];
    if (!(z >= 0)) { dropped.aboveMudline += 1; continue; }
    const dtOk = dtv != null && Number.isFinite(dtv);
    const rv = rho ? rho[i] : null;
    const rhoOk = rv != null && Number.isFinite(rv);
    if (byRes) {
      if (!(res[i] > 0)) { dropped.resGaps += 1; continue; }
      if (!dtOk && !rhoOk) { dropped.noDensity += 1; continue; }
    } else if (!dtOk) { dropped.dtGaps += 1; continue; }
    if (z < deepest) { dropped.upturn += 1; continue; }
    deepest = z;
    zBmlM.push(z);
    mdM.push(md);
    dtUsPerM.push(dtOk ? slownessToUsPerM(dtv, units?.DT) : null);
    rhoKgM3.push(rhoOk ? densityToKgM3(rv, units?.RHOB) : null);
    if (byRes) resOhmM.push(res[i]);
    if (shale) shaleOut.push(Number.isFinite(shale[i]) ? shale[i] : NaN);
  }
  if (zBmlM.length === 0) {
    throw new Error('No usable samples below the mudline.');
  }
  return {
    zBmlM, dtUsPerM, rhoKgM3, ...(byRes ? { resOhmM } : {}), ...(shale && shale.length === depth.length ? { shale: shaleOut } : {}), mdM, dropped, tvdFrom: frame && !frame.isVertical ? 'survey' : 'vertical',
  };
}
