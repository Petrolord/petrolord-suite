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
import { supabaseSharingStore, makeHarnessSharing, colleagueShared } from '@/lib/recordSharing';

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
 * In-memory backend for the harness and jest: projects kept in a list
 * with the same row shape the registry returns, surfaces and wells from
 * the Mapping harness backend plus a seeded depth dome, no Seismolord
 * exports, in-memory prospects, and a dev user so Save works.
 */
export function makeInMemoryRcpBackend({ savedRows = [], prospects = [], sharedRows = false, sharing: sharingOpts = {} } = {}) {
  const mapping = makeMappingInMemoryBackend();
  const ready = seedDome(mapping);
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
  const projects = {
    async getProjects() { return (sharing.db.select(T, ME).data || []).map(fromRow); },
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
      listWellsWithTops: () => mapping.listWells(),
      async listZones(wellId) { const w = (await mapping.listWells()).find((x) => x.id === wellId); return (w?.zones || []).map((z, i) => ({ id: `${wellId}-z${i}`, well_id: wellId, ...z })); },
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
