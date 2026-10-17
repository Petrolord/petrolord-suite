// The fine grid as a 3D scene (Earth Modeling 3D grid upgrade, 2026-10-17):
// the grid's shell (top, base and side walls) with the grid skeleton (cell
// edges every n cells on the shell and on the slices), I, J and K slices,
// cells filtered by a property range, contact planes, fault walls and the
// wells with their upscaled logs. Cells are node-centred: the cell of node
// (c, r) spans half a cell each way from the node, and its corners take the
// mean depth of the live nodes around them (a corner-point display, so the
// layers bend smoothly from cell to cell). Normalised model space as the
// framework scene (framework3d.js): x = (X - x0) / L, z = (Y - y0) / L,
// y = -(depth - zMin) / zRange. Pure, no WebGL.

import { isNull } from '@/lib/gridding/gridmath';
import { hexToRgb } from '@/components/viewer3d/gridMesh';
import { STRUCTURE_LUT } from '@/components/maps/lut';
import { faciesColor, fluidCode, contactAtNode } from './properties';

export const ZONE_COLORS = ['#a8a29e', '#16a34a', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2'];
export const FLUID_RGB = { 0: [0.15, 0.39, 0.92], 1: [0.09, 0.64, 0.29], 2: [0.86, 0.15, 0.15] };
export const PROPERTY_KEYS = ['phi', 'sw', 'ntg', 'perm', 'vsh', 'facies', 'fluid', 'zone'];
export const PROPERTY_LABELS = { phi: 'Porosity', sw: 'Sw', ntg: 'NTG', perm: 'Permeability (md)', vsh: 'Vsh', facies: 'Facies', fluid: 'Fluid zone', zone: 'Zones' };

/**
 * Every cell layer of the model top to bottom (a zone of the layer-cake is one
 * layer): {zone, k, top, base, props} with the zone's index and the layer in it.
 */
export function cellLayers(built) {
  const out = [];
  (built?.zones || []).forEach((z, zi) => {
    if (z.layers?.length) z.layers.forEach((L, k) => out.push({ zone: zi, k, top: L.top, base: L.base, props: L.props || {} }));
    else out.push({ zone: zi, k: 0, top: built.clamped[zi], base: built.clamped[zi + 1], props: z.props || {} });
  });
  return out;
}

/** The engine contacts of each zone ({goc, owc} as numbers, per block or per node), for the fluid property and the planes. */
export function zoneContacts(built) {
  return (built?.zones || []).map((z) => {
    const f = z.mc?.fluids || z.fluids || null;
    return { goc: f?.goc ?? null, owc: f?.owc ?? null };
  });
}

/** A cell's value of a property (null where there is none). */
export function cellValue(built, layers, contacts, K, j, prop) {
  const L = layers[K];
  if (!L) return null;
  if (isNull(L.top[j]) || isNull(L.base[j])) return null;
  if (prop === 'zone') return L.zone;
  if (prop === 'fluid') {
    // the cap is seal rock: no fluid zone (drawn grey)
    if (built.zones[L.zone]?.kind === 'cap') return null;
    const c = contacts[L.zone] || {};
    const lab = built.zones[L.zone]?.labels ? built.zones[L.zone].labels[j] : (built.labels ? built.labels[j] : 0);
    return fluidCode((L.top[j] + L.base[j]) / 2, contactAtNode(c.goc, j, lab), contactAtNode(c.owc, j, lab));
  }
  const g = L.props?.[prop];
  if (!g) return null;
  const v = g[j];
  if (prop === 'facies') return v === 255 ? null : v;
  return isNull(v) || !Number.isFinite(v) ? null : v;
}

/** The low and high of a property over every live cell (permeability on a log scale), or null. */
export function propertyStats(built, prop, layers = cellLayers(built)) {
  if (['zone', 'facies', 'fluid'].includes(prop)) return null;
  // the colour range spans the 2nd to the 98th percentile of the live cells
  // (a few extreme cells would wash the rest into one colour); min and max kept too
  const vals = [];
  let min = Infinity; let max = -Infinity; let n = 0;
  for (const L of layers) {
    const g = L.props?.[prop];
    if (!g) continue;
    for (let j = 0; j < g.length; j++) {
      const v = g[j];
      if (isNull(v) || !Number.isFinite(v) || isNull(L.top[j])) continue;
      if (v < min) min = v; if (v > max) max = v;
      n += 1;
      if (n % 7 === 1) vals.push(prop === 'perm' ? Math.log10(Math.max(v, 1e-3)) : v);
    }
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  let lo = prop === 'perm' ? 10 ** q(0.02) : q(0.02); let hi = prop === 'perm' ? 10 ** q(0.98) : q(0.98);
  if (!(hi > lo)) { lo = min; hi = max; }
  if (prop === 'perm') { lo = Math.max(lo, 0.001); hi = Math.max(hi, lo * 1.01); return { lo, hi, log: true, min, max }; }
  if (hi - lo < 1e-9) hi = lo + 1e-9;
  return { lo, hi, log: false, min, max };
}

/** The colour of a value: a ramp for a continuous property (low blue to high red), a palette for codes. */
export function colourOf(prop, v, range) {
  if (v === null || v === undefined) return [0.35, 0.35, 0.4];
  if (prop === 'zone') return hexToRgb(ZONE_COLORS[v % ZONE_COLORS.length]);
  if (prop === 'facies') return hexToRgb(faciesColor(v));
  if (prop === 'fluid') return FLUID_RGB[v] || [0.5, 0.5, 0.5];
  if (!range) return [0.6, 0.6, 0.6];
  const f = range.log ? (Math.log10(Math.max(v, range.lo)) - Math.log10(range.lo)) / (Math.log10(range.hi) - Math.log10(range.lo) || 1) : (v - range.lo) / (range.hi - range.lo);
  const i = Math.min(255, Math.max(0, Math.floor(Math.min(1, Math.max(0, f)) * 256))) * 4;
  return [STRUCTURE_LUT[i] / 255, STRUCTURE_LUT[i + 1] / 255, STRUCTURE_LUT[i + 2] / 255];
}

/**
 * Corner depths of a horizon: (nx + 1) x (ny + 1) corners, each the mean of
 * the live nodes of the four cells around it (null where none is live).
 */
export function cornerDepths(z, nx, ny) {
  const out = new Float64Array((nx + 1) * (ny + 1));
  for (let r = 0; r <= ny; r++) {
    for (let c = 0; c <= nx; c++) {
      let s = 0; let n = 0;
      for (const [cc, rr] of [[c - 1, r - 1], [c, r - 1], [c - 1, r], [c, r]]) {
        if (cc < 0 || rr < 0 || cc >= nx || rr >= ny) continue;
        const v = z[rr * nx + cc];
        if (!isNull(v)) { s += v; n += 1; }
      }
      out[r * (nx + 1) + c] = n ? s / n : 1e30;
    }
  }
  return out;
}

/** A growable soup of quads (4 vertices, 2 triangles, one colour each) and line segments. */
function soup() {
  let pos = new Float32Array(4096); let col = new Float32Array(4096); let idx = new Uint32Array(4096);
  let np = 0; let ni = 0;
  let lin = new Float32Array(4096); let nl = 0;
  const grow = (a, need) => { if (need <= a.length) return a; const b = new a.constructor(Math.max(need, a.length * 2)); b.set(a); return b; };
  return {
    quad(p, rgb) {
      pos = grow(pos, np + 12); col = grow(col, np + 12); idx = grow(idx, ni + 6);
      const v0 = np / 3;
      for (let q = 0; q < 4; q++) {
        pos[np] = p[q][0]; pos[np + 1] = p[q][1]; pos[np + 2] = p[q][2];
        col[np] = rgb[0]; col[np + 1] = rgb[1]; col[np + 2] = rgb[2];
        np += 3;
      }
      idx[ni++] = v0; idx[ni++] = v0 + 1; idx[ni++] = v0 + 2; idx[ni++] = v0; idx[ni++] = v0 + 2; idx[ni++] = v0 + 3;
    },
    line(a, b) {
      lin = grow(lin, nl + 6);
      lin[nl++] = a[0]; lin[nl++] = a[1]; lin[nl++] = a[2]; lin[nl++] = b[0]; lin[nl++] = b[1]; lin[nl++] = b[2];
    },
    mesh() { return { positions: pos.slice(0, np), colors: col.slice(0, np), indices: idx.slice(0, ni), quads: ni / 6 }; },
    lines() { return lin.slice(0, nl); },
  };
}

/**
 * The grid scene.
 * @param {object} built a built model with layered zones (the fine grid) or a layer-cake
 * @param {object} opts
 * @param {(x, y, depth) => number[]} opts.toModel map coordinates (the model's native XY) and depth (m) to model space
 * @param {string} [opts.prop] the property the cells are coloured by (PROPERTY_KEYS)
 * @param {'shell'|'slices'|'filter'} [opts.mode]
 * @param {{i: number|null, j: number|null, k: number|null}} [opts.slices] the I (column), J (row) and K (global layer) slices
 * @param {number} [opts.density] skeleton lines every this many cells (0 = none)
 * @param {{lo: number, hi: number}|null} [opts.filter] cells shown in filter mode
 * @param {number} [opts.maxCells] cells drawn in filter mode (columns are skipped past it)
 */
export function gridScene(built, { toModel, prop = 'zone', mode = 'shell', slices = {}, density = 5, filter = null, maxCells = 250000, hiddenZones = null } = {}) {
  const spec = built.spec;
  const { nx, ny } = spec;
  const allLayers = cellLayers(built);
  // hidden zones (the cap, to see the reservoir under it) leave the shell and the filter
  const layers = hiddenZones && hiddenZones.length && mode !== 'slices' ? allLayers.filter((L) => !hiddenZones.includes(L.zone)) : allLayers;
  const hiddenK = (K) => !!(hiddenZones && hiddenZones.includes(layers[K]?.zone));
  const nK = layers.length;
  const contacts = zoneContacts(built);
  const range = propertyStats(built, prop, layers);
  const value = (K, j) => cellValue(built, layers, contacts, K, j, prop);
  const col = (K, j) => colourOf(prop, value(K, j), range);
  const live = (j) => !isNull(layers[0]?.top[j]) && !isNull(layers[nK - 1]?.base[j]);
  // corner depths of every horizon (K top faces and the last base)
  const corners = [];
  const cornersOf = (K) => {
    if (corners[K]) return corners[K];
    const z = K < nK ? layers[K].top : layers[nK - 1].base;
    corners[K] = cornerDepths(z, nx, ny);
    return corners[K];
  };
  const cx = (c) => spec.x0 + (c - 0.5) * spec.dx; // corner c sits half a cell before node c
  const cy = (r) => spec.y0 + (r - 0.5) * spec.dy;
  const cd = (K, c, r) => cornersOf(K)[r * (nx + 1) + c];
  // display interpolation at the edge: a corner of a step (one live column of
  // four, or three) moves half way towards the live (or the empty) column, so
  // the cell steps along the model edge draw as a straight chamfer
  const cornerShift = new Float32Array((nx + 1) * (ny + 1) * 2);
  for (let r = 0; r <= ny; r++) {
    for (let c = 0; c <= nx; c++) {
      let n = 0; let sx = 0; let sy = 0; let ox = 0; let oy = 0;
      for (const [cc, rr, ddx, ddy] of [[c - 1, r - 1, -1, -1], [c, r - 1, 1, -1], [c - 1, r, -1, 1], [c, r, 1, 1]]) {
        const inGrid = cc >= 0 && rr >= 0 && cc < nx && rr < ny;
        if (inGrid && live(rr * nx + cc)) { n += 1; sx += ddx; sy += ddy; } else { ox += ddx; oy += ddy; }
      }
      const q = (r * (nx + 1) + c) * 2;
      if (n === 1) { cornerShift[q] = 0.25 * sx * spec.dx; cornerShift[q + 1] = 0.25 * sy * spec.dy; }
      if (n === 3) { cornerShift[q] = 0.25 * ox * spec.dx; cornerShift[q + 1] = 0.25 * oy * spec.dy; }
    }
  }
  const P = (K, c, r) => { const q = (r * (nx + 1) + c) * 2; return toModel(cx(c) + cornerShift[q], cy(r) + cornerShift[q + 1], cd(K, c, r)); };
  const S = soup();
  const d = Math.max(0, Math.floor(density));
  const on = (n) => d > 0 && n % d === 0;
  const counts = { cells: 0, skipped: 0 };

  // a horizontal face of cell (c, r) at horizon K, with its skeleton edges
  const hFace = (K, c, r, rgb, edges = true) => {
    const p = [P(K, c, r), P(K, c + 1, r), P(K, c + 1, r + 1), P(K, c, r + 1)];
    S.quad(p, rgb);
    if (!edges || !d) return;
    if (on(c)) S.line(p[0], p[3]);
    if (on(r)) S.line(p[0], p[1]);
    if (on(c + 1) || c === nx - 1) S.line(p[1], p[2]);
    if (on(r + 1) || r === ny - 1) S.line(p[3], p[2]);
  };
  // a vertical face of a cell on its side: (c0, r0) to (c1, r1) corners, layer K
  const vFace = (K, c0, r0, c1, r1, rgb, along) => {
    const p = [P(K, c0, r0), P(K, c1, r1), P(K + 1, c1, r1), P(K + 1, c0, r0)];
    S.quad(p, rgb);
    if (!d) return;
    // layer lines every n layers, and always at a zone boundary
    if (on(layers[K].k) || layers[K].k === 0) S.line(p[0], p[1]);
    if (K === nK - 1) S.line(p[3], p[2]);
    if (on(along)) S.line(p[0], p[3]);
  };

  if (mode === 'shell' && nK) {
    for (let r = 0; r < ny; r++) {
      for (let c = 0; c < nx; c++) {
        const j = r * nx + c;
        if (!live(j)) continue;
        hFace(0, c, r, col(0, j));
        hFace(nK, c, r, col(nK - 1, j), false);
        // side walls where the next column is outside the model
        const out = (cc, rr) => cc < 0 || rr < 0 || cc >= nx || rr >= ny || !live(rr * nx + cc);
        for (let K = 0; K < nK; K++) {
          if (isNull(layers[K].top[j])) continue;
          const rgb = col(K, j);
          if (out(c - 1, r)) vFace(K, c, r + 1, c, r, rgb, r);
          if (out(c + 1, r)) vFace(K, c + 1, r, c + 1, r + 1, rgb, r);
          if (out(c, r - 1)) vFace(K, c, r, c + 1, r, rgb, c);
          if (out(c, r + 1)) vFace(K, c + 1, r + 1, c, r + 1, rgb, c);
        }
      }
    }
  }

  if (mode === 'slices' && nK) {
    const { i: si = null, j: sj = null, k: sk = null } = slices || {};
    if (Number.isInteger(si) && si >= 0 && si < nx) {
      // the I slice: the column of cells at node column si, cut through the cell centres
      for (let r = 0; r < ny; r++) {
        const j = r * nx + si;
        if (!live(j)) continue;
        for (let K = 0; K < nK; K++) {
          if (isNull(layers[K].top[j]) || hiddenK(K)) continue;
          const x = spec.x0 + si * spec.dx;
          const zT = (rr) => midDepth(layers[K].top, nx, ny, si, r, 0, rr);
          const zB = (rr) => midDepth(layers[K].base, nx, ny, si, r, 0, rr);
          const p = [toModel(x, cy(r), zT(-1)), toModel(x, cy(r + 1), zT(1)), toModel(x, cy(r + 1), zB(1)), toModel(x, cy(r), zB(-1))];
          S.quad(p, col(K, j));
          if (d) { if (on(layers[K].k) || layers[K].k === 0) S.line(p[0], p[1]); if (K === nK - 1) S.line(p[3], p[2]); if (on(r)) S.line(p[0], p[3]); }
        }
      }
    }
    if (Number.isInteger(sj) && sj >= 0 && sj < ny) {
      for (let c = 0; c < nx; c++) {
        const j = sj * nx + c;
        if (!live(j)) continue;
        for (let K = 0; K < nK; K++) {
          if (isNull(layers[K].top[j]) || hiddenK(K)) continue;
          const y = spec.y0 + sj * spec.dy;
          const zT = (cc) => midDepth(layers[K].top, nx, ny, c, sj, cc, 0);
          const zB = (cc) => midDepth(layers[K].base, nx, ny, c, sj, cc, 0);
          const p = [toModel(cx(c), y, zT(-1)), toModel(cx(c + 1), y, zT(1)), toModel(cx(c + 1), y, zB(1)), toModel(cx(c), y, zB(-1))];
          S.quad(p, col(K, j));
          if (d) { if (on(layers[K].k) || layers[K].k === 0) S.line(p[0], p[1]); if (K === nK - 1) S.line(p[3], p[2]); if (on(c)) S.line(p[0], p[3]); }
        }
      }
    }
    if (Number.isInteger(sk) && sk >= 0 && sk < nK && !hiddenK(sk)) {
      for (let r = 0; r < ny; r++) {
        for (let c = 0; c < nx; c++) {
          const j = r * nx + c;
          if (!live(j) || isNull(layers[sk].top[j])) continue;
          hFace(sk, c, r, col(sk, j));
        }
      }
    }
  }

  if (mode === 'filter' && nK) {
    const pass = (K, j) => {
      if (K < 0 || K >= nK) return false;
      const v = value(K, j);
      if (v === null) return false;
      if (!filter) return true;
      return v >= filter.lo && v <= filter.hi;
    };
    // count first, then skip columns evenly past the budget
    let total = 0;
    for (let K = 0; K < nK; K++) for (let j = 0; j < nx * ny; j++) if (pass(K, j)) total += 1;
    const stride = total > maxCells ? Math.ceil(Math.sqrt(total / maxCells)) : 1;
    counts.skipped = stride > 1 ? total - Math.ceil(total / (stride * stride)) : 0;
    for (let r = 0; r < ny; r += stride) {
      for (let c = 0; c < nx; c += stride) {
        const j = r * nx + c;
        if (!live(j)) continue;
        for (let K = 0; K < nK; K++) {
          if (!pass(K, j)) continue;
          counts.cells += 1;
          const rgb = col(K, j);
          // the faces a viewer can see: the top unless the cell above is shown, the sides next to hidden cells
          const shown = (cc, rr, KK) => cc >= 0 && rr >= 0 && cc < nx && rr < ny && stride === 1 && pass(KK, rr * nx + cc);
          if (!shown(c, r, K - 1)) hFace(K, c, r, rgb, false);
          if (!shown(c, r, K + 1)) hFace(K + 1, c, r, rgb.map((v) => v * 0.8), false);
          const c1 = c + stride; const r1 = r + stride;
          const side = (c0, r0, c2, r2) => S.quad([P(K, c0, r0), P(K, c2, r2), P(K + 1, c2, r2), P(K + 1, c0, r0)], rgb.map((v) => v * 0.9));
          if (!shown(c - 1, r, K)) side(c, Math.min(r1, ny), c, r);
          if (!shown(c + 1, r, K)) side(Math.min(c1, nx), r, Math.min(c1, nx), Math.min(r1, ny));
          if (!shown(c, r - 1, K)) side(c, r, Math.min(c1, nx), r);
          if (!shown(c, r + 1, K)) side(Math.min(c1, nx), Math.min(r1, ny), c, Math.min(r1, ny));
        }
      }
    }
  }

  return { mesh: S.mesh(), skeleton: S.lines(), range, nK, counts, layers: layers.length };
}

/**
 * The depth of a horizon half a cell from node (c, r) towards the neighbour
 * (c + dc, r + dr): the mean of the two nodes, or the node's own where the
 * neighbour is unmapped (dc, dr in -1..1, one of them zero).
 */
export function midDepth(z, nx, ny, c, r, dc, dr) {
  const a = z[r * nx + c];
  const cc = c + dc; const rr = r + dr;
  if (cc < 0 || rr < 0 || cc >= nx || rr >= ny) return a;
  const b = z[rr * nx + cc];
  return isNull(b) ? a : (a + b) / 2;
}

/**
 * Contact planes: for each zone and contact, the cells whose column the
 * contact cuts inside the zone, as flat quads at the contact depth, plus the
 * line where the contact meets the zone top (its intersection outline).
 * @returns {Array<{kind: 'owc'|'goc', zone: number, depth: number|null, mesh, lines}>}
 */
export function contactScene(built, { toModel, hiddenZones = null } = {}) {
  const spec = built.spec; const { nx, ny } = spec;
  const contacts = zoneContacts(built);
  // one plane per contact: zones sharing a contact (Ekene Sand Upper, Middle and
  // Lower share the OWC) draw it once, where it cuts any of them
  const groups = new Map();
  (built.zones || []).forEach((z, zi) => {
    if (hiddenZones && hiddenZones.includes(zi)) return;
    for (const kind of ['goc', 'owc']) {
      const c = contacts[zi]?.[kind];
      if (c === null || c === undefined) continue;
      const key = `${kind}|${typeof c === 'number' ? c.toFixed(3) : zi}`;
      if (!groups.has(key)) groups.set(key, { kind, c, zones: [] });
      groups.get(key).zones.push(zi);
    }
  });
  const out = [];
  for (const { kind, c, zones } of groups.values()) {
    const S = soup();
    let any = false; let depth = null;
    const labelOf = (zi, j) => (built.zones[zi].labels ? built.zones[zi].labels[j] : (built.labels ? built.labels[j] : 0));
    const at = (j) => contactAtNode(c, j, labelOf(zones[0], j));
    const inside = (j) => {
      const v = at(j);
      if (v === null) return false;
      return zones.some((zi) => { const t = built.clamped[zi][j]; const b = built.clamped[zi + 1][j]; return !isNull(t) && !isNull(b) && t < v && b > v; });
    };
    const ins = new Uint8Array(nx * ny);
    for (let j = 0; j < nx * ny; j++) ins[j] = inside(j) ? 1 : 0;
    for (let r = 0; r < ny; r++) {
      for (let cc = 0; cc < nx; cc++) {
        const j = r * nx + cc;
        if (!ins[j]) continue;
        const v = at(j); depth = depth ?? v; any = true;
        const x0 = spec.x0 + (cc - 0.5) * spec.dx; const x1 = x0 + spec.dx;
        const y0 = spec.y0 + (r - 0.5) * spec.dy; const y1 = y0 + spec.dy;
        S.quad([toModel(x0, y0, v), toModel(x1, y0, v), toModel(x1, y1, v), toModel(x0, y1, v)], kind === 'owc' ? [0.15, 0.39, 0.92] : [0.86, 0.15, 0.15]);
        // the outline where the plane leaves the reservoir
        const edge = (c2, r2) => c2 < 0 || r2 < 0 || c2 >= nx || r2 >= ny || !ins[r2 * nx + c2];
        if (edge(cc - 1, r)) S.line(toModel(x0, y0, v), toModel(x0, y1, v));
        if (edge(cc + 1, r)) S.line(toModel(x1, y0, v), toModel(x1, y1, v));
        if (edge(cc, r - 1)) S.line(toModel(x0, y0, v), toModel(x1, y0, v));
        if (edge(cc, r + 1)) S.line(toModel(x0, y1, v), toModel(x1, y1, v));
      }
    }
    if (any) out.push({ kind, zone: zones[0], zones, depth, mesh: S.mesh(), lines: S.lines() });
  }
  return out;
}

/**
 * Fault planes: a Seismolord fault's rails (x, y, depth) lofted into a
 * surface, and a fault polygon with no depth as vertical walls along its
 * edges through the model's depth range.
 */
export function faultScene(faultPolygons, { toModel, zMin, zMax }) {
  const S = soup();
  const rgb = [0.92, 0.7, 0.03];
  for (const p of faultPolygons || []) {
    const rails = (p.rails || []).filter((r) => Array.isArray(r) && r.length >= 2);
    if (rails.length >= 2) {
      for (let a = 0; a + 1 < rails.length; a++) {
        const A = rails[a]; const B = rails[a + 1];
        const n = Math.min(A.length, B.length);
        for (let q = 0; q + 1 < n; q++) {
          S.quad([toModel(A[q][0], A[q][1], A[q][2]), toModel(B[q][0], B[q][1], B[q][2]), toModel(B[q + 1][0], B[q + 1][1], B[q + 1][2]), toModel(A[q + 1][0], A[q + 1][1], A[q + 1][2])], rgb);
        }
      }
      continue;
    }
    const v = (p.vertices || []).map((x) => (Array.isArray(x) ? x : [x.x, x.y]));
    for (let q = 0; q < v.length; q++) {
      const [x1, y1] = v[q]; const [x2, y2] = v[(q + 1) % v.length];
      S.quad([toModel(x1, y1, zMin), toModel(x2, y2, zMin), toModel(x2, y2, zMax), toModel(x1, y1, zMax)], rgb);
      S.line(toModel(x1, y1, zMin), toModel(x2, y2, zMin));
    }
  }
  return { mesh: S.mesh(), lines: S.lines() };
}

/**
 * The wells' upscaled logs as ribbons: one quad per upscaled cell, from the
 * well path out along the map's east axis by the value (scaled to `width`
 * map units at the top of the range), coloured by the value.
 */
export function wellLogScene(built, prop, { toModel, width, range }) {
  const S = soup();
  if (!range || ['zone', 'fluid'].includes(prop)) return S.mesh();
  const k = built.xyToM || 1;
  (built.zones || []).forEach((z) => {
    for (const r of z.logRows || []) {
      const v = prop === 'facies' ? r.facies : r[prop];
      if (!Number.isFinite(v) || !Number.isFinite(r.tvdss)) continue;
      const half = Math.max(0.05, (r.grossM || 0) / 2);
      const f = prop === 'facies' ? 0.6 : Math.min(1, Math.max(0.05, range.log ? (Math.log10(Math.max(v, range.lo)) - Math.log10(range.lo)) / (Math.log10(range.hi) - Math.log10(range.lo) || 1) : (v - range.lo) / (range.hi - range.lo)));
      const x = r.x / k; const y = r.y / k;
      S.quad([toModel(x, y, r.tvdss - half), toModel(x + f * width, y, r.tvdss - half), toModel(x + f * width, y, r.tvdss + half), toModel(x, y, r.tvdss + half)], colourOf(prop, v, range));
    }
  });
  return S.mesh();
}
