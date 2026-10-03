// RRV-U1 (Risked Reserves Valuation upgrade, 2026-10-02): rrv_valuations
// travel in a .pld. A valuation packaged WITH its prospect stays linked to
// it under the new ids (column, key and payload); packaged alone it keeps
// the old id as provenance and loses only the column link.
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { buildGeosciencePackage } from '@/lib/portability/exportPackage';
import { readPackage, planImport } from '@/lib/portability/importPackage';
import { tableSpec, getFamily, rootTable, importOrder } from '@/lib/portability/familySpec';
import { BACKUP_KINDS } from '@/lib/portability/backup';
import schema from '../../../../test-data/portability/manifest.schema.json';
import {
  fromRcpProspect, setInput, toRow, fromRow, payloadOf, upstreamState, RRV_KIND,
} from '@/pages/apps/riskedreserves/services/rrvStore';
import { RRV_SEED_PROSPECTS } from '@/pages/apps/riskedreserves/services/rrvFixtures';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

if (typeof globalThis.TextEncoder !== 'function') globalThis.TextEncoder = NodeTextEncoder;
if (typeof globalThis.TextDecoder !== 'function') globalThis.TextDecoder = NodeTextDecoder;

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const P = '00000001-0000-4000-8000-000000000000';
const V = '00000002-0000-4000-8000-000000000000';

const prospect = { id: P, user_id: USER, schema_version: 1, ...RRV_SEED_PROSPECTS[0] };
const valued = { ...setInput(fromRcpProspect(prospect, { now: new Date('2026-10-02T15:00:00Z') }), 'mefs', 15), ident: { company: 'Lordsway Energy', licence: 'OML 143', play: 'Agbada', analyst: 'A. Analyst' } };
const valuation = {
  id: V, user_id: USER, schema_version: 1, app_build: 'abc', created_at: '2026-10-02T15:01:00Z', updated_at: '2026-10-02T15:01:00Z',
  visibility: 'organization', organization_id: '0000000a-0000-4000-8000-000000000000', org_access: 'view', version: 3, updated_by: USER,
  ...toRow(valued),
};
const source = {
  async currentUser() { return { id: USER, organization_id: null, organization_name: null }; },
  async getRow(table, id) { return table === 'rcp_prospects' && id === P ? prospect : table === 'rrv_valuations' && id === V ? valuation : null; },
  async listChildren() { return []; },
  async downloadBlob() { return new Uint8Array(); },
  async listBlobs() { return []; },
  async listStateRowsForWells() { return []; },
  async getCustomCrs() { return null; },
};

test('the geoscience family carries rrv_valuations after the prospects, a backup lists it, the manifest allows it', () => {
  expect(getFamily('geoscience').roots.rrv_valuation).toBe('rrv_valuations');
  expect(rootTable('rrv_valuation')).toEqual({ family: 'geoscience', table: 'rrv_valuations' });
  expect(tableSpec('rrv_valuations').kind).toBe(RRV_KIND);
  expect(BACKUP_KINDS).toContain('rrv_valuation');
  expect(JSON.stringify(schema)).toContain('"rrv_valuation"');
  const order = importOrder();
  expect(order.indexOf('rrv_valuations')).toBeGreaterThan(order.indexOf('rcp_prospects'));
});

test('round trip with its prospect: the valuation comes back whole, private, and linked to the imported prospect', async () => {
  expect(valuation.rcp_prospect_id).toBe(P);
  const built = await buildGeosciencePackage(source, [{ kind: 'rcp_prospect', id: P }, { kind: 'rrv_valuation', id: V }], { name: 'Prospect and valuation' });
  expect([...built.collection.tables.rrv_valuations.keys()]).toEqual([V]);
  expect(built.refs.dangling).toEqual([]);
  const pkg = await readPackage(await built.writer.toUint8Array());
  const plan = planImport(pkg, { userId: DST, organizationId: null });
  expect(plan.problems || []).toEqual([]);
  const newProspect = plan.planned.rcp_prospects[0];
  const row = plan.planned.rrv_valuations[0];
  expect(row.user_id).toBe(DST);
  expect(row.id).not.toBe(V);
  // the three ways the valuation names its prospect all follow it
  expect(row.rcp_prospect_id).toBe(newProspect.id);
  expect(row.prospect_key).toBe(`rcp-${newProspect.id}`);
  expect(row.valuation.rcpId).toBe(newProspect.id);
  expect(row.valuation.id).toBe(`rcp-${newProspect.id}`);
  expect(row.valuation.handoff.recordId).toBe(newProspect.id);
  // the sharing state does not travel: importing is copying into a private record
  for (const c of ['visibility', 'organization_id', 'org_access', 'version', 'updated_by']) expect(row[c]).toBeUndefined();
  // the payload reads back to the same valuation, the ids aside
  const back = fromRow(row);
  const strip = (v) => { const { id, rcpId, handoff, ...rest } = payloadOf(v); const { recordId, ...h } = handoff; return { ...rest, handoff: h }; };
  expect(strip(back)).toEqual(strip(valued));
  expect(back.ident).toEqual(valued.ident);
  expect(back.mefs).toBe(15);
  // and it still recognises its source record as unchanged
  expect(upstreamState(back, [newProspect]).state).toBe('current');
});

test('a valuation packaged alone keeps the id it was valued against as provenance, and says the source is not in the inventory', async () => {
  const built = await buildGeosciencePackage(source, [{ kind: 'rrv_valuation', id: V }], { name: 'Valuation only' });
  expect(built.collection.tables.rcp_prospects?.size || 0).toBe(0);
  expect(built.refs.dangling).toEqual([]);
  const pkg = await readPackage(await built.writer.toUint8Array());
  const plan = planImport(pkg, { userId: DST, organizationId: null });
  const row = plan.planned.rrv_valuations[0];
  expect(row.rcp_prospect_id).toBeNull();
  expect(row.prospect_key).toBe(`rcp-${P}`);
  expect(row.valuation.handoff.recordId).toBe(P);
  expect(row.valuation.p90).toBe(12);
  expect(upstreamState(fromRow(row), []).state).toBe('missing');
});
