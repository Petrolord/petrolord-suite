// RCP-U1-026 (ReservoirCalc Pro upgrade U1, 2026-09-30): rcp_prospects
// travel in a .pld (plan cross-cutting item). Before: the table was in no
// family, so a package or backup lost the prospect inventory that Risked
// Reserves Valuation reads. The saved projects themselves already travel
// as saved_quickvol_projects in the apps family.
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildGeosciencePackage } from '@/lib/portability/exportPackage';
import { readPackage, planImport } from '@/lib/portability/importPackage';
import { tableSpec, getFamily, rootTable } from '@/lib/portability/familySpec';
import { BACKUP_KINDS } from '@/lib/portability/backup';
import { SAVED_PROJECT_TABLES } from '@/lib/portability/familiesCore';
import schema from '../../../../test-data/portability/manifest.schema.json';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const P = '00000001-0000-4000-8000-000000000000';

const prospect = {
  id: P, user_id: USER, name: 'Keta North', schema_version: 1,
  pg_factors: { trap: 0.6, reservoir: 0.7, charge: 0.8, seal: 0.7 },
  inputs: { mean: 42.1, p90: 20.3, p50: 38.0, p10: 70.2, unit: 'MMbbl', basis: 'recoverable' },
  risked: { pg: 0.2352, risked_mean: 9.9, success: { mean: 42.1, p90: 20.3, p50: 38.0, p10: 70.2 } },
};
const source = {
  async currentUser() { return { id: USER, organization_id: null, organization_name: null }; },
  async getRow(table, id) { return table === 'rcp_prospects' && id === P ? prospect : null; },
  async listChildren() { return []; },
  async downloadBlob() { return new Uint8Array(); },
  async listBlobs() { return []; },
  async listStateRowsForWells() { return []; },
  async getCustomCrs() { return null; },
};

test('the geoscience family carries rcp_prospects with a root kind, a backup lists it, the manifest allows it', () => {
  expect(getFamily('geoscience').roots.rcp_prospect).toBe('rcp_prospects');
  expect(rootTable('rcp_prospect')).toEqual({ family: 'geoscience', table: 'rcp_prospects' });
  expect(tableSpec('rcp_prospects').kind).toBe('rcp-prospect');
  expect(BACKUP_KINDS).toContain('rcp_prospect');
  expect(JSON.stringify(schema)).toContain('"rcp_prospect"');
  // the saved projects already travel
  expect(SAVED_PROJECT_TABLES).toContain('saved_quickvol_projects');
});

test('a prospect package imports under the new owner with its unit and basis', async () => {
  const built = await buildGeosciencePackage(source, [{ kind: 'rcp_prospect', id: P }], { name: 'Prospect handover' });
  expect([...built.collection.tables.rcp_prospects.keys()]).toEqual([P]);
  expect(built.refs.dangling).toEqual([]);
  const pkg = await readPackage(await built.writer.toUint8Array());
  const plan = planImport(pkg, { userId: DST, organizationId: null });
  const row = plan.planned.rcp_prospects[0];
  expect(row.user_id).toBe(DST);
  expect(row.id).not.toBe(P);
  expect(row.inputs).toMatchObject({ unit: 'MMbbl', basis: 'recoverable' });
  expect(row.risked.pg).toBeCloseTo(0.2352, 9);
});
