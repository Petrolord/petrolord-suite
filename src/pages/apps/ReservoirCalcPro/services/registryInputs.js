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

import { unitToMetres } from '../../../../../packages/engines/lib/crs/catalog';

const NULL = (v) => !Number.isFinite(v) || Math.abs(v) >= 1e29;
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/**
 * One zone's thickness pair for RCP's GRV x NTG: the GROSS thickness and
 * the NTG that goes with it. RCP multiplies its thickness by NTG, so the
 * thickness must be gross; feeding net pay there applied NTG twice
 * (PETRO-U1-001: a zone with net 20 m, NTG 0.5 went in as 10 m of pay).
 * True vertical thickness (Petrophysics Studio publishes gross_tvt_m and
 * net_tvt_m from 2026-09-28) wins over the along-hole figure. A row with
 * net pay only reconstructs gross as net / NTG, or goes in with NTG 1.
 * @returns {?{gross: number, ntg: ?number}}
 */
export function zoneGrossAndNtg(p) {
  const fin = (v) => Number.isFinite(v);
  if (fin(p.gross_tvt_m) && p.gross_tvt_m > 0) {
    return { gross: p.gross_tvt_m, ntg: fin(p.net_tvt_m) ? p.net_tvt_m / p.gross_tvt_m : (fin(p.ntg) ? p.ntg : null) };
  }
  if (fin(p.gross_m) && p.gross_m > 0) {
    return { gross: p.gross_m, ntg: fin(p.ntg) ? p.ntg : (fin(p.net_m) ? p.net_m / p.gross_m : null) };
  }
  if (fin(p.net_m)) {
    if (fin(p.ntg) && p.ntg > 0) return { gross: p.net_m / p.ntg, ntg: p.ntg };
    return { gross: p.net_m, ntg: 1 };
  }
  return null;
}

/**
 * Average the PUBLISHED per-zone properties across wells that carry the
 * same zone (a prospect's reservoir), into RCP petrophysics inputs.
 * Thickness = mean GROSS thickness (vertical when published), NTG the
 * mean of the matching net-to-gross, so thickness x NTG is the mean net
 * pay; only zones with a published `properties` (an actual G2.5
 * publish) contribute.
 * @param {Array<{properties?: Object}>} zones
 * @returns {{porosity?: number, sw?: number, ntg?: number, thickness?: number,
 *            thicknessBasis?: string, fromWells: number}}
 */
export function zoneAveragesToInputs(zones) {
  const pub = (zones || []).map((z) => z.properties || {}).filter((p) => Number.isFinite(p.phi_avg) || Number.isFinite(p.net_m));
  const out = { fromWells: pub.length };
  // RCP-U1-018 (PL1): the averages RCP multiplies together must
  // reproduce the wells' total pore and hydrocarbon thickness, so NTG is
  // total net over total gross, porosity is net-thickness weighted and Sw
  // is pore-thickness (net x porosity) weighted. Plain means of each
  // property were biased whenever wells differ in thickness (a thin wet
  // well counted as much as a thick oil well). Wells with no thickness
  // fall back to equal weights.
  const rows = pub.map((p) => {
    const pair = zoneGrossAndNtg(p);
    const net = pair && Number.isFinite(pair.ntg) ? pair.gross * pair.ntg : (pair ? pair.gross : null);
    return { p, pair, net: Number.isFinite(net) && net > 0 ? net : null };
  });
  const anyNet = rows.some((r) => r.net !== null);
  const wNet = (r) => (anyNet ? (r.net ?? 0) : 1);
  const wavg = (pairs) => {
    const live = pairs.filter(([v, w]) => Number.isFinite(v) && Number.isFinite(w) && w > 0);
    const sw = live.reduce((s, [, w]) => s + w, 0);
    return sw > 0 ? live.reduce((s, [v, w]) => s + v * w, 0) / sw : null;
  };
  const phi = wavg(rows.map((r) => [r.p.phi_avg, wNet(r)]));
  const sw = wavg(rows.map((r) => [r.p.sw_avg, wNet(r) * (Number.isFinite(r.p.phi_avg) ? r.p.phi_avg : (phi ?? 1))]));
  if (phi !== null) out.porosity = phi;
  if (sw !== null) out.sw = sw;
  const pairs = rows.map((r) => r.pair).filter(Boolean);
  const gross = avg(pairs.map((q) => q.gross));
  const withNtg = pairs.filter((q) => Number.isFinite(q.ntg));
  const sumGross = withNtg.reduce((s, q) => s + q.gross, 0);
  const ntg = sumGross > 0 ? withNtg.reduce((s, q) => s + q.gross * q.ntg, 0) / sumGross : null;
  if (gross !== null) {
    out.thickness = gross;
    out.thicknessBasis = pub.some((p) => Number.isFinite(p.gross_tvt_m)) ? 'gross, true vertical' : 'gross, along hole';
  }
  if (ntg !== null) out.ntg = ntg;
  out.weighting = anyNet ? 'net-thickness weighted porosity, pore-thickness weighted Sw, NTG as total net over total gross' : 'equal weights (no thickness published)';
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
  // MAP-U1-029: dx and dy are in the frame's XY unit (US survey feet on a
  // state plane); read as metres the area was 10.76 times too large
  let s = 1;
  try { s = unitToMetres(surface.xy_unit || 'm'); } catch { s = NaN; }
  if (!Number.isFinite(s)) throw new Error(`${surface.name || 'This surface'} is in a geographic CRS, so it has no area in square metres. Reproject it first.`);
  return live * surface.dx * surface.dy * s * s;
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
    if (z.thicknessBasis) provenance.thickness_basis = z.thicknessBasis;
    delete z.fromWells;
    delete z.thicknessBasis;
    delete z.weighting;
    Object.assign(patch, z);
  }
  if (surface && grid) {
    patch.area = surfaceArea(surface, grid, areaUnit);
    provenance.surface = surface.name || surface.id || null;
    provenance.area_unit = areaUnit;
  }
  return { patch, provenance };
}
