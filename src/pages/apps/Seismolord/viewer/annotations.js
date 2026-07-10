// Viewer annotations: axis ticks/labels, scale bar, north arrow, colorbar.
// The tick/spacing/azimuth MATH is pure and jest-tested; the draw*
// functions are thin canvas-2D painters over that math. Everything maps
// through the shared ViewTransform, so annotations stay glued to the data
// under any zoom / pan / exaggeration — and any future overlay (well
// markers, measure tool) should follow the same pattern.

/** Largest "nice" number (1/2/5 x 10^n) <= raw. */
export function niceStepDown(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const m = raw / mag;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * mag;
}

/** Smallest "nice" number (1/2/5 x 10^n) >= raw. */
export function niceStepUp(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const m = raw / mag;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * mag;
}

/** Format a tick value for its step (integers for integer steps). */
export function fmtTick(value, step) {
  if (step >= 1) return String(Math.round(value));
  const dp = Math.min(6, Math.max(0, -Math.floor(Math.log10(step))));
  return value.toFixed(dp);
}

/**
 * Ticks along one axis of the visible view.
 *
 * World coordinates are data-cell indices (ViewTransform axes); each index
 * carries an annotation VALUE (inline/crossline number, TWT ms) that is
 * affine in the index: value = valueAtZero + index * valuePerCell.
 *
 * @param {Object} p
 * @param {number} p.world0 first visible world coordinate (cells)
 * @param {number} p.world1 last visible world coordinate (cells)
 * @param {number} p.worldMax data extent in cells (ticks clamp to data)
 * @param {number} p.pxPerCell pixels per world cell (transform.ppx/ppy)
 * @param {number} p.valueAtZero annotation value of cell index 0
 * @param {number} p.valuePerCell annotation value increment per cell
 * @param {number} [p.targetPx] preferred label spacing in px
 * @returns {{world: number, value: number, label: string}[]} tick world
 *   coords are CELL CENTRES (index + 0.5) so labels sit on the trace.
 */
export function axisTicks({
  world0, world1, worldMax, pxPerCell, valueAtZero, valuePerCell, targetPx = 90,
}) {
  if (!(pxPerCell > 0) || valuePerCell === 0) return [];
  const lo = Math.max(0, Math.min(world0, world1));
  const hi = Math.min(worldMax, Math.max(world0, world1));
  if (hi <= lo) return [];
  const rawValueStep = (targetPx / pxPerCell) * Math.abs(valuePerCell);
  const step = niceStepUp(rawValueStep);
  const vLo = valueAtZero + lo * valuePerCell;
  const vHi = valueAtZero + (hi - 1) * valuePerCell;
  const vMin = Math.min(vLo, vHi);
  const vMax = Math.max(vLo, vHi);
  const out = [];
  for (let v = Math.ceil(vMin / step) * step; v <= vMax + 1e-9; v += step) {
    const idx = (v - valueAtZero) / valuePerCell;
    if (idx < 0 || idx > worldMax - 1) continue;
    out.push({ world: idx + 0.5, value: v, label: fmtTick(v, step) });
  }
  return out;
}

/**
 * Scale-bar length: the longest nice distance that fits in maxPx.
 * @returns {{px: number, meters: number, label: string}|null}
 */
export function scaleBarSpec(metersPerPx, maxPx = 180) {
  if (!(metersPerPx > 0) || !Number.isFinite(metersPerPx)) return null;
  const meters = niceStepDown(maxPx * metersPerPx);
  const px = meters / metersPerPx;
  if (!(px > 4)) return null;
  const label = meters >= 1000
    ? `${fmtTick(meters / 1000, niceStepDown(meters / 1000))} km`
    : `${fmtTick(meters, meters)} m`;
  return { px, meters, label };
}

/**
 * Ground spacing per inline/crossline step from the manifest's corner
 * coordinates. Uses the same axis-aligned survey assumption as gridding
 * (picksToPoints): x varies along crosslines, y along inlines. Returns
 * null when the manifest has no usable corners (spacing then unknown —
 * callers must hide ground-distance UI rather than guess).
 * @returns {{xlSpacing:number, ilSpacing:number, dxPerXl:number,
 *   dyPerIl:number}|null}
 */
export function surveySpacing(manifest) {
  const g = manifest?.geometry;
  const c = g?.corners;
  if (!c?.first || !c?.last) return null;
  const nIl = g.il?.count || 0;
  const nXl = g.xl?.count || 0;
  if (nIl < 2 || nXl < 2) return null;
  const dxPerXl = (c.last.x - c.first.x) / (nXl - 1);
  const dyPerIl = (c.last.y - c.first.y) / (nIl - 1);
  if (!Number.isFinite(dxPerXl) || !Number.isFinite(dyPerIl)) return null;
  if (dxPerXl === 0 && dyPerIl === 0) return null;
  return {
    xlSpacing: Math.abs(dxPerXl), ilSpacing: Math.abs(dyPerIl), dxPerXl, dyPerIl,
  };
}

/**
 * Screen direction of grid north (+y world) on the time slice, under the
 * axis-aligned assumption above. Screen y is DOWN and inline index grows
 * downward, so north points down when world y grows with inline number.
 * @returns {{x:number, y:number}|null} unit screen vector, or null when
 *   the survey orientation is unknown.
 */
export function northScreenDir(manifest) {
  const s = surveySpacing(manifest);
  if (!s || s.dyPerIl === 0) return null;
  return { x: 0, y: s.dyPerIl > 0 ? 1 : -1 };
}

// ---------------------------------------------------------------------
// Painters. All take device-pixel coordinates; `font` scales with dpr so
// labels stay readable on hi-dpi screens.

const FONT = (dpr) => `${Math.round(10 * dpr)}px ui-monospace, monospace`;
const INK = 'rgba(203, 213, 225, 0.92)';      // slate-300
const INK_DIM = 'rgba(148, 163, 184, 0.55)';  // slate-400
const GUTTER_BG = 'rgba(2, 6, 23, 0.92)';     // slate-950
const GRID = 'rgba(148, 163, 184, 0.14)';

/**
 * Axis gutters (top = x axis, left = y axis) + optional grid lines.
 * @param {CanvasRenderingContext2D} ctx annotation canvas (full container)
 * @param {Object} p
 * @param {import('./viewTransform').ViewTransform} p.transform
 * @param {number} p.dpr @param {number} p.gutterLeft @param {number} p.gutterTop
 * @param {{title:string, valueAtZero:number, valuePerCell:number}} p.xAxis
 * @param {{title:string, valueAtZero:number, valuePerCell:number}} p.yAxis
 * @param {boolean} [p.grid] draw faint lines across the data area
 */
export function drawAxes(ctx, {
  transform: t, dpr, gutterLeft, gutterTop, xAxis, yAxis, grid = false,
}) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const r = t.visibleRect();

  ctx.save();
  ctx.fillStyle = GUTTER_BG;
  ctx.fillRect(0, 0, W, gutterTop);
  ctx.fillRect(0, 0, gutterLeft, H);
  ctx.font = FONT(dpr);
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = dpr;

  const xTicks = axisTicks({
    world0: r.x0, world1: r.x0 + r.w, worldMax: t.nx, pxPerCell: t.ppx,
    valueAtZero: xAxis.valueAtZero, valuePerCell: xAxis.valuePerCell,
    targetPx: 90 * dpr,
  });
  const yTicks = axisTicks({
    world0: r.y0, world1: r.y0 + r.h, worldMax: t.ny, pxPerCell: t.ppy,
    valueAtZero: yAxis.valueAtZero, valuePerCell: yAxis.valuePerCell,
    targetPx: 60 * dpr,
  });

  // top gutter: x ticks
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = INK;
  for (const tick of xTicks) {
    const sx = gutterLeft + t.worldToScreen(tick.world, 0).x;
    if (sx < gutterLeft - 1 || sx > W + 1) continue;
    ctx.beginPath();
    ctx.moveTo(sx, gutterTop - 4 * dpr);
    ctx.lineTo(sx, gutterTop);
    ctx.stroke();
    ctx.fillText(tick.label, sx, gutterTop - 5 * dpr);
  }
  // left gutter: y ticks
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const tick of yTicks) {
    const sy = gutterTop + t.worldToScreen(0, tick.world).y;
    if (sy < gutterTop - 1 || sy > H + 1) continue;
    ctx.beginPath();
    ctx.moveTo(gutterLeft - 4 * dpr, sy);
    ctx.lineTo(gutterLeft, sy);
    ctx.stroke();
    ctx.fillText(tick.label, gutterLeft - 6 * dpr, sy);
  }

  // axis titles in the corner block
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = INK_DIM;
  ctx.fillText(xAxis.title, gutterLeft + 4 * dpr, gutterTop - 4 * dpr);
  ctx.save();
  ctx.translate(gutterLeft - 6 * dpr, gutterTop + 4 * dpr);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'right';
  ctx.fillText(yAxis.title, 0, 0);
  ctx.restore();

  if (grid) {
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    for (const tick of xTicks) {
      const sx = gutterLeft + t.worldToScreen(tick.world, 0).x;
      ctx.moveTo(sx, gutterTop);
      ctx.lineTo(sx, H);
    }
    for (const tick of yTicks) {
      const sy = gutterTop + t.worldToScreen(0, tick.world).y;
      ctx.moveTo(gutterLeft, sy);
      ctx.lineTo(W, sy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Scale bar with end caps + centred distance label above it. */
export function drawScaleBar(ctx, { x, y, metersPerPx, dpr, maxPx }) {
  const spec = scaleBarSpec(metersPerPx, maxPx || 180 * dpr);
  if (!spec) return;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.5 * dpr;
  ctx.font = FONT(dpr);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.beginPath();
  ctx.moveTo(x, y - 5 * dpr); ctx.lineTo(x, y + 5 * dpr);
  ctx.moveTo(x, y); ctx.lineTo(x + spec.px, y);
  ctx.moveTo(x + spec.px, y - 5 * dpr); ctx.lineTo(x + spec.px, y + 5 * dpr);
  ctx.stroke();
  ctx.fillText(spec.label, x + spec.px / 2, y - 7 * dpr);
  ctx.restore();
}

/** North arrow: circle + arrow along `dir` (unit screen vector) + "N". */
export function drawNorthArrow(ctx, { x, y, dir, dpr }) {
  const R = 14 * dpr;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.5 * dpr;
  ctx.font = FONT(dpr);
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.stroke();
  const tipX = x + dir.x * R * 0.72;
  const tipY = y + dir.y * R * 0.72;
  const px = -dir.y;                       // perpendicular
  const py = dir.x;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(x - dir.x * R * 0.4 + px * R * 0.3, y - dir.y * R * 0.4 + py * R * 0.3);
  ctx.lineTo(x - dir.x * R * 0.4 - px * R * 0.3, y - dir.y * R * 0.4 - py * R * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = dir.y > 0 ? 'bottom' : 'top';
  ctx.fillText('N', x + dir.x * (R + 3 * dpr), y + dir.y * (R + 3 * dpr));
  ctx.restore();
}

/**
 * Vertical colorbar with the effective amplitude range at its ends
 * (amplitude that maps to the LUT extremes: +/- clip / gain).
 * @param {Uint8Array} lut 256x4 RGBA (SliceRenderer.lut)
 */
export function drawColorbar(ctx, { x, y, w, h, lut, ampAtEnds, dpr }) {
  ctx.save();
  for (let i = 0; i < h; i++) {
    // top = +amplitude (LUT end), bottom = -amplitude
    const li = Math.min(255, Math.max(0, Math.round(255 * (1 - i / (h - 1)))));
    ctx.fillStyle = `rgb(${lut[li * 4]}, ${lut[li * 4 + 1]}, ${lut[li * 4 + 2]})`;
    ctx.fillRect(x, y + i, w, 1.5);
  }
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = dpr;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  ctx.font = FONT(dpr);
  ctx.fillStyle = INK;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  const fmt = (v) => {
    const a = Math.abs(v);
    return a !== 0 && (a >= 1e4 || a < 1e-2) ? v.toExponential(1) : v.toPrecision(3);
  };
  ctx.fillText(`+${fmt(ampAtEnds)}`, x - 4 * dpr, y);
  ctx.textBaseline = 'middle';
  ctx.fillText('0', x - 4 * dpr, y + h / 2);
  ctx.textBaseline = 'bottom';
  ctx.fillText(`-${fmt(ampAtEnds)}`, x - 4 * dpr, y + h);
  ctx.restore();
}
