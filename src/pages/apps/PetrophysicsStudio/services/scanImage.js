// Image plumbing for the digitizer (PT7): the natural-pixel RGBA buffer
// the tracer needs, and a bounded data URL for the scan reader. Browser
// only (canvas); planDownscale and fitsBudget are pure so jest can pin
// the limits the edge function enforces.

export const SCAN_MAX_SIDE = 1600;
export const SCAN_MAX_BYTES = 1.5 * 1024 * 1024;

/** Longest side capped at maxSide, aspect kept, never upscaled. */
export function planDownscale(width, height, { maxSide = SCAN_MAX_SIDE } = {}) {
  const w = Math.max(1, Math.round(width || 1));
  const h = Math.max(1, Math.round(height || 1));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { scale, width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Approximate decoded byte size of a base64 data URL. */
export function dataUrlBytes(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  if (i < 0) return 0;
  const b64 = dataUrl.slice(i + 1);
  const pad = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
  return Math.floor((b64.length * 3) / 4) - pad;
}

export function fitsBudget(dataUrl, maxBytes = SCAN_MAX_BYTES) {
  return dataUrlBytes(dataUrl) <= maxBytes;
}

function drawTo(imgEl, width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imgEl, 0, 0, width, height);
  return c;
}

/** Natural-size RGBA buffer {width, height, data} for the tracer. */
export function imageToImageData(imgEl) {
  const w = imgEl.naturalWidth || imgEl.width;
  const h = imgEl.naturalHeight || imgEl.height;
  if (!(w > 0 && h > 0)) throw new Error('Load an image first.');
  const c = drawTo(imgEl, w, h);
  const id = c.getContext('2d').getImageData(0, 0, w, h);
  return { width: w, height: h, data: id.data };
}

/**
 * Data URL within the reader's limits: downscaled to maxSide, PNG when it
 * fits, otherwise JPEG at descending quality. Returns {dataUrl, width,
 * height, format, scale}.
 */
export function imageToDataUrl(imgEl, { maxSide = SCAN_MAX_SIDE, maxBytes = SCAN_MAX_BYTES } = {}) {
  const nw = imgEl.naturalWidth || imgEl.width;
  const nh = imgEl.naturalHeight || imgEl.height;
  const plan = planDownscale(nw, nh, { maxSide });
  const c = drawTo(imgEl, plan.width, plan.height);
  const png = c.toDataURL('image/png');
  if (fitsBudget(png, maxBytes)) return { dataUrl: png, width: plan.width, height: plan.height, format: 'png', scale: plan.scale };
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const jpg = c.toDataURL('image/jpeg', q);
    if (fitsBudget(jpg, maxBytes)) return { dataUrl: jpg, width: plan.width, height: plan.height, format: 'jpeg', scale: plan.scale };
  }
  throw new Error('The image is too large to send to the scan reader even after downscaling. Crop it and try again.');
}
