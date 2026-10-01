// True-north dip azimuth (upgrade U2-017). Dip azimuth (grid north) is
// measured clockwise from the projected grid's north; true north differs
// by the meridian convergence. The engine maps the time gradient through
// the survey affine, so handing it an affine whose inline and crossline
// vectors are rotated by the convergence gives azimuths from true north:
// a vector with grid bearing b has true bearing b - g, where g is the
// grid bearing of true north (src/lib/crs convergenceAt).
//
// The convergence is taken at the survey centre and applied to the whole
// volume; its spread across the survey is computed at the corners and
// reported, so the user can see whether one value is good enough.

import { ilxlToWorld } from '../engine/surveyGeometry';

/** Rotate an engine affine so bearings read shifted by thetaDeg (true = grid + theta). */
export function rotateAffineBearing(affine, thetaDeg) {
  if (!thetaDeg) return affine;
  const t = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  // bearing + theta: (x, y) -> (x cos + y sin, -x sin + y cos)
  const rot = (v) => ({ x: v.x * c + v.y * s, y: -v.x * s + v.y * c });
  return {
    ...affine, ilVec: rot(affine.ilVec), xlVec: rot(affine.xlVec),
  };
}

/**
 * The convergence over a survey.
 * @param {Object} affine engine affine
 * @param {{nIl: number, nXl: number}} geom
 * @param {(x, y) => number} convergenceDegAt grid bearing of true north at (x, y)
 * @returns {{centreDeg: number, spreadDeg: number}}
 */
export function surveyConvergence(affine, geom, convergenceDegAt) {
  const pts = [[0, 0], [0, geom.nXl - 1], [geom.nIl - 1, 0], [geom.nIl - 1, geom.nXl - 1]]
    .map(([i, j]) => ilxlToWorld(affine, i, j));
  const centre = ilxlToWorld(affine, (geom.nIl - 1) / 2, (geom.nXl - 1) / 2);
  const g = pts.map((p) => convergenceDegAt(p.x, p.y));
  if (![...g].every(Number.isFinite)) throw new Error('The meridian convergence could not be computed for this survey CRS.');
  return { centreDeg: convergenceDegAt(centre.x, centre.y), spreadDeg: Math.max(...g) - Math.min(...g) };
}

/** The affine the azimuth job uses for a north reference. */
export function affineForNorth(affine, north) {
  if (!north || north.reference !== 'true') return affine;
  return rotateAffineBearing(affine, -Number(north.convergenceDeg || 0));
}
