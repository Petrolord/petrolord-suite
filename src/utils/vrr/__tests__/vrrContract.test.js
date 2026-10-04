// VRR-U2-001: the `vrr-1` contract. One documented read-by-id contract of a
// saved Voidage Replacement Monitor project for the ledger AND the pressure
// rows, converged with Waterflood's `vrr-ledger-1` (WF-U2-004): one builder,
// one fingerprint, a schema and a version field. Material Balance reads its
// pressure rows through it (its numbers identical: its own reader on the old
// direct read is the control) and Waterflood reads the ledger through it
// (a legacy `vrr-ledger-1` contract or intake still reads).
import {
  buildVrrContract, buildVrrLedgerContract, vrrPressureRows, isVrrContract, vrrLedgerFingerprint,
  VRR_SCHEMA, VRR_CONTRACT_VERSION, VRR_SCHEMAS, compareVrrWithSource, getVrrContract,
} from '../vrrLedgerContract';
import { vrrSurveys, takeSurveys } from '@/pages/apps/reservoir-balance/lib/vrrPressureIntake';
import { surveillanceFromVrrLedger, vrrIntakeLines, isVrrIntakeSource } from '@/utils/waterflooddesign/vrrIntake';
import { fingerprint } from '@/utils/declineCurve/dcaModel';
import { projectPayload, defaultInputs } from '@/contexts/VrrMonitorContext';
import { parseVrrWellCSV, vrrTemplateCSV } from '../csvImport';

// The read Material Balance did before U2-001, verbatim (the control)
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
function legacyVrrSurveys(row) {
  const list = row?.inputs_data?.inputs?.pressureSurveys;
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => ({ date: String(s?.date ?? '').trim(), p_psia: Number(s?.p_psia) }))
    .filter((s) => /^\d{4}-\d{2}(-\d{2})?$/.test(s.date) && finite(s.p_psia) && s.p_psia > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

const SURVEYS = [{ date: '2025-03-15', p_psia: 2300 }, { date: '2025-01', p_psia: '2600' }, { date: 'bad', p_psia: 1 }, { date: '2025-02-01', p_psia: '' }, { date: ' 2025-02-10 ', p_psia: 2450.5 }];
const ledgerInputs = () => ({ ...defaultInputs(), mode: 'imported', wellRows: parseVrrWellCSV(vrrTemplateCSV()).rows, pressureSurveys: SURVEYS, datum: { depth: '8500', reference: 'TVDSS' } });
const gridInputs = () => ({ ...defaultInputs(), pressureSurveys: SURVEYS });
const row = (inputs, id = 'p1', name = 'Ekene VRR') => ({ id, project_name: name, updated_at: '2026-10-04T09:00:00Z', inputs_data: projectPayload({ id, name, inputs }) });
const contractOf = (r) => buildVrrContract({ projectId: r.id, projectName: r.project_name, projectSavedAt: r.updated_at, payload: r.inputs_data });

describe('VRR-U2-001: one contract for the ledger and the pressure rows', () => {
  it('a ledger project: schema, version, the ledger and the pressure rows, the datum as stated', () => {
    const { ok, contract: c } = contractOf(row(ledgerInputs()));
    expect(ok).toBe(true);
    expect(c.schema).toBe(VRR_SCHEMA);
    expect(VRR_SCHEMA).toBe('vrr-1');
    expect(c.version).toBe(VRR_CONTRACT_VERSION);
    expect(c.hasLedger).toBe(true);
    expect(c.months).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(c.wells).toEqual({ injectors: ['I-1', 'I-2'], producers: ['P-1', 'P-2'] });
    expect(c.totals.oil_stb).toBe(40500);
    expect(c.pressureRows).toEqual([{ date: '2025-01', p_psia: 2600 }, { date: '2025-02-10', p_psia: 2450.5 }, { date: '2025-03-15', p_psia: 2300 }]);
    expect(c.datum).toEqual({ depth_ft: 8500, reference: 'TVDSS', corrected: false });
    expect(c.units.pressure).toBe('psia (absolute), as saved; not corrected to the datum');
    expect(isVrrContract(c)).toBe(true);
  });
  it('a period-grid project still sends its pressure rows; the ledger part names why it is absent', () => {
    const { ok, contract: c } = contractOf(row(gridInputs()));
    expect(ok).toBe(true);
    expect(c.hasLedger).toBe(false);
    expect(c.ledgerRefusal).toMatch(/field period grid/);
    expect(c.pressureRows).toHaveLength(3);
    // the ledger reader refuses it with the reason it always gave
    expect(buildVrrLedgerContract({ projectId: 'p1', payload: row(gridInputs()).inputs_data })).toEqual({ ok: false, reason: c.ledgerRefusal });
  });
  it('Material Balance reads its pressure rows through the contract; numbers identical to its old direct read', () => {
    for (const inputs of [ledgerInputs(), gridInputs(), { ...defaultInputs('si'), pressureSurveys: [{ date: '2025-01-15', p_psia: 3000.0000001 }] }]) {
      const r = row(inputs);
      expect(vrrSurveys(r)).toEqual(legacyVrrSurveys(r));
      expect(vrrSurveys(r)).toEqual(vrrPressureRows(contractOf(r).contract));
    }
    // a row with no inputs at all
    expect(vrrSurveys({ id: 'x', inputs_data: null })).toEqual([]);
  });
  it('the Material Balance handoff records the contract it read (schema, version, fingerprint)', () => {
    const r = row(ledgerInputs());
    const rows = [{ timestep_index: 0, observation_date: '2024-12-01', pressure_psia: 2800 }, { timestep_index: 1, observation_date: '2025-01-01', pressure_psia: 2700 }];
    const got = takeSurveys(r, rows, { now: '2026-10-04T00:00:00Z' });
    expect(got.rows.map((x) => x.pressure_psia)).toEqual([2800, 2600]);
    expect(got.handoff.contract).toEqual({ schema: 'vrr-1', version: 1, fingerprint: contractOf(r).contract.fingerprint });
  });
  it('one fingerprint: the vrr-ledger-1 composition, so a Waterflood intake taken before U2-001 does not read as changed', () => {
    const r = row(ledgerInputs());
    const c = contractOf(r).contract;
    expect(c.fingerprint).toBe(fingerprint({ projectId: c.projectId, wells: c.wells, months: c.months, volumes: c.volumes, fvf: c.fvf, pressureSurveys: c.pressureSurveys }));
    expect(vrrLedgerFingerprint(c)).toBe(c.fingerprint);
    expect(compareVrrWithSource(c.fingerprint, { ok: true, contract: c }).state).toBe('unchanged');
  });
  it('Waterflood reads a vrr-1 contract and a legacy vrr-ledger-1 one the same way; an unknown schema is refused', () => {
    const c = contractOf(row(ledgerInputs())).contract;
    const a = surveillanceFromVrrLedger(c, { at: '2026-10-04' });
    const b = surveillanceFromVrrLedger({ ...c, schema: 'vrr-ledger-1', version: undefined }, { at: '2026-10-04' });
    expect(a.ok).toBe(true);
    expect(a.rows).toEqual(b.rows);
    expect(VRR_SCHEMAS).toEqual(['vrr-1', 'vrr-ledger-1']);
    // negative control: a contract of another schema is not read
    expect(surveillanceFromVrrLedger({ ...c, schema: 'vrr-ledger-2' }).ok).toBe(false);
    expect(surveillanceFromVrrLedger({ ...c, hasLedger: false }).ok).toBe(false);
    // an intake saved with the old source name still prints its read-back
    expect(isVrrIntakeSource('vrr-ledger-1')).toBe(true);
    expect(vrrIntakeLines({ ...a.intake, source: 'vrr-ledger-1' })).toEqual(vrrIntakeLines(a.intake));
  });
  it('read by id: the contract of one saved project, null when it is gone', async () => {
    const r = row(ledgerInputs());
    const client = { from: () => ({ select: () => ({ eq: (k, v) => ({ limit: async () => ({ data: v === 'p1' ? [r] : [], error: null }) }) }) }) };
    expect((await getVrrContract(client, { projectId: 'p1' })).contract.fingerprint).toBe(contractOf(r).contract.fingerprint);
    expect(await getVrrContract(client, { projectId: 'gone' })).toBeNull();
  });
});
