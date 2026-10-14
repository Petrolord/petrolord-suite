/**
 * Suite Projects P1 gate (docs/scope/SuiteProject-DESIGN.md section 8): a
 * consultant with two clients, each with a project, loads wells into each,
 * and every Geoscience app sees only the current project's data.
 *
 * Twelve apps, each through the entry point the app itself uses:
 * Seismolord, Well Data Manager, Petrophysics, Well Correlation,
 * Stratigraphy, Mapping & Surface, Pore Pressure, Rock Physics, QI Studio,
 * Earth Modeling, Basin & Charge Modeling and ReservoirCalc Pro.
 * (Wellsite Studio keeps its own local wells and reads no registry.)
 *
 * The negative control at the end turns projects off and shows every app
 * then lists both clients' wells, so the scoping is what the test measures.
 */
import { makeFakeSupabase } from './fakeSupabase';

let mockFake;
jest.mock('@/lib/customSupabaseClient', () => ({
  get supabase() { return mockFake; },
}));


jest.mock('@/pages/apps/WellDataManager/services/lasImportService', () => ({}));
const scope = require('@/lib/projects/projectScope');

const PA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const PB = 'bbbbbbbb-0000-4000-8000-00000000000b';
const DEF = 'dddddddd-0000-4000-8000-00000000000d';
const ME = 'c0c0c0c0-0000-4000-8000-000000000001';

function apps() {
  const wdm = require('@/pages/apps/WellDataManager/services/registryBackend').makeRegistryBackend();
  const petro = require('@/pages/apps/PetrophysicsStudio/services/registryBackend').makeRegistryBackend();
  const corr = require('@/pages/apps/WellCorrelation/services/registryBackend').makeRegistryBackend();
  const strat = require('@/pages/apps/StratigraphyStudio/services/registryBackend').makeRegistryBackend();
  const mapping = require('@/pages/apps/MappingSurfaceStudio/services/registryBackend').makeRegistryBackend();
  const pp = require('@/pages/apps/PorePressureStudio/services/registryBackend').makeRegistryBackend();
  const rp = require('@/pages/apps/RockPhysicsStudio/services/registryBackend').makeRegistryBackend();
  const qi = require('@/pages/apps/QIStudio/services/registryBackend').makeRegistryBackend();
  const em = require('@/pages/apps/EarthModeling/services/registryBackend').makeRegistryBackend();
  const rcp = require('@/pages/apps/ReservoirCalcPro/services/rcpBackend').makeRegistryRcpBackend();
  const basin = require('@/pages/apps/BasinFlowGenesis/services/backend');
  const seisWells = require('@/pages/apps/Seismolord/services/wellsService');
  const seisVolumes = require('@/pages/apps/Seismolord/services/volumesService');
  const names = (rows) => (rows || []).map((r) => r.name || r.well_name).filter(Boolean).sort();
  const basinBackend = (basin.makeRegistryBackend || basin.makeBackend || basin.default)?.();
  const seisListWells = seisWells.listWells || seisWells.fetchWells || seisWells.loadWells;
  return {
    'Well Data Manager': async () => names(await wdm.listWells()),
    Petrophysics: async () => names(await petro.listWells()),
    'Well Correlation': async () => names(await corr.listWells()),
    Stratigraphy: async () => names(await strat.listWells()),
    'Mapping & Surface': async () => names(await mapping.listWells()),
    'Pore Pressure': async () => names(await pp.listWells()),
    'Rock Physics': async () => names(await rp.listWells()),
    'QI Studio': async () => names(await qi.listWells()),
    'Earth Modeling': async () => names(await (em.listWells || em.listRegistryWells)()),
    'ReservoirCalc Pro': async () => names(await rcp.wells.listWellsWithTops()),
    'Basin & Charge Modeling': async () => names(await basinBackend.listRegistryWells()),
    Seismolord: async () => [...names(await seisListWells()), ...names(await seisVolumes.listVolumes())].sort(),
  };
}

beforeEach(() => {
  jest.resetModules();
  mockFake = makeFakeSupabase({
    user: { id: ME },
    tables: {
      geo_wells: [{ id: 'legacy-1', user_id: ME, name: 'LEGACY-1', surface_x: 0, surface_y: 0, kb_m: 0, suite_project_id: null, deviation: [], checkshots: [] }],
      seismic_volumes: [
        { id: 'vol-a', user_id: ME, name: 'VOL-ALPHA', suite_project_id: PA, status: 'ready' },
        { id: 'vol-b', user_id: ME, name: 'VOL-BETA', suite_project_id: PB, status: 'ready' },
      ],
    },
  });
});

async function loadWells() {
  // the consultant loads one well in each client's project through Well Data Manager's own save
  const s = require('@/lib/projects/projectScope');
  const wdm = require('@/pages/apps/WellDataManager/services/registryBackend').makeRegistryBackend();
  s.setProjectScope({ enabled: true, projectId: PA, defaultProjectId: DEF });
  await wdm.saveWell({ name: 'ALPHA-1', surfaceX: 100, surfaceY: 200 });
  s.setProjectScope({ enabled: true, projectId: PB, defaultProjectId: DEF });
  await wdm.saveWell({ name: 'BETA-1', surfaceX: 300, surfaceY: 400 });
  return s;
}

test('each upload lands in the project that was current', async () => {
  await loadWells();
  const byName = Object.fromEntries(mockFake.db.geo_wells.map((w) => [w.name, w.suite_project_id]));
  expect(byName).toEqual({ 'LEGACY-1': null, 'ALPHA-1': PA, 'BETA-1': PB });
});

test('every Geoscience app sees only the current project', async () => {
  const s = await loadWells();
  const list = apps();
  expect(Object.keys(list)).toHaveLength(12);

  const seen = {};
  for (const [project, expectWells] of [[PA, ['ALPHA-1']], [PB, ['BETA-1']], [DEF, ['LEGACY-1']]]) {
    s.setProjectScope({ enabled: true, projectId: project, defaultProjectId: DEF });
    for (const [app, read] of Object.entries(list)) {
      const got = await read();
      seen[`${app} @ ${project.slice(0, 1)}`] = got;
      const wells = got.filter((n) => !n.startsWith('VOL-'));
      expect({ app, project, wells }).toEqual({ app, project, wells: expectWells });
    }
  }
  // Seismolord volumes follow the project too
  expect(seen['Seismolord @ a']).toContain('VOL-ALPHA');
  expect(seen['Seismolord @ a']).not.toContain('VOL-BETA');
  expect(seen['Seismolord @ b']).toEqual(['BETA-1', 'VOL-BETA']);
});

test('negative control: with projects off every app lists both clients', async () => {
  const s = await loadWells();
  s.setProjectScope({ enabled: false });
  for (const [app, read] of Object.entries(apps())) {
    const got = (await read()).filter((n) => !n.startsWith('VOL-'));
    expect({ app, got }).toEqual({ app, got: ['ALPHA-1', 'BETA-1', 'LEGACY-1'] });
  }
});

afterAll(() => scope._resetProjectScope());
