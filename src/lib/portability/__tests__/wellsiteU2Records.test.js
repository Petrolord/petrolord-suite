// Wellsite Studio upgrade U2 (2026-10-01), PL5: every record type the
// upgrade added lives in ws_records, so it is stored offline, queued and
// packaged with the well. A .pld import gives every row a new id; the ids
// these records carry in their payloads (the import a data chunk belongs
// to, the lag check a washout rests on) must follow, or an imported well
// would lose its mudlog curves and its washout would cite nothing. The
// app's own readers are run on the imported rows.
import '@/lib/portability/familyWellsite';
import { planImport } from '@/lib/portability/importPackage';
import { parseMudlogFile, initialMapping, convertMudlog, mudlogRecords, mudlogSeries, withdrawParams, importsOf, IMPORT_SUBTYPE, DATA_SUBTYPE } from '@/pages/apps/WellsiteStudio/services/mudlogImport';
import { washoutParams, currentWashout, LAG_CHECK_SUBTYPE } from '@/pages/apps/WellsiteStudio/services/lagCheck';
import { buildRun, activeSurvey } from '@/pages/apps/WellsiteStudio/services/surveys';
import { chromatographParams, gasReading } from '@/pages/apps/WellsiteStudio/services/gas';
import { dxcSettingsParams, currentDxcSettings } from '@/pages/apps/WellsiteStudio/services/dexponent';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const GEO = U(1); const WELL = U(2); const CHECK = U(3); const WASH = U(4); const IMP = U(5); const IMP2 = U(6); const WITHDRAW = U(7); const GAS = U(8); const RUN = U(9); const DXC = U(10);
const stamp = { schema_version: 1, app_build: 'test' };
const REG = [{ md: 0, inc: 0, azi: 0 }, { md: 1400, inc: 0, azi: 0 }, { md: 3200, inc: 30, azi: 90 }];
const rec = (id, p, extra = {}) => ({ id, well_id: WELL, kind: p.kind, subtype: p.subtype, chain_id: id, version_no: 1, evidence_ids: p.evidenceIds || [], payload: p.payload, occurred_at: '2026-10-01T10:00:00.000Z', md_calc_m: 3000, ...stamp, ...extra });

const table = parseMudlogFile('Depth (m),ROP (m/hr),Total Gas (%)\n3000,20,0.4\n3001,22,0.5\n3002,21,0.6\n');
const mapping = { ...initialMapping(table), depthDatum: 'KB' };
const one = mudlogRecords(convertMudlog(table, mapping), { importId: IMP, fileName: 'a.csv', table, mapping });
const two = mudlogRecords(convertMudlog(table, mapping), { importId: IMP2, fileName: 'wrong-well.csv', table, mapping });
const head2 = rec(IMP2, two.header);
const records = [
  rec(CHECK, { kind: 'observation', subtype: LAG_CHECK_SUBTYPE, payload: { text: 'Lag check', measured_lag_strokes: 5100, calculated_lag_strokes: 4600, washout_fraction: 0.2 } }),
  rec(WASH, washoutParams({ washoutFraction: 0.2, lagCheckId: CHECK })),
  rec(IMP, one.header),
  ...one.chunks.map((c, i) => rec(U(100 + i), c)),
  head2,
  ...two.chunks.map((c, i) => rec(U(200 + i), c)),
  rec(WITHDRAW, { kind: 'observation', subtype: IMPORT_SUBTYPE, ...withdrawParams(head2, { reason: 'file from another well', person: 'R' }) }, { supersedes_id: IMP2, occurred_at: '2026-10-01T11:00:00.000Z' }),
  rec(GAS, chromatographParams({ components: { c1: 70000, c2: 12000, c3: 9000, ic4: 2500, nc4: 3500, ic5: 1000, nc5: 2000 }, unit: 'ppm' })),
  rec(RUN, buildRun({ stations: [{ md: 3300, inc: 32, azi: 90 }], mdUnit: 'm', azimuthRef: 'grid', current: REG })),
  rec(DXC, dxcSettingsParams({ normalValue: 8.6, normalUnit: 'ppg', trendFromMdM: 2900, trendToMdM: 3000 })),
];
const pkg = {
  manifest: { package_id: U(99), name: 'Live well with U2 records', source: { user_id: USER, organization_id: null }, created_at: '2026-10-01T00:00:00Z', platform: { sha: 'abc' }, notes: [] },
  blobs: [],
  tables: {
    geo_wells: [{ id: GEO, user_id: USER, organization_id: null, name: 'KETA-2', kb_m: 25, deviation: REG, ...stamp }],
    ws_wells: [{ id: WELL, geo_well_id: GEO, organization_id: null, name: 'KETA-2', header: { kb_elev_m: 25 }, settings: {}, survey: { version: 'registry-1', stations: REG }, ...stamp }],
    ws_records: records,
  },
};

const plan = planImport(pkg, { userId: DST, organizationId: null });
const newId = (old) => plan.items.find((i) => i.oldId === old).newId;
const out = plan.planned.ws_records;
const well = plan.planned.ws_wells[0];

test('before import the readers see one live import of three rows, a washout citing its check, and the rig survey', () => {
  expect(mudlogSeries(records)).toMatchObject({ imports: 1 });
  expect(mudlogSeries(records).points).toHaveLength(3);
  expect(currentWashout(records).lagCheckId).toBe(CHECK);
});

test('every row has a new id and belongs to the imported well', () => {
  expect(out).toHaveLength(records.length);
  for (const r of out) { expect(records.some((x) => x.id === r.id)).toBe(false); expect(r.well_id).toBe(well.id); }
});

test('mudlog data chunks still belong to their import, and the withdrawn import stays withdrawn', () => {
  const chunk = out.find((r) => r.subtype === DATA_SUBTYPE && r.payload.import_id === newId(IMP));
  expect(chunk).toBeTruthy();
  const s = mudlogSeries(out);
  expect(s.imports).toBe(1);
  expect(s.points.map((p) => [p.mdM, p.values.rop, p.values.total_gas])).toEqual([[3000, 20, 0.4], [3001, 22, 0.5], [3002, 21, 0.6]]);
  const imports = importsOf(out);
  expect(imports.current.map((h) => h.id).sort()).toEqual([newId(IMP), newId(WITHDRAW)].sort());
  expect(imports.current.find((h) => h.id === newId(WITHDRAW)).payload).toMatchObject({ withdrawn: true, import_id: newId(IMP2) });
  // negative control: with the old id left in the payload the chunks would be orphans the reader cannot tell from live data
  expect(out.some((r) => r.subtype === DATA_SUBTYPE && [IMP, IMP2].includes(r.payload.import_id))).toBe(false);
});

test('the washout in force cites the imported lag check, in its payload and its evidence', () => {
  const w = currentWashout(out);
  expect(w.fraction).toBe(0.2);
  expect(w.lagCheckId).toBe(newId(CHECK));
  expect(w.record.evidence_ids).toEqual([newId(CHECK)]);
});

test('the chromatograph reading, the survey run and the d-exponent settings read the same after import', () => {
  expect(gasReading(out.find((r) => r.id === newId(GAS))).haworth.wh).toBeCloseTo(30, 12);
  const a = activeSurvey(well, out);
  expect(a).toMatchObject({ source: 'actual', runs: 1 });
  expect(a.survey.stations.map((s) => s.md)).toEqual([0, 1400, 3200, 3300]);
  expect(currentDxcSettings(out)).toMatchObject({ normalValue: 8.6, normalUnit: 'ppg', trendFromMdM: 2900, trendToMdM: 3000 });
});
