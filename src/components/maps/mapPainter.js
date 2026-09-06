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
import { isNull } from '@/lib/gridding/gridmath';
import {
  niceStepUp, fmtTick, drawScaleBar, INK, INK_DIM, FONT,
} from './annotations';
import { contourLabelPositions, isMajorLevel } from './contourLabels';
import { FIT_PAD } from './mapTransform';

export const MAP_BG = '#0f172a';
const LABEL_FONT = '10px sans-serif';
const MAX_CONTOUR_LEVELS = 400;

/** World extent of the grid NODES. */
export function nodeExtent(spec) {
  return {
    x0: spec.x0, y0: spec.y0,
    x1: spec.x0 + (spec.nx - 1) * spec.dx,
    y1: spec.y0 + (spec.ny - 1) * spec.dy,
  };
}

/** Offscreen bitmap of the grid through the LUT (row 0 = south). */
export function rasterBitmap({ grid, spec, lut, zMin, zMax, makeCanvas = () => document.createElement('canvas') }) {
  const { nx, ny } = spec;
  const rgba = buildMapPixels(grid, ny, nx, lut, zMin, zMax === zMin ? zMin + 1 : zMax);
  const c = makeCanvas();
  c.width = nx;
  c.height = ny;
  c.getContext('2d').putImageData(new ImageData(rgba, nx, ny), 0, 0);
  return c;
}

/**
 * Blit the bitmap over the CELL extent (each pixel centred on its
 * node), y flipped so bitmap row 0 lands on the southern edge.
 */
export function paintRaster(ctx, { bitmap, spec, transform, smoothing = true }) {
  const e = nodeExtent(spec);
  const a = transform.worldToScreen(e.x0 - spec.dx / 2, e.y0 - spec.dy / 2); // south-west corner
  const b = transform.worldToScreen(e.x1 + spec.dx / 2, e.y1 + spec.dy / 2); // north-east corner
  ctx.save();
  ctx.imageSmoothingEnabled = smoothing;
  ctx.translate(a.x, a.y);
  ctx.scale((b.x - a.x) / spec.nx, (b.y - a.y) / spec.ny); // negative y: flip
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
      out[k] = spec.x0 + poly[k] * spec.dx;
      out[k + 1] = spec.y0 + poly[k + 1] * spec.dy;
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
  contours, transform, labels = true, majorEvery = 5, fmt = null,
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
    for (let k = 0; k < levels.length; k++) {
      if (!isMajorLevel(levels[k], step, majorEvery)) continue;
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

/** Well symbol kinds: 'circle' (default), 'ring' (planned), 'cross' (dry, plugged). */
export const defaultSymbol = (w) => {
  const s = String(w?.status || '').toLowerCase();
  if (s === 'planned' || s === 'proposed') return 'ring';
  if (s === 'dry' || s === 'plugged' || s === 'abandoned') return 'cross';
  return 'circle';
};

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
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      const b = transform.worldToScreen(p.x, p.y);
      if (Math.hypot(b.x - s.x, b.y - s.y) > 2) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ink;
        ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
      }
    }
    const kind = symbolOf(w);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1.5;
    if (kind === 'ring') {
      ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2); ctx.stroke();
    } else if (kind === 'cross') {
      ctx.beginPath();
      ctx.moveTo(s.x - 3.5, s.y - 3.5); ctx.lineTo(s.x + 3.5, s.y + 3.5);
      ctx.moveTo(s.x - 3.5, s.y + 3.5); ctx.lineTo(s.x + 3.5, s.y - 3.5);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    if (showNames || p) {
      const text = `${showNames ? w.name : ''}${p && Number.isFinite(p.z) ? `${showNames ? '  ' : ''}${fmt(p.z)}` : ''}`;
      if (text) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = halo;
        ctx.strokeText(text, s.x + 5, s.y + 3);
        ctx.fillStyle = label;
        ctx.fillText(text, s.x + 5, s.y + 3);
      }
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
          ctx.globalAlpha = 0.08;
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
}) {
  ctx.save();
  for (let i = 0; i < h; i++) {
    const li = Math.round((1 - i / Math.max(1, h - 1)) * 255) * 4;
    ctx.fillStyle = `rgb(${lut[li]},${lut[li + 1]},${lut[li + 2]})`;
    ctx.fillRect(x, y + i, w, 1);
  }
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.font = FONT(1);
  ctx.fillStyle = INK;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const span = zMax - zMin;
  const levels = span > 0 ? contourLevels(zMin, zMax, ticks).levels : [];
  const drawn = [];
  const put = (v, ty) => {
    if (drawn.some((d) => Math.abs(d - ty) < 9)) return;
    drawn.push(ty);
    ctx.beginPath(); ctx.moveTo(x - 3, ty); ctx.lineTo(x, ty); ctx.stroke();
    ctx.fillText(fmt(v), x - 5, ty);
  };
  ctx.strokeStyle = INK;
  put(zMax, y);
  put(zMin, y + h);
  for (const v of levels) {
    if (v <= zMin || v >= zMax) continue;
    put(v, y + h * (1 - (v - zMin) / span));
  }
  if (step > 0) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = INK_DIM;
    ctx.fillText(`CI ${(stepFmt || fmt)(step)}${unit ? ` ${unit}` : ''}`, x + w, y + h + 6);
  }
  ctx.restore();
}

/** Scale bar for an axis-aligned metre grid. */
export function paintScaleBar(ctx, { x, y, transform, maxPx = 180 }) {
  drawScaleBar(ctx, { x, y, metersPerPx: transform.metersPerPx, dpr: 1, maxPx });
}

/** North arrow for a grid whose y axis is grid north (screen up). */
export function paintNorthArrow(ctx, { x, y }) {
  const R = 14;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
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
export function paintAxes(ctx, { transform, pad = FIT_PAD, targetPx = 90 }) {
  const r = transform.visibleRect();
  const step = niceStepUp(targetPx * transform.metersPerPx);
  const { vw, vh } = transform;
  ctx.save();
  ctx.font = FONT(1);
  ctx.strokeStyle = INK_DIM;
  ctx.fillStyle = INK;
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
  const e = nodeExtent(spec);
  if (w.x < e.x0 || w.x > e.x1 || w.y < e.y0 || w.y > e.y1) return { ...w, z: null };
  const fx = (w.x - spec.x0) / spec.dx;
  const fy = (w.y - spec.y0) / spec.dy;
  const c = Math.round(fx);
  const r = Math.round(fy);
  const v = grid[r * spec.nx + c];
  return { ...w, z: isNull(v) ? null : v };
}
