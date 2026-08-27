// 3D model preview math (S5): the builder's grid + wells -> a projected
// SVG scene. Pure geometry, no React: the top structure surface becomes
// depth-colored quads (node depths averaged from the block-centred cell
// TOPS, decimated for big grids), wells become polylines, and an
// orthographic azimuth/elevation projection with vertical exaggeration
// turns it all into screen coordinates with painter's-order sorting.
// Display only — the deck geometry stays exactly what emitGrid writes.
import { topsArray, columnInterfaces, cellCenterXY } from '@/utils/simDeckGeneration';

const DEG = Math.PI / 180;

// Shallow -> deep, warm to cool (colorblind-safe ramp shared with the
// structure heatmap preview).
export const depthColor = (t) => {
  const ramp = [[254, 224, 144], [253, 174, 97], [244, 109, 67], [178, 24, 43], [103, 0, 31]];
  const x = Math.max(0, Math.min(0.9999, t)) * (ramp.length - 1);
  const a = ramp[Math.floor(x)];
  const b = ramp[Math.ceil(x)];
  const f = x - Math.floor(x);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`;
};

/** Top-surface depth at node (ni, nj) (0..nx, 0..ny): the mean of the
 *  adjacent cell tops — a smoothed display surface over the stepped
 *  block-centred TOPS. */
export function nodeDepth(grid, tops, ni, nj) {
  let sum = 0;
  let n = 0;
  for (let j = Math.max(1, nj); j <= Math.min(grid.ny, nj + 1); j += 1) {
    for (let i = Math.max(1, ni); i <= Math.min(grid.nx, ni + 1); i += 1) {
      sum += tops[(j - 1) * grid.nx + (i - 1)];
      n += 1;
    }
  }
  return sum / n;
}

const stridedNodes = (n, step) => {
  const out = [];
  for (let v = 0; v < n; v += step) out.push(v);
  out.push(n);
  return out;
};

/**
 * grid (the builder/composeDeck grid) -> world-space scene:
 * { quads: [{pts: [[x,y,d]x4], depth}], posts: [[p,p]...], wells: [],
 *   bounds: {x, y, top, bottom}, depthSpan: {min, max} }.
 * Quads cover the top surface (≤ maxQuads via striding); posts are the
 * four corner verticals + bottom rectangle giving the reservoir box.
 * Wells are appended by the callers via wellLineVertical/addWellPath.
 */
export function buildGridScene(grid, { maxQuads = 3600 } = {}) {
  const tops = topsArray(grid);
  const thickness = grid.layers.reduce((s, l) => s + Number(l.dz), 0);
  const step = Math.max(1, Math.ceil(Math.sqrt((grid.nx * grid.ny) / maxQuads)));
  const iN = stridedNodes(grid.nx, step);
  const jN = stridedNodes(grid.ny, step);

  const depthAt = new Map();
  const at = (ni, nj) => {
    const key = `${ni},${nj}`;
    if (!depthAt.has(key)) depthAt.set(key, nodeDepth(grid, tops, ni, nj));
    return depthAt.get(key);
  };

  const quads = [];
  for (let b = 0; b < jN.length - 1; b += 1) {
    for (let a = 0; a < iN.length - 1; a += 1) {
      const [i0, i1] = [iN[a], iN[a + 1]];
      const [j0, j1] = [jN[b], jN[b + 1]];
      const pts = [
        [i0 * grid.dx, j0 * grid.dy, at(i0, j0)],
        [i1 * grid.dx, j0 * grid.dy, at(i1, j0)],
        [i1 * grid.dx, j1 * grid.dy, at(i1, j1)],
        [i0 * grid.dx, j1 * grid.dy, at(i0, j1)],
      ];
      quads.push({ pts, depth: (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4 });
    }
  }

  const xMax = grid.nx * grid.dx;
  const yMax = grid.ny * grid.dy;
  const corners = [[0, 0], [xMax, 0], [xMax, yMax], [0, yMax]];
  const posts = [];
  corners.forEach(([x, y], idx) => {
    const top = at(x === 0 ? 0 : grid.nx, y === 0 ? 0 : grid.ny);
    const bottom = top + thickness;
    posts.push([[x, y, top], [x, y, bottom]]);
    const [nx2, ny2] = corners[(idx + 1) % 4];
    const nTop = at(nx2 === 0 ? 0 : grid.nx, ny2 === 0 ? 0 : grid.ny);
    posts.push([[x, y, bottom], [nx2, ny2, nTop + thickness]]);
  });

  let min = Infinity;
  let max = -Infinity;
  quads.forEach((q) => {
    if (q.depth < min) min = q.depth;
    if (q.depth > max) max = q.depth;
  });

  return {
    quads,
    posts,
    wells: [],
    bounds: { x: xMax, y: yMax, top: min, bottom: max + thickness },
    depthSpan: { min, max },
  };
}

/** Vertical well (i/j/k window) -> its scene line: completion from the
 *  top of k1 to the base of k2, with a stalk from the column top when
 *  the completion starts below layer 1. */
export function wellLineVertical(well, grid) {
  const { x, y } = cellCenterXY(grid, well.i, well.j);
  const ifc = columnInterfaces(grid, well.i, well.j);
  const k1 = Math.min(Math.max(1, well.k1), grid.nz);
  const k2 = Math.min(Math.max(k1, well.k2), grid.nz);
  return {
    name: well.name,
    type: well.type,
    stalk: k1 > 1 ? [[x, y, ifc[0]], [x, y, ifc[k1 - 1]]] : null,
    path: [[x, y, ifc[k1 - 1]], [x, y, ifc[k2]]],
  };
}

/** Deviated well path (buildTrajectoryConnections pathFt) -> scene line,
 *  decimated to ~120 points. */
export function wellLineFromPath(well, pathFt) {
  const step = Math.max(1, Math.ceil(pathFt.length / 120));
  const pts = pathFt.filter((_, idx) => idx % step === 0 || idx === pathFt.length - 1)
    .map((p) => [p.x, p.y, p.depth]);
  return { name: well.name, type: well.type, stalk: null, path: pts };
}

/** A vertical exaggeration that makes the reservoir's relief+thickness
 *  read at roughly a fifth of the areal extent. */
export function autoVertExag(scene) {
  const xy = Math.max(scene.bounds.x, scene.bounds.y);
  const z = Math.max(1, scene.bounds.bottom - scene.bounds.top);
  return Math.min(50, Math.max(1, Math.round((xy * 0.2) / z)));
}

/**
 * Orthographic projection. view: {azimuthDeg, elevationDeg, vertExag}.
 * Azimuth rotates the model about the vertical axis; elevation 90 is a
 * map view, small angles approach a section view; depths are exaggerated
 * by vertExag. Returns screen-space:
 * { polys (painter-sorted, far first, each {pts, t, fill}), posts, wells,
 *   extent: {minX, minY, width, height} }.
 */
export function projectScene(scene, { azimuthDeg = 225, elevationDeg = 30, vertExag = 1 } = {}) {
  const ca = Math.cos(azimuthDeg * DEG);
  const sa = Math.sin(azimuthDeg * DEG);
  const ce = Math.cos(elevationDeg * DEG);
  const se = Math.sin(elevationDeg * DEG);
  const cx = scene.bounds.x / 2;
  const cy = scene.bounds.y / 2;
  const cz = (scene.bounds.top + scene.bounds.bottom) / 2;

  const P = ([x, y, d]) => {
    const xr = (x - cx) * ca - (y - cy) * sa;
    const yr = (x - cx) * sa + (y - cy) * ca;
    const zUp = -(d - cz) * vertExag;
    return {
      x: xr,
      y: -(yr * se + zUp * ce),
      far: yr * ce - zUp * se,
    };
  };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const track = (p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    return p;
  };

  const span = Math.max(1e-9, scene.depthSpan.max - scene.depthSpan.min);
  const flat = scene.depthSpan.max - scene.depthSpan.min < 1e-6;
  const polys = scene.quads.map((q) => {
    const pts = q.pts.map((pt) => track(P(pt)));
    const t = flat ? 0.5 : (q.depth - scene.depthSpan.min) / span;
    return {
      pts: pts.map((p) => [p.x, p.y]),
      t,
      fill: depthColor(t),
      far: pts.reduce((s, p) => s + p.far, 0) / pts.length,
    };
  }).sort((a, b) => b.far - a.far);

  const posts = scene.posts.map((seg) => seg.map((pt) => {
    const p = track(P(pt));
    return [p.x, p.y];
  }));

  const wells = scene.wells.map((w) => ({
    name: w.name,
    type: w.type,
    stalk: w.stalk ? w.stalk.map((pt) => { const p = track(P(pt)); return [p.x, p.y]; }) : null,
    path: w.path.map((pt) => { const p = track(P(pt)); return [p.x, p.y]; }),
  }));

  return {
    polys,
    posts,
    wells,
    extent: { minX, minY, width: Math.max(1e-9, maxX - minX), height: Math.max(1e-9, maxY - minY) },
  };
}
