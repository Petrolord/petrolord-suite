// Registry input reader (Integration & Risking G5.1): shared-registry
// data -> ReservoirCalc Pro volumetric inputs, closing the loop without
// a file export. Pure mapping functions; the DB fetch (wellsRegistry
// listZones + surfacesRegistry) is a thin caller in the UI/context.
//
// Sources:
//   geo_wells_zones.properties — published by Petrophysics Studio G2.5:
//     { phi_avg, sw_avg, vsh_avg, ntg, net_m, gross_m, ... }
//   geo_surfaces + its f32 grid — planimetric area from the live nodes.
//
// RCP inputs consumed: { area, thickness, porosity, sw, ntg }. We never
// invent a value: a field with no registry source is left absent so the
// existing input keeps its manual value.

const NULL = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/**
 * Average the PUBLISHED per-zone properties across wells that carry the
 * same zone (a prospect's reservoir), into RCP petrophysics inputs.
 * Thickness = mean net pay (net_m); only zones with a published
 * `properties` (an actual G2.5 publish) contribute.
 * @param {Array<{properties?: Object}>} zones
 * @returns {{porosity?: number, sw?: number, ntg?: number, thickness?: number,
 *            fromWells: number}}
 */
export function zoneAveragesToInputs(zones) {
  const pub = (zones || []).map((z) => z.properties || {}).filter((p) => Number.isFinite(p.phi_avg) || Number.isFinite(p.net_m));
  const pick = (key) => avg(pub.map((p) => p[key]).filter(Number.isFinite));
  const out = { fromWells: pub.length };
  const phi = pick('phi_avg');
  const sw = pick('sw_avg');
  const ntg = pick('ntg');
  const net = pick('net_m');
  if (phi !== null) out.porosity = phi;
  if (sw !== null) out.sw = sw;
  if (ntg !== null) out.ntg = ntg;
  if (net !== null) out.thickness = net;
  return out;
}

/**
 * Planimetric area of a surface's live footprint = (# live nodes)·dx·dy,
 * in square metres. The gridding null sentinel marks empty nodes.
 * @param {{dx: number, dy: number}} surface @param {ArrayLike<number>} grid
 */
export function surfaceAreaM2(surface, grid) {
  let live = 0;
  for (let i = 0; i < grid.length; i++) if (!NULL(grid[i])) live += 1;
  return live * surface.dx * surface.dy;
}

const M2_PER_ACRE = 4046.8564224;
const M2_PER_KM2 = 1e6;

/** Surface area in the RCP area unit ('acres' | 'km2' | 'm2'). */
export function surfaceArea(surface, grid, unit = 'acres') {
  const m2 = surfaceAreaM2(surface, grid);
  if (unit === 'acres') return m2 / M2_PER_ACRE;
  if (unit === 'km2') return m2 / M2_PER_KM2;
  return m2;
}

/**
 * Build the partial RCP inputs patch from registry sources. Only the
 * fields with a real source are set; the caller merges over the current
 * inputs so manual values survive.
 * @param {{zones?: Array, surface?: Object, grid?: ArrayLike<number>, areaUnit?: string}} src
 * @returns {{patch: Object, provenance: Object}}
 */
export function buildRegistryInputs({ zones, surface, grid, areaUnit = 'acres' }) {
  const patch = {};
  const provenance = { source: 'shared-registry' };
  if (zones && zones.length) {
    const z = zoneAveragesToInputs(zones);
    provenance.wells_averaged = z.fromWells;
    delete z.fromWells;
    Object.assign(patch, z);
  }
  if (surface && grid) {
    patch.area = surfaceArea(surface, grid, areaUnit);
    provenance.surface = surface.name || surface.id || null;
    provenance.area_unit = areaUnit;
  }
  return { patch, provenance };
}
