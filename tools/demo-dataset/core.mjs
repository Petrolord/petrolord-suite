// Routine core analysis (RCA) for the cored intervals (kit v2.1, 2026-10-08).
//
// The kit always named the cored intervals (06-stratigraphy) and carried three
// SCAL plugs, but no plug-by-plug porosity and permeability, so a lesson on
// calibrating logs to core had nothing to calibrate against. This module cuts
// plugs from the TRUTH rows the way a core lab would: one plug per foot, in
// sand only (no plugs in shale beds), helium porosity with lab precision, and
// air permeability from the field's permeability model with plug-to-plug
// scatter.
//
// Permeability model (DESIGN, anchored on the LOCKED reservoir k of 250 mD at
// phi 0.20 and the three SCAL plugs: EK1-P 420 mD at 0.23, EK5-P 95 mD at
// 0.16):  log10 k = 2.398 + 9.2 (phi_e - 0.20) + e, e ~ N(0, 0.12) log cycles
// (about +-30 percent, typical plug scatter). Clay acts through phi_e (which
// already leaves out the clay-bound water), so the classic one-variable
// semi-log core transform is the right calibration for this rock.

const FT_PER_M = 3.28084;
// the cored intervals (m MD) named in 06-stratigraphy since kit v1
export const CORED = Object.freeze([
  { well: 'Ekene-1', topM: 1548.0, baseM: 1566.0, seed: 101 },
  { well: 'Ekene-3', topM: 1541.0, baseM: 1559.5, seed: 103 },
  { well: 'Ekene-5', topM: 1552.0, baseM: 1570.0, seed: 105 },
]);
export const K_MODEL = Object.freeze({ log10kAt20: Math.log10(250), b: 9.2, scatter: 0.12, porNoise: 0.006 });

function hash32(x) {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function gauss(seed, i) {
  const u1 = Math.max(1e-12, hash32(seed * 7919 + i * 2 + 1));
  const u2 = hash32(seed * 7919 + i * 2 + 2);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Truth permeability (mD) of a sample, without scatter. */
export const kTruth = (phie) => 10 ** (K_MODEL.log10kAt20 + K_MODEL.b * (phie - 0.2));

/**
 * Plugs over [topM, baseM] (m MD), one per foot, sand only (Vsh < 0.5).
 * @param {Array<object>} rows truth rows (md, phie, vsh)
 * @returns {Array<{md: number, ft: number, cpor: number, ckh: number, phieTrue: number, kTrue: number}>}
 */
export function cutPlugs(rows, { topM, baseM, seed }) {
  const out = [];
  let lastFt = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.md < topM || r.md > baseM) continue;
    const ft = r.md * FT_PER_M;
    if (ft - lastFt < 0.999) continue;          // one plug per foot
    lastFt = ft;
    if (r.vsh >= 0.5) continue;                 // no plugs in shale beds
    const kT = kTruth(r.phie);
    out.push({
      md: r.md, ft, i,
      cpor: Math.max(0.01, r.phie + K_MODEL.porNoise * gauss(seed, 2 * i)),
      ckh: kT * 10 ** (K_MODEL.scatter * gauss(seed, 2 * i + 1)),
      phieTrue: r.phie, kTrue: kT,
    });
  }
  return out;
}

/** LAS rows on the well's own depth grid: CPOR (percent) and CKH (mD) at the
 *  plug samples, null elsewhere, so an import into the existing well keeps
 *  each plug at its depth (Well Data Manager resamples onto the well grid and
 *  leaves nulls empty). */
export function coreLasRows(rows, plugs) {
  const at = new Map(plugs.map((p) => [p.i, p]));
  const i0 = Math.max(0, Math.min(...plugs.map((p) => p.i)) - 2);
  const i1 = Math.min(rows.length - 1, Math.max(...plugs.map((p) => p.i)) + 2);
  const out = [];
  for (let i = i0; i <= i1; i++) {
    const p = at.get(i);
    out.push({ md: rows[i].md, CPOR: p ? p.cpor * 100 : NaN, CKH: p ? p.ckh : NaN });
  }
  return out;
}
