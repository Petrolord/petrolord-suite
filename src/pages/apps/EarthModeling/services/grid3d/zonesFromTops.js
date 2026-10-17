// Zones from well tops and the cap (Earth Modeling 3D grid upgrade,
// 2026-10-17; owner decision 3: Ekene Sand Upper, Middle and Lower from the
// well tops, and the shale above as a cap).
//
// Split a zone by tops: a zone between two stacked surfaces is cut at well
// tops picked inside it ("Ekene Sand Middle", "Ekene Sand Lower"). At each
// well the top's position is the fraction f of the zone at the well
// (true vertical depth from the zone top pick over the zone thickness
// there); f is interpolated over the frame by inverse distance and the
// internal horizon is top + f (base - top) at every node, so the sub-zones
// stay conformable to the stacked surfaces and thin and thicken with them
// (the "proportional isochore" way of making zones). Fractions are held in
// order (each internal horizon at or below the one above).
//
// The cap: a slab of typed thickness above the top surface (50 ft by
// default), parallel to it. The Ekene seal (the Ogbia Shale) is about 850 ft
// thick, so the cap is a slab of it over the reservoir, enough to show the
// seal draped over the structure and to carry the shale's own properties.
// Pure, no I/O.

import { minCurvature, positionAtMd } from '../../engine/wellties';
import { isNull } from '@/lib/gridding/gridmath';
import { NULL_VALUE } from '@/lib/gridding/numeric';
import { extendTrajectory } from '../logUpscale';

export const DEFAULT_CAP = Object.freeze({ on: false, thickness: '50', unit: 'ft', name: 'Cap' });

/** The cap thickness in metres, or null when the cap is off. Throws on a bad value. */
export function capThicknessM(cap) {
  if (!cap?.on) return null;
  const v = Number(cap.thickness);
  if (!(v > 0)) throw new Error('The cap needs a thickness greater than zero.');
  return cap.unit === 'm' ? v : v * 0.3048;
}

/** The cap horizon: the top surface raised by the cap thickness. */
export function capHorizon(top, capM) {
  return Float64Array.from(top, (v) => (isNull(v) ? NULL_VALUE : Math.max(0, v - capM)));
}

/** TVDSS of an MD pick on a well path (metres). */
const tvdssAt = (traj, md) => positionAtMd(traj, md);

/**
 * The fraction of the zone at each well for each split top.
 * @param {Array} wells engine wells (metres: x, y, kb_m, deviation, tops)
 * @param {string} topName @param {string} baseName the zone's tie tops
 * @param {string[]} splitTops the tops inside the zone, shallow to deep
 * @returns {{points: Array<Array<{well, x, y, f}>>, missing: string[]}}
 */
export function splitFractions(wells, topName, baseName, splitTops) {
  const points = splitTops.map(() => []);
  for (const w of wells || []) {
    const pick = (nm) => (w.tops || []).find((t) => t.name === nm)?.md_m;
    const tMd = pick(topName); const bMd = pick(baseName);
    if (!Number.isFinite(tMd) || !Number.isFinite(bMd) || !(bMd > tMd)) continue;
    const traj = extendTrajectory(minCurvature(w.deviation || [], w.kb_m, w.x, w.y), bMd + 50);
    const T = tvdssAt(traj, tMd); const B = tvdssAt(traj, bMd);
    const h = B.tvdss - T.tvdss;
    if (!(h > 0)) continue;
    splitTops.forEach((s, q) => {
      const md = pick(s);
      if (!Number.isFinite(md)) return;
      const P = tvdssAt(traj, md);
      points[q].push({ well: w.name, x: P.x, y: P.y, f: Math.min(1, Math.max(0, (P.tvdss - T.tvdss) / h)) });
    });
  }
  const missing = splitTops.filter((_, q) => !points[q].length);
  return { points, missing };
}

/** Inverse-distance interpolation of the fractions on the frame (power 2; exact at a well). */
function idwFraction(spec, pts, power = 2) {
  const N = spec.nx * spec.ny;
  const out = new Float64Array(N);
  for (let r = 0; r < spec.ny; r++) {
    for (let c = 0; c < spec.nx; c++) {
      const x = spec.x0 + c * spec.dx; const y = spec.y0 + r * spec.dy;
      let sw = 0; let sv = 0; let exact = null;
      for (const p of pts) {
        const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d2 < 1e-6) { exact = p.f; break; }
        const w = 1 / d2 ** (power / 2);
        sw += w; sv += w * p.f;
      }
      out[r * spec.nx + c] = exact ?? sv / sw;
    }
  }
  return out;
}

/**
 * The internal horizons of a zone split at well tops.
 * @returns {{horizons: Float64Array[], fractions: Float64Array[], points, notes: string[]}}
 */
export function splitHorizons({ spec, top, base, wells, topName, baseName, splitTops }) {
  if (!topName || !baseName) throw new Error('Splitting a zone by well tops needs the tie tops of its top and base surfaces. Pick them in the stack.');
  const { points, missing } = splitFractions(wells, topName, baseName, splitTops);
  if (missing.length) throw new Error(`No well has ${missing.join(' and ')} between ${topName} and ${baseName}, so the zone cannot be split there.`);
  const fractions = points.map((pts) => idwFraction(spec, pts));
  // in order: each fraction at or below the one above
  for (let q = 1; q < fractions.length; q++) for (let j = 0; j < fractions[q].length; j++) fractions[q][j] = Math.max(fractions[q][j], fractions[q - 1][j]);
  const horizons = fractions.map((f) => Float64Array.from(top, (t, j) => (isNull(t) || isNull(base[j]) ? NULL_VALUE : t + f[j] * Math.max(0, base[j] - t))));
  const notes = splitTops.map((s, q) => `${s}: ${points[q].length} well${points[q].length === 1 ? '' : 's'} (fraction of the zone ${points[q].map((p) => p.f.toFixed(2)).join(', ')})`);
  return { horizons, fractions, points, notes };
}

/** Sub-zone names for a split zone: Upper, Middle, Lower for three, else the top names. */
export function subzoneNames(zoneName, splitTops) {
  if (splitTops.length === 2) return ['Upper', 'Middle', 'Lower'].map((w) => `${zoneName} ${w}`);
  if (splitTops.length === 1) return [`${zoneName} Upper`, `${zoneName} Lower`];
  return [zoneName, ...splitTops];
}

/**
 * The framework with its cap and split zones (the definition's stack is
 * unchanged; the build works on the expanded one).
 * @param {object} p
 * @param {Array<Float64Array>} p.clamped stacked surfaces (depth down, metres)
 * @param {string[]} p.topNames tie tops per stacked surface
 * @param {Array} p.zones the definition's zones
 * @param {object} p.cap the definition's cap
 * @returns {{clamped, topNames, horizonNames, zones: Array<{def, parent, kind, name, topName, baseName}>, inserted: boolean[], notes: string[]}}
 */
export function expandFramework({ spec, clamped, topNames = [], surfaceNames = [], zones = [], cap = null, wells = [] }) {
  const notes = [];
  const outGrids = []; const outTops = []; const outNames = []; const inserted = []; const outZones = [];
  const capM = capThicknessM(cap);
  if (capM !== null && clamped.length >= 2) {
    outGrids.push(capHorizon(clamped[0], capM)); outTops.push(''); outNames.push(`${cap.name || 'Cap'} top`); inserted.push(true);
    const zname = cap.name || 'Cap';
    outZones.push({ def: { name: zname, registryZone: '' }, parent: -1, kind: 'cap', name: zname, topName: '', baseName: topNames[0] || '', capM });
  }
  for (let i = 0; i < clamped.length; i++) {
    outGrids.push(clamped[i]); outTops.push(topNames[i] || ''); outNames.push(surfaceNames[i] || `Surface ${i + 1}`); inserted.push(false);
    if (i + 1 >= clamped.length) break;
    const zd = zones[i] || { name: `Zone ${i + 1}`, registryZone: '' };
    const split = (zd.splitTops || []).filter(Boolean);
    if (!split.length) {
      outZones.push({ def: zd, parent: i, kind: 'zone', name: zd.name, topName: topNames[i] || '', baseName: topNames[i + 1] || '' });
      continue;
    }
    const r = splitHorizons({ spec, top: clamped[i], base: clamped[i + 1], wells, topName: topNames[i], baseName: topNames[i + 1], splitTops: split });
    notes.push(`${zd.name} split at the well tops: ${r.notes.join('; ')}.`);
    const names = subzoneNames(zd.name, split);
    const bounds = [topNames[i] || '', ...split, topNames[i + 1] || ''];
    names.forEach((nm, q) => {
      if (q > 0) { outGrids.push(r.horizons[q - 1]); outTops.push(split[q - 1]); outNames.push(split[q - 1]); inserted.push(true); }
      outZones.push({ def: { ...zd, name: nm }, parent: i, kind: 'subzone', name: nm, topName: bounds[q], baseName: bounds[q + 1] });
    });
  }
  return { clamped: outGrids, topNames: outTops, horizonNames: outNames, zones: outZones, inserted, notes };
}
