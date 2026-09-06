// The registry door (ReservoirCalc Pro RC1, 2026-09-06): what the Wells
// tab pulls from the shared Geoscience registry into the volumetric
// inputs, and how. Zone averages published by Petrophysics Studio
// (geo_wells_zones.properties) become porosity, Sw, NTG and net
// thickness; a registry surface's live footprint becomes the area; a
// boundary polygon drawn in Mapping (geo_culture) becomes an AOI. Pure
// planning over registryInputs; the panel fetches and applies.

import { zoneAveragesToInputs, surfaceArea } from './registryInputs';
import { canonicalUnitFor } from './unitsCatalog';
import { AOIManager } from './AOIManager';
import { ringOf } from '@/pages/apps/MappingSurfaceStudio/services/polygonTools';

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
  delete avg.fromWells;
  if (!fromWells) throw new Error(`No well carries a published average for zone ${zoneName}. Publish zone summaries from Petrophysics Studio first.`);
  const patch = { ...avg };
  if (Number.isFinite(patch.thickness)) {
    patch.thickness = canonicalUnitFor('thickness', unitSystem) === 'ft' ? patch.thickness / M_PER_FT : patch.thickness;
  }
  const wellNames = carrying.filter((w) => (w.zones || []).some((z) => z.name === zoneName && (Number.isFinite(z.properties?.phi_avg) || Number.isFinite(z.properties?.net_m)))).map((w) => w.name);
  return {
    patch,
    fromWells,
    wellNames,
    provenance: { source: 'shared-registry', zone: zoneName, wells: wellNames, fields: Object.keys(patch), pulled_at: new Date().toISOString() },
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
  const ring = ringOf(features?.[0]);
  if (ring.length < 3) throw new Error(`${row.name} has no polygon to use as an AOI.`);
  const aoi = AOIManager.createAOI(row.name, ring.map(([x, y]) => ({ x, y })), '#22d3ee');
  aoi.source = { kind: 'geo_culture', id: row.id, name: row.name, layerKind: row.kind };
  return aoi;
}

/** Word a preview of what Apply would set. */
export function describePatch(patch, unitSystem = 'field') {
  const parts = [];
  if (Number.isFinite(patch.porosity)) parts.push(`porosity ${patch.porosity.toFixed(3)}`);
  if (Number.isFinite(patch.sw)) parts.push(`Sw ${patch.sw.toFixed(3)}`);
  if (Number.isFinite(patch.ntg)) parts.push(`NTG ${patch.ntg.toFixed(3)}`);
  if (Number.isFinite(patch.thickness)) parts.push(`net thickness ${patch.thickness.toFixed(1)} ${canonicalUnitFor('thickness', unitSystem)}`);
  if (Number.isFinite(patch.area)) parts.push(`area ${patch.area.toFixed(1)} ${canonicalUnitFor('area', unitSystem) === 'acre' ? 'acres' : 'km2'}`);
  return parts.join(', ');
}
