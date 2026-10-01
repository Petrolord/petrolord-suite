// The registry door (ReservoirCalc Pro RC1, 2026-09-06): what the Wells
// tab pulls from the shared Geoscience registry into the volumetric
// inputs, and how. Zone averages published by Petrophysics Studio
// (geo_wells_zones.properties) become porosity, Sw, NTG and gross
// thickness (RCP applies NTG to it); a registry surface's live footprint becomes the area; a
// boundary polygon drawn in Mapping (geo_culture) becomes an AOI. Pure
// planning over registryInputs; the panel fetches and applies.

import { zoneAveragesToInputs, surfaceArea } from './registryInputs';
import { canonicalUnitFor } from './unitsCatalog';
import { AOIManager } from './AOIManager';
import { isPrePt9aZone, PRE_PT9A_ZONE_NOTE } from '@/lib/petroProvenance';
import { polygonRingsOf } from '@/lib/culturePolygonFiles';

export const BOUNDARY_KINDS = Object.freeze(['boundary', 'license_block', 'lease', 'aoi', 'prospect']);
const M_PER_FT = 0.3048;

/** Zone names across the wells with counts and how many carry a publish. */
export function zoneCatalog(wells) {
  const byName = new Map();
  for (const w of wells || []) {
    for (const z of w.zones || []) {
      if (!z?.name) continue;
      const e = byName.get(z.name) || { name: z.name, wells: 0, published: 0 };
      e.wells += 1;
      const p = z.properties || {};
      if (Number.isFinite(p.phi_avg) || Number.isFinite(p.net_m)) e.published += 1;
      byName.set(z.name, e);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The inputs patch for one registry zone: averages across the wells that
 * carry it, thickness converted to the system's canonical length unit.
 * @returns {{patch: Object, provenance: Object, fromWells: number, wellNames: string[]}}
 */
export function registryPatchForZone(wells, zoneName, unitSystem = 'field') {
  const carrying = (wells || []).filter((w) => (w.zones || []).some((z) => z.name === zoneName));
  const zones = carrying.flatMap((w) => (w.zones || []).filter((z) => z.name === zoneName));
  const avg = zoneAveragesToInputs(zones);
  const fromWells = avg.fromWells;
  const thicknessBasis = avg.thicknessBasis || null;
  const weighting = avg.weighting || null;
  delete avg.fromWells;
  delete avg.thicknessBasis;
  delete avg.weighting;
  if (!fromWells) throw new Error(`No well carries a published average for zone ${zoneName}. Publish zone summaries from Petrophysics Studio first.`);
  const patch = { ...avg };
  if (Number.isFinite(patch.thickness)) {
    patch.thickness = canonicalUnitFor('thickness', unitSystem) === 'ft' ? patch.thickness / M_PER_FT : patch.thickness;
  }
  const wellNames = carrying.filter((w) => (w.zones || []).some((z) => z.name === zoneName && (Number.isFinite(z.properties?.phi_avg) || Number.isFinite(z.properties?.net_m)))).map((w) => w.name);
  // RCP-U1-018: a zone summary published before PT9a holds total porosity
  // (PETRO-U2-013); every reader names such wells
  const phitWells = carrying.filter((w) => (w.zones || []).some((z) => z.name === zoneName && isPrePt9aZone(z.properties))).map((w) => w.name);
  const notes = phitWells.length ? [`${phitWells.join(', ')}: ${PRE_PT9A_ZONE_NOTE}`] : [];
  return {
    patch,
    fromWells,
    wellNames,
    notes,
    provenance: { source: 'shared-registry', zone: zoneName, wells: wellNames, fields: Object.keys(patch), thickness_basis: thicknessBasis, weighting, total_porosity_wells: phitWells, pulled_at: new Date().toISOString() },
  };
}

/** The area patch for a registry surface in the system's canonical area unit. */
export function areaPatchForSurface(surface, grid, unitSystem = 'field') {
  const unit = canonicalUnitFor('area', unitSystem) === 'acre' ? 'acres' : 'km2';
  const area = surfaceArea(surface, grid, unit);
  if (!(area > 0)) throw new Error(`${surface.name} has no live nodes to measure.`);
  return { patch: { area }, provenance: { source: 'shared-registry', surface: surface.name, surface_id: surface.id, area_unit: unit, pulled_at: new Date().toISOString() } };
}

/** Culture rows the door offers as boundaries. */
export const isBoundaryLayer = (row) => BOUNDARY_KINDS.includes(row?.kind) && (row.geometry_type === 'polygon' || row.geometry_type === 'mixed' || !row.geometry_type);

/** An RCP AOI from a culture layer's first polygon ring. */
export function aoiFromBoundary(row, features) {
  // RCP-U1-027: every polygon of the layer becomes its own AOI (the door
  // took the first ring of the first feature, so a licence block in two
  // parts lost one without a word); the largest comes first
  const rings = polygonRingsOfFeatures(features);
  if (!rings.length) throw new Error(`${row.name} has no polygon to use as an AOI.`);
  return rings.map((ring, i) => {
    const aoi = AOIManager.createAOI(rings.length > 1 ? `${row.name} (part ${i + 1} of ${rings.length})` : row.name, ring.map(([x, y]) => ({ x, y })), '#22d3ee');
    aoi.source = { kind: 'geo_culture', id: row.id, name: row.name, layerKind: row.kind, part: i + 1, parts: rings.length, crs: row.crs || null };
    return aoi;
  });
}

/** Outer rings of every polygon in a feature list (the shared reader), largest first. */
export function polygonRingsOfFeatures(features) {
  const rings = polygonRingsOf(features);
  const area = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);
  return rings.sort((a, b) => area(b) - area(a));
}
/** Word a preview of what Apply would set. */
export function describePatch(patch, unitSystem = 'field') {
  const parts = [];
  if (Number.isFinite(patch.porosity)) parts.push(`porosity ${patch.porosity.toFixed(3)}`);
  if (Number.isFinite(patch.sw)) parts.push(`Sw ${patch.sw.toFixed(3)}`);
  if (Number.isFinite(patch.ntg)) parts.push(`NTG ${patch.ntg.toFixed(3)}`);
  if (Number.isFinite(patch.thickness)) parts.push(`gross thickness ${patch.thickness.toFixed(1)} ${canonicalUnitFor('thickness', unitSystem)}`);
  if (Number.isFinite(patch.area)) parts.push(`area ${patch.area.toFixed(1)} ${canonicalUnitFor('area', unitSystem) === 'acre' ? 'acres' : 'km2'}`);
  return parts.join(', ');
}
