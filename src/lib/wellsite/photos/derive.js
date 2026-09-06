// Photo derive pipeline (WS4, spec sections 22 and 44): a captured file
// becomes a thumbnail (long edge 320 px) and a working image (long edge
// 2048 px), both WebP, plus the SHA-256 of the original bytes. The
// original is kept only when the well says so. Runs on the main thread
// with createImageBitmap (decoding is off-thread in the browser); jsdom
// has no canvas, so tests mock this module.

export const THUMB_MAX = 320;
export const WORKING_MAX = 2048;
export const ACCEPTED = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export async function sha256Hex(blob) {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

async function toBlob(canvas, type, quality) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function scaled(bitmap, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await toBlob(canvas, 'image/webp', quality);
  return { blob, width: w, height: h, bytes: blob.size };
}

/**
 * @param {File|Blob} file
 * @param {Object} [o] { keepOriginal }
 * @returns {Promise<{thumb, working, original, width, height, sha256, contentType}>}
 */
export async function derivePhotoVariants(file, { keepOriginal = false } = {}) {
  if (!file || !(file.size > 0)) throw new Error('The photo file is empty.');
  if (file.type && !ACCEPTED.includes(file.type)) throw new Error(`Photos must be JPEG, PNG, WebP or HEIC, not ${file.type}.`);
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const [working, thumb, sha256] = await Promise.all([scaled(bitmap, WORKING_MAX, 0.82), scaled(bitmap, THUMB_MAX, 0.7), sha256Hex(file)]);
    return {
      thumb, working,
      original: keepOriginal ? { blob: file, width: bitmap.width, height: bitmap.height, bytes: file.size, contentType: file.type || 'application/octet-stream' } : null,
      width: bitmap.width, height: bitmap.height, sha256, contentType: 'image/webp',
    };
  } finally { if (bitmap.close) bitmap.close(); }
}
