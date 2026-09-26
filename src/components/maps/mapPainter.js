// Pure canvas painters for the map viewports (Mapping MS1, 2026-09-05).
// Everything paints in CSS pixels on a context the caller has already
// scaled by devicePixelRatio; the world-to-screen mapping is the
// MapTransform passed in. No React, no document (offscreen canvases
// come from an injected factory so jsdom tests can stub them).
//
// Grid convention (lib/gridding): z[r*nx + c], world x = x0 + c*dx,
// y = y0 + r*dy, row 0 = SOUTH. The raster bitmap therefore has its row
// 0 at the bottom of the map; paintRaster flips it on the way onto the
// screen. (Both pre-MS1 map twins drew row 0 at the top, which mirrored
// the raster north-south against its own contours and wells.)

import {
  contourLevels, contourPolylines, buildMapPixels, gridRange,
} from '@/lib/gridding/mapContours';
import { isNull, gridXY, gridRotation, gridBBox, worldToGridIndex } from '@/lib/gridding/gridmath';
import {
  niceStepUp, fmtTick, drawScaleBar, INK, INK_DIM, FONT,
} from './annotations';
import { contourLabelPositions, isMajorLevel } from './contourLabels';
import { FIT_PAD } from './mapTransform';

export const MAP_BG = '#0f172a';

/**
 * Scene palettes (Mapping T1 MAP-T1-010, 2026-09-26). 'screen' is the dark
 * workstation look; 'print' is the white report page the Suite chart
 * standard asks for (dark ink, white halos), used by the PNG export.
 */
export const MAP_THEMES = Object.freeze({
  screen: {
    bg: MAP_BG, ink: INK, inkDim: INK_DIM, label: '#94a3b8',
    wellInk: '#e2e8f0', wellLabel: '#cbd5e1', halo: 'rgba(2, 6, 23, 0.8)',
    contourInk: 'rgba(226, 232, 240, 0.95)', contourHalo: 'rgba(2, 6, 23, 0.85)',
    markerHalo: 'rgba(2, 6, 23, 0.8)',
  },
  print: {
    bg: '#ffffff', ink: '#0f172a', inkDim: '#475569', label: '#334155',
    wellInk: '#0f172a', wellLabel: '#0f172a', halo: 'rgba(255, 255, 255, 0.9)',
    contourInk: '#0f172a', contourHalo: 'rgba(255, 255, 255, 0.9)',
    markerHalo: 'rgba(255, 255, 255, 0.9)',
  },
});
const LABEL_FONT = '10px sans-serif';
const MAX_CONTOUR_LEVELS = 400;

/** World extent of the grid NODES. */
export function nodeExtent(spec) {
  if (!gridRotation(spec)) {
    return {
      x0: spec.x0, y0: spec.y0,
      x1: spec.x0 + (spec.nx - 1) * spec.dx,
      y1: spec.y0 + (spec.ny - 1) * spec.dy,
    };
  }
  // a rotated frame (MS5): the world bounding box of its node corners
  const b = gridBBox(spec);
  return { x0: b.xmin, y0: b.ymin, x1: b.xmax, y1: b.ymax };
}

/** Offscreen bitmap of the grid through the LUT (row 0 = south). */
export function rasterBitmap({ grid, spec, lut, zMin, zMax, upsample = 1, makeCanvas = () => document.createElement('canvas') }) {
  const { nx, ny } = spec;
  const k = Math.max(1, Math.floor(upsample));
  const c = makeCanvas();
  if (k === 1) {
    const rgba = buildMapPixels(grid, ny, nx, lut, zMin, zMax === zMin ? zMin + 1 : zMax);
    c.width = nx;
    c.height = ny;
    c.getContext('2d').putImageData(new ImageData(rgba, nx, ny), 0, 0);
    return c;
  }
  const { rgba, w, h } = upsampledPixels(grid, spec, lut, zMin, zMax, k);
  c.width = w;
  c.height = h;
  c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return c;
}

/**
 * Mapping T1 (MAP-T1-011): a k-times finer bitmap whose pixels take the
 * bilinear value of the four surrounding nodes when all four are live
 * (a smooth interior instead of blocky cells); near nulls, the weighted
 * mean of the live corners, drawn only where they carry at least half the
 * bilinear weight. The map edge is then crisp and follows the mask's 0.5
 * level instead of a blurred cell staircase. Bitmap pixel (c, r) covers
 * the node-space point ((c + 0.5) / k - 0.5, (r + 0.5) / k - 0.5), so the
 * bitmap still spans the cell extent and paintRaster maps it unchanged.
 */
export function upsampledPixels(grid, spec, lut, zMin, zMax, k) {
  const { nx, ny } = spec;
  const w = nx * k;
  const h = ny * k;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const span = zMax > zMin ? zMax - zMin : 1;
  const live = (v) => Number.isFinite(v) && Math.abs(v) < 1e29;
  for (let r = 0; r < h; r++) {
    const fy = (r + 0.5) / k - 0.5;
    const r0 = Math.max(0, Math.min(ny - 1, Math.floor(fy)));
    const r1 = Math.min(ny - 1, r0 + 1);
    const v = Math.max(0, Math.min(1, fy - r0));
    const rn = Math.max(0, Math.min(ny - 1, Math.round(fy)));
    for (let c = 0; c < w; c++) {
      const fx = (c + 0.5) / k - 0.5;
      const c0 = Math.max(0, Math.min(nx - 1, Math.floor(fx)));
      const c1 = Math.min(nx - 1, c0 + 1);
      const u = Math.max(0, Math.min(1, fx - c0));
      // bilinear over the LIVE corners only; the pixel is drawn when the
      // live corners carry at least half the weight, which traces the
      // mask's 0.5 level (a smooth diagonal edge, not a cell staircase)
      let wl = 0; let zl = 0;
      const add = (zz, ww) => { if (live(zz) && ww > 0) { wl += ww; zl += ww * zz; } };
      add(grid[r0 * nx + c0], (1 - u) * (1 - v));
      add(grid[r0 * nx + c1], u * (1 - v));
      add(grid[r1 * nx + c0], (1 - u) * v);
      add(grid[r1 * nx + c1], u * v);
      if (wl < 0.5) continue;
      const z = zl / wl;
      const li = Math.max(0, Math.min(255, Math.round(((z - zMin) / span) * 255))) * 4;
      const o = (r * w + c) * 4;
      rgba[o] = lut[li]; rgba[o + 1] = lut[li + 1]; rgba[o + 2] = lut[li + 2]; rgba[o + 3] = 255;
    }
  }
  return { rgba, w, h };
}

/** Upsampling factor that brings the bitmap's long side near `targetPx` (1 to 8). */
export const rasterUpsample = (spec, targetPx = 1024) => Math.max(1, Math.min(8, Math.floor(targetPx / Math.max(spec.nx, spec.ny))));

/**
 * Blit the bitmap over the CELL extent (each pixel centred on its
 * node), y flipped so bitmap row 0 lands on the southern edge.
 */
export function paintRaster(ctx, { bitmap, spec, transform, smoothing = true }) {
  // the bitmap's pixel (c, r) covers node (r, c); map its corners through
  // the grid frame (rotation included) with one affine: origin at the
  // south-west cell corner, one pixel along local X and local Y
  const o = gridXY(spec, -0.5, -0.5);
  const ex = gridXY(spec, -0.5, spec.nx - 0.5);
  const ey = gridXY(spec, spec.ny - 0.5, -0.5);
  const a = transform.worldToScreen(o.x, o.y);
  const bx = transform.worldToScreen(ex.x, ex.y);
  const by = transform.worldToScreen(ey.x, ey.y);
  ctx.save();
  ctx.imageSmoothingEnabled = smoothing;
  // per BITMAP pixel: an upsampled bitmap (T1) has k pixels per cell
  const bw = bitmap.width || spec.nx;
  const bh = bitmap.height || spec.ny;
  ctx.transform((bx.x - a.x) / bw, (bx.y - a.y) / bw, (by.x - a.x) / bh, (by.y - a.y) / bh, a.x, a.y);
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();
}

/**
 * Contour levels and world-space polylines of a grid: a nice automatic
 * step for `target` levels, or a fixed `step` (falls back to automatic
 * when the step would produce more than MAX_CONTOUR_LEVELS levels).
 * @returns {{levels:number[], step:number, paths:Float64Array[][], zMin, zMax, auto:boolean}}
 */
export function contourPaths(grid, spec, { target = 10, step = null } = {}) {
  const { zMin, zMax } = gridRange(grid);
  if (!(zMax > zMin)) return { levels: [], step: 0, paths: [], zMin, zMax, auto: true };
  let levels;
  let st;
  let auto = true;
  if (step > 0 && (zMax - zMin) / step <= MAX_CONTOUR_LEVELS) {
    st = step;
    levels = [];
    for (let v = Math.ceil(zMin / st) * st; v <= zMax + 1e-9; v += st) levels.push(v);
    auto = false;
  } else {
    ({ levels, step: st } = contourLevels(zMin, zMax, target));
  }
  const paths = levels.map((lvl) => contourPolylines(grid, spec.ny, spec.nx, lvl).map((poly) => {
    const out = new Float64Array(poly.length);
    for (let k = 0; k < poly.length; k += 2) {
      const w = gridXY(spec, poly[k + 1], poly[k]); // fractional (row, col) through the frame
      out[k] = w.x;
      out[k + 1] = w.y;
    }
    return out;
  }));
  return { levels, step: st, paths, zMin, zMax, auto };
}

const toScreenFlat = (pts, transform) => {
  const out = new Float64Array(pts.length);
  for (let k = 0; k < pts.length; k += 2) {
    const s = transform.worldToScreen(pts[k], pts[k + 1]);
    out[k] = s.x;
    out[k + 1] = s.y;
  }
  return out;
};

/** Contours (major levels heavier) with optional labels on the majors. */
export function paintContours(ctx, {
  contours, transform, labels = true, majorEvery = 5, fmt = null, labelEvery = null,
  minor = 'rgba(15, 23, 42, 0.55)', major = 'rgba(15, 23, 42, 0.9)',
  ink = 'rgba(226, 232, 240, 0.95)', halo = 'rgba(2, 6, 23, 0.85)',
}) {
  if (!contours || !contours.levels.length) return;
  const { levels, step, paths } = contours;
  const format = fmt || ((v) => fmtTick(v, step));
  const screenPaths = paths.map((polys) => polys.map((p) => toScreenFlat(p, transform)));
  ctx.save();
  for (let k = 0; k < levels.length; k++) {
    const isMajor = isMajorLevel(levels[k], step, majorEvery);
    ctx.lineWidth = isMajor ? 1.6 : 1;
    ctx.strokeStyle = isMajor ? major : minor;
    for (const pts of screenPaths[k]) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        if (i) ctx.lineTo(pts[i], pts[i + 1]); else ctx.moveTo(pts[i], pts[i + 1]);
      }
      ctx.stroke();
    }
  }
  if (labels) {
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.fillStyle = ink;
    // Mapping T1 (MAP-T1-011): a sparse map (12 levels or fewer) labels
    // every level; a dense one labels the majors as before
    const every = labelEvery ?? (levels.length <= 12 ? 1 : majorEvery);
    for (let k = 0; k < levels.length; k++) {
      if (!isMajorLevel(levels[k], step, every)) continue;
      const text = format(levels[k]);
      for (const pts of screenPaths[k]) {
        for (const pos of contourLabelPositions(pts)) {
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.rotate(pos.angle);
          ctx.strokeText(text, 0, 0);
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }
      }
    }
  }
  ctx.restore();
}

/**
 * Well symbol kinds from a registry status (Mapping T1 MAP-T1-015):
 * 'circle' (unknown, drilling), 'ring' (planned), 'cross' (dry, plugged,
 * abandoned), 'oil' (filled, green), 'gas' (circle with rays, red),
 * 'oilgas' (filled with rays), 'water' (filled, blue), 'injector' (circle
 * with an arrow), 'suspended' (circle with a bar).
 */
export const defaultSymbol = (w) => {
  const s = String(w?.status || '').toLowerCase();
  if (s === 'planned' || s === 'proposed') return 'ring';
  if (s === 'dry' || s === 'plugged' || s === 'abandoned') return 'cross';
  if (s === 'oil') return 'oil';
  if (s === 'gas') return 'gas';
  if (s === 'oil_gas') return 'oilgas';
  if (s === 'water') return 'water';
  if (s === 'injector_water' || s === 'injector_gas') return 'injector';
  if (s === 'suspended') return 'suspended';
  return 'circle';
};

export const WELL_SYMBOL_LABELS = Object.freeze({
  circle: 'Well', ring: 'Planned', cross: 'Dry or abandoned', oil: 'Oil', gas: 'Gas', oilgas: 'Oil and gas',
  water: 'Water', injector: 'Injector', suspended: 'Suspended',
});

/** Draw one well symbol of `kind` centred at (x, y). */
export function drawWellSymbol(ctx, kind, x, y, ink) {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 1.5;
  const dot = (fill) => { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke(); };
  const rays = () => {
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; ctx.moveTo(x + 4.5 * Math.cos(a), y + 4.5 * Math.sin(a)); ctx.lineTo(x + 7 * Math.cos(a), y + 7 * Math.sin(a)); }
    ctx.stroke();
  };
  if (kind === 'ring') { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke(); } else if (kind === 'cross') {
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 3.5); ctx.lineTo(x + 3.5, y + 3.5);
    ctx.moveTo(x - 3.5, y + 3.5); ctx.lineTo(x + 3.5, y - 3.5);
    ctx.stroke();
  } else if (kind === 'oil') dot('#16a34a');
  else if (kind === 'water') dot('#2563eb');
  else if (kind === 'gas') { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke(); rays(); } else if (kind === 'oilgas') { dot('#16a34a'); rays(); } else if (kind === 'injector') {
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, y - 8); ctx.moveTo(x - 2.5, y - 5.5); ctx.lineTo(x, y - 8); ctx.lineTo(x + 2.5, y - 5.5); ctx.stroke();
  } else if (kind === 'suspended') {
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5.5, y); ctx.lineTo(x + 5.5, y); ctx.stroke();
  } else { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
}

/** A small key of the well symbols present (only when any well has a status). */
export function paintWellLegend(ctx, { wells, x, y = null, bottom = null, ink = INK, bg = 'rgba(2, 6, 23, 0.6)', symbolOf = defaultSymbol }) {
  const kinds = [...new Set((wells || []).filter((w) => w?.status).map(symbolOf))];
  if (!kinds.length) return 0;
  ctx.save();
  ctx.font = FONT(1);
  const h = 14 * kinds.length + 8;
  if (y == null) y = (bottom ?? 0) - h; // eslint-disable-line no-param-reassign
  const w = 16 + Math.max(...kinds.map((k) => ctx.measureText(WELL_SYMBOL_LABELS[k] || k).width)) + 8;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  kinds.forEach((k, i) => {
    drawWellSymbol(ctx, k, x + 9, y + 11 + i * 14, ink);
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(WELL_SYMBOL_LABELS[k] || k, x + 18, y + 11 + i * 14);
  });
  ctx.restore();
  return h;
}

/**
 * Posted wells: symbol at the wellhead, name and (optionally) the posted
 * value; when `posted[name]` carries a borehole x/y that differs from
 * the wellhead by more than 2 px, a thin line and a small square mark
 * the borehole position the value was taken at.
 * @param {Object<string, {z:number, x?:number, y?:number}>} [posted]
 */
export function paintWells(ctx, {
  wells, transform, showNames = true, posted = null, fmt = (v) => String(v), symbolOf = defaultSymbol,
  ink = '#e2e8f0', label = '#cbd5e1', halo = 'rgba(2, 6, 23, 0.8)',
}) {
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const w of wells || []) {
    if (!Number.isFinite(w.surface_x) || !Number.isFinite(w.surface_y)) continue;
    const s = transform.worldToScreen(w.surface_x, w.surface_y);
    const p = posted?.[w.name];
    let bore = null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      const b = transform.worldToScreen(p.x, p.y);
      if (Math.hypot(b.x - s.x, b.y - s.y) > 2) {
        bore = b;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ink;
        ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
      }
    }
    drawWellSymbol(ctx, symbolOf(w), s.x, s.y, ink);
    // Mapping T1 (MAP-T1-012): a deviated well's posted value is written
    // at the borehole point it was taken at, its name at the wellhead
    const value = p && Number.isFinite(p.z) ? fmt(p.z) : '';
    const put = (text, x, y) => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = halo;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = label;
      ctx.fillText(text, x, y);
    };
    // a borehole within a label's reach of the wellhead keeps one label
    if (bore && Math.hypot(bore.x - s.x, bore.y - s.y) < 36) bore = null;
    if (bore) {
      if (showNames) put(w.name, s.x + 5, s.y + 3);
      if (value) put(value, bore.x + 5, bore.y + 3);
    } else if (showNames || value) {
      const text = `${showNames ? w.name : ''}${value ? `${showNames ? '  ' : ''}${value}` : ''}`;
      if (text) put(text, s.x + 5, s.y + 3);
    }
  }
  ctx.restore();
}

const ringOf = (poly) => (Array.isArray(poly) ? poly : poly?.vertices || poly?.rings?.[0] || []);
const vx = (v) => (Array.isArray(v) ? v[0] : v.x);
const vy = (v) => (Array.isArray(v) ? v[1] : v.y);

/** Committed polygons (gold, closed) and the in-progress ring (orange,
 *  dashed, vertex squares): the Earth Modeling styles. */
export function paintPolygons(ctx, {
  polygons = [], pending = [], transform, committed = '#eab308', draft = '#f97316',
}) {
  ctx.save();
  const drawRing = (verts, stroke, dash, close) => {
    if (!verts.length) return;
    ctx.strokeStyle = stroke;
    ctx.setLineDash(dash);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    verts.forEach((v, i) => {
      const s = transform.worldToScreen(vx(v), vy(v));
      if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
    });
    if (close) ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  };
  for (const p of polygons) drawRing(ringOf(p), p?.color || committed, [], true);
  drawRing(pending, draft, [4, 3], false);
  ctx.fillStyle = draft;
  for (const v of pending) {
    const s = transform.worldToScreen(vx(v), vy(v));
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
  }
  ctx.restore();
}

/** Point markers (guide points, picks): a triangle with a label. */
export function paintMarkers(ctx, { markers = [], transform, color = '#f472b6', halo = 'rgba(2, 6, 23, 0.8)' }) {
  if (!markers.length) return;
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const m of markers) {
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    const s = transform.worldToScreen(m.x, m.y);
    ctx.fillStyle = m.color || color;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 5);
    ctx.lineTo(s.x + 4.5, s.y + 3);
    ctx.lineTo(s.x - 4.5, s.y + 3);
    ctx.closePath();
    ctx.fill();
    if (m.label) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = halo;
      ctx.strokeText(m.label, s.x + 6, s.y + 3);
      ctx.fillStyle = '#fbcfe8';
      ctx.fillText(m.label, s.x + 6, s.y + 3);
    }
  }
  ctx.restore();
}

/** Culture / GIS layers (geo_culture features in the map's frame). */
export function paintCulture(ctx, { layers = [], transform }) {
  ctx.save();
  for (const layer of layers) {
    const color = layer.style?.color || '#f59e0b';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, layer.style?.weight || 1);
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'left';
    for (const f of layer.features || []) {
      if (f.type === 'point') {
        const s = transform.worldToScreen(f.x, f.y);
        ctx.fillRect(s.x - 2.5, s.y - 2.5, 5, 5);
        if (f.label) ctx.fillText(f.label, s.x + 5, s.y + 3);
        continue;
      }
      const rings = f.type === 'polygon' ? f.rings : f.paths;
      let first = null;
      for (const ring of rings || []) {
        if (ring.length < 2) continue;
        ctx.beginPath();
        ring.forEach((v, i) => {
          const s = transform.worldToScreen(v[0], v[1]);
          if (i === 0) { ctx.moveTo(s.x, s.y); if (!first) first = s; } else ctx.lineTo(s.x, s.y);
        });
        if (f.type === 'polygon') {
          ctx.closePath();
          ctx.save();
          ctx.globalAlpha = Number.isFinite(layer.style?.fill_opacity) ? layer.style.fill_opacity : 0.08;   // facies / paleogeography polygons fill stronger (Stratigraphy ST4)
          ctx.fill();
          ctx.restore();
        }
        ctx.stroke();
      }
      if (first && f.label) ctx.fillText(f.label, first.x + 5, first.y + 3);
    }
  }
  ctx.restore();
}

/** Vertical colour bar with nice ticks and the contour interval. */
export function paintColorbar(ctx, {
  x, y, w = 10, h, lut, zMin, zMax, fmt = (v) => String(v), unit = '', step = null, ticks = 5, stepFmt = null,
  ink = INK, inkDim = INK_DIM, levelsOf = null,
}) {
  ctx.save();
  for (let i = 0; i < h; i++) {
    const li = Math.round((1 - i / Math.max(1, h - 1)) * 255) * 4;
    ctx.fillStyle = `rgb(${lut[li]},${lut[li + 1]},${lut[li + 2]})`;
    ctx.fillRect(x, y + i, w, 1);
  }
  ctx.strokeStyle = inkDim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.font = FONT(1);
  ctx.fillStyle = ink;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const span = zMax - zMin;
  // levelsOf (Mapping T1 MAP-T1-011) returns round levels chosen in the
  // DISPLAY unit, converted back to data units; the default picks them in
  // data units (round metres shown in feet read as -4790.0, -4855.6)
  const levels = span > 0 ? (levelsOf ? levelsOf(zMin, zMax, ticks) : contourLevels(zMin, zMax, ticks).levels) : [];
  const drawn = [];
  const put = (v, ty) => {
    if (drawn.some((d) => Math.abs(d - ty) < 9)) return;
    drawn.push(ty);
    ctx.beginPath(); ctx.moveTo(x - 3, ty); ctx.lineTo(x, ty); ctx.stroke();
    ctx.fillText(fmt(v), x - 5, ty);
  };
  ctx.strokeStyle = ink;
  put(zMax, y);
  put(zMin, y + h);
  for (const v of levels) {
    if (v <= zMin || v >= zMax) continue;
    put(v, y + h * (1 - (v - zMin) / span));
  }
  if (step > 0) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = inkDim;
    // an interval is a magnitude, whatever sign the labels use
    ctx.fillText(`CI ${String((stepFmt || fmt)(step)).replace(/^-/, '')}${unit ? ` ${unit}` : ''}`, x + w, y + h + 6);
  }
  ctx.restore();
}

/** Scale bar for an axis-aligned metre grid. */
export function paintScaleBar(ctx, { x, y, transform, maxPx = 180, ink = INK }) {
  drawScaleBar(ctx, { x, y, metersPerPx: transform.metersPerPx, dpr: 1, maxPx, ink });
}

/** North arrow for a grid whose y axis is grid north (screen up). */
export function paintNorthArrow(ctx, { x, y, ink = INK }) {
  const R = 14;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 1.5;
  ctx.font = FONT(1);
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - R * 0.72);
  ctx.lineTo(x + R * 0.3, y + R * 0.4);
  ctx.lineTo(x - R * 0.3, y + R * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('N', x, y - R - 3);
  ctx.restore();
}

/** Easting ticks along the bottom pad and northing ticks along the left
 *  pad (rotated), the tick step a nice number near 90 px. */
export function paintAxes(ctx, { transform, pad = FIT_PAD, targetPx = 90, ink = INK, inkDim = INK_DIM }) {
  const r = transform.visibleRect();
  const step = niceStepUp(targetPx * transform.metersPerPx);
  const { vw, vh } = transform;
  ctx.save();
  ctx.font = FONT(1);
  ctx.strokeStyle = inkDim;
  ctx.fillStyle = ink;
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = Math.ceil(r.x0 / step) * step; v <= r.x1 + 1e-9; v += step) {
    const sx = transform.worldToScreen(v, 0).x;
    if (sx < pad || sx > vw - pad) continue;
    ctx.beginPath(); ctx.moveTo(sx, vh - pad); ctx.lineTo(sx, vh - pad + 5); ctx.stroke();
    ctx.fillText(fmtTick(v, step), sx, vh - pad + 7);
  }
  ctx.textBaseline = 'bottom';
  for (let v = Math.ceil(r.y0 / step) * step; v <= r.y1 + 1e-9; v += step) {
    const sy = transform.worldToScreen(0, v).y;
    if (sy < pad || sy > vh - pad) continue;
    ctx.beginPath(); ctx.moveTo(pad - 5, sy); ctx.lineTo(pad, sy); ctx.stroke();
    ctx.save();
    ctx.translate(pad - 7, sy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(fmtTick(v, step), 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

/** Value under a screen point, null-aware. */
export function sampleAtScreen(grid, spec, transform, sx, sy) {
  const w = transform.screenToWorld(sx, sy);
  const { fx, fy } = worldToGridIndex(spec, w.x, w.y);
  if (fx < 0 || fy < 0 || fx > spec.nx - 1 || fy > spec.ny - 1) return { ...w, z: null };
  const c = Math.round(fx);
  const r = Math.round(fy);
  const v = grid[r * spec.nx + c];
  return { ...w, z: isNull(v) ? null : v };
}
