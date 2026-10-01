// The app's real backend adapter (the Rock Physics Studio pair
// pattern): everything PPWorkstation touches goes through this one
// object so /dev/pore-pressure-studio can swap in inMemoryBackend and
// the WHOLE app runs without auth or DB.
//
// Reads go straight to the shared registry (src/lib/wellsRegistry.js:
// geo_wells, geo_wells_logs + f32 curve objects — RLS enforces
// ownership/org sharing server-side). The only write surface in P3 is
// pp_projects (owner-only, migration 20260714170000); publishing
// PP/FG/OBG curves to geo_wells_logs lands at P4 (plan Q4).

import { supabase } from '@/lib/customSupabaseClient';
import { registerStateKind, openStateRow, writeStamped } from '@/lib/stateVersion';
import {
  listWells, listLogs, downloadCurve, saveLogs, deleteLog,
} from '@/lib/wellsRegistry';
import { listVolumes, getManifest } from '@/pages/apps/Seismolord/services/volumesService';
import {
  listPublishedVelocityModels, resolveLayerCake, boundariesAt,
} from '@/lib/velocityModels';
import { listSurfaces, downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import { compareTags } from '@/lib/crs/tags';
import { getTransformer } from '@/lib/crs';
import { staleOwnCurves } from './publish';
import { getDepthUnit } from '@/lib/crs/settingsService';
import { projectWellIds } from './projectRow';
import { layerCakeAlongWell } from './alongHole';
import { wellDepthFrame } from './prep';
import { normalizeVelocity, layercakeDepthM } from '@/pages/apps/Seismolord/engine/velocityModel';

// ---- Seismolord velocity models (P4; layer cakes from Seismolord U2-006) ----
// Through the shared reader (src/lib/velocityModels): the volume row's
// model first (W0.2), the manifest as the fallback. A single V(z) samples
// directly; a layer cake is read at a well, through the boundary horizons
// Seismolord published as time surfaces.

async function listVelocityModels() {
  const entries = await listPublishedVelocityModels({ listVolumes, getManifest });
  return entries.map((e) => (e.kind === 'linear'
    ? {
      id: e.id, name: e.name, kind: 'linear', calibration: e.calibration,
      velocity: { v0: Number(e.model.v0), k: Number(e.model.k ?? 0) },
    }
    : {
      id: e.id, name: e.name, kind: 'layercake', calibration: e.calibration, velocity: e.velocity, entry: e,
    }));
}

/**
 * The layer cake's boundary times along a well (PP-U2-008): where the hole
 * crosses each boundary, through the well's survey, below the declared
 * seismic datum. A vertical well (no survey) reads them at the wellhead.
 */
async function layerCakeBoundariesAt(model, well, { srdElevM = 0 } = {}) {
  const resolved = await resolveLayerCake(model.entry, { surfaces: await listSurfaces(), downloadGrid: downloadSurfaceGrid });
  if (!resolved.ok) throw new Error(resolved.reason);
  let x = Number(well.surface_x);
  let y = Number(well.surface_y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`${well.name} has no surface location, so the layer cake cannot be read there.`);
  const surfCrs = resolved.boundaries[0]?.row?.crs || null;
  const rel = compareTags(well.crs, surfCrs);
  if (rel === 'transformable') {
    const p = getTransformer(well.crs, surfCrs).forward(x, y);
    x = p.x; y = p.y;
  } else if (rel === 'local-mismatch') {
    throw new Error(`${well.name} is on a local grid and the layer boundaries are not, so the layer cake cannot be read there.`);
  }
  // the survey offsets are metres east and north of the wellhead in the well's
  // frame; on a transformed CRS the offset is carried by the transform
  const toSurf = rel === 'transformable'
    ? (() => { const t = getTransformer(well.crs, surfCrs); return (dx, dy) => t.forward(Number(well.surface_x) + dx, Number(well.surface_y) + dy); })()
    : (dx, dy) => ({ x: x + dx, y: y + dy });
  const along = layerCakeAlongWell({
    sampleAt: (px, py) => { const q = toSurf(px - x, py - y); return boundariesAt(resolved, q.x, q.y); },
    layers: normalizeVelocity(model.velocity).layers,
    layercakeDepthM,
    surface: { x, y },
    frame: wellDepthFrame(well),
    srdElevM,
  });
  const boundaryTwtMs = along.boundaryTwtMs;
  const missing = boundaryTwtMs.map((v, i) => (v == null ? resolved.boundaries[i].row.name : null)).filter(Boolean);
  return {
    boundaryTwtMs,
    names: resolved.boundaries.map((b) => b.row.name),
    note: [along.note, missing.length ? `${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no value at ${well.name}; the layer above extends there.` : null].filter(Boolean).join(' '),
    crsStatus: rel,
  };
}

// ---- publish (P4, plan Q4) ----------------------------------------------------
// Overwrite-own: republish replaces only this engine's curves for the
// same well + mnemonic + project (the Petrophysics Studio contract).

async function publishCurves(wellId, preparedLogs, projectId) {
  const existing = await listLogs(wellId);
  for (const log of staleOwnCurves(existing, preparedLogs, projectId)) {
    await deleteLog(log);
  }
  return saveLogs(wellId, preparedLogs);
}

// ---- pp_projects (app-private workspace state) -------------------------------
// v1: one implicit project per user, created on first save (the
// petro_projects convention).

// PP0 state kind (docs/scope/ProjectPortability-PLAN.md §4.3): version 1 is
// the current row shape; a future shape change bumps `current` and adds
// migrations[n]. Rows open through openStateRow, writes go through writeStamped.
const PP_PROJECT_KIND = 'pp-project';
registerStateKind(PP_PROJECT_KIND, { current: 1, label: 'pore pressure project' });

async function loadProject() {
  const { data, error } = await supabase.from('pp_projects')
    .select('*').order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`Could not load the project: ${error.message}`);
  return openStateRow(PP_PROJECT_KIND, data?.[0] || null);
}

async function saveProject(patch) {
  const existing = await loadProject();
  if (existing) {
    const { data, error } = await writeStamped(PP_PROJECT_KIND,
      { ...patch, well_ids: projectWellIds(patch, existing), updated_at: new Date().toISOString() },
      (row) => supabase.from('pp_projects').update(row).eq('id', existing.id).select().single());
    if (error) throw new Error(`Could not save the project: ${error.message}`);
    return data;
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('You must be signed in to save projects.');
  const { data, error } = await writeStamped(PP_PROJECT_KIND,
    { user_id: user.id, name: 'Default project', ...patch, well_ids: projectWellIds(patch) },
    (row) => supabase.from('pp_projects').insert(row).select().single());
  if (error) throw new Error(`Could not save the project: ${error.message}`);
  return data;
}

export function makeRegistryBackend() {
  return {
    listWells,
    listLogs,
    downloadCurve,
    listVelocityModels,
    layerCakeBoundariesAt,
    getDepthUnit,
    publishCurves,
    loadProject,
    saveProject,
  };
}
