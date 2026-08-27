// Deviated-well import (S4): survey stations (MD/INC/AZI) -> grid
// connections for COMPDAT, through the validated drilling minimum-
// curvature kernel (computeWellPath — the single source of truth, never
// reimplemented) and the sim wellPath intersector. Unit seams live HERE:
// surveys arrive in ft or metres, the deck frame is feet.
//
// Frame: the wellhead is placed at (wellheadX, wellheadY) ft in the
// grid-local frame (x east from the i=1/j=1 corner, y north), azimuths
// are grid azimuths, and deck depth = TVD + kbToDatumFt (zero when the
// survey's KB reference is already the deck depth datum).
import { computeWellPath, resample } from '@/pages/apps/well-planning/engine/surveyMath';
import { connectionsFromPath, cellCenterXY, columnInterfaces } from '@/utils/simDeckGeneration';

const FT_PER_M = 3.280839895013123;

/** "MD INC AZI" lines (whitespace/comma separated, # or -- comments) ->
 *  { stations, errors }. */
export function parseSurveyText(text) {
  const stations = [];
  const errors = [];
  String(text || '').split(/\r?\n/).forEach((raw, lineNo) => {
    const line = raw.replace(/(#|--).*$/, '').trim();
    if (!line) return;
    const parts = line.split(/[\s,;]+/).map(Number);
    if (parts.length < 3 || parts.some((v) => !Number.isFinite(v))) {
      errors.push(`Line ${lineNo + 1}: expected "MD INC AZI" numbers, got '${raw.trim()}'.`);
      return;
    }
    const [md, inc, azi] = parts;
    if (inc < 0 || inc > 120) errors.push(`Line ${lineNo + 1}: inclination ${inc}° is out of range.`);
    else stations.push({ md, inc, azi: ((azi % 360) + 360) % 360 });
  });
  if (stations.length >= 2) {
    for (let i = 1; i < stations.length; i += 1) {
      if (stations[i].md <= stations[i - 1].md) {
        errors.push(`Station MDs must increase (${stations[i - 1].md} -> ${stations[i].md}).`);
        break;
      }
    }
  }
  return { stations, errors };
}

/**
 * Survey -> ordered COMPDAT connections.
 * opts: { stations: [{md, inc, azi}], mdUnit: 'ft'|'m',
 *         wellheadX, wellheadY (ft, grid frame), kbToDatumFt? }
 * grid:  the builder's grid (nx, ny, nz, dx, dy, layers, tops|topsDepth).
 * Returns { connections, headIJ, refDepthFt, pathFt, tvdRange, warnings }.
 */
export function buildTrajectoryConnections(opts, grid) {
  const {
    stations, mdUnit = 'ft', wellheadX, wellheadY, kbToDatumFt = 0,
  } = opts;
  if (!Array.isArray(stations) || stations.length < 2) {
    throw new Error('A survey needs at least two stations.');
  }
  [wellheadX, wellheadY].forEach((v) => {
    if (!Number.isFinite(Number(v))) throw new Error('Wellhead X/Y (ft, grid frame) are required.');
  });

  const scale = mdUnit === 'm' ? FT_PER_M : 1;
  const ftStations = stations.map((s) => ({ md: s.md * scale, inc: s.inc, azi: s.azi }));
  // Densify along the minimum-curvature arc so the intersector's linear
  // segments track it (10 ft ≪ any sane cell size).
  const dense = resample(ftStations, { step: 10 });
  const path = computeWellPath(dense, {
    surfaceX: Number(wellheadX), surfaceY: Number(wellheadY), kb: 0,
  }).map((p) => ({ x: p.x, y: p.y, depth: p.tvd + kbToDatumFt }));

  const connections = connectionsFromPath(path, grid);
  const warnings = [];
  if (!connections.length) {
    throw new Error('The trajectory never enters the grid — check the wellhead position, KB-to-datum shift and survey depths.');
  }
  const inGrid = connections.reduce((s, c) => s + c.lengthFt, 0);
  const total = path[path.length - 1].md ?? 0;
  if (inGrid < 50) {
    warnings.push(`Only ${inGrid.toFixed(0)} ft of the wellbore lies inside the grid.`);
  }

  const head = connections[0];
  const refDepthFt = Math.round(columnInterfaces(grid, head.i, head.j)[head.k - 1] * 100) / 100;
  return {
    connections,
    headIJ: { i: head.i, j: head.j },
    refDepthFt,
    pathFt: path,
    tvdRange: {
      min: Math.round(Math.min(...path.map((p) => p.depth))),
      max: Math.round(Math.max(...path.map((p) => p.depth))),
    },
    inGridFt: Math.round(inGrid),
    totalMdFt: Math.round(total),
    warnings,
  };
}

export { cellCenterXY };
