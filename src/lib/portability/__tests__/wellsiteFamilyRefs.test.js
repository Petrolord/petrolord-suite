// WS-U1-003 (Wellsite Studio upgrade U1, 2026-10-01): a live well travels
// through a .pld with its own ids rewritten. Every row gets a new id on
// import, so the ids a row carries inside its columns (the competing heads a
// resolution settled, the evidence a call cites, the chain id of a version,
// the call a top_called event names, the registry well a prognosis came
// from) must follow, or a resolved conflict comes back and the evidence
// chain points at nothing.
import '@/lib/portability/familyWellsite';
import { planImport } from '@/lib/portability/importPackage';
import { topConflicts, chainHeads } from '@/lib/wellsite/tops';
import { evidenceChain } from '@/pages/apps/WellsiteStudio/services/tops';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const GEO = U(1); const WELL = U(2); const OBS = U(3); const TA = U(4); const TB = U(5); const TC = U(6); const EV = U(7); const PROG = U(8); const REP = U(9);
const stamp = { schema_version: 1, app_build: 'test' };

const top = (id, extra) => ({
  id, well_id: WELL, formation_key: 'top_agbada', name: 'Top Agbada', role: 'official', status: 'confirmed', confidence: 'high', basis: 'GR drop',
  chain_id: TA, version_no: 1, previous_version_id: null, resolves_ids: null, evidence_ids: [OBS], md_calc_m: 3099, occurred_at: '2026-09-07T10:00:00.000Z', ...stamp, ...extra,
});

const pkg = {
  manifest: { package_id: U(99), name: 'Live well', source: { user_id: USER, organization_id: null }, created_at: '2026-10-01T00:00:00Z', platform: { sha: 'abc' }, notes: [] },
  blobs: [],
  tables: {
    geo_wells: [{ id: GEO, user_id: USER, organization_id: null, name: 'KETA-2', kb_m: 25, deviation: [], ...stamp }],
    ws_wells: [{ id: WELL, geo_well_id: GEO, organization_id: null, name: 'KETA-2', header: {}, settings: {}, ...stamp }],
    ws_records: [
      { id: OBS, well_id: WELL, kind: 'observation', subtype: 'total_gas', chain_id: OBS, version_no: 1, evidence_ids: [], payload: { value: 120, unit: 'units' }, ...stamp },
      { id: EV, well_id: WELL, kind: 'event', subtype: 'top_called', chain_id: EV, version_no: 1, evidence_ids: [TC], payload: { label: 'Top Agbada called', top_id: TC }, ...stamp },
    ],
    ws_tops: [
      top(TA),
      // the office called it fresh on its own chain: a competing head
      top(TB, { chain_id: TB, md_calc_m: 3101, created_by: USER }),
      // the approver resolved both, citing them, as version 2 of the rig's chain
      top(TC, { version_no: 2, previous_version_id: TA, resolves_ids: [TA, TB], basis: 'Rig pick stands' }),
    ],
    ws_prognosis: [{ id: PROG, well_id: WELL, version: 1, source: { geo_well_id: GEO, offset_well_ids: [GEO] }, tops: [{ name: 'Top Agbada', md_m: 3100, registry_top_id: null }], offset_tops: [{ well_id: GEO, name: 'Top Agbada' }], ...stamp }],
    ws_reports: [{ id: REP, well_id: WELL, kind: 'daily', chain_id: REP, version_no: 1, previous_version_id: null, canonical: { cited: [OBS] }, content_hash: 'sha256:x', ...stamp }],
  },
};

const plan = planImport(pkg, { userId: DST, organizationId: null });
const newId = (old) => plan.items.find((i) => i.oldId === old).newId;
const tops = plan.planned.ws_tops;

test('the source package itself has one head and no conflict (the resolution holds)', () => {
  expect(chainHeads(pkg.tables.ws_tops).map((t) => t.id)).toEqual([TC]);
  expect(topConflicts(pkg.tables.ws_tops)).toEqual([]);
});

test('after import the resolution still holds: one head, no conflict', () => {
  expect(chainHeads(tops).map((t) => t.id)).toEqual([newId(TC)]);
  expect(topConflicts(tops)).toEqual([]);
  const tc = tops.find((t) => t.id === newId(TC));
  expect(tc.resolves_ids).toEqual([newId(TA), newId(TB)]);
});

test('versions keep one chain under the new ids, and the evidence chain walks to the observation', () => {
  const ta = tops.find((t) => t.id === newId(TA));
  const tc = tops.find((t) => t.id === newId(TC));
  expect(ta.chain_id).toBe(newId(TA));
  expect(tc.chain_id).toBe(newId(TA));
  const chain = evidenceChain(tc, { tops, records: plan.planned.ws_records });
  expect(chain.map((r) => r.id)).toEqual(expect.arrayContaining([newId(TC), newId(TA), newId(OBS)]));
  const ev = plan.planned.ws_records.find((r) => r.id === newId(EV));
  expect(ev.payload.top_id).toBe(newId(TC));
  expect(ev.evidence_ids).toEqual([newId(TC)]);
});

test('the prognosis names the imported registry well; the report keeps its signed canonical model', () => {
  const p = plan.planned.ws_prognosis[0];
  expect(p.source.geo_well_id).toBe(newId(GEO));
  expect(p.source.offset_well_ids).toEqual([newId(GEO)]);
  expect(p.offset_tops[0].well_id).toBe(newId(GEO));
  const r = plan.planned.ws_reports[0];
  expect(r.chain_id).toBe(newId(REP));
  // the canonical model is what was signed: its hash must still verify, so it is not rewritten
  expect(r.canonical).toEqual({ cited: [OBS] });
});
