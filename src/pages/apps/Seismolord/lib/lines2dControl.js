// 2D lines with the 3D volume (upgrade U2-005). Pure.
//
//  - linePicksToControl: a 2D line's picks as gridding control points in
//    world XY with the time in the 3D volume's samples. Picks are stored
//    in raw line time; the line's applied mistie static (the integer
//    sample roll the 2D Lines window displays) is added first, so the
//    control is the mistie-corrected pick, the same time the mistie
//    solve used. Lines with a different sample interval convert through
//    milliseconds.
//  - lineMarkersOnSection: where each visible 2D line crosses the
//    displayed inline or crossline, as a fractional trace on the section
//    (the line's lattice positions from engines lineToLattice), for the
//    vertical line markers on 3D sections.

import { worldToIlxl } from '../engine/surveyGeometry';

const NULL_F32 = Math.fround(1.0e30);
const live = (v) => v !== NULL_F32 && Number.isFinite(v);

/**
 * @param {{picks: Float32Array, nav: {x: ArrayLike<number>, y: ArrayLike<number>},
 *   dtMs2d: number, dtMs3d: number, shiftMs?: number, step?: number}} p
 *   step: keep every step-th live pick (gridding decimates anyway)
 * @returns {{points: {x: number, y: number, sample: number}[], live: number}}
 */
export function linePicksToControl({
  picks, nav, dtMs2d, dtMs3d, shiftMs = 0, step = 1,
}) {
  if (!(dtMs2d > 0) || !(dtMs3d > 0)) throw new Error('Both sample intervals must be positive.');
  const roll = Math.round((shiftMs || 0) / dtMs2d);
  const n = Math.min(picks.length, nav.x.length, nav.y.length);
  const points = [];
  let count = 0;
  for (let t = 0; t < n; t++) {
    const p = picks[t];
    if (!live(p) || !Number.isFinite(nav.x[t]) || !Number.isFinite(nav.y[t])) continue;
    if (count % Math.max(1, step) === 0) {
      points.push({ x: nav.x[t], y: nav.y[t], sample: ((p + roll) * dtMs2d) / dtMs3d });
    }
    count += 1;
  }
  return { points, live: count };
}

/**
 * Control points as gridding input, with the depth or time Z and, when
 * the survey lattice is known, the lattice cell (for layer-cake depth
 * and fault blocks). Points whose Z cannot be computed (a column-
 * dependent model off the survey) are counted as skipped.
 * @param {{x, y, sample}[]} control
 * @param {Object} affine survey affine
 * @param {{nIl, nXl}} geom
 * @param {(sample: number, cell: ?number) => ?number} sampleToZ
 * @param {{columnDependent?: boolean}} [opts]
 */
export function controlToGridPoints(control, affine, geom, sampleToZ, { columnDependent = false } = {}) {
  const out = [];
  let skipped = 0;
  for (const c of control || []) {
    const ij = worldToIlxl(affine, c.x, c.y);
    const inside = ij && ij.i >= -0.5 && ij.j >= -0.5 && ij.i <= geom.nIl - 0.5 && ij.j <= geom.nXl - 0.5;
    const ci = ij ? Math.max(0, Math.min(geom.nIl - 1, Math.round(ij.i))) : 0;
    const cj = ij ? Math.max(0, Math.min(geom.nXl - 1, Math.round(ij.j))) : 0;
    const cell = ci * geom.nXl + cj;
    if (columnDependent && !inside) { skipped += 1; continue; }
    const z = sampleToZ(c.sample, cell);
    if (!Number.isFinite(z)) { skipped += 1; continue; }
    out.push({ x: c.x, y: c.y, z, cell, inside: Boolean(inside) });
  }
  return { points: out, skipped };
}

/** A surveyBounds object {x0, x1, y0, y1} grown to hold a point set. */
export function mergeBounds(b, points) {
  const out = { ...b };
  for (const p of points || []) {
    out.x0 = Math.min(out.x0, p.x); out.x1 = Math.max(out.x1, p.x);
    out.y0 = Math.min(out.y0, p.y); out.y1 = Math.max(out.y1, p.y);
  }
  return out;
}

/**
 * Where visible 2D lines cross the displayed section.
 * @param {{id, name, color?, positions: ({il, xl}|null)[]}[]} lines lattice positions per trace
 * @param {'inline'|'xline'} orientation
 * @param {number} index the section's lattice index
 * @returns {{id, name, color, trace: number, lineTrace: number}[]} trace: fractional
 *   position along the section; lineTrace: the 2D line's trace there
 */
export function lineMarkersOnSection(lines, orientation, index) {
  const out = [];
  if (orientation !== 'inline' && orientation !== 'xline') return out;
  const across = orientation === 'inline' ? 'il' : 'xl';
  const along = orientation === 'inline' ? 'xl' : 'il';
  for (const l of lines || []) {
    const pos = l.positions || [];
    for (let k = 0; k + 1 < pos.length; k++) {
      const a = pos[k];
      const b = pos[k + 1];
      if (!a || !b) continue;
      const da = a[across] - index;
      const db = b[across] - index;
      if (da === 0 && db === 0) continue; // running along the section: no single crossing
      if ((da <= 0 && db > 0) || (da >= 0 && db < 0)) {
        const f = da / (da - db);
        out.push({
          id: l.id, name: l.name, color: l.color || '#e879f9', trace: a[along] + f * (b[along] - a[along]), lineTrace: k + f,
        });
      }
    }
  }
  return out;
}
