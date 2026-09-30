// WDM-U2-014: every reader that converts a stored well across datums uses
// the well's datum-transformation choice (crs_provenance.datum_transform,
// written by Well Design Studio for a Minna site), not the catalog default.
// Oracle: the vendored EPSG/PROJ goldens put the same West Belt point about
// 10 m apart under EPSG:1754 (default) and EPSG:1168. Negative control: the
// default-transform position, which every reader returned before the fix.

const db = {
  geoscience_settings: [{ id: 'st1', user_id: 'user-1', project_crs: 'EPSG:26391', project_crs_name: 'Minna / Nigeria West Belt', project_xy_unit: 'm', custom_defs: {} }],
  geo_wells: [], geo_surfaces: [], seismic_volumes: [], em_models: [],
};

jest.mock('@/lib/customSupabaseClient', () => {
  const makeBuilder = (table) => {
    const st = { op: 'select', payload: null, filters: [], notNull: [] };
    const rows = () => db[table].filter((r) => st.filters.every(([c, v]) => r[c] === v) && st.notNull.every((c) => r[c] != null));
    const finish = () => {
      if (st.op === 'update') { const hit = rows(); hit.forEach((r) => Object.assign(r, st.payload)); return { data: hit[0] || null, error: null }; }
      return { data: rows(), error: null };
    };
    const b = {
      select() { return b; },
      update(payload) { st.op = 'update'; st.payload = payload; return b; },
      insert(payload) { db[table].push({ id: `id-${db[table].length}`, ...payload }); return b; },
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
import { getTransformer, rowDatumTransform, transformOptsForRow } from '@/lib/crs';
import { placeWellsForHost } from '@/lib/crs/guards';
import { placeWellLocation } from '@/lib/crs/wellPlacement';

const P = { x: 286131.31, y: 165839.51 }; // West Belt golden point
const UTM31 = 'EPSG:32631';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const byOverride = getTransformer('EPSG:26391', UTM31, {}, { fromTransform: 'EPSG:1168' }).forward(P.x, P.y);
const byDefault = getTransformer('EPSG:26391', UTM31).forward(P.x, P.y);

test('the two transformations really differ (the size of the error being fixed)', () => {
  expect(dist(byOverride, byDefault)).toBeGreaterThan(8);
  expect(dist(byOverride, byDefault)).toBeLessThan(12);
});

test('rowDatumTransform: a published option for the row CRS, else the default (null)', () => {
  expect(rowDatumTransform({ crs: 'EPSG:26391', crs_provenance: { datum_transform: 'EPSG:1168' } })).toBe('EPSG:1168');
  expect(rowDatumTransform({ crs: 'EPSG:32631', crs_provenance: { datum_transform: 'EPSG:1168' } })).toBeNull();
  expect(rowDatumTransform({ crs: 'EPSG:26391', crs_provenance: { datum_transform: 'EPSG:9999' } })).toBeNull();
  expect(rowDatumTransform({ crs: 'EPSG:26391' })).toBeNull();
  expect(transformOptsForRow({ crs: 'EPSG:26391', crs_provenance: { datum_transform: 'EPSG:1168' } })).toEqual({ datumTransform: 'EPSG:1168' });
});

test('Project CRS reprojection converts the well through its site choice and records it', async () => {
  db.geo_wells = [
    { id: 'w1', user_id: 'user-1', name: 'SITE-1', crs: 'EPSG:26391', xy_unit: 'm', surface_x: P.x, surface_y: P.y, deviation: [], crs_provenance: { datum_transform: 'EPSG:1168', source: 'well-design-studio' } },
    { id: 'w2', user_id: 'user-1', name: 'PLAIN-1', crs: 'EPSG:26391', xy_unit: 'm', surface_x: P.x, surface_y: P.y, deviation: [], crs_provenance: {} },
  ];
  await reprojectProjectData({ toTag: UTM31 });
  const [site, plain] = db.geo_wells;
  expect(dist({ x: site.surface_x, y: site.surface_y }, byOverride)).toBeLessThan(1e-6);
  expect(dist({ x: site.surface_x, y: site.surface_y }, byDefault)).toBeGreaterThan(8); // negative control
  expect(dist({ x: plain.surface_x, y: plain.surface_y }, byDefault)).toBeLessThan(1e-6);
  expect(site.crs_provenance.transform_chain[0].datum_transform).toBe('EPSG:1168');
  // the choice does not apply to WGS 84 / UTM, so it no longer rides on the row
  expect(site.crs_provenance.datum_transform).toBeUndefined();
});

test('the overlay guard (Seismolord, Mapping) converts a well through its choice', () => {
  const r = placeWellsForHost([
    { id: 'a', name: 'SITE-1', crs: 'EPSG:26391', surfaceX: P.x, surfaceY: P.y, crs_provenance: { datum_transform: 'EPSG:1168' } },
    { id: 'b', name: 'PLAIN-1', crs: 'EPSG:26391', surfaceX: P.x, surfaceY: P.y },
  ], UTM31);
  expect(dist({ x: r.wells[0].surfaceX, y: r.wells[0].surfaceY }, byOverride)).toBeLessThan(1e-6);
  expect(dist({ x: r.wells[1].surfaceX, y: r.wells[1].surfaceY }, byDefault)).toBeLessThan(1e-6);
});

test('the well door places a declared location through the choice and keeps it', () => {
  const placed = placeWellLocation({ mode: 'xy', crsTag: 'EPSG:26391', x: P.x, y: P.y, xyUnit: 'm', datumTransform: 'EPSG:1168' }, { projectTag: UTM31 });
  expect(dist({ x: placed.surfaceX, y: placed.surfaceY }, byOverride)).toBeLessThan(1e-6);
  expect(placed.crsProvenance.datum_transform).toBe('EPSG:1168');
  const plain = placeWellLocation({ mode: 'xy', crsTag: 'EPSG:26391', x: P.x, y: P.y, xyUnit: 'm' }, { projectTag: UTM31 });
  expect(dist({ x: plain.surfaceX, y: plain.surfaceY }, byDefault)).toBeLessThan(1e-6);
});
