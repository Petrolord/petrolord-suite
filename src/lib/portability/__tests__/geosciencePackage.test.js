// PP1 acceptance gate (docs/scope/ProjectPortability-PLAN.md §6, PP1 row):
// package the Petrophysics analytic type well, unzip it, and check that
//   - the LAS sidecar parses back to byte-identical float32 curves
//   - the manifest validates and lists every file with a matching sha256
//   - the dangling-reference detector finds zero ids outside the package
//   - an interpretation that spans a well outside the selection is left out
//     and named, while one inside is carried
//   - a ZMAP sidecar for a surface round-trips through the Suite's parser

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import JSZip from 'jszip';
import typewell from '../../../../packages/engines/test-data/petrophysics/typewell.json';
import { parseLas } from '@/pages/apps/WellDataManager/engine/lasParse';
import { parseSurfaceFile } from '@/lib/gridding/surfaceImport';
import { buildGeosciencePackage, PackageIntegrityError } from '@/lib/portability/exportPackage';
import { validateManifest } from '@/lib/portability/manifest';
import { sha256Hex } from '@/lib/portability/zipWriter';
import { detectDanglingRefs } from '@/lib/portability/danglingRefs';
import { isOptionalRefPath } from '@/lib/portability/geoscienceSpec';

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WELL = '11111111-1111-4111-8111-111111111111';
const WELL2 = '12121212-1212-4121-8121-121212121212';
const SURF = '55555555-5555-4555-8555-555555555555';
const PETRO_IN = '77777777-7777-4777-8777-777777777777';
const PETRO_OUT = '78787878-7878-4787-8787-787878787878';
const CRS_ID = '99999999-9999-4999-8999-999999999999';
const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

/** In-memory source built from the type well, the way the registry would return it. */
function makeSource() {
  const curves = typewell.curves;
  const n = curves.DEPT.length;
  const toF32 = (arr) => Float32Array.from(arr, (v) => (v == null ? NaN : v));
  const logRows = [];
  const samples = {};
  Object.entries(curves).forEach(([mn, arr], i) => {
    const id = uid(100 + i);
    logRows.push({
      id, well_id: WELL, mnemonic: mn, description: mn === 'DEPT' ? 'depth' : `${mn} curve`, unit: mn === 'DEPT' ? 'M' : mn === 'GR' ? 'API' : '',
      start_md_m: curves.DEPT[0], stop_md_m: curves.DEPT[n - 1], step_m: 0.5, n_samples: n, null_count: arr.filter((v) => v == null).length,
      source_file: 'typewell.las', provenance: { las_version: '2.0', null_value: -999.25 }, storage_path: `${USER}/${WELL}/logs/${id}.f32`, created_at: '2026-09-01T00:00:00Z',
    });
    samples[id] = toF32(arr);
  });
  // a computed curve whose provenance points at GR (inside) and at an interpretation
  const vshId = uid(200);
  logRows.push({
    id: vshId, well_id: WELL, mnemonic: 'VSH', description: 'Shale volume (larionov-tertiary)', unit: 'V/V',
    start_md_m: curves.DEPT[0], stop_md_m: curves.DEPT[n - 1], step_m: 0.5, n_samples: n, null_count: 1,
    source_file: null, provenance: { computed: true, engine: 'petrophysics', pipeline_version: 'v4', project_id: PETRO_IN, input_log_ids: [logRows[2].id] },
    storage_path: `${USER}/${WELL}/logs/${vshId}.f32`, created_at: '2026-09-01T00:00:01Z',
  });
  samples[vshId] = Float32Array.from(curves.GR, (g) => (g == null ? NaN : Math.min(1, Math.max(0, (g - 20) / 100))));

  const wells = {
    [WELL]: { id: WELL, user_id: USER, organization_id: ORG, name: 'KETA TYPE-1', uwi: 'KETA-1', kb_m: 25, td_md_m: 2100, crs: `CUSTOM:${CRS_ID}`, xy_unit: 'm', deviation: [], checkshots: [], created_at: '2026-09-01T00:00:00Z' },
    [WELL2]: { id: WELL2, user_id: USER, organization_id: ORG, name: 'AKOMA-2', uwi: 'AK-2', crs: 'EPSG:32631', deviation: [], created_at: '2026-09-01T00:00:00Z' },
  };
  const tops = { [WELL]: [{ id: uid(300), well_id: WELL, name: 'Top Sand A', md_m: 2010, interpreter: 'oracle' }, { id: uid(301), well_id: WELL, name: 'Top Sand B', md_m: 2050, interpreter: 'oracle' }], [WELL2]: [] };
  const zones = { [WELL]: [{ id: uid(400), well_id: WELL, name: 'SAND A', top_md_m: 2010, base_md_m: 2030, properties: { net_m: 18 } }], [WELL2]: [] };
  const grid = Float32Array.from({ length: 12 }, (_, i) => (i === 5 ? 1e30 : 1000 + i * 2.5));
  const surface = { id: SURF, user_id: USER, organization_id: null, name: 'Top Sand A depth', kind: 'depth', origin_x: 500000, origin_y: 600000, nx: 4, ny: 3, dx: 100, dy: 100, rotation_deg: 0, z_domain: 'depth', z_unit: 'm', null_value: 1e30, crs: 'EPSG:32631', provenance: { isochore: [SURF, uid(900)] }, storage_path: `${USER}/${SURF}/grid.f32` };
  const state = {
    petro_projects: [
      { id: PETRO_IN, user_id: USER, name: 'Type well interp', well_ids: [WELL], params: { grClean: 20 }, layouts: { version: 1, templates: [] }, facies: { [WELL]: [] }, zone_params: { [uid(400)]: { grClay: 110 } }, schema_version: 1 },
      { id: PETRO_OUT, user_id: USER, name: 'Field interp', well_ids: [WELL, WELL2], params: {}, layouts: null, facies: {}, zone_params: {}, schema_version: 1 },
    ],
    pp_projects: [], rp_projects: [],
    geo_correlation_sections: [{ id: uid(500), user_id: USER, name: 'A-B section', well_ids: [WELL, WELL2], datum: { mode: 'top', topName: 'Top Sand A' }, track_layout: {} }],
  };

  // generic collector interface (PP3): rows by table, children by FK, blobs by path
  const TABLES = {
    geo_wells: Object.values(wells), geo_wells_logs: logRows, geo_wells_tops: Object.values(tops).flat(), geo_wells_zones: Object.values(zones).flat(),
    geo_surfaces: [surface], geo_culture: [], ...state,
  };
  const f32bytes = (arr) => { const f = arr instanceof Float32Array ? arr : Float32Array.from(arr); return new Uint8Array(f.buffer, f.byteOffset, f.byteLength); };
  const BLOBS = new Map();
  for (const l of logRows) BLOBS.set(`wells/${l.storage_path}`, f32bytes(samples[l.id]));
  BLOBS.set(`surfaces/${surface.storage_path}`, f32bytes(grid));
  return {
    calls: { downloads: 0 },
    async currentUser() { return { id: USER, organization_id: ORG, organization_name: 'Lordsway' }; },
    async getRow(table, id) { return (TABLES[table] || []).find((r) => r.id === id) || null; },
    async listChildren(table, column, parentId) { return (TABLES[table] || []).filter((r) => r[column] === parentId); },
    async downloadBlob(bucket, path) { this.calls.downloads += 1; const b = BLOBS.get(`${bucket}/${path}`); if (!b) throw new Error(`no blob ${bucket}/${path}`); return b; },
    async listBlobs() { return []; },
    async listStateRowsForWells(table, wellIds) { return (state[table] || []).filter((r) => r.well_ids.some((w) => wellIds.includes(w))); },
    async getCustomCrs(id) { return id === CRS_ID ? { name: 'Keta local TM', proj4: '+proj=tmerc +lat_0=0 +lon_0=1 +k=0.9996 +x_0=500000 +y_0=0 +ellps=WGS84 +units=m +no_defs' } : null; },
    _samples: samples, _logRows: logRows, _grid: grid, _surface: surface,
  };
}

async function unzip(writer) {
  const zip = await JSZip.loadAsync(await writer.toUint8Array());
  const text = (p) => zip.file(p).async('string');
  const bytes = (p) => zip.file(p).async('uint8array');
  return { zip, text, bytes, names: Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort() };
}

describe('Geoscience package: the type well round trip', () => {
  let source; let built; let pkg;
  beforeAll(async () => {
    source = makeSource();
    built = await buildGeosciencePackage(source, [{ kind: 'well', id: WELL }, { kind: 'surface', id: SURF }], { name: 'Type well handover' });
    pkg = await unzip(built.writer);
  });

  test('the manifest validates and every file it lists is present with a matching sha256', async () => {
    const manifest = JSON.parse(await pkg.text('manifest.json'));
    expect(validateManifest(manifest)).toEqual({ ok: true, errors: [] });
    expect(manifest.name).toBe('Type well handover');
    expect(manifest.scope.roots).toEqual([{ kind: 'well', id: WELL, name: 'KETA TYPE-1' }, { kind: 'surface', id: SURF, name: 'Top Sand A depth' }]);
    const listed = Object.keys(manifest.files).sort();
    expect(listed).toEqual(pkg.names.filter((n) => n !== 'manifest.json'));
    for (const [file, info] of Object.entries(manifest.files)) {
      const b = await pkg.bytes(file);
      expect(b.byteLength).toBe(info.bytes);
      expect(await sha256Hex(b)).toBe(info.sha256);
    }
    expect(manifest.tables.geo_wells.rows).toBe(1);
    expect(manifest.tables.geo_wells_logs.rows).toBe(7);
    expect(manifest.tables.geo_wells_tops.rows).toBe(2);
    expect(manifest.tables.geo_wells_zones.rows).toBe(1);
    expect(manifest.tables.geo_surfaces.rows).toBe(1);
    expect(manifest.tables.geoscience_custom_crs.rows).toBe(1);
    expect(manifest.blobs).toHaveLength(8);
    expect(manifest.open.map((o) => o.kind).sort()).toEqual(['las', 'readme', 'tops_csv', 'zmap', 'zones_csv']);
  });

  test('the LAS sidecar parses back to byte-identical float32 curves', async () => {
    const las = await pkg.text('open/wells/keta-type-1.las');
    const parsed = parseLas(las);
    expect(parsed.curves[0].mnemonic).toBe('DEPT');
    expect(parsed.curves.map((c) => c.mnemonic)).toEqual(['DEPT', 'DT', 'GR', 'NPHI', 'RHOB', 'RT', 'VSH']);
    for (const c of parsed.curves) {
      const row = source._logRows.find((l) => l.mnemonic === c.mnemonic);
      const original = source._samples[row.id];
      expect(c.data.length).toBe(original.length);
      for (let i = 0; i < original.length; i += 1) {
        if (Number.isNaN(original[i])) expect(Number.isNaN(c.data[i])).toBe(true);
        else expect(c.data[i]).toBe(original[i]);
      }
    }
    expect(parsed.well.WELL?.value ?? parsed.well.WELL).toMatch(/KETA TYPE-1/);
  });

  test('the float32 blobs are the curves, byte for byte', async () => {
    for (const row of source._logRows) {
      const raw = await pkg.bytes(`blobs/wells/${row.storage_path}`);
      const back = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
      const original = source._samples[row.id];
      expect(back.length).toBe(original.length);
      expect(Buffer.from(back.buffer, back.byteOffset, back.byteLength).equals(Buffer.from(original.buffer, original.byteOffset, original.byteLength))).toBe(true);
    }
  });

  test('rows are dumped as stored, one JSON object per line', async () => {
    const lines = (await pkg.text('data/geo_wells_logs.jsonl')).trim().split('\n');
    expect(lines).toHaveLength(7);
    const vsh = lines.map((l) => JSON.parse(l)).find((r) => r.mnemonic === 'VSH');
    expect(vsh.provenance.input_log_ids).toEqual([source._logRows[2].id]);
    const crs = (await pkg.text('data/geoscience_custom_crs.jsonl')).trim();
    expect(JSON.parse(crs)).toMatchObject({ id: CRS_ID, name: 'Keta local TM' });
  });

  test('zero dangling references; the only external ones sit at optional paths', () => {
    expect(built.refs.dangling).toEqual([]);
    // provenance.isochore -> a surface outside the package, declared optional
    expect(built.refs.external).toBe(1);
    expect(isOptionalRefPath('geo_surfaces', 'provenance.isochore[1]')).toBe(true);
    expect(isOptionalRefPath('geo_wells_logs', 'provenance.input_log_ids[0]')).toBe(false);
  });

  test('interpretations inside the selection travel; ones that span other wells are named and left out', async () => {
    const petro = (await pkg.text('data/petro_projects.jsonl')).trim().split('\n').map(JSON.parse);
    expect(petro.map((p) => p.id)).toEqual([PETRO_IN]);
    expect(pkg.names).not.toContain('data/geo_correlation_sections.jsonl');
    expect(built.manifest.notes.join('\n')).toMatch(/Field interp.*1 well outside this selection/);
    expect(built.manifest.notes.join('\n')).toMatch(/A-B section.*1 well outside/);
    expect(built.manifest.notes.join('\n')).not.toContain('—');
  });

  test('the ZMAP sidecar round-trips through the Suite parser (nulls included)', async () => {
    const z = parseSurfaceFile(await pkg.text('open/surfaces/top-sand-a-depth.zmap'));
    expect(z.nx).toBe(4);
    expect(z.ny).toBe(3);
    expect(z.dx).toBeCloseTo(100, 6);
    expect(z.x0).toBeCloseTo(500000, 3);
    // parser returns row-major from the south row, same convention as the registry grid
    for (let i = 0; i < 12; i += 1) {
      if (source._grid[i] >= 1e30) expect(z.z[i]).toBeGreaterThanOrEqual(1e30);
      else expect(z.z[i]).toBeCloseTo(source._grid[i], 3);
    }
  });

  test('the README names the roots and the notes', async () => {
    const readme = await pkg.text('README.txt');
    expect(readme).toMatch(/PETROLORD PROJECT PACKAGE/);
    expect(readme).toMatch(/well: KETA TYPE-1/);
    expect(readme).toMatch(/geo_wells_logs: 7 rows/);
    expect(readme).toMatch(/Field interp/);
    expect(readme).not.toContain('—');
  });
});

describe('Geoscience package: roots and refusals', () => {
  test('a project root pulls in all of its wells, and every curve is downloaded once', async () => {
    const source = makeSource();
    const built = await buildGeosciencePackage(source, [{ kind: 'petro_project', id: PETRO_OUT }], { includeSidecars: false });
    expect(built.manifest.tables.geo_wells.rows).toBe(2);
    expect(built.manifest.tables.petro_projects.rows).toBe(2); // Field interp (root) + Type well interp (now fully inside)
    expect(built.manifest.tables.geo_correlation_sections.rows).toBe(1);
    expect(source.calls.downloads).toBe(7);
    expect(built.manifest.scope.roots[0]).toEqual({ kind: 'petro_project', id: PETRO_OUT, name: 'Field interp' });
  });

  test('a dangling reference refuses the whole package and names the first one', async () => {
    const source = makeSource();
    const bad = uid(999);
    source._logRows[1].provenance = { computed: true, input_log_ids: [bad] };
    await expect(buildGeosciencePackage(source, [{ kind: 'well', id: WELL }])).rejects.toThrow(PackageIntegrityError);
    await expect(buildGeosciencePackage(source, [{ kind: 'well', id: WELL }])).rejects.toThrow(new RegExp(`geo_wells_logs.provenance.input_log_ids\\[0\\] -> ${bad}`));
  });

  test('an unknown root kind is rejected before anything is read', async () => {
    const source = makeSource();
    await expect(buildGeosciencePackage(source, [{ kind: 'volume', id: WELL }])).rejects.toThrow(/unknown root kind "volume"/);
    expect(source.calls.downloads).toBe(0);
  });

  test('a well without a depth log still packages, with the LAS gap recorded', async () => {
    const source = makeSource();
    source._logRows.splice(0, 1); // drop DEPT
    const built = await buildGeosciencePackage(source, [{ kind: 'well', id: WELL }]);
    expect(built.manifest.open.some((o) => o.kind === 'las')).toBe(false);
    expect(built.manifest.notes.join('\n')).toMatch(/no depth log/);
  });
});
