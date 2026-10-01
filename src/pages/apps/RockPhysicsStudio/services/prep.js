// Curve preparation for Rock Physics Studio (G6.4): registry logs ->
// the SI model the engine consumes (vp/vs in m/s, rho kg/m3, phi/vsh/sw
// v/v). Unit conversions live HERE, at the UI edge (lasImport
// precedent); the engine only ever sees SI. Vs provenance follows
// the synthetics T(z) discipline: measured DTS wins, otherwise
// Greenberg-Castagna on the VSH sand/shale split, always flagged.
//
// AppUpgrade RP-U1 (2026-10-01):
// - 002: the alias table builds on the shared registry table
//   (components/wells/curveMap.js), so RHOZ, TDEP, DT24, DTCO and the
//   rest map here as they do in Petrophysics; shear and fraction curves
//   keep their own rows.
// - 003: sonic and density go through the shared input normaliser
//   (curveUnits.normalizeInputCurve: vendor nulls, unit table, range
//   checks), shear is read in the unit that gives a physical Vp/Vs, and
//   fraction curves in percent are found by range as well as by unit.
//   Every reading that changed a number is a sentence in `notes`.
// - 004: PHIE and PHIT are separate inputs; the model says which
//   porosity it carries (`phiBasis`), never PHIT under a PHIE label.

import { isGap } from '@/lib/waveform';
import { familyMember, isPercentUnit, isPerFootSlowness } from '@/components/wells/unitFamilies';
import { CURVE_ALIASES as SHARED_ALIASES } from '@/components/wells/curveMap';
import { normalizeInputCurve } from '@/components/wells/curveUnits';
import { isPrePt9aPhie } from '@/lib/petroProvenance';
import { shearForWell } from '../engine/vsEstimate';

// engine inputs <- registry mnemonics (base name, ':n' duplicate
// suffixes ignored; first match wins; the PetroWorkstation pattern)
export const CURVE_ALIASES = {
  DEPT: SHARED_ALIASES.DEPT,
  DT: SHARED_ALIASES.DT,
  DTS: ['DTS', 'DTSM', 'DTSH', 'DTS1', 'DTS2', 'DTSD', 'DT4S', 'DTSHEAR', 'DTSW', 'DT_S', 'DTSXX', 'DTSYY'],
  RHOB: SHARED_ALIASES.RHOB,
  PHIE: ['PHIE', 'PHI_E', 'PHIEFF', 'EPOR', 'PHIE_X'],
  PHIT: ['PHIT', 'PHI', 'POR', 'PHI_T', 'PHITOT', 'TPOR', 'PHIT_X'],
  VSH: ['VSH', 'VCL', 'VCLAY', 'VSHALE', 'VSH_GR', 'VCL_GR'],
  SW: ['SW', 'SWE', 'SWT', 'SW_AR', 'SWA'],
};

const base = (m) => String(m || '').toUpperCase().split(':')[0];

export function mapLogs(logs) {
  const byBase = new Map();
  for (const log of logs) {
    const b = base(log.mnemonic);
    if (!byBase.has(b)) byBase.set(b, log);
  }
  const mapped = {};
  for (const [key, aliases] of Object.entries(CURVE_ALIASES)) {
    const hit = aliases.find((a) => byBase.has(a));
    mapped[key] = hit ? byBase.get(hit) : null;
  }
  return mapped;
}

const FT = 0.3048;
const median = (arr) => {
  const xs = Array.from(arr).filter(Number.isFinite).sort((a, b) => a - b);
  return xs.length ? xs[Math.floor((xs.length - 1) / 2)] : NaN;
};

/** us/m slowness -> velocity m/s (gaps and non-positive values NaN). */
const slownessUsPerM = (values) => Array.from(values, (dt) => (isGap(dt) || !(dt > 0) ? NaN : 1e6 / dt));

/** Compressional slowness through the shared normaliser -> velocity, m/s. */
function sonicToVelocity(values, log, notes) {
  const r = normalizeInputCurve('DT', log || { mnemonic: 'DT' }, values);
  notes.push(...r.notes);
  return { vp: slownessUsPerM(r.data), decision: r.decision };
}

/**
 * Shear slowness -> velocity, m/s. A table unit is read as written; an
 * unknown or missing unit is read in whichever of us/m and us/ft gives a
 * median Vp/Vs between 1.35 and 4 (the physical range for rocks), and
 * the reading is said.
 */
function shearToVelocity(values, log, vp, notes) {
  const name = log?.mnemonic || 'DTS';
  const cleaned = Array.from(values, (v) => (isGap(v) || v <= -999 ? NaN : v));
  const unit = String(log?.unit || '').trim();
  const known = !!familyMember('DT', unit);
  if (known) {
    const perFoot = isPerFootSlowness(unit);
    return slownessUsPerM(perFoot ? cleaned.map((v) => v / FT) : cleaned);
  }
  const asM = slownessUsPerM(cleaned);
  const asFt = slownessUsPerM(cleaned.map((v) => v / FT));
  const ratio = (vs) => median(vp.map((p, i) => (Number.isFinite(p) && vs[i] > 0 ? p / vs[i] : NaN)));
  const ok = (r) => r >= 1.35 && r <= 4;
  const rM = ratio(asM);
  const rFt = ratio(asFt);
  if (/F/i.test(unit) || (!ok(rM) && ok(rFt))) {
    notes.push(`${name} ${unit ? `unit "${unit}" is not in the unit table` : 'has no unit'}: read as us/ft (median Vp/Vs ${rFt.toFixed(2)}; as us/m it would be ${Number.isFinite(rM) ? rM.toFixed(2) : 'n/a'}).`);
    return asFt;
  }
  if (!unit || !known) notes.push(`${name} ${unit ? `unit "${unit}" is not in the unit table` : 'has no unit'}: read as us/m (median Vp/Vs ${Number.isFinite(rM) ? rM.toFixed(2) : 'n/a'}).`);
  return asM;
}

/** Bulk density through the shared normaliser (g/cc) -> kg/m3. */
function densityToSi(values, log, notes) {
  const r = normalizeInputCurve('RHOB', log || { mnemonic: 'RHOB' }, values);
  notes.push(...r.notes);
  let out = Array.from(r.data, (v) => (isGap(v) || !(v > 0) ? NaN : v * 1000));
  // a kg/m3 label on numbers that are g/cc: 2.35 "kg/m3" is not a rock
  const med = median(out);
  if (med > 0 && med < 100) {
    out = out.map((v) => v * 1000);
    notes.push(`${log?.mnemonic || 'RHOB'} is labelled ${log?.unit || 'kg/m3'} but its values sit near ${(med / 1000).toFixed(2)}, which only g/cc can mean: read as g/cc.`);
  }
  return out;
}

/** Fraction curve (phi/vsh/sw): percent by unit, or by range (p95 above 1.5), to v/v. */
function toFraction(values, log, notes) {
  const name = log?.mnemonic || 'curve';
  const unit = log?.unit || '';
  let nulls = 0;
  const clean = Array.from(values, (v) => {
    if (isGap(v)) return NaN;
    if (v <= -999) { nulls += 1; return NaN; }
    return v;
  });
  if (nulls) notes.push(`${name}: ${nulls} sample${nulls === 1 ? '' : 's'} at -999 or below read as null (a vendor null value the file did not declare).`);
  const known = !!familyMember('NPHI', unit);
  let pct = isPercentUnit(unit) || (!known && /%|PERC|PU/i.test(unit));
  if (!pct) {
    const xs = clean.filter(Number.isFinite).sort((a, b) => a - b);
    const p95 = xs.length ? xs[Math.min(xs.length - 1, Math.floor(0.95 * (xs.length - 1)))] : NaN;
    if (p95 > 1.5) {
      pct = true;
      notes.push(`${name} values run to ${p95.toFixed(1)}, which only percent can mean${unit ? ` (the file labels them ${unit})` : ''}: divided by 100 to v/v.`);
    }
  }
  return clean.map((v) => (Number.isFinite(v) && pct ? v / 100 : v));
}

/**
 * Registry curves -> SI model. curves/mapped keyed by CURVE_ALIASES.
 * Returns {depth, vp, vs, vsSource, rho, phi, phiBasis, phiCurve, vsh,
 * sw, n, notes}: vsSource is 'measured' | 'estimated' (never silently
 * mixed); phiBasis is 'effective' | 'total' | null (no porosity curve).
 */
export function buildModel(curves, mapped) {
  if (!curves.DEPT) throw new Error('This well has no depth curve. Import LAS logs in Well Data Manager first.');
  if (!curves.DT) throw new Error('This well has no sonic (DT) curve, and rock physics needs Vp.');
  if (!curves.RHOB) throw new Error('This well has no density (RHOB) curve.');
  const notes = [];
  const depth = Array.from(curves.DEPT, (d) => (isGap(d) ? NaN : d));
  const { vp } = sonicToVelocity(curves.DT, mapped.DT, notes);
  const vsh = curves.VSH ? toFraction(curves.VSH, mapped.VSH, notes) : null;
  const { vs, source: vsSource } = shearForWell({
    vpCurve: vp,
    dtsVsCurve: curves.DTS ? shearToVelocity(curves.DTS, mapped.DTS, vp, notes) : null,
    vshCurve: vsh,
  });
  // RP-U1-004: effective porosity when there is one, total otherwise; a
  // Studio PHIE published before PT9a is total porosity (PETRO-U2-013)
  let phi = null;
  let phiBasis = null;
  let phiCurve = null;
  if (curves.PHIE) {
    phi = toFraction(curves.PHIE, mapped.PHIE, notes);
    phiCurve = mapped.PHIE?.mnemonic || 'PHIE';
    phiBasis = mapped.PHIE && isPrePt9aPhie(mapped.PHIE) ? 'total' : 'effective';
  } else if (curves.PHIT) {
    phi = toFraction(curves.PHIT, mapped.PHIT, notes);
    phiCurve = mapped.PHIT?.mnemonic || 'PHIT';
    phiBasis = 'total';
  }
  return {
    depth,
    vp,
    vs,
    vsSource,
    rho: densityToSi(curves.RHOB, mapped.RHOB, notes),
    phi,
    phiBasis,
    phiCurve,
    vsh,
    sw: curves.SW ? toFraction(curves.SW, mapped.SW, notes) : null,
    n: depth.length,
    notes,
  };
}

/** Sample indices inside [topMdM, baseMdM] (inclusive both ends). */
export function zoneIndices(depth, topMdM, baseMdM) {
  const idx = [];
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] >= topMdM && depth[i] <= baseMdM) idx.push(i);
  }
  return idx;
}

/** NaN-skipping mean over the given indices (NaN if none valid). */
export function meanAt(arr, indices) {
  let sum = 0;
  let n = 0;
  for (const i of indices) {
    const v = arr[i];
    if (Number.isFinite(v)) { sum += v; n += 1; }
  }
  return n ? sum / n : NaN;
}
