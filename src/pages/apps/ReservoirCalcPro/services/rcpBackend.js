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
export function makeInMemoryRcpBackend({ savedRows = [], prospects = [] } = {}) {
  const mapping = makeMappingInMemoryBackend();
  const ready = seedDome(mapping);
  // U1 (PL5): rows saved by earlier releases (services/savedFixtures.js),
  // newest first like the registry
  const rows = [...savedRows].reverse().map((r) => JSON.parse(JSON.stringify(r)));
  let seq = 0;
  const projects = {
    async getProjects() { return rows.map(fromRow); },
    async saveProject(projectData, isNew = false) {
      if (!projectData.user_id) throw new Error('Sign in to save projects.');
      if (isNew || !projectData.id) {
        seq += 1;
        const row = {
          id: `proj-${seq}`, user_id: projectData.user_id, project_name: projectData.name || 'Untitled Project',
          mode: projectData.calcMethod || 'deterministic', inputs_data: toBlob(projectData, 1),
          results_data: projectData.results || null, created_at: new Date(2026, 8, 6, 9, 0, seq).toISOString(),
        };
        rows.unshift(row);
        return fromRow(row);
      }
      const row = rows.find((r) => r.id === projectData.id);
      if (!row) throw new Error('Project not found.');
      Object.assign(row, {
        project_name: projectData.name || 'Untitled Project', mode: projectData.calcMethod || 'deterministic',
        inputs_data: toBlob(projectData, (projectData.version || 1) + 1), results_data: projectData.results || null,
      });
      return fromRow(row);
    },
    async deleteProject(id) { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); return true; },
    exportToJSON: ProjectService.exportToJSON,
    async importFromJSON(file, userId) {
      const json = JSON.parse(await file.text());
      if (!json.project) throw new Error('Invalid project file format.');
      const { id, created_at, updated_at, ...projectData } = json.project;
      return projects.saveProject({ ...projectData, user_id: userId, name: `${projectData.name || 'Project'} (Imported)`, version: 1 }, true);
    },
  };
  return {
    devUser: { id: 'user-dev', email: 'dev@petrolord.local' },
    projects,
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
    prospects: makeInMemoryProspectsBackend(prospects),
    async getDepthUnit() { return null; },
    scal: {
      async listScalProjects() { return [{ id: SCAL_SAMPLE.id, name: SCAL_SAMPLE.name, updatedAt: '2026-09-29T00:00:00Z' }]; },
      async loadScalProject(id) { return id === SCAL_SAMPLE.id ? JSON.parse(JSON.stringify(SCAL_SAMPLE)) : null; },
    },
  };
}
