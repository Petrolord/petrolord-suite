// Reproject-or-block flow, wells path: real proj4 math over an
// in-memory supabase. Surfaces/volumes/models storage plumbing is
// covered by their engine oracles (gridReproject / affineReproject);
// here the flow semantics are what is under test: skip-by-tag,
// azimuth rotation by convergence difference, chain provenance,
// idempotent rerun, and the setting moving last.

const db = {
  geoscience_settings: [{
    id: 'st1', user_id: 'user-1', project_crs: 'EPSG:23031',
    project_crs_name: 'ED50 / UTM zone 31N', project_xy_unit: 'm', custom_defs: {},
  }],
  geo_wells: [],
  geo_surfaces: [],
  seismic_volumes: [],
  em_models: [],
};

jest.mock('@/lib/customSupabaseClient', () => {
  const makeBuilder = (table) => {
    const st = { op: 'select', payload: null, filters: [], notNull: [], head: false };
    const rows = () => db[table].filter((r) => (
      st.filters.every(([c, v]) => r[c] === v) && st.notNull.every((c) => r[c] != null)
    ));
    const finish = () => {
      if (st.op === 'update') {
        const hit = rows();
        hit.forEach((r) => Object.assign(r, st.payload));
        return { data: hit[0] || null, error: null };
      }
      if (st.head) return { data: null, count: rows().length, error: null };
      return { data: rows(), count: rows().length, error: null };
    };
    const b = {
      select(_c, opts = {}) { st.head = !!opts.head; return b; },
      update(payload) { st.op = 'update'; st.payload = payload; return b; },
      insert(payload) {
        db[table].push({ id: `id-${db[table].length}`, ...payload });
        return b;
      },
      eq(c, v) { st.filters.push([c, v]); return b; },
      not(c, op, v) { if (op === 'is' && v === null) st.notNull.push(c); return b; },
      maybeSingle() { const r = finish(); return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); },
      single() { const r = finish(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: null }); },
      then(onF, onR) { return Promise.resolve(finish()).then(onF, onR); },
    };
    return b;
  };
  return {
    supabase: {
      from: (t) => makeBuilder(t),
      storage: { from: () => ({ download: async () => ({ data: null }), update: async () => ({}) }) },
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    },
  };
});

import { reprojectProjectData } from '@/lib/crs/reprojectProject';
import { getTransformer, convergenceAt } from '@/lib/crs';

const NATIVE = { x: 450000, y: 5760000 };

beforeEach(() => {
  db.geo_wells = [
    {
      id: 'w1', user_id: 'user-1', name: 'A-1', crs: 'EPSG:23031', xy_unit: 'm',
      surface_x: NATIVE.x, surface_y: NATIVE.y,
      deviation: [{ md: 0, inc: 0, azi: 10 }, { md: 500, inc: 30, azi: 10 }],
      crs_provenance: { declared_crs: 'EPSG:23031' },
    },
    { id: 'w2', user_id: 'user-1', name: 'Legacy', crs: null, surface_x: 1, surface_y: 2 },
    { id: 'w3', user_id: 'user-1', name: 'Yard', crs: 'LOCAL', surface_x: 10, surface_y: 20 },
  ];
  db.geoscience_settings[0].project_crs = 'EPSG:23031';
});

test('wells convert with azimuth rotation, sentinels skip, setting moves last', async () => {
  const steps = [];
  const report = await reprojectProjectData({
    toTag: 'EPSG:32631',
    onProgress: (p) => steps.push(p.step),
  });

  expect(report.wells).toEqual({ converted: 1, skipped: 1 });
  expect(report.skippedNames).toEqual(['Yard (LOCAL)']);

  const w = db.geo_wells[0];
  const t = getTransformer('EPSG:23031', 'EPSG:32631');
  const direct = t.forward(NATIVE.x, NATIVE.y);
  expect(w.surface_x).toBeCloseTo(direct.x, 9);
  expect(w.surface_y).toBeCloseTo(direct.y, 9);
  expect(w.crs).toBe('EPSG:32631');

  const dGamma = convergenceAt('EPSG:32631', direct.x, direct.y)
    - convergenceAt('EPSG:23031', NATIVE.x, NATIVE.y);
  expect(w.deviation[1].azi).toBeCloseTo(((10 + dGamma) % 360 + 360) % 360, 9);
  expect(w.crs_provenance.transform_chain).toHaveLength(1);
  expect(w.crs_provenance.transform_chain[0]).toMatchObject({
    from: 'EPSG:23031', to: 'EPSG:32631',
  });
  // The null-tag legacy well was never touched (listOwnTagged filters).
  expect(db.geo_wells[1].surface_x).toBe(1);
  expect(db.geoscience_settings[0].project_crs).toBe('EPSG:32631');
  expect(steps[steps.length - 1]).toBe('done');
});

test('rerunning is a no-op (idempotent by tag) and A->B->A restores the native position', async () => {
  await reprojectProjectData({ toTag: 'EPSG:32631' });
  const afterB = { x: db.geo_wells[0].surface_x, y: db.geo_wells[0].surface_y };
  const again = await reprojectProjectData({ toTag: 'EPSG:32631' });
  expect(again.wells.converted).toBe(0);
  expect(db.geo_wells[0].surface_x).toBe(afterB.x);

  const back = await reprojectProjectData({ toTag: 'EPSG:23031' });
  expect(back.wells.converted).toBe(1);
  // Helmert round trip lands within ~1 mm (proj4's iterative
  // geocentric-to-geodetic step); centimetre assertion, far below any
  // survey positioning tolerance.
  expect(db.geo_wells[0].surface_x).toBeCloseTo(NATIVE.x, 2);
  expect(db.geo_wells[0].surface_y).toBeCloseTo(NATIVE.y, 2);
  expect(db.geo_wells[0].deviation[1].azi).toBeCloseTo(10, 6);
  expect(db.geo_wells[0].crs_provenance.transform_chain).toHaveLength(2);
});

test('refuses a non-transformable target', async () => {
  await expect(reprojectProjectData({ toTag: 'UNKNOWN' })).rejects.toThrow(/transformable/);
});
