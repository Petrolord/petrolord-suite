// Curve preparation for Rock Physics Studio (G6.4): registry logs ->
// the SI model the engine consumes (vp/vs in m/s, rho kg/m3, phi/vsh
// v/v). Unit conversions live HERE, at the UI edge (lasImport
// precedent) — the engine only ever sees SI. Vs provenance follows
// the synthetics T(z) discipline: measured DTS wins, otherwise
// Greenberg-Castagna on the VSH sand/shale split, always flagged.

import { isGap } from '@/lib/waveform';
import { shearForWell } from '../engine/vsEstimate';

// engine inputs <- registry mnemonics (base name, ':n' duplicate
// suffixes ignored; first match wins — the PetroWorkstation pattern)
export const CURVE_ALIASES = {
  DEPT: ['DEPT', 'DEPTH', 'MD'],
  DT: ['DT', 'DTC', 'AC', 'DTCO'],
  DTS: ['DTS', 'DTSM', 'DTSH'],
  RHOB: ['RHOB', 'DEN', 'ZDEN'],
  PHIE: ['PHIE', 'PHIT', 'PHI', 'POR'],
  VSH: ['VSH', 'VCL', 'VCLAY'],
  SW: ['SW', 'SWT', 'SWE'],
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

/** Sonic slowness -> velocity, m/s. US/M by default; US/F converted. */
function slownessToVelocity(values, unit) {
  const perFoot = /F/i.test(unit || '');
  return Array.from(values, (dt) => {
    if (isGap(dt) || !(dt > 0)) return NaN;
    return perFoot ? (1e6 * FT) / dt : 1e6 / dt;
  });
}

/** Bulk density -> kg/m3. G/C3-style logs (values ~2.x) scaled. */
function densityToSi(values, unit) {
  const gcc = /G\s*\/?\s*C/i.test(unit || '');
  return Array.from(values, (v) => {
    if (isGap(v) || !(v > 0)) return NaN;
    return gcc || v < 10 ? v * 1000 : v;
  });
}

/** Fraction curve (phi/vsh/sw): percent logs scaled to v/v. */
function toFraction(values, unit) {
  const pct = /%|PERC|PU/i.test(unit || '');
  return Array.from(values, (v) => {
    if (isGap(v)) return NaN;
    return pct ? v / 100 : v;
  });
}

/**
 * Registry curves -> SI model. curves/mapped keyed by CURVE_ALIASES.
 * Returns {depth, vp, vs, vsSource, rho, phi, vsh, sw, n} — vsSource
 * is 'measured' | 'estimated' (never silently mixed).
 */
export function buildModel(curves, mapped) {
  if (!curves.DEPT) throw new Error('This well has no depth curve — import LAS logs in Well Data Manager first.');
  if (!curves.DT) throw new Error('This well has no sonic (DT) curve — rock physics needs Vp.');
  if (!curves.RHOB) throw new Error('This well has no density (RHOB) curve.');
  const depth = Array.from(curves.DEPT, (d) => (isGap(d) ? NaN : d));
  const vp = slownessToVelocity(curves.DT, mapped.DT?.unit);
  const vsh = curves.VSH ? toFraction(curves.VSH, mapped.VSH?.unit) : null;
  const { vs, source: vsSource } = shearForWell({
    vpCurve: vp,
    dtsVsCurve: curves.DTS ? slownessToVelocity(curves.DTS, mapped.DTS?.unit) : null,
    vshCurve: vsh,
  });
  return {
    depth,
    vp,
    vs,
    vsSource,
    rho: densityToSi(curves.RHOB, mapped.RHOB?.unit),
    phi: curves.PHIE ? toFraction(curves.PHIE, mapped.PHIE?.unit) : null,
    vsh,
    sw: curves.SW ? toFraction(curves.SW, mapped.SW?.unit) : null,
    n: depth.length,
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
