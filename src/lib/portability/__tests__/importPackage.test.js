// PP2 acceptance gate (docs/scope/ProjectPortability-PLAN.md §6, PP2 row),
// run in-process: export the type well with PP1, import it into an
// in-memory sink standing in for a different user's registry, and check
//   - every id is new; no id from the package survives in any written row
//   - blobs land under the importer's prefix, at the paths the rows point to,
//     byte-identical to the source curves
//   - Petrophysics on the imported curves reproduces the oracle zone summary
//     (SAND A net 18.0 m from goldens.json)
//   - importing twice gives two independent copies
//   - a manifest edited to a higher package_version is refused, naming both
//   - a tampered file is refused by hash; an unlisted file is refused
//   - rows saved by a newer state version are refused
//   - optional references outside the package are dropped, required ones
//     inside are rewritten; provenance.imported_from is stamped
//   - resume skips what a failed run already wrote

import fs from 'node:fs';
import path from 'node:path';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import JSZip from 'jszip';
import { buildGeosciencePackage } from '@/lib/portability/exportPackage';
import { readPackage, planImport, executeImport, importPackage, preflightPackage, PackageReadError, PackagePlanError, IMPORT_ORDER } from '@/lib/portability/importPackage';
import { sha256Hex } from '@/lib/portability/zipWriter';
import { walkUuids } from '@/lib/portability/danglingRefs';
import { computeWell, zoneSummary, DEFAULT_PARAMS } from '@/pages/apps/PetrophysicsStudio/engine/pipeline';
import { registerStateKind, _resetStateKinds } from '@/lib/stateVersion';
import '@/pages/apps/PetrophysicsStudio/services/registryBackend'; // registers 'petro-project'

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const goldens = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));

const SRC_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SRC_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DST_USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DST_ORG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WELL = '11111111-1111-4111-8111-111111111111';
const SURF = '55555555-5555-4555-8555-555555555555';
const PETRO = '77777777-7777-4777-8777-777777777777';
const CRS_ID = '99999999-9999-4999-8999-999999999999';
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

// registry-shaped source for the exporter (same as the PP1 gate, minimal)
function makeSource() {
  const curves = typewell.curves;
  const n = curves.DEPT.length;
  const toF32 = (arr) => Float32Array.from(arr, (v) => (v == null ? NaN : v));
  const logRows = []; const samples = {};
  Object.entries(curves).forEach(([mn, arr], i) => {
    const id = uid(100 + i);
    logRows.push({ id, well_id: WELL, mnemonic: mn, description: mn, unit: mn === 'DEPT' ? 'M' : '', start_md_m: curves.DEPT[0], stop_md_m: curves.DEPT[n - 1], step_m: 0.5, n_samples: n, null_count: 0, source_file: 'typewell.las', provenance: { las_version: '2.0' }, storage_path: `${SRC_USER}/${WELL}/logs/${id}.f32`, created_at: '2026-09-01T00:00:00Z' });
    samples[id] = toF32(arr);
  });
  const vshId = uid(200);
  logRows.push({ id: vshId, well_id: WELL, mnemonic: 'VSH', description: 'computed', unit: 'V/V', start_md_m: curves.DEPT[0], stop_md_m: curves.DEPT[n - 1], step_m: 0.5, n_samples: n, null_count: 0, source_file: null,
    provenance: { computed: true, engine: 'petrophysics', project_id: PETRO, input_log_ids: [logRows[2].id] }, storage_path: `${SRC_USER}/${WELL}/logs/${vshId}.f32`, created_at: '2026-09-01T00:00:01Z' });
  samples[vshId] = Float32Array.from(curves.GR, (g) => (g == null ? NaN : 0.5));
  const well = { id: WELL, user_id: SRC_USER, organization_id: SRC_ORG, name: 'KETA TYPE-1', uwi: 'KETA-1', kb_m: 25, crs: `CUSTOM:${CRS_ID}`, deviation: [], created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' };
  const zones = [{ id: uid(400), well_id: WELL, name: 'SAND A', top_md_m: 2010, base_md_m: 2030, properties: {} }];
  const tops = [{ id: uid(300), well_id: WELL, name: 'Top Sand A', md_m: 2010, interpreter: 'oracle' }];
  const grid = Float32Array.from({ length: 6 }, (_, i) => 1000 + i);
  const surface = { id: SURF, user_id: SRC_USER, organization_id: null, name: 'Top Sand A depth', kind: 'depth', origin_x: 0, origin_y: 0, nx: 3, ny: 2, dx: 10, dy: 10, rotation_deg: 0, z_domain: 'depth', z_unit: 'm', null_value: 1e30, crs: 'EPSG:32631', provenance: { isochore: [SURF, uid(900)] }, storage_path: `${SRC_USER}/${SURF}/grid.f32` };
  const petro = { id: PETRO, user_id: SRC_USER, name: 'Type well interp', well_ids: [WELL], params: { grClean: 20 }, layouts: { version: 1, templates: [] }, facies: { [WELL]: [{ name: 'sand' }] }, zone_params: { [uid(400)]: { grClay: 110 } }, schema_version: 1 };
  const wells = { [WELL]: well }; const topsMap = { [WELL]: tops }; const zonesMap = { [WELL]: zones };
  const state = { petro_projects: [petro], pp_projects: [], rp_projects: [], geo_correlation_sections: [] };
  const TABLES = { geo_wells: Object.values(wells), geo_wells_logs: logRows, geo_wells_tops: Object.values(topsMap).flat(), geo_wells_zones: Object.values(zonesMap).flat(), geo_surfaces: [surface], geo_culture: [], ...state };
  const f32bytes = (arr) => { const f = arr instanceof Float32Array ? arr : Float32Array.from(arr); return new Uint8Array(f.buffer, f.byteOffset, f.byteLength); };
  const BLOBS = new Map();
  for (const l of logRows) BLOBS.set(`wells/${l.storage_path}`, f32bytes(samples[l.id]));
  BLOBS.set(`surfaces/${surface.storage_path}`, f32bytes(grid));
  return {
    async currentUser() { return { id: SRC_USER, organization_id: SRC_ORG, organization_name: 'Source Co' }; },
    async getRow(table, id) { return (TABLES[table] || []).find((r) => r.id === id) || null; },
    async listChildren(table, column, parentId) { return (TABLES[table] || []).filter((r) => r[column] === parentId); },
    async downloadBlob(bucket, path) { const b = BLOBS.get(`${bucket}/${path}`); if (!b) throw new Error(`no blob ${bucket}/${path}`); return b; },
    async listBlobs() { return []; },
    async listStateRowsForWells(table) { return table === 'petro_projects' ? [petro] : []; },
    async getCustomCrs(id) { return id === CRS_ID ? { name: 'Keta TM', proj4: '+proj=tmerc' } : null; },
    _samples: samples, _logRows: logRows, _grid: grid,
  };
}

/** In-memory registry standing in for the importing user's account. */
function makeSink({ failOn = null, jobs = true, existingWells = [] } = {}) {
  const store = { rows: {}, blobs: new Map(), jobs: new Map(), items: [], crs: {}, calls: [] };
  return {
    store,
    async currentUser() { return { id: DST_USER, organization_id: DST_ORG }; },
    async listMyWells() { return existingWells; },
    async createJob(job) { if (!jobs) return null; const id = uid(5000 + store.jobs.size); store.jobs.set(id, { id, ...job }); return id; },
    async updateJob(id, patch) { if (store.jobs.has(id)) Object.assign(store.jobs.get(id), patch); },
    async listItems(id) { return store.items.filter((i) => i.job_id === id); },
    async recordItems(id, items) { store.items.push(...items); },
    async mergeCustomCrs(defs) { for (const d of defs) if (!(d.id in store.crs)) store.crs[d.id] = d; },
    async uploadBlob(bucket, p, bytes, contentType) { store.calls.push(['upload', bucket, p]); if (store.blobs.has(`${bucket}/${p}`)) throw new Error('exists'); store.blobs.set(`${bucket}/${p}`, { bytes: new Uint8Array(bytes), contentType }); },
    async removeBlob(bucket, p) { store.blobs.delete(`${bucket}/${p}`); },
    async insertRows(table, rows) {
      store.calls.push(['insert', table, rows.length]);
      if (failOn && table === failOn.table && (failOn.count -= 1) === 0) throw new Error(`simulated failure on ${table}`);
      store.rows[table] = [...(store.rows[table] || []), ...rows.map((r) => JSON.parse(JSON.stringify(r)))];
    },
  };
}

async function exportBytes(roots = [{ kind: 'well', id: WELL }, { kind: 'surface', id: SURF }], name = 'Handover') {
  const built = await buildGeosciencePackage(makeSource(), roots, { name });
  return { bytes: await built.writer.toUint8Array(), manifest: built.manifest };
}

// ids anywhere in the rows, except the deliberate provenance.imported_from record of the old ids
const allUuids = (rows) => {
  const ids = new Set();
  for (const r of rows) {
    const { provenance, ...rest } = r;
    const prov = provenance && typeof provenance === 'object' ? { ...provenance } : provenance;
    if (prov && typeof prov === 'object') delete prov.imported_from;
    walkUuids({ ...rest, provenance: prov }, (id) => ids.add(id));
  }
  return ids;
};

beforeAll(() => {
  // kinds the importer consults for the Petrel rule and for migrating rows up
  registerStateKind('pp-project', { current: 1, label: 'pore pressure project' });
  registerStateKind('rp-project', { current: 1, label: 'rock physics project' });
  registerStateKind('correlation-section', { current: 1, label: 'correlation section' });
});

describe('PP2 import: the type well arrives as an independent copy', () => {
  let bytes; let manifest; let sink; let result;
  beforeAll(async () => {
    ({ bytes, manifest } = await exportBytes());
    sink = makeSink();
    result = await importPackage(bytes, sink, { shareWithOrg: false });
  });

  test('every table is written in dependency order with new ids and the importer as owner', () => {
    const written = Object.keys(sink.store.rows);
    expect(written).toEqual(IMPORT_ORDER.filter((t) => written.includes(t)));
    const oldIds = new Set();
    for (const rows of Object.values(result.pkg.tables)) for (const r of rows) if (r.id) oldIds.add(r.id.toLowerCase());
    oldIds.delete(CRS_ID); // preserved on purpose
    for (const [table, rows] of Object.entries(sink.store.rows)) {
      for (const r of rows) {
        expect(oldIds.has(r.id)).toBe(false);
        if ('user_id' in r) expect(r.user_id).toBe(DST_USER);
        if ('organization_id' in r) expect(r.organization_id).toBeNull();
        expect(r).not.toHaveProperty('created_at');
      }
      const survivors = [...allUuids(rows)].filter((id) => oldIds.has(id));
      expect({ table, survivors }).toEqual({ table, survivors: [] });
    }
    expect(result.summary.rowsWritten).toBe(1 + 7 + 1 + 1 + 1 + 1);
    expect(result.summary.blobsWritten).toBe(8);
  });

  test('blobs land under the importer prefix at the paths the rows point to, byte for byte', () => {
    const src = makeSource();
    const logs = sink.store.rows.geo_wells_logs;
    const well = sink.store.rows.geo_wells[0];
    for (const log of logs) {
      expect(log.storage_path).toBe(`${DST_USER}/${well.id}/logs/${log.id}.f32`);
      expect(log.well_id).toBe(well.id);
      const blob = sink.store.blobs.get(`wells/${log.storage_path}`);
      expect(blob).toBeDefined();
      const original = src._samples[src._logRows.find((l) => l.mnemonic === log.mnemonic).id];
      expect(Buffer.from(blob.bytes).equals(Buffer.from(original.buffer, original.byteOffset, original.byteLength))).toBe(true);
    }
    const surf = sink.store.rows.geo_surfaces[0];
    expect(surf.storage_path).toBe(`${DST_USER}/${surf.id}/grid.f32`);
    expect(sink.store.blobs.has(`surfaces/${surf.storage_path}`)).toBe(true);
    // blobs were uploaded before any row was inserted
    const firstInsert = sink.store.calls.findIndex((c) => c[0] === 'insert');
    const lastUpload = sink.store.calls.map((c) => c[0]).lastIndexOf('upload');
    expect(lastUpload).toBeLessThan(firstInsert);
  });

  test('Petrophysics on the imported curves reproduces the oracle zone summary (SAND A)', () => {
    const logs = sink.store.rows.geo_wells_logs;
    const curve = (mn) => { const l = logs.find((x) => x.mnemonic === mn); const b = sink.store.blobs.get(`wells/${l.storage_path}`).bytes; return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
    const curves = { DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'), NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT') };
    const { outputs } = computeWell(curves, DEFAULT_PARAMS);
    const zone = sink.store.rows.geo_wells_zones[0];
    const s = zoneSummary(curves, outputs, DEFAULT_PARAMS, { top_md_m: zone.top_md_m, base_md_m: zone.base_md_m });
    const g = goldens.ZONES.SAND_A.summary;
    expect(s.net_m).toBeCloseTo(g.net_m, 6);
    expect(s.gross_m).toBeCloseTo(g.gross_m, 6);
    expect(s.ntg).toBeCloseTo(g.ntg, 6);
    // float32 storage of float64 oracle curves: averages agree to single precision
    expect(s.phi_avg).toBeCloseTo(g.phi_avg, 5);
    expect(s.sw_avg).toBeCloseTo(g.sw_avg, 5);
  });

  test('references are rewritten through the spec: required ones map, optional ones outside are dropped', () => {
    const logs = sink.store.rows.geo_wells_logs;
    const gr = logs.find((l) => l.mnemonic === 'GR');
    const vsh = logs.find((l) => l.mnemonic === 'VSH');
    const petro = sink.store.rows.petro_projects[0];
    const well = sink.store.rows.geo_wells[0];
    const zone = sink.store.rows.geo_wells_zones[0];
    expect(vsh.provenance.input_log_ids).toEqual([gr.id]);
    expect(vsh.provenance.project_id).toBe(petro.id);
    expect(petro.well_ids).toEqual([well.id]);
    expect(Object.keys(petro.facies)).toEqual([well.id]);
    expect(Object.keys(petro.zone_params)).toEqual([zone.id]);
    const surf = sink.store.rows.geo_surfaces[0];
    expect(surf.provenance.isochore).toEqual([surf.id]); // the outside parent was dropped
    expect(well.crs).toBe(`CUSTOM:${CRS_ID}`);
    expect(sink.store.crs[CRS_ID]).toMatchObject({ name: 'Keta TM' });
  });

  test('provenance.imported_from is stamped on rows that carry provenance; app-state and registry rows both carry the version stamp (20260902120500 applied 2026-09-03)', () => {
    const vsh = sink.store.rows.geo_wells_logs.find((l) => l.mnemonic === 'VSH');
    expect(vsh.provenance.imported_from).toMatchObject({ package_id: manifest.package_id, source_user_id: SRC_USER, source_organization_name: 'Source Co', original_id: uid(200) });
    expect(vsh.provenance.computed).toBe(true);
    const petro = sink.store.rows.petro_projects[0];
    expect(petro.schema_version).toBe(1);
    expect(petro.app_build).toBe('unknown');
    const well = sink.store.rows.geo_wells[0];
    expect(well.schema_version).toBe(1);
    expect(well.app_build).toBe('unknown');
    expect(vsh.schema_version).toBe(1);
  });

  test('the job and its ledger record every row', () => {
    const job = [...sink.store.jobs.values()][0];
    expect(job.status).toBe('done');
    expect(job.rows_written).toBe(result.summary.rowsWritten);
    expect(job.blobs_written).toBe(8);
    expect(sink.store.items).toHaveLength(result.summary.rowsWritten);
    const item = sink.store.items.find((i) => i.old_id === WELL);
    expect(item.new_id).toBe(sink.store.rows.geo_wells[0].id);
    expect(result.summary.notes.join('\n')).not.toContain('—');
  });

  test('importing the same package twice gives two independent copies', async () => {
    const sink2 = makeSink();
    await importPackage(bytes, sink2);
    await importPackage(bytes, sink2);
    expect(sink2.store.rows.geo_wells).toHaveLength(2);
    expect(sink2.store.rows.geo_wells[0].id).not.toBe(sink2.store.rows.geo_wells[1].id);
    expect(sink2.store.rows.geo_wells_logs).toHaveLength(14);
    expect(sink2.store.blobs.size).toBe(16);
    const ids = allUuids(sink2.store.rows.geo_wells_logs);
    expect(ids.has(sink2.store.rows.geo_wells[0].id) && ids.has(sink2.store.rows.geo_wells[1].id)).toBe(true);
  });

  test('share with organization stamps the importer org on scoped rows only', async () => {
    const sink3 = makeSink();
    await importPackage(bytes, sink3, { shareWithOrg: true });
    expect(sink3.store.rows.geo_wells[0].organization_id).toBe(DST_ORG);
    expect(sink3.store.rows.geo_surfaces[0].organization_id).toBe(DST_ORG);
    expect(sink3.store.rows.petro_projects[0]).not.toHaveProperty('organization_id');
  });

  test('a well whose name is taken lands under a free "(imported)" name, never merged, never a unique violation', async () => {
    // geo_wells_owner_name_uniq (live 2026-09-03) and the client rule both
    // forbid a second "KETA TYPE-1"; the importer must pick the name first
    const sink4 = makeSink({ existingWells: [{ id: uid(1), name: ' keta  type-1 ', uwi: 'KETA-1', user_id: DST_USER }] });
    const r = await importPackage(bytes, sink4);
    expect(sink4.store.rows.geo_wells).toHaveLength(1);
    const w = sink4.store.rows.geo_wells[0];
    expect(w.name).toBe('KETA TYPE-1 (imported)');
    expect(w.provenance.imported_from.original_name).toBe('KETA TYPE-1');
    expect(r.summary.notes.join('\n')).toMatch(/Well "KETA TYPE-1" is already in your registry; this copy is imported as "KETA TYPE-1 \(imported\)"/);
    expect(r.summary.warnings.join('\n')).toMatch(/UWI KETA-1/);
    // the review screen sees the same rename before anything is written
    const pre = await preflightPackage(bytes, sink4);
    expect(pre.plan.planned.geo_wells[0].name).toBe('KETA TYPE-1 (imported)');
    expect(pre.plan.notes.join('\n')).toMatch(/imported as "KETA TYPE-1 \(imported\)"/);
  });

  test('a repeat restore of the same package counts up; a teammate\'s shared name is worded as such', async () => {
    const existing = [
      { id: uid(1), name: 'KETA TYPE-1', user_id: 'someone-else' },
      { id: uid(2), name: 'KETA TYPE-1 (imported)', user_id: DST_USER },
    ];
    const sink5 = makeSink({ existingWells: existing });
    const r = await importPackage(bytes, sink5);
    expect(sink5.store.rows.geo_wells[0].name).toBe('KETA TYPE-1 (imported 2)');
    expect(r.summary.notes.join('\n')).toMatch(/is shared with you by a teammate; this copy is imported as "KETA TYPE-1 \(imported 2\)"/);
  });
});

describe('PP2 import: refusals (nothing written)', () => {
  async function rezip(bytes, mutate) {
    const zip = await JSZip.loadAsync(bytes);
    await mutate(zip);
    return zip.generateAsync({ type: 'uint8array' });
  }

  test('a manifest edited to a higher package_version is refused, naming both versions', async () => {
    const { bytes } = await exportBytes();
    const edited = await rezip(bytes, async (zip) => { const m = JSON.parse(await zip.file('manifest.json').async('string')); m.package_version = 2; zip.file('manifest.json', JSON.stringify(m)); });
    await expect(readPackage(edited)).rejects.toThrow(/package version 2; this build reads up to version 1/);
    await expect(readPackage(edited)).rejects.toMatchObject({ code: 'newer-package' });
  });

  test('a tampered data file is refused by hash', async () => {
    const { bytes } = await exportBytes();
    const edited = await rezip(bytes, async (zip) => { const t = await zip.file('data/geo_wells.jsonl').async('string'); zip.file('data/geo_wells.jsonl', t.replace('KETA TYPE-1', 'KETA TYPE-9')); });
    await expect(readPackage(edited)).rejects.toMatchObject({ code: 'tampered', file: 'data/geo_wells.jsonl' });
    await expect(readPackage(edited)).rejects.toThrow(/does not match its checksum/);
  });

  test('a tampered binary is refused by hash even at the same size', async () => {
    const { bytes } = await exportBytes();
    let target;
    const edited = await rezip(bytes, async (zip) => {
      target = Object.keys(zip.files).find((n) => n.endsWith('.f32'));
      const b = await zip.file(target).async('uint8array'); b[3] ^= 0x80; zip.file(target, b);
    });
    await expect(readPackage(edited)).rejects.toMatchObject({ code: 'tampered', file: target });
  });

  test('an unlisted file is refused', async () => {
    const { bytes } = await exportBytes();
    const edited = await rezip(bytes, async (zip) => { zip.file('data/evil.jsonl', '{"id":"x"}\n'); });
    await expect(readPackage(edited)).rejects.toMatchObject({ code: 'unlisted-file' });
  });

  test('a missing listed file is refused', async () => {
    const { bytes } = await exportBytes();
    const edited = await rezip(bytes, async (zip) => { zip.remove('README.txt'); });
    await expect(readPackage(edited)).rejects.toMatchObject({ code: 'missing-file', file: 'README.txt' });
  });

  test('rows saved by a newer state version are refused (the Petrel rule per table)', async () => {
    const { bytes } = await exportBytes();
    const edited = await rezip(bytes, async (zip) => {
      const m = JSON.parse(await zip.file('manifest.json').async('string'));
      m.tables.petro_projects.schema_version = { min: 1, max: 3 };
      zip.file('manifest.json', JSON.stringify(m));
    });
    await expect(readPackage(edited)).rejects.toMatchObject({ code: 'newer-state', table: 'petro_projects', found: 3, reads: 1 });
    await expect(readPackage(edited)).rejects.toThrow(/state version 3; this build reads up to version 1/);
  });

  test('not a zip, and a zip without a manifest', async () => {
    await expect(readPackage(new Uint8Array([1, 2, 3, 4]))).rejects.toMatchObject({ code: 'not-zip' });
    const z = new JSZip(); z.file('hello.txt', 'hi');
    await expect(readPackage(await z.generateAsync({ type: 'uint8array' }))).rejects.toMatchObject({ code: 'no-manifest' });
  });

  test('a required reference the package cannot resolve refuses the plan', async () => {
    const { bytes } = await exportBytes();
    const pkg = await readPackage(bytes);
    const gr = pkg.tables.geo_wells_logs.find((l) => l.mnemonic === 'VSH');
    gr.provenance.input_log_ids = [uid(999)];
    expect(() => planImport(pkg, { userId: DST_USER, organizationId: DST_ORG })).toThrow(PackagePlanError);
    expect(() => planImport(pkg, { userId: DST_USER, organizationId: DST_ORG })).toThrow(/geo_wells_logs.provenance.input_log_ids\[\] -> 00000999/);
  });

  test('sharing without an organization is refused before anything is written', async () => {
    const { bytes } = await exportBytes();
    const pkg = await readPackage(bytes);
    expect(() => planImport(pkg, { userId: DST_USER, organizationId: null, shareWithOrg: true })).toThrow(/not a member of an organization/);
  });
});

describe('PP2 import: resume after a failure', () => {
  test('a failed run leaves a failed job; resuming skips what was written and finishes', async () => {
    const { bytes } = await exportBytes();
    const sink = makeSink({ failOn: { table: 'geo_wells_tops', count: 1 } });
    let err;
    try { await importPackage(bytes, sink); } catch (e) { err = e; }
    expect(err.message).toMatch(/Import stopped: simulated failure on geo_wells_tops/);
    expect(err.message).toMatch(/resume it from Import history/);
    const job = [...sink.store.jobs.values()][0];
    expect(job.status).toBe('failed');
    const writtenBefore = sink.store.rows.geo_wells.length + sink.store.rows.geo_wells_logs.length;
    expect(writtenBefore).toBe(8);

    // resume: same plan (same new ids), same sink, failure cleared
    const pkg = await readPackage(bytes);
    const plan = planImport(pkg, { userId: DST_USER, organizationId: DST_ORG });
    // a resumed run must reuse the ids already written: rebuild from the ledger
    for (const it of sink.store.items) { const r = plan.planned[it.table_name]?.find((x) => plan.items.find((i) => i.newId === x.id && i.oldId === it.old_id)); if (r) { r.id = it.new_id; } }
    for (const it of plan.items) { const done = sink.store.items.find((d) => d.table_name === it.table && d.old_id === it.oldId); if (done) it.newId = done.new_id; }
    const summary = await executeImport(plan, sink, { resumeJobId: job.id });
    expect(summary.resumed).toBe(true);
    expect(summary.skipped).toBeGreaterThanOrEqual(8);
    expect(sink.store.jobs.get(job.id).status).toBe('done');
    expect(sink.store.rows.geo_wells).toHaveLength(1);
    expect(sink.store.rows.geo_wells_tops).toHaveLength(1);
    expect(sink.store.rows.petro_projects).toHaveLength(1);
  });

  test('without the job tables the import still completes and says resume is unavailable', async () => {
    const { bytes } = await exportBytes();
    const sink = makeSink({ jobs: false });
    const r = await importPackage(bytes, sink);
    expect(r.summary.jobId).toBeNull();
    expect(r.summary.notes.join('\n')).toMatch(/cannot be resumed/);
    expect(sink.store.rows.geo_wells).toHaveLength(1);
  });
});

afterAll(() => _resetStateKinds());
