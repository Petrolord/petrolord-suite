// Project CRS settings: first-touch creation, the Petrel-style lock
// (free until CRS-tagged data exists, then refuse with counts), and
// custom definition storage.

// In-memory Supabase mock: geoscience_settings rows plus taggable
// registry tables for the lock's counts.
const db = {
  geoscience_settings: [],
  geo_wells: [],
  geo_surfaces: [],
  seismic_volumes: [],
  em_models: [],
};

jest.mock('@/lib/customSupabaseClient', () => {
  const makeBuilder = (table) => {
    const st = { op: 'select', payload: null, filters: [], notNull: [], head: false, count: null };
    const rows = () => db[table].filter((r) => (
      st.filters.every(([c, v]) => r[c] === v) && st.notNull.every((c) => r[c] != null)
    ));
    const finish = () => {
      if (st.op === 'insert') {
        if (table === 'geoscience_settings'
          && db[table].some((r) => r.user_id === st.payload.user_id)) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
        }
        const row = { id: `id-${db[table].length + 1}`, ...st.payload };
        db[table].push(row);
        return { data: row, error: null };
      }
      if (st.op === 'update') {
        const hit = rows();
        hit.forEach((r) => Object.assign(r, st.payload));
        return { data: hit[0] || null, error: null };
      }
      if (st.head) return { data: null, count: rows().length, error: null };
      return { data: rows(), count: rows().length, error: null };
    };
    const b = {
      select(_cols, opts = {}) { st.head = !!opts.head; st.count = opts.count || null; return b; },
      insert(payload) { st.op = 'insert'; st.payload = payload; return b; },
      update(payload) { st.op = 'update'; st.payload = payload; return b; },
      eq(col, val) { st.filters.push([col, val]); return b; },
      not(col, op, val) { if (op === 'is' && val === null) st.notNull.push(col); return b; },
      maybeSingle() { const r = finish(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
      single() {
        const r = finish();
        const row = Array.isArray(r.data) ? r.data[0] : r.data;
        return Promise.resolve({ data: row ?? null, error: r.error || (row ? null : { message: 'no rows' }) });
      },
      then(onF, onR) { return Promise.resolve(finish()).then(onF, onR); },
    };
    return b;
  };
  return {
    supabase: {
      from: (table) => makeBuilder(table),
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    },
  };
});

import {
  getSettings, getProjectCrs, setProjectCrs, countCrsTaggedData, addCustomDef,
} from '@/lib/crs/settingsService';

beforeEach(() => {
  Object.keys(db).forEach((k) => { db[k] = []; });
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: () => '6f9619ff-8b86-d011-b42d-00c04fc964ff' },
    });
  }
});

test('first touch creates an empty settings row; project CRS reads UNKNOWN', async () => {
  const s = await getSettings();
  expect(s.user_id).toBe('user-1');
  expect(db.geoscience_settings).toHaveLength(1);
  const p = await getProjectCrs();
  expect(p.tag).toBe('UNKNOWN');
  expect(p.xyUnit).toBe('m');
});

test('setProjectCrs stores a normalized tag with timestamp', async () => {
  await setProjectCrs({ tag: 'epsg:32631', name: 'WGS 84 / UTM zone 31N' });
  const p = await getProjectCrs();
  expect(p.tag).toBe('EPSG:32631');
  expect(p.name).toBe('WGS 84 / UTM zone 31N');
  expect(p.setAt).toBeTruthy();
});

test('UNKNOWN is not a settable Project CRS', async () => {
  await expect(setProjectCrs({ tag: 'garbage' })).rejects.toThrow(/specific system/);
});

test('the lock: refuses once CRS-tagged data exists, with per-registry counts', async () => {
  await setProjectCrs({ tag: 'EPSG:32631' });
  db.geo_wells.push({ id: 'w1', user_id: 'user-1', crs: 'EPSG:32631' });
  db.seismic_volumes.push({ id: 'v1', user_id: 'user-1', crs: 'EPSG:32631' });
  db.geo_wells.push({ id: 'w2', user_id: 'someone-else', crs: 'EPSG:32631' });
  db.geo_surfaces.push({ id: 's1', user_id: 'user-1', crs: null });

  const counts = await countCrsTaggedData();
  expect(counts).toMatchObject({ geo_wells: 1, seismic_volumes: 1, geo_surfaces: 0, em_models: 0, total: 2 });

  await expect(setProjectCrs({ tag: 'EPSG:23031' })).rejects.toMatchObject({
    code: 'PROJECT_CRS_LOCKED',
    counts: expect.objectContaining({ total: 2 }),
  });

  // The reproject flow passes allowWithData and goes through.
  await setProjectCrs({ tag: 'EPSG:23031', allowWithData: true });
  expect((await getProjectCrs()).tag).toBe('EPSG:23031');
});

test('addCustomDef stores the definition and returns its tag', async () => {
  const tag = await addCustomDef({ name: 'Field grid', proj4: '+proj=tmerc +lat_0=4 +lon_0=8 +k=1 +x_0=0 +y_0=0 +ellps=WGS84' });
  expect(tag).toMatch(/^CUSTOM:[0-9a-f-]{36}$/);
  const p = await getProjectCrs();
  expect(p.customDefs[tag.slice(7)].name).toBe('Field grid');
  await expect(addCustomDef({ name: 'x', proj4: '' })).rejects.toThrow(/name and a proj4/);
});
