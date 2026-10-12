// Source freshness in ReservoirCalc Pro (2026-10-12; shared model in
// src/lib/sourceFreshness). What the open workspace took from the shared
// registry, read again as it is now, and the app's own pulls run again on
// "Refresh from source":
//
//   zone averages  registryProvenance.zone.sources   geo_wells_zones, content (published properties, interval)
//   footprint area registryProvenance.area           geo_surfaces, content; before 2026-10-12: updated_at after pulled_at
//   surfaces       surfaces[].registrySource         geo_surfaces, content; before: updated_at after the import (createdAt)
//   boundary AOIs  aois[].source (geo_culture)       geo_culture, content; before: updated_at after the AOI was made
//
// A zone average pulled before 2026-10-12 kept well names and no zone ids,
// so it has no reference and no notice (pull it again once to start).
// Pure apart from the backend reads the functions are handed.

import { registryPatchForZone, areaPatchForSurface, aoiFromBoundary } from './registryDoor';
import { surfaceFromRegistryRow } from './surfaceDoor';

/**
 * The source references of the workspace.
 * @param {object} state the ReservoirCalc state (inputs, surfaces, aois, activeAoiId, inputMethod)
 */
export function rcpSourceRefs(state) {
  const refs = [];
  const prov = state?.inputs?.registryProvenance || {};
  const method = state?.inputMethod || 'simple';
  for (const s of prov.zone?.sources || []) {
    if (s?.key && s.id) refs.push({ ...s, affects_results: true, pull: 'zone' });
  }
  const area = prov.area;
  if (area?.surface_id) {
    const base = area.source_ref || { key: `area:${area.surface_id}`, kind: 'geo_surfaces', id: area.surface_id, used_at: area.pulled_at || null };
    refs.push({ ...base, name: base.name || area.surface, affects_results: method === 'simple', pull: 'area' });
  }
  const top = state?.inputs?.topSurfaceId;
  const bottom = state?.inputs?.baseSurfaceId;
  for (const surf of Object.values(state?.surfaces || {})) {
    if (!surf?.registryId) continue;
    const base = surf.registrySource || { kind: 'geo_surfaces', id: surf.registryId, used_at: surf.createdAt || null };
    const inUse = method !== 'simple' && method !== 'areadepth' && (surf.id === top || surf.id === bottom);
    refs.push({ ...base, key: `surface:${surf.id}`, id: surf.registryId, name: surf.registryName || surf.name, affects_results: inUse, pull: 'surface', rcp_surface_id: surf.id });
  }
  const seen = new Set();
  for (const aoi of state?.aois || []) {
    const src = aoi?.source;
    if (src?.kind !== 'geo_culture' || !src.id || seen.has(src.id)) continue;
    seen.add(src.id);
    const parts = (state.aois || []).filter((a) => a.source?.kind === 'geo_culture' && a.source.id === src.id);
    const base = src.ref || { kind: 'geo_culture', id: src.id, used_at: aoi.createdAt || null };
    refs.push({
      ...base, key: `aoi:${src.id}`, id: src.id, name: src.name, pull: 'aoi',
      affects_results: method !== 'simple' && parts.some((a) => a.id === state.activeAoiId),
    });
  }
  return refs;
}

/** Wells with their zones, the way the Wells tab reads them. */
async function wellsWithZones(backend, onlyIds = null) {
  const ws = backend?.wells ? await backend.wells.listWellsWithTops() : [];
  const pick = onlyIds ? ws.filter((w) => onlyIds.has(w.id)) : ws;
  return Promise.all(pick.map(async (w) => ({
    ...w,
    zones: Array.isArray(w.zones) && w.zones.length ? w.zones : (backend?.wells?.listZones ? await backend.wells.listZones(w.id).catch(() => []) : []),
  })));
}

/**
 * The registry rows the references point at, as they are now: by ref key,
 * the row, null when it is gone (or no longer shared), and no entry when it
 * could not be read.
 */
export async function readRcpSources(backend, refs) {
  const out = new Map();
  const zoneRefs = refs.filter((r) => r.kind === 'geo_wells_zones');
  const surfRefs = refs.filter((r) => r.kind === 'geo_surfaces');
  const cultRefs = refs.filter((r) => r.kind === 'geo_culture');
  if (zoneRefs.length) {
    try {
      const all = await wellsWithZones(backend);
      for (const r of zoneRefs) {
        const w = all.find((x) => x.id === r.well_id);
        if (!w) { out.set(r.key, null); continue; }
        // by id; a zone written again under the same name in the same well is the same zone
        const z = (w.zones || []).find((x) => x.id === r.id) || (w.zones || []).find((x) => x.name === r.zone);
        out.set(r.key, z || null);
      }
    } catch { /* not readable: no entry, no notice */ }
  }
  if (surfRefs.length) {
    try {
      const rows = backend?.surfaces ? await backend.surfaces.listSurfaces() : null;
      if (rows) for (const r of surfRefs) out.set(r.key, rows.find((x) => x.id === r.id) || null);
    } catch { /* not readable */ }
  }
  if (cultRefs.length) {
    try {
      const rows = backend?.culture ? await backend.culture.listCulture() : null;
      if (rows) for (const r of cultRefs) out.set(r.key, rows.find((x) => x.id === r.id) || null);
    } catch { /* not readable */ }
  }
  return out;
}

/**
 * Who changed a zone: the well's change log names the person whose
 * statement wrote its zones ("Zones: 1 changed"), when the log is there.
 */
export async function zoneEditor(backend, result) {
  const r = result?.ref;
  if (r?.kind !== 'geo_wells_zones' || !r.well_id || !backend?.sharing?.history) return null;
  const log = await backend.sharing.history('geo_wells', r.well_id, { limit: 50 });
  const since = Date.parse(r.used_at || 0) || 0;
  const hit = (log || []).find((c) => c.action === 'updated' && (c.changed_fields || []).some((f) => /zone/i.test(String(f)))
    && Date.parse(c.changed_at) >= since);
  return hit?.changed_by_name || null;
}

/**
 * What "Refresh from source" does for one result: the pull the app already
 * has (the Wells tab and the surface import), run again on the row as it is
 * now. Returns what to apply; the context applies it.
 * @returns {Promise<{inputs?: object, surface?: object, aois?: {remove: string[], add: object[]}, log: [string, string]}>}
 */
export async function rcpRefreshPlan(result, { state, backend }) {
  const ref = result.ref;
  const unitSystem = state.unitSystem || 'field';
  const prov = state.inputs?.registryProvenance || {};
  if (ref.pull === 'zone') {
    const zp = prov.zone;
    const zoneName = zp?.zone || ref.zone;
    const leftOut = new Set(zp?.left_out || []);
    const wells = await wellsWithZones(backend);
    const carrying = wells.filter((w) => (w.zones || []).some((z) => z.name === zoneName));
    const used = carrying.filter((w) => !leftOut.has(w.name));
    const r = registryPatchForZone(used, zoneName, unitSystem, { inputMethod: state.inputMethod });
    const left = carrying.filter((w) => leftOut.has(w.name)).map((w) => w.name);
    const provenance = left.length ? { ...r.provenance, left_out: left } : r.provenance;
    return {
      inputs: { ...r.patch, registryProvenance: { ...prov, zone: provenance } },
      log: ['Registry inputs refreshed', `zone ${zoneName} read again from ${r.wellNames.join(', ')}`],
    };
  }
  if (ref.pull === 'area') {
    const rows = await backend.surfaces.listSurfaces();
    const s = rows.find((x) => x.id === ref.id);
    if (!s) throw new Error(`${ref.name || 'The surface'} is no longer in the registry.`);
    const grid = await backend.surfaces.downloadSurfaceGrid(s);
    const r = areaPatchForSurface(s, grid, unitSystem);
    return { inputs: { ...r.patch, registryProvenance: { ...prov, area: r.provenance } }, log: ['Registry area refreshed', `${s.name}: footprint measured again`] };
  }
  if (ref.pull === 'surface') {
    const rows = await backend.surfaces.listSurfaces();
    const row = rows.find((x) => x.id === ref.id);
    if (!row) throw new Error(`${ref.name || 'The surface'} is no longer in the registry.`);
    const grid = await backend.surfaces.downloadSurfaceGrid(row);
    const r = surfaceFromRegistryRow(row, grid);
    if (!r.ok) throw new Error(r.reason);
    const old = state.surfaces?.[ref.rcp_surface_id] || {};
    // the same id, so the Top and Base choices keep pointing at it
    return { surface: { ...r.surface, id: ref.rcp_surface_id, name: old.name || r.surface.name }, log: ['Surface refreshed', `${row.name} read again from the registry`] };
  }
  if (ref.pull === 'aoi') {
    const rows = await backend.culture.listCulture();
    const row = rows.find((x) => x.id === ref.id);
    if (!row) throw new Error(`${ref.name || 'The polygon layer'} is no longer in the registry.`);
    const feats = await backend.culture.downloadCultureFeatures(row);
    const add = aoiFromBoundary(row, feats);
    const remove = (state.aois || []).filter((a) => a.source?.kind === 'geo_culture' && a.source.id === row.id).map((a) => a.id);
    return { aois: { remove, add }, log: ['AOI refreshed', `${row.name}: ${add.length} polygon${add.length === 1 ? '' : 's'} read again`] };
  }
  throw new Error('This source has no refresh.');
}
