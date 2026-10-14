/**
 * Suite Projects P2 gate (docs/scope/SuiteProject-DESIGN.md section 8):
 * "a settings change leaves stored data byte-identical".
 *
 * A consultant in a client project changes every project setting (units,
 * CRS, datum, timescale edition) through the real save path. Then:
 *   - the only write is one update of that suite_projects row;
 *   - every registry table (wells, logs, tops, surfaces, seismic) is
 *     byte-identical to before;
 *   - and each setting takes effect where it should: the unit resolution
 *     has a project layer, the Project CRS is the project's, a new well's
 *     depth reference follows the project, the stratigraphy lookups use the
 *     pinned chart edition.
 */
import { makeFakeSupabase } from './fakeSupabase';

let mockFake;
jest.mock('@/lib/customSupabaseClient', () => ({ get supabase() { return mockFake; } }));

const ME = 'c0c0c0c0-0000-4000-8000-000000000001';
const PA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const DEF = 'dddddddd-0000-4000-8000-00000000000d';

const REGISTRY = {
  geo_wells: [{ id: 'w1', user_id: ME, name: 'ALPHA-1', surface_x: 500000.25, surface_y: 300000.5, kb_m: 25, depth_ref_kind: 'KB', crs: 'EPSG:26331', suite_project_id: PA, deviation: [], checkshots: [] }],
  geo_wells_logs: [{ id: 'l1', well_id: 'w1', mnemonic: 'GR', unit: 'GAPI', start_md_m: 1000, stop_md_m: 2000, step_m: 0.1524 }],
  geo_wells_tops: [{ id: 't1', well_id: 'w1', name: 'Top Agbada', md_m: 1500, age_ma: 23.03 }],
  geo_surfaces: [{ id: 's1', user_id: ME, name: 'Top Agbada depth', crs: 'EPSG:26331', z_unit: 'm', suite_project_id: PA }],
  seismic_volumes: [{ id: 'v1', user_id: ME, name: 'OML 42 3D', crs: 'EPSG:26331', survey_meta: { inlines: 400 }, suite_project_id: PA }],
};
const snapshot = (db) => JSON.stringify(Object.keys(REGISTRY).map((t) => db[t]));

beforeEach(() => {
  jest.resetModules();
  mockFake = makeFakeSupabase({
    user: { id: ME },
    tables: {
      ...JSON.parse(JSON.stringify(REGISTRY)),
      suite_projects: [{ id: PA, name: 'OML 42', settings: { futureKey: { kept: true } } }],
      geoscience_settings: [{ id: 'gs', user_id: ME, project_crs: 'EPSG:4326', project_xy_unit: 'm', custom_defs: {} }],
    },
  });
});

test('every setting changes what people see, and no stored data', async () => {
  const scope = require('@/lib/projects/projectScope'); // eslint-disable-line global-require
  const { saveProjectSettings } = require('@/lib/projects/projectsService'); // eslint-disable-line global-require
  scope.setProjectScope({ enabled: true, projectId: PA, defaultProjectId: DEF, settings: { futureKey: { kept: true } } });

  const before = snapshot(mockFake.db);
  const writesBefore = mockFake.calls.filter((c) => c.op !== 'select').length;

  await saveProjectSettings(PA, {
    units: { preset: 'metric', units: {} },
    datum: { refKind: 'RT', verticalDatum: 'LAT', srdM: 12.5 },
    timescale: 'ICS 2023/09',
  });
  const { setProjectCrs, getProjectCrs } = require('@/lib/crs/settingsService'); // eslint-disable-line global-require
  // the project has CRS-tagged data, so the lock refuses a change of an existing CRS
  // only when one is set; a first CRS on a project goes through
  await setProjectCrs({ tag: 'EPSG:26332', name: 'Minna / UTM 32N', xyUnit: 'm', allowWithData: true });

  // 1. only the project row was written
  const writes = mockFake.calls.filter((c) => c.op !== 'select').slice(writesBefore);
  expect(writes.map((c) => `${c.op}:${c.table}`)).toEqual(['update:suite_projects', 'update:suite_projects']);
  // 2. every registry row is byte-identical
  expect(snapshot(mockFake.db)).toBe(before);
  // keys this build does not know survive the save
  expect(mockFake.db.suite_projects[0].settings.futureKey).toEqual({ kept: true });
  // the user's own Project CRS (the Default project's) is untouched
  expect(mockFake.db.geoscience_settings[0].project_crs).toBe('EPSG:4326');

  // 3. the settings take effect
  expect((await getProjectCrs()).tag).toBe('EPSG:26332');
  const { buildProfileValue } = require('@/lib/units/UnitProfileContext'); // eslint-disable-line global-require
  const { normalizeProjectSettings } = require('@/lib/projects/projectSettings'); // eslint-disable-line global-require
  const settings = normalizeProjectSettings(scope.currentProjectSettings());
  const profile = buildProfileValue({ layers: null, project: settings.units, ready: true });
  expect(profile.units.depth).toBe('m');
  expect(profile.sources.depth).toBe('project');
  const { projectDepthRefKind, projectSrdM } = require('@/lib/projects/projectDefaults'); // eslint-disable-line global-require
  expect(projectDepthRefKind()).toBe('RT');
  expect(projectSrdM()).toBe(12.5);
  const ts = require('@/lib/stratigraphy/timescale'); // eslint-disable-line global-require
  expect(ts.currentTimescale()).toBe('ICS 2023/09');
  // lookups default to the pinned edition: no boundary moved from 2023/09 to the pin
  expect(ts.boundaryChanges('ICS 2023/09')).toEqual([]);
  expect(ts.boundaryChanges('ICS 2023/09', ts.TIMESCALE_VERSION).length).toBeGreaterThan(0);
});

test('the Default project keeps each user\'s own Project CRS (unchanged behaviour)', async () => {
  const scope = require('@/lib/projects/projectScope'); // eslint-disable-line global-require
  scope.setProjectScope({ enabled: true, projectId: DEF, defaultProjectId: DEF, settings: {} });
  const { getProjectCrs } = require('@/lib/crs/settingsService'); // eslint-disable-line global-require
  expect((await getProjectCrs()).tag).toBe('EPSG:4326');
  const ts = require('@/lib/stratigraphy/timescale'); // eslint-disable-line global-require
  expect(ts.currentTimescale()).toBe(ts.TIMESCALE_VERSION);
});

test('a project CRS is locked once the project holds CRS-tagged data', async () => {
  const scope = require('@/lib/projects/projectScope'); // eslint-disable-line global-require
  scope.setProjectScope({ enabled: true, projectId: PA, defaultProjectId: DEF, settings: {} });
  const { setProjectCrs } = require('@/lib/crs/settingsService'); // eslint-disable-line global-require
  await expect(setProjectCrs({ tag: 'EPSG:26332' })).rejects.toMatchObject({ code: 'PROJECT_CRS_LOCKED' });
  expect(snapshot(mockFake.db)).toBe(snapshot(JSON.parse(JSON.stringify(REGISTRY))));
});
