// PP3b gate: a well-planning site travels with its whole tree.
//   site -> targets, wellbores -> geometry, surveys, designs -> programs,
//   anti-collision runs; studio cases -> runs; cross-case links (cd -> ct,
//   ps -> ct + cd) re-linked; design target_ids re-linked; prefixed offset
//   ids 'wp:<id>' rewritten to the new wellbore id, 'geo:<id>' left named;
//   optional registry links cleared; stamped tables stamped, runs not.

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildPackage } from '@/lib/portability/exportPackage';
import { importPackage } from '@/lib/portability/importPackage';
import { validateManifest } from '@/lib/portability/manifest';
import { tableSpec, getFamily } from '@/lib/portability/familySpec';
import { WP_TABLES } from '@/lib/portability/familiesWellPlanning';
import { walkUuids } from '@/lib/portability/danglingRefs';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const SRC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SRC_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const SITE = uid(1); const T1 = uid(2); const T2 = uid(3); const WB1 = uid(4); const WB2 = uid(5);
const DES = uid(6); const PROG = uid(7); const AC = uid(8); const CT = uid(9); const CD = uid(10); const PS = uid(11);
const CTR = uid(12); const GEO = uid(13); const OFFSET_GEO = uid(14);

function makeWorld() {
  const rows = {
    wp_sites: [{ id: SITE, user_id: SRC, organization_id: SRC_ORG, name: 'Keta pad', crs_provenance: {}, slots: [], lease_lines: [], schema_version: 1 }],
    wp_targets: [
      { id: T1, user_id: SRC, site_id: SITE, name: 'T1', parent_target_id: null, geometry: { x: 1 }, provenance: { source: 'legacy' } },
      { id: T2, user_id: SRC, site_id: SITE, name: 'T2', parent_target_id: T1, geometry: { x: 2 }, provenance: {} },
    ],
    wp_wellbores: [
      { id: WB1, user_id: SRC, site_id: SITE, name: 'KETA-1 ST1', parent_wellbore_id: null, geo_well_id: GEO, mag_model: {} },
      { id: WB2, user_id: SRC, site_id: SITE, name: 'KETA-1 ST2', parent_wellbore_id: WB1, geo_well_id: null, mag_model: {} },
    ],
    wp_wellbore_geometry: [{ id: uid(20), user_id: SRC, wellbore_id: WB1, hole_sections: [{ od: 12.25 }] }],
    wp_surveys: [{ id: uid(21), user_id: SRC, wellbore_id: WB1, source: 'geo_wells', stations: [], computed: {}, imported_from: { geo_well_id: GEO } }],
    wp_designs: [{ id: DES, user_id: SRC, wellbore_id: WB1, name: 'Plan A', status: 'definitive', target_ids: [T1, T2], published_geo_well_id: GEO, tie_on: {}, segments: [], stations: [], error_model: {}, engine_version: 'drilling-wd4', schema_version: 1 }],
    wp_survey_programs: [{ id: PROG, user_id: SRC, design_id: DES, intervals: [] }],
    wp_ac_runs: [{ id: AC, user_id: SRC, design_id: DES, engine_version: 'drilling-ac', offsets: [`wp:${WB2}`, `geo:${OFFSET_GEO}`], results: [{ offset: `wp:${WB2}`, sf: 2.1 }, { offset: `geo:${OFFSET_GEO}`, sf: 4.0 }], summary: { worstOffset: `wp:${WB2}` } }],
    wp_ct_cases: [{ id: CT, user_id: SRC, wellbore_id: WB1, design_id: DES, name: 'Casing A', environment: { ppfg: { geoWellId: GEO } }, schema_version: 1 }],
    wp_cd_cases: [{ id: CD, user_id: SRC, wellbore_id: WB1, design_id: DES, ct_case_id: CT, name: 'Completion A', schema_version: 1 }],
    wp_ps_cases: [{ id: PS, user_id: SRC, wellbore_id: WB1, design_id: null, ct_case_id: CT, cd_case_id: CD, name: 'Perf A', schema_version: 1 }],
    wp_ct_runs: [{ id: CTR, user_id: SRC, case_id: CT, design_id: DES, params: {}, results: { sf: 1.4 }, summary: {}, engine_version: 'drilling-ct6' }],
  };
  for (const t of WP_TABLES) rows[t] = rows[t] || [];
  return {
    rows,
    async currentUser() { return { id: SRC, organization_id: SRC_ORG, organization_name: 'Source Co' }; },
    async getRow(table, id) { return (rows[table] || []).find((r) => r.id === id) || null; },
    async listChildren(table, column, parentId) { return (rows[table] || []).filter((r) => r[column] === parentId); },
    async downloadBlob() { throw new Error('no blobs in well planning'); },
    async listBlobs() { return []; },
    async listStateRowsForWells() { return []; },
    async getCustomCrs() { return null; },
  };
}

function makeSink() {
  const store = { rows: {}, blobs: new Map(), jobs: new Map(), items: [], crs: {} };
  return {
    store,
    async currentUser() { return { id: DST, organization_id: null }; },
    async listMyWells() { return []; },
    async createJob(job) { const id = uid(9000 + store.jobs.size); store.jobs.set(id, { id, ...job }); return id; },
    async updateJob(id, patch) { Object.assign(store.jobs.get(id), patch); },
    async listItems() { return []; },
    async recordItems(id, items) { store.items.push(...items); },
    async mergeCustomCrs() {},
    async uploadBlob() { throw new Error('no blobs expected'); },
    async removeBlob() {},
    async insertRows(table, rows) { store.rows[table] = [...(store.rows[table] || []), ...rows.map((r) => JSON.parse(JSON.stringify(r)))]; },
  };
}

describe('well planning family', () => {
  test('is registered with 30 tables (8 core + 11 studio case/run pairs), one site root, and cross-case order ct < cd < ps < st', () => {
    const f = getFamily('wellplanning');
    expect(f).not.toBeNull();
    expect(WP_TABLES).toHaveLength(30);
    expect(f.roots).toEqual({ wp_site: 'wp_sites' });
    const o = f.order;
    expect(o.indexOf('wp_ct_cases')).toBeLessThan(o.indexOf('wp_cd_cases'));
    expect(o.indexOf('wp_cd_cases')).toBeLessThan(o.indexOf('wp_ps_cases'));
    expect(o.indexOf('wp_ps_cases')).toBeLessThan(o.indexOf('wp_st_cases'));
    expect(o.indexOf('wp_targets')).toBeLessThan(o.indexOf('wp_designs'));
    expect(tableSpec('wp_designs')).toMatchObject({ kind: 'wp-design', stamped: true });
    expect(tableSpec('wp_ct_runs').stamped).toBeUndefined();
  });

  describe('a site round trip', () => {
    let world; let sink; let built;
    beforeAll(async () => {
      world = makeWorld();
      built = await buildPackage(world, [{ kind: 'wp_site', id: SITE }], { name: 'Keta pad' });
      expect(validateManifest(built.manifest).ok).toBe(true);
      expect(built.refs.dangling).toEqual([]);
      sink = makeSink();
      await importPackage(await built.writer.toUint8Array(), sink);
    });

    test('every level of the tree is written, rescoped and re-parented', () => {
      const site = sink.store.rows.wp_sites[0];
      expect(site.user_id).toBe(DST);
      expect(site.organization_id).toBeNull();
      const targets = sink.store.rows.wp_targets;
      const wbs = sink.store.rows.wp_wellbores;
      expect(targets.every((t) => t.site_id === site.id)).toBe(true);
      expect(wbs.every((w) => w.site_id === site.id)).toBe(true);
      const t2 = targets.find((t) => t.name === 'T2');
      expect(t2.parent_target_id).toBe(targets.find((t) => t.name === 'T1').id);
      const wb1 = wbs.find((w) => w.name === 'KETA-1 ST1');
      const wb2 = wbs.find((w) => w.name === 'KETA-1 ST2');
      expect(wb2.parent_wellbore_id).toBe(wb1.id);
      expect(wb1.geo_well_id).toBeNull(); // registry well not in the package
      expect(sink.store.rows.wp_wellbore_geometry[0].wellbore_id).toBe(wb1.id);
      expect(sink.store.rows.wp_surveys[0].wellbore_id).toBe(wb1.id);
      expect(Object.keys(sink.store.rows).sort()).toEqual([
        'wp_ac_runs', 'wp_cd_cases', 'wp_ct_cases', 'wp_ct_runs', 'wp_designs', 'wp_ps_cases', 'wp_sites', 'wp_survey_programs', 'wp_surveys', 'wp_targets', 'wp_wellbore_geometry', 'wp_wellbores',
      ]);
    });

    test('the design re-links its targets, its program and its runs; registry links are cleared', () => {
      const des = sink.store.rows.wp_designs[0];
      const targets = sink.store.rows.wp_targets;
      expect(des.target_ids.sort()).toEqual(targets.map((t) => t.id).sort());
      expect(des.published_geo_well_id).toBeNull();
      expect(des.schema_version).toBe(1);
      expect(des.engine_version).toBe('drilling-wd4');
      expect(sink.store.rows.wp_survey_programs[0].design_id).toBe(des.id);
      expect(sink.store.rows.wp_ct_runs[0].design_id).toBe(des.id);
      expect(sink.store.rows.wp_ct_runs[0]).not.toHaveProperty('schema_version');
    });

    test('studio cases re-link to each other and to their runs', () => {
      const ct = sink.store.rows.wp_ct_cases[0];
      const cd = sink.store.rows.wp_cd_cases[0];
      const ps = sink.store.rows.wp_ps_cases[0];
      expect(cd.ct_case_id).toBe(ct.id);
      expect(ps.ct_case_id).toBe(ct.id);
      expect(ps.cd_case_id).toBe(cd.id);
      expect(ps.design_id).toBeNull();
      expect(ct.environment.ppfg.geoWellId).toBeNull();
      expect(sink.store.rows.wp_ct_runs[0].case_id).toBe(ct.id);
      expect(ct.schema_version).toBe(1);
    });

    test('anti-collision offsets: wp: ids follow the new wellbore, geo: ids stay named', () => {
      const ac = sink.store.rows.wp_ac_runs[0];
      const wb2 = sink.store.rows.wp_wellbores.find((w) => w.name === 'KETA-1 ST2');
      expect(ac.design_id).toBe(sink.store.rows.wp_designs[0].id);
      expect(ac.offsets).toEqual([`wp:${wb2.id}`, `geo:${OFFSET_GEO}`]);
      expect(ac.results[0].offset).toBe(`wp:${wb2.id}`);
      expect(ac.summary.worstOffset).toBe(`wp:${wb2.id}`);
    });

    test('no source id survives except named external references and provenance', () => {
      // GEO stays only where an optional `any` path keeps an unknown external id by name (wp_surveys.imported_from)
      expect(sink.store.rows.wp_surveys[0].imported_from).toEqual({ geo_well_id: GEO });
      const old = new Set([SITE, T1, T2, WB1, WB2, DES, PROG, AC, CT, CD, PS, CTR]);
      for (const rows of Object.values(sink.store.rows)) {
        for (const r of rows) {
          const { provenance, ...rest } = r;
          walkUuids(rest, (id) => expect(old.has(id)).toBe(false));
        }
      }
      expect(built.manifest.tables.wp_ac_runs.rows).toBe(1);
    });
  });
});
