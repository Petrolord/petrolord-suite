// Depths on screen in the project's unit system (Field shows ft, Metric m).
// A registry surface is held in metres elevation whatever unit it was
// published in (surfaceDoor), so a feet surface in a Field project read
// "Min Z -1590.8 m" and the viewers said "DEPTH (M)". These helpers convert
// for display only; the stored surface and the volume engine are untouched.

export const FT_PER_M = 3.280839895;
const NULL_Z = 1e29;

/** The depth unit a project shows: ft for Field, m for Metric. */
export const projectDepthUnit = (unitSystem) => (unitSystem === 'metric' ? 'm' : 'ft');

/** Multiplier from one depth unit to another (1 when unknown or equal). */
export function depthFactor(from, to) {
  if (!from || !to || from === to) return 1;
  if (from === 'm' && to === 'ft') return FT_PER_M;
  if (from === 'ft' && to === 'm') return 1 / FT_PER_M;
  return 1;
}

/** A surface's Z range in the project's unit: {min, max, unit}. */
export function surfaceZRange(surface, unitSystem) {
  const unit = projectDepthUnit(unitSystem);
  const f = depthFactor(surface?.depthUnit || unit, unit);
  const v = (z) => (Number.isFinite(z) ? z * f : null);
  return { min: v(surface?.minZ), max: v(surface?.maxZ), unit };
}

/** A flat Z array scaled by f, nulls kept. */
export function scaleFlatZ(z, f) {
  if (!z || f === 1) return z;
  const out = new Float32Array(z.length);
  for (let i = 0; i < z.length; i++) {
    const v = z[i];
    out[i] = Number.isFinite(v) && Math.abs(v) < NULL_Z ? v * f : v;
  }
  return out;
}

/** An RCP grid ({x, y, z[ny][nx]}) with Z scaled by f, nulls kept. */
export function scaleRcpGrid(g, f) {
  if (!g || f === 1 || !Array.isArray(g.z)) return g;
  return {
    ...g,
    z: g.z.map((row) => (row || []).map((v) => {
      if (v === null || v === undefined || v === '') return v;
      const n = Number(v);
      return Number.isFinite(n) && Math.abs(n) < NULL_Z ? n * f : v;
    })),
  };
}
