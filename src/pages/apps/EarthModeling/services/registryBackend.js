// The real backend adapter (Earth Modeling G8.2/G8.3): everything
// EarthWorkstation touches goes through this one object, so the
// /dev/earth-modeling harness swaps in inMemoryBackend and the whole
// app runs without auth or DB (the house pattern).
//
// Reads: wells + tops + zones from the shared well registry, surfaces
// from geo_surfaces. Writes: geo_surfaces (the publish action — the
// ReservoirCalc Pro handoff) and em_models (app-private model
// definitions, owner-only RLS; named em_models because a legacy
// pre-G8 em_projects orphan exists in the live DB — see the
// 20260714130000 migration header).

import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';
import { listWellsWithTops, listZones, listLogs, downloadCurve } from '@/lib/wellsRegistry';
import { listSurfaces, saveSurface, downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import { listCulture, downloadCultureFeatures } from '@/lib/cultureRegistry';
import { POLYGON_KINDS, ringOf } from '@/pages/apps/MappingSurfaceStudio/services/polygonTools';
import { polygonRingsOf } from '@/lib/culturePolygonFiles';
import { getDepthUnit, setDepthUnit, getProjectCrs } from '@/lib/crs/settingsService';
import { listSeismicFaultsForModel } from '@/lib/seismicFaultsReader';
import { getTransformer } from '@/lib/crs';

/** Seismolord U2-003 (EM-T1-010): interpreted faults, read only, in the Project CRS. */
export async function listSeismicFaults() {
  const { tag, customDefs } = await getProjectCrs().catch(() => ({ tag: null, customDefs: {} }));
  return listSeismicFaultsForModel({
    supabase, hostCrs: tag && tag !== 'UNKNOWN' ? tag : null, getTransformer, customDefs,
  });
}

/**
 * Polygons from geo_culture as vertex lists the block engine takes
 * (Mapping MS5; U1 EM-U1-012). EVERY closed ring of a row counts: a
 * fault-polygon file imported in Mapping (U2-004) holds many faults in one
 * row, and the first ring alone silently dropped the rest. Fault rows give
 * one entry per ring (`id`, then `id#2`, ...); boundary rows give one
 * entry whose `rings` the model clips to as a union. The row's CRS rides
 * along so the build can refuse a polygon from another system. A layer
 * whose features cannot be read is skipped, not fatal.
 */
export function culturePolygonEntries(row, feats, { split = true } = {}) {
  const rings = polygonRingsOf(feats);
  if (!rings.length) {
    const ring = ringOf(feats?.[0]);
    if (ring.length >= 3) rings.push(ring);
  }
  if (!rings.length) return [];
  const base = { is_own: !!row.is_own, source: 'geo_culture', crs: row.crs || null };
  if (!split) return [{ ...base, id: row.id, name: row.name, vertices: rings[0], rings }];
  return rings.map((ring, i) => ({ ...base, id: i ? `${row.id}#${i + 1}` : row.id, name: i || rings.length > 1 ? `${row.name} (${i + 1})` : row.name, vertices: ring }));
}

export async function listCulturePolygons(kind, { split = true } = {}) {
  const rows = (await listCulture()).filter((c) => c.kind === kind);
  const out = [];
  for (const row of rows) {
    try {
      out.push(...culturePolygonEntries(row, await downloadCultureFeatures(row), { split }));
    } catch { /* unreadable layer: leave it out */ }
  }
  return out;
}
export const listCultureFaultPolygons = () => listCulturePolygons(POLYGON_KINDS.fault);
/** Boundary polygons drawn in Mapping (geo_culture kind boundary; EM0). */
export const listCultureBoundaries = () => listCulturePolygons(POLYGON_KINDS.boundary, { split: false });

// PP0 state kind (docs/scope/ProjectPortability-PLAN.md §4.3): version 1 is
// the current row shape; a future shape change bumps `current` and adds
// migrations[n]. Rows open through openStateRow, writes go through writeStamped.
const EM_MODEL_KIND = 'em-model';
registerStateKind(EM_MODEL_KIND, { current: 1, label: 'earth model' });

async function listProjects() {
  const { data, error } = await supabase.from('em_models')
    .select('*').order('updated_at', { ascending: false });
  if (error) throw new Error(`Could not load models: ${error.message}`);
  return (data || []).map((row) => openStateRow(EM_MODEL_KIND, row));
}

async function saveProject({ name, definition, crs = null }) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save models.');
  const { data, error } = await writeStamped(EM_MODEL_KIND,
    { user_id: user.id, name, definition, crs },
    (row) => supabase.from('em_models').insert(row).select().single());
  if (error) throw new Error(`Could not save the model: ${error.message}`);
  return data;
}

async function updateProject(id, patch) {
  const { data, error } = await writeStamped(EM_MODEL_KIND,
    { ...patch, updated_at: new Date().toISOString() },
    (row) => supabase.from('em_models').update(row).eq('id', id).select().single());
  if (error) throw new Error(`Could not update the model: ${error.message}`);
  return data;
}

async function deleteProject(id) {
  const { error } = await supabase.from('em_models').delete().eq('id', id);
  if (error) throw new Error(`Could not delete the model: ${error.message}`);
}

export function makeRegistryBackend() {
  return {
    async listWells() {
      const wells = await listWellsWithTops();
      return Promise.all(wells.map(async (w) => ({
        ...w,
        zones: w.is_own || w.organization_id ? await listZones(w.id).catch(() => []) : [],
      })));
    },
    listSurfaces,
    downloadSurfaceGrid,
    saveSurface,
    // EM3: curves for the section window's GR columns
    listLogs,
    downloadCurve,
    listFaultPolygons: listCultureFaultPolygons,
    listSeismicFaults,
    listBoundaries: listCultureBoundaries,
    // EM0: the account's Geoscience depth unit (geoscience_settings.depth_unit)
    getDepthUnit,
    setDepthUnit,
    listProjects,
    saveProject,
    updateProject,
    deleteProject,
  };
}
