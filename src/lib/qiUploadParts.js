// Part bodies for a virtual (cropped) file in the resumable upload
// (2026-10-15, QI round 3). A cropped file has no bytes on disk: each part is
// produced by reading the cropped SEG-Y, and the cropped reader allocates
// about three times what it is asked for (the output, the whole-trace block,
// the source chunks). Asking for a 64 MiB part at once, two lanes, held about
// 1.3 GB in the renderer during the crop build's live test. The part is now
// read in pieces of pieceBytes; in a browser each piece goes straight into a
// Blob (the browser keeps Blob data outside the page's heap, and XHR sends a
// Blob from there), so the page holds one piece at a time per lane. Without
// Blobs (tests, fetchImpl) the pieces are copied into one Uint8Array.
// The part numbers, sizes and bytes are unchanged, so resume is unaffected.
export const VIRTUAL_PIECE_BYTES = 8 * 1024 * 1024;

/**
 * @param {{read: (offset: number, length: number) => Promise<ArrayBuffer>}} file
 * @param {number} start
 * @param {number} size
 * @param {{pieceBytes?: number, asBlob?: boolean, BlobImpl?: typeof Blob}} [o]
 * @returns {Promise<Blob|Uint8Array>}
 */
export async function readVirtualPart(file, start, size, { pieceBytes = VIRTUAL_PIECE_BYTES, asBlob = false, BlobImpl = typeof Blob === 'undefined' ? null : Blob } = {}) {
  const step = Math.max(1, Math.min(pieceBytes, size || 1));
  if (asBlob && BlobImpl) {
    const pieces = [];
    for (let at = 0; at < size; at += step) pieces.push(new BlobImpl([await file.read(start + at, Math.min(step, size - at))]));
    return new BlobImpl(pieces);
  }
  const out = new Uint8Array(size);
  for (let at = 0; at < size; at += step) out.set(new Uint8Array(await file.read(start + at, Math.min(step, size - at))), at);
  return out;
}
