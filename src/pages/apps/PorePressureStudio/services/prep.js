// Curve preparation for Pore Pressure Studio (P3): registry logs ->
// the SI arrays the engine consumes (depth m below mudline, transit
// time us/m, bulk density kg/m3 nullable per sample). Unit
// conversions live HERE, at the UI edge (lasImport precedent) — the
// engine only ever sees SI.

// engine inputs <- registry mnemonics (base name, ':n' duplicate
// suffixes ignored; first match wins — the PetroWorkstation pattern)
export const CURVE_ALIASES = {
  DEPT: ['DEPT', 'DEPTH', 'MD'],
  DT: ['DT', 'DTC', 'AC', 'DTCO'],
  RHOB: ['RHOB', 'DEN', 'ZDEN'],
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

/**
 * Registry curves -> computeProfile input. Depth is converted to
 * metres below mudline by subtracting mudlineMdM (v1 vertical-well
 * convention: MD below the datum, mudline at a user-set MD). Samples
 * above the mudline are dropped; DT gaps (null/NaN) are dropped WITH
 * their depth (the engine is strict); RHOB gaps stay null per sample
 * (the engine's Gardner fallback records provenance).
 */
export function buildProfileInput({ depth, dt, rho }, units, { mudlineMdM = 0 } = {}) {
  if (!depth || !dt || depth.length !== dt.length) {
    throw new Error('Depth and sonic curves must be present and equal length.');
  }
  if (rho && rho.length !== depth.length) {
    throw new Error('Density curve length must match depth.');
  }
  const zBmlM = [];
  const dtUsPerM = [];
  const rhoKgM3 = [];
  for (let i = 0; i < depth.length; i++) {
    const z = depth[i] - mudlineMdM;
    const dtv = dt[i];
    if (!(z >= 0) || dtv == null || !Number.isFinite(dtv)) continue;
    zBmlM.push(z);
    dtUsPerM.push(slownessToUsPerM(dtv, units?.DT));
    const rv = rho ? rho[i] : null;
    rhoKgM3.push(rv == null || !Number.isFinite(rv) ? null : densityToKgM3(rv, units?.RHOB));
  }
  if (zBmlM.length === 0) {
    throw new Error('No usable samples below the mudline.');
  }
  return { zBmlM, dtUsPerM, rhoKgM3 };
}
