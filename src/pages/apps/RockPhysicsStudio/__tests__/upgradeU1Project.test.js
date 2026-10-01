/**
 * Rock Physics U1 (practitioner lens), saved state: RP-U1-001 and RP-U1-013.
 *
 * 001: the workstation saved `{scenario, rock, avo, wedge}`; `scenario` is
 * not an rp_projects column, so PostgREST refused every registry save (the
 * live table held 0 rows on 2026-10-01). The test drives the shipped
 * registry backend against a fake PostgREST that refuses unknown columns,
 * with the column list read from the migration file itself.
 * 013: the save now carries the well (well_ids, so a .pld carries it) and
 * the zone; the .pld importer rewrites both.
 */
import fs from 'fs';
import path from 'path';

const MIGRATION = path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260714100000_create_rp_projects.sql');
const STATE_MIGRATION = path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260902120000_pp0_state_versions.sql');

function migrationColumns() {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const body = sql.slice(sql.indexOf('create table if not exists public.rp_projects ('), sql.indexOf(');', sql.indexOf('create table')));
  const cols = body.split('\n').slice(1).map((l) => l.trim().split(/\s+/)[0]).filter((c) => /^[a-z_]+$/.test(c));
  // the PP0 state stamp columns, added to every state table
  const pp0 = fs.readFileSync(STATE_MIGRATION, 'utf8');
  for (const c of ['schema_version', 'app_build', 'engine_version']) if (pp0.includes(c)) cols.push(c);
  return new Set(cols);
}

const mockColumns = migrationColumns();
const COLUMNS = mockColumns;
const mockCalls = [];

// A PostgREST stand-in: unknown columns are refused with PGRST204, as live.
function mockQuery(table) {
  const refuse = (row) => {
    const bad = Object.keys(row).filter((k) => !mockColumns.has(k));
    return bad.length ? { code: 'PGRST204', message: `Could not find the '${bad[0]}' column of '${table}' in the schema cache` } : null;
  };
  const q = {
    _rows: [],
    select() { return q; },
    order() { return q; },
    limit() { return Promise.resolve({ data: q._rows, error: null }); },
    insert(row) { mockCalls.push({ op: 'insert', row }); const error = refuse(row); q._result = { data: error ? null : { id: 'p1', ...row }, error }; return q; },
    update(row) { mockCalls.push({ op: 'update', row }); const error = refuse(row); q._result = { data: error ? null : { id: 'p1', ...row }, error }; return q; },
    eq() { return q; },
    single() { return Promise.resolve(q._result); },
  };
  return q;
}

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (t) => mockQuery(t),
    auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-000000000001' } }, error: null }) },
  },
}));

// eslint-disable-next-line import/first
import { makeRegistryBackend } from '../services/registryBackend';
// eslint-disable-next-line import/first
import { projectRowFromState, projectStateFromRow, RP_PROJECT_COLUMNS } from '../services/projectState';
// eslint-disable-next-line import/first
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '../services/scenario';
// eslint-disable-next-line import/first
import { DEFAULT_AVO, DEFAULT_WEDGE } from '../services/defaults';
// eslint-disable-next-line import/first
import { planImport } from '@/lib/portability/importPackage';

const WELL = '11111111-1111-4111-8111-111111111111';
const ZONE = '22222222-2222-4222-8222-222222222222';
const TOP = '33333333-3333-4333-8333-333333333333';
const state = {
  scenario: DEFAULT_SCENARIO, rock: DEFAULT_ROCK, avo: { ...DEFAULT_AVO, topId: TOP }, wedge: DEFAULT_WEDGE, wellId: WELL, zoneId: ZONE,
};

beforeEach(() => { mockCalls.length = 0; });

test('RP-U1-001: the column list the code declares is the migration\'s', () => {
  expect(new Set(RP_PROJECT_COLUMNS)).toEqual(COLUMNS);
});

test('RP-U1-001: a save through the registry backend writes only real columns and succeeds', async () => {
  const backend = makeRegistryBackend();
  const saved = await backend.saveProject(projectRowFromState(state));
  expect(saved.id).toBe('p1');
  const row = mockCalls.find((c) => c.op === 'insert').row;
  for (const k of Object.keys(row)) expect(COLUMNS.has(k)).toBe(true);
  expect(row.scenarios).toEqual([DEFAULT_SCENARIO]);
  expect(row.well_ids).toEqual([WELL]);
  expect(row.rock.zoneId).toBe(ZONE);
});

test('RP-U1-001 negative control: the old save shape is refused by the same backend', async () => {
  const backend = makeRegistryBackend();
  await expect(backend.saveProject({ scenario: DEFAULT_SCENARIO, rock: DEFAULT_ROCK, avo: DEFAULT_AVO, wedge: DEFAULT_WEDGE }))
    .rejects.toThrow(/Could not find the 'scenario' column/);
});

test('RP-U1-001/013: the reader opens every saved shape and round-trips the current one', () => {
  const back = projectStateFromRow({ id: 'p1', ...projectRowFromState(state) });
  expect(back.scenario).toEqual(DEFAULT_SCENARIO);
  expect(back.rock).toEqual(DEFAULT_ROCK);
  expect(back.wellId).toBe(WELL);
  expect(back.zoneId).toBe(ZONE);
  expect(back.avo.topId).toBe(TOP);
  // the harness shape before U1 (scenario key, hc as a bare string)
  const old = projectStateFromRow({ scenario: { conditions: DEFAULT_SCENARIO.conditions, fluidA: { sw: 1, hc: 'gas' }, fluidB: { sw: 0, hc: 'oil-dead' } }, rock: { phiConst: 0.2 } });
  expect(old.scenario.fluidA.hc).toEqual({ kind: 'gas', gravity: 0.6 });
  expect(old.scenario.fluidB.hc).toEqual({ kind: 'oil-dead', api: 35 });
  expect(old.wellId).toBeNull();
  // an empty row (column defaults) opens with nothing to restore
  expect(projectStateFromRow({ scenarios: [], rock: {}, avo: {}, wedge: {}, well_ids: [] }))
    .toEqual({ scenario: null, rock: null, avo: null, wedge: null, wellId: null, zoneId: null });
});

test('RP-U1-013: a .pld import rewrites the project\'s well, zone and top ids', () => {
  const SRC = '44444444-4444-4444-8444-444444444444';
  const PROJ = '55555555-5555-4555-8555-555555555555';
  const pkg = {
    manifest: { package_id: '66666666-6666-4666-8666-666666666666', name: 't', source: { user_id: SRC }, created_at: '2026-10-01T00:00:00Z', notes: [] },
    tables: {
      geo_wells: [{ id: WELL, user_id: SRC, organization_id: null, name: 'W' }],
      geo_wells_tops: [{ id: TOP, well_id: WELL, name: 'Top', md_m: 2060 }],
      geo_wells_zones: [{ id: ZONE, well_id: WELL, name: 'Z', top_md_m: 2020, base_md_m: 2040 }],
      rp_projects: [{ id: PROJ, user_id: SRC, name: 'Default project', ...projectRowFromState(state) }],
    },
    blobs: new Map(),
  };
  const plan = planImport(pkg, { userId: '77777777-7777-4777-8777-777777777777', organizationId: null });
  const row = plan.planned.rp_projects[0];
  const newWell = plan.planned.geo_wells[0].id;
  expect(newWell).not.toBe(WELL);
  expect(row.well_ids).toEqual([newWell]);
  expect(row.rock.zoneId).toBe(plan.planned.geo_wells_zones[0].id);
  expect(row.avo.topId).toBe(plan.planned.geo_wells_tops[0].id);
});
