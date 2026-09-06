// Map annotations shared by the map viewports (Mapping MS1, 2026-09-05):
// the generic half of Seismolord's viewer/annotations.js, moved here at
// the second consumer (Seismolord re-exports these by identity; its
// survey-bound ticks, axes and amplitude colourbar stay there). Pure
// tick math plus thin canvas painters in device pixels (`dpr` scales
// the fonts; callers painting in CSS px pass dpr 1).

export { niceStepUp } from '@/lib/gridding/numeric';

/** Largest "nice" number (1/2/5 x 10^n) <= raw. */
export function niceStepDown(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const m = raw / mag;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * mag;
}

/** Format a tick value for its step (integers for integer steps). */
export function fmtTick(value, step) {
  if (step >= 1) return String(Math.round(value));
  const dp = Math.min(6, Math.max(0, -Math.floor(Math.log10(step))));
  return value.toFixed(dp);
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

export const FONT = (dpr) => `${Math.round(10 * dpr)}px ui-monospace, monospace`;
export const INK = 'rgba(203, 213, 225, 0.92)';      // slate-300
export const INK_DIM = 'rgba(148, 163, 184, 0.55)';  // slate-400

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
