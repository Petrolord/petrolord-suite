// A registry surface's own lattice, kept on the RCP surface (ReservoirCalc
// Pro upgrade U2-005, 2026-10-01; closes RCP-U1-036).
//
// A geo_surfaces grid used to reach the volume engine as at most 5,000
// thinned points, re-gridded by inverse distance onto RCP's own cells:
// 30 percent low on an 11 x 9 grid, 2 to 3 percent at 41 x 41. The grid
// Mapping published is now kept as it is (its frame, rotation and node
// values, metres elevation) and the engine integrates on its nodes, so
// RCP and Mapping measure the same surface the same way.
//
// The node values travel with a saved project as base64 Float32 bytes,
// so a project reopened without the registry still has its lattice.
// Pure.

export const MAX_LATTICE_NODES = 400_000;

const DECODED = new WeakMap();

/** Float32 values as base64 (JSON-safe, 4 bytes a node). */
export function encodeF32(arr) {
  const f = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  const bytes = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

/** Inverse of encodeF32. */
export function decodeF32(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/**
 * The lattice record kept on a surface, or null when the grid is too
 * large to keep (the caller then says the points were thinned).
 * @param {{x0,y0,dx,dy,nx,ny,rotation_deg?}} spec the row's own frame
 * @param {ArrayLike<number>} gridM node values, metres elevation
 */
export function makeLattice(spec, gridM) {
  const n = spec.nx * spec.ny;
  if (!(n > 0) || gridM.length !== n || n > MAX_LATTICE_NODES) return null;
  const s = { x0: spec.x0, y0: spec.y0, dx: spec.dx, dy: spec.dy, nx: spec.nx, ny: spec.ny };
  if (Number(spec.rotation_deg)) s.rotation_deg = Number(spec.rotation_deg);
  return { spec: s, zB64: encodeF32(gridM), unit: 'm', convention: 'elevation' };
}

/** The decoded lattice of a surface ({spec, z}) or null. Cached per record. */
export function latticeOf(surface) {
  const L = surface?.lattice;
  if (!L || !L.spec || typeof L.zB64 !== 'string') return null;
  let z = DECODED.get(L);
  if (!z) {
    try { z = decodeF32(L.zB64); } catch { return null; }
    if (z.length !== L.spec.nx * L.spec.ny) return null;
    DECODED.set(L, z);
  }
  return { spec: L.spec, z };
}
