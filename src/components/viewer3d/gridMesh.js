// Grid to triangle mesh (lifted from Seismolord viewer/interpMesh.js
// horizonMesh at the third consumer, Earth Modeling EM6, 2026-09-06).
// Null samples make holes: a triangle is emitted only when all three
// corners are live, and the quad diagonal is chosen so a single null
// corner still yields the one valid triangle. Large grids are decimated
// by an integer stride per axis so the vertex lattice stays at most
// maxDim x maxDim (last row and column always kept). Pure, no WebGL.

/** '#rrggbb' -> [r, g, b] in 0..1 (renderer color uniforms). */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [1, 1, 1];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/**
 * @param {ArrayLike<number>} values row-major nRows x nCols
 * @param {number} nRows @param {number} nCols
 * @param {(row:number, col:number, value:number) => number[]|null} toXYZ
 *   model-space position of a live sample, or null for a null sample
 * @param {{maxDim?: number, colorOf?: (row, col, value) => number[]}} [opts]
 *   colorOf (optional) gives an [r, g, b] per vertex -> `colors`
 * @returns {{positions: Float32Array, indices: Uint32Array, colors?: Float32Array,
 *            vertexCount: number, triangleCount: number}}
 */
export function gridMesh(values, nRows, nCols, toXYZ, opts = {}) {
  const maxDim = opts.maxDim || 512;
  const stepR = Math.max(1, Math.ceil(nRows / maxDim));
  const stepC = Math.max(1, Math.ceil(nCols / maxDim));
  const rows = [];
  for (let i = 0; i < nRows; i += stepR) rows.push(i);
  if (rows[rows.length - 1] !== nRows - 1) rows.push(nRows - 1);
  const cols = [];
  for (let x = 0; x < nCols; x += stepC) cols.push(x);
  if (cols[cols.length - 1] !== nCols - 1) cols.push(nCols - 1);

  const nR = rows.length;
  const nC = cols.length;
  const positions = new Float32Array(nR * nC * 3);
  const colors = opts.colorOf ? new Float32Array(nR * nC * 3) : null;
  const live = new Uint8Array(nR * nC);
  for (let r = 0; r < nR; r++) {
    const row = rows[r];
    for (let c = 0; c < nC; c++) {
      const col = cols[c];
      const v = values[row * nCols + col];
      const k = r * nC + c;
      const p = toXYZ(row, col, v);
      if (!p) continue;
      live[k] = 1;
      positions[k * 3] = p[0];
      positions[k * 3 + 1] = p[1];
      positions[k * 3 + 2] = p[2];
      if (colors) {
        const cc = opts.colorOf(row, col, v);
        colors[k * 3] = cc[0]; colors[k * 3 + 1] = cc[1]; colors[k * 3 + 2] = cc[2];
      }
    }
  }
  const idx = [];
  for (let r = 0; r < nR - 1; r++) {
    for (let c = 0; c < nC - 1; c++) {
      const a = r * nC + c;
      const b = r * nC + c + 1;
      const d = (r + 1) * nC + c;
      const e = (r + 1) * nC + c + 1;
      if (live[a] && live[b] && live[e]) idx.push(a, b, e);
      if (live[a] && live[e] && live[d]) idx.push(a, e, d);
      else if (!live[e] && live[a] && live[b] && live[d]) idx.push(a, b, d);
      else if (!live[a] && live[b] && live[e] && live[d]) idx.push(b, e, d);
    }
  }
  return {
    positions,
    indices: Uint32Array.from(idx),
    ...(colors ? { colors } : {}),
    vertexCount: nR * nC,
    triangleCount: idx.length / 3,
  };
}
