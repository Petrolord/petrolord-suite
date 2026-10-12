// ReservoirCalc Pro backend pair (RC0, 2026-09-06): everything the app
// reads or writes outside its own state goes through one object, so
// the /dev/reservoircalc-pro harness runs the identical app on
// in-memory stores (the house pattern the other Geoscience apps use).
// The registry backend is the real thing: saved projects, the surface
// registry and Seismolord exports, the well registry, culture layers
// and the prospects table.

import { ProjectService, fromRow, toBlob } from './ProjectService';
import { listSurfaces, downloadSurfaceGrid } from '@/lib/surfacesRegistry';
import { listExportedSurfaces, downloadExportedSurface } from '@/pages/apps/Seismolord/services/exportsService';
import { listWellsWithTops, listZones } from '@/lib/wellsRegistry';
import { listCulture, downloadCultureFeatures } from '@/lib/cultureRegistry';
import { makeRegistryProspectsBackend, makeInMemoryProspectsBackend } from './prospectsService';
import { getDepthUnit } from '@/lib/crs/settingsService';
import { makeInMemoryBackend as makeMappingInMemoryBackend } from '@/pages/apps/MappingSurfaceStudio/services/inMemoryBackend';
import { createSavedProjectsService } from '@/utils/savedProjects';
import { supabaseSharingStore, makeHarnessSharing, colleagueShared, HARNESS_COLLEAGUE } from '@/lib/recordSharing';
import { registryPatchForZone } from './registryDoor';

// U2-007: SCAL Studio projects for Sw from saturation height (read only)
const scalProjects = createSavedProjectsService('saved_scal_projects');

/** The harness's one SCAL project (the Petrophysics harness sample). */
export const SCAL_SAMPLE = {
  id: 'scal-sample', name: 'Keta SAND J (sample)', schema: 1, samples: [],
  capillary: { jMode: 'manual', manual: { a: '0.25', b: '1.4', Swirr: '0.15' }, SwirrOverride: '', includedSampleIds: [], reservoir: { k_md: '150', phi: '0.22', sigma_dyncm: '26', thetaDeg: '30' } },
  height: { gammaW: '1.05', gammaHc: '0.80', fwl_tvdss: '6758.53', swMin: '0.2', swMax: '0.95' },
};

export function makeRegistryRcpBackend() {
  return {
    devUser: null,
    projects: ProjectService,
    surfaces: { listSurfaces, downloadSurfaceGrid, listExportedSurfaces, downloadExportedSurface },
    wells: { listWellsWithTops, listZones },
    culture: { listCulture, downloadCultureFeatures },
    prospects: makeRegistryProspectsBackend(),
    // RC2: the account's Geoscience depth unit (the Mapping setting)
    getDepthUnit,
    scal: { listScalProjects: () => scalProjects.list(), loadScalProject: (id) => scalProjects.load(id) },
    // U2-014 organisation sharing of projects and prospects
    sharing: supabaseSharingStore(),
  };
}

/** A dome in elevation metres (crest -1500 m) on the Mapping harness frame. */
function seedDome(mapping) {
  const spec = { x0: 500600, y0: 6699200, nx: 16, ny: 11, dx: 200, dy: 200 };
  const z = new Float32Array(spec.nx * spec.ny);
  for (let r = 0; r < spec.ny; r++) {
    for (let c = 0; c < spec.nx; c++) {
      const x = spec.x0 + c * spec.dx - 502100;
      const y = spec.y0 + r * spec.dy - 6700200;
      z[r * spec.nx + c] = -(1500 + 0.00012 * (x * x + y * y));
    }
  }
  return mapping.saveSurface({
    name: 'Harness Dome', kind: 'structure', spec, grid: z, zDomain: 'depth', zUnit: 'm', crs: null,
    provenance: { engine: 'reservoircalc-harness', z_convention: 'elevation' },
  });
}

/**
 * A top and base pair for the top/base surfaces check (RCP preview sizing,
 * 2026-10-12): the harness dome as "Ekene Sand Top" and the same dome 30 m
 * deeper as "Ekene Sand Base", both elevation metres on the dome's frame.
 * With a contact at -1560 m the gross rock between them is two paraboloid
 * caps, pi * h^2 / (2a) with a = 0.00012 per m: the top's 60 m cap less the
 * base's 30 m cap, 3.534e7 m3 (28,650 acre-ft).
 */
function seedTopBase(mapping) {
  const spec = { x0: 500600, y0: 6699200, nx: 16, ny: 11, dx: 200, dy: 200 };
  const surface = (name, shift) => {
    const z = new Float32Array(spec.nx * spec.ny);
    for (let r = 0; r < spec.ny; r++) {
      for (let c = 0; c < spec.nx; c++) {
        const x = spec.x0 + c * spec.dx - 502100;
        const y = spec.y0 + r * spec.dy - 6700200;
        z[r * spec.nx + c] = -(1500 + shift + 0.00012 * (x * x + y * y));
      }
    }
    return mapping.saveSurface({
      name, kind: 'structure', spec, grid: z, zDomain: 'depth', zUnit: 'm', crs: null,
      provenance: { engine: 'reservoircalc-harness', z_convention: 'elevation' },
    });
  };
  return Promise.all([surface('Ekene Sand Top', 0), surface('Ekene Sand Base', 30)]);
}

/**
 * In-memory backend for the harness and jest: projects kept in a list
 * with the same row shape the registry returns, surfaces and wells from
 * the Mapping harness backend plus a seeded depth dome, no Seismolord
 * exports, in-memory prospects, and a dev user so Save works.
 */
/** Harness zone rows: ids and a publish time, as listZones returns them. */
const HARNESS_ZONE_PUBLISHED = '2026-09-06T09:00:00.000Z';
function harnessZones(w, edits) {
  const edit = edits?.[w.id] || null;
  return (w.zones || []).map((z, i) => ({
    id: `${w.id}-z${i}`, well_id: w.id, updated_at: HARNESS_ZONE_PUBLISHED, ...z,
    ...(edit && edit.zone === z.name ? { properties: { ...z.properties, ...edit.properties }, updated_at: edit.updated_at, updated_by: edit.updated_by } : {}),
  }));
}

/**
 * Source freshness harness (?sourceChanged=1, 2026-10-12): KETA-2's Top
 * Dome zone is published again by a colleague after the project "Keta
 * source check" averaged it, and the project's imported surface has left
 * the registry. The project row is built from the registry as it was, so
 * the notice shows one change and one deletion.
 */
export const SOURCE_CHANGED_EDITS = Object.freeze({
  'map-w2': { zone: 'Top Dome', properties: { phi_avg: 0.23, ntg: 0.61 }, updated_at: '2026-10-08T14:20:00.000Z', updated_by: HARNESS_COLLEAGUE },
});
export const SOURCE_CHANGED_PROJECT = 'Keta source check';
async function sourceChangedRow(mapping) {
  const wells = (await mapping.listWells()).map((w) => ({ ...w, zones: harnessZones(w, null) }));
  const used = '2026-10-01T09:30:00.000Z';
  const r = registryPatchForZone(wells, 'Top Dome', 'field');
  const sources = r.provenance.sources.map((s) => ({ ...s, used_at: used }));
  const deterministic = {
    fluidType: 'oil', area: 1200, thickness: 150, ntg: 0.7, porosity: 0.22, sw: 0.3, fvf: 1.2, bg: 0.005, recovery: 25, recoveryGas: 70,
    pressure: 3500, temperature: 180, permeability: 100, api: 35, gasGrav: 0.7, owc: -8000, goc: -7000, fillToSpill: true,
    ...r.patch,
    registryProvenance: { zone: { ...r.provenance, pulled_at: used, sources } },
  };
  const pts = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pts.push({ x: 501000 + 500 * i, y: 6699500 + 500 * j, z: -1500 - 20 * (i + j) });
  const surface = {
    id: 'surf-retired', name: 'Top Dome v1', format: 'registry', points: pts, minZ: -1580, maxZ: -1500, avgZ: -1540, pointCount: 9,
    xyUnit: 'm', depthUnit: 'm', zConvention: 'elevation', crs: null, registryId: 'geo-retired', registryName: 'Top Dome v1', createdAt: used,
  };
  return {
    id: 'saved-source-check', user_id: 'user-dev', project_name: SOURCE_CHANGED_PROJECT, mode: 'deterministic', created_at: used,
    inputs_data: toBlob({ name: SOURCE_CHANGED_PROJECT, description: 'Zone averages from the registry (source freshness harness).', calcMethod: 'deterministic', inputMethod: 'simple', unitSystem: 'field', reservoirName: 'Top Dome', inputs: { deterministic, surfaces: [surface], polygons: [] } }, 1),
    results_data: null,
  };
}

export function makeInMemoryRcpBackend({ savedRows = [], prospects = [], sharedRows = false, sharing: sharingOpts = {}, sourceChanged = false, sourceEdits = SOURCE_CHANGED_EDITS, topBase = false } = {}) {
  const mapping = makeMappingInMemoryBackend();
  // sourceEdits null: the project is seeded, the registry left as it was (the negative control)
  const zoneEdits = sourceChanged ? sourceEdits : null;
  const ready = topBase ? seedDome(mapping).then(() => seedTopBase(mapping)) : seedDome(mapping);
  // U2-014: projects and prospects live in the in-memory mirror of the
  // sharing rules, so the harness shows the same control and refusals
  const sharing = makeHarnessSharing(sharingOpts);
  const ME = sharing.me;
  const T = 'saved_quickvol_projects';
  // U1 (PL5): rows saved by earlier releases (services/savedFixtures.js),
  // newest first like the registry
  sharing.db.seed(T, [...savedRows].reverse().map((r) => JSON.parse(JSON.stringify(r))), { owner: ME });
  if (sharedRows) {
    // two projects a colleague shared with the organisation (harness ?shared=1)
    const blob = (name) => toBlob({ name, description: 'Shared by a colleague.', calcMethod: 'deterministic' }, 1);
    sharing.db.seed(T, [
      colleagueShared({ id: 'proj-shared-view', project_name: 'Keta North (Ada)', mode: 'deterministic', inputs_data: blob('Keta North (Ada)'), results_data: null, created_at: new Date(2026, 8, 29, 9, 0, 0).toISOString() }),
      colleagueShared({ id: 'proj-shared-edit', project_name: 'Keta South, team copy', mode: 'deterministic', inputs_data: blob('Keta South, team copy'), results_data: null, created_at: new Date(2026, 8, 29, 10, 0, 0).toISOString() }, { access: 'edit' }),
    ]);
  }
  let seq = 0;
  let sourceSeeded = !sourceChanged;
  const projects = {
    async getProjects() {
      if (!sourceSeeded) { sourceSeeded = true; sharing.db.seed(T, [await sourceChangedRow(mapping)], { owner: ME }); }
      return (sharing.db.select(T, ME).data || []).map(fromRow);
    },
    async saveProject(projectData, isNew = false) {
      if (!projectData.user_id) throw new Error('Sign in to save projects.');
      if (isNew || !projectData.id) {
        seq += 1;
        const { data, error } = sharing.db.insert(T, ME, {
          id: `proj-${seq}`, user_id: projectData.user_id, project_name: projectData.name || 'Untitled Project',
          mode: projectData.calcMethod || 'deterministic', inputs_data: toBlob(projectData, 1),
          results_data: projectData.results || null, created_at: new Date(2026, 8, 6, 9, 0, seq).toISOString(),
        });
        if (error) throw new Error(error.message);
        return fromRow(data);
      }
      const nextVersion = (projectData.version || 1) + 1;
      const { data, error } = await sharing.store.update(T, projectData.id, {
        project_name: projectData.name || 'Untitled Project', mode: projectData.calcMethod || 'deterministic',
        inputs_data: toBlob(projectData, nextVersion), results_data: projectData.results || null,
      }, { note: `Project saved (v${nextVersion})` });
      if (error) throw new Error(error.name === 'RecordConflict' ? error.message : 'Project not found.');
      return fromRow(data);
    },
    async deleteProject(id) { sharing.db.remove(T, ME, id); return true; },
    exportToJSON: ProjectService.exportToJSON,
    async importFromJSON(file, userId) {
      const json = JSON.parse(await file.text());
      if (!json.project) throw new Error('Invalid project file format.');
      const { id, created_at, updated_at, ...projectData } = json.project;
      return projects.saveProject({ ...projectData, user_id: userId, name: `${projectData.name || 'Project'} (Imported)`, version: 1 }, true);
    },
  };
  return {
    devUser: { id: ME, email: 'dev@petrolord.local' },
    projects,
    sharing: sharing.store,
    /** test seam: the in-memory database and the colleague's store */
    _sharing: sharing,
    surfaces: {
      async listSurfaces() { await ready; return mapping.listSurfaces(); },
      downloadSurfaceGrid: (s) => mapping.downloadSurfaceGrid(s),
      async listExportedSurfaces() { return []; },
      async downloadExportedSurface() { throw new Error('No Seismolord exports in the harness.'); },
    },
    wells: {
      async listWellsWithTops() { return (await mapping.listWells()).map((w) => ({ ...w, zones: harnessZones(w, zoneEdits) })); },
      async listZones(wellId) { const w = (await mapping.listWells()).find((x) => x.id === wellId); return w ? harnessZones(w, zoneEdits) : []; },
    },
    culture: { listCulture: () => mapping.listCulture(), downloadCultureFeatures: (row) => mapping.downloadCultureFeatures(row) },
    prospects: makeInMemoryProspectsBackend(prospects, { sharing, sharedRows }),
    async getDepthUnit() { return null; },
    scal: {
      async listScalProjects() { return [{ id: SCAL_SAMPLE.id, name: SCAL_SAMPLE.name, updatedAt: '2026-09-29T00:00:00Z' }]; },
      async loadScalProject(id) { return id === SCAL_SAMPLE.id ? JSON.parse(JSON.stringify(SCAL_SAMPLE)) : null; },
    },
  };
}
