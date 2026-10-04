// VRR-U1 RL11: the FVFs from a Fluid Systems Studio project through the
// pvt-1 contract (the Good Oil Co. Well No. 4 fluid of the Fluid test kit),
// read per period at the period pressure, never extrapolated; the shared
// intake card says "edited after intake" and "source changed since".
import { vrrTableFromPvt, fvfAt, periodFvfFromTable, vrrPvtIntake, vrrPvtCardFields, vrrPvtSourceText } from '../pvtIntake';
import { deriveVrr } from '../workspace';
import { parseVrrWellCSV, vrrTemplateCSV } from '../csvImport';
import { defaultInputs } from '@/contexts/VrrMonitorContext';
import { pvtIntakeCardModel } from '@/lib/inputProvenance/pvtIntakeCard';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';

const ws = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT' });
const block = { ...ws.contract, project_id: 'fluid-1' };

describe('the table of the block in the monitor\'s units', () => {
  const t = vrrTableFromPvt(block);
  it('ascending in pressure, Bg in RB/Mscf: one known value (RB/scf x 1,000)', () => {
    expect(t.ok).toBe(true);
    expect(t.rows[0].p).toBeLessThan(t.rows[t.rows.length - 1].p);
    const src = block.table.find((r) => r.pressure === block.at_saturation.pressure) || block.table[5];
    const mine = t.rows.find((r) => r.p === src.pressure);
    expect(mine.Bg).toBeCloseTo(src.Bg * 1000, 9);
  });
  it('at the bubble point: the block\'s saturation values', () => {
    const sat = block.at_saturation;
    const v = fvfAt(t.rows, sat.pressure);
    expect(v.Bo).toBeCloseTo(sat.Bo, 3);
    expect(v.Rs).toBeCloseTo(sat.Rs, 1);
    expect(v.Bg).toBeCloseTo(sat.Bg * 1000, 2);
  });
  it('outside the table: null, never extrapolated', () => {
    expect(fvfAt(t.rows, t.rows[t.rows.length - 1].p + 100)).toBeNull();
    expect(fvfAt(t.rows, 1)).toBeNull();
  });
  it('NEGATIVE CONTROL: no block, no table', () => {
    expect(vrrTableFromPvt(null).ok).toBe(false);
    expect(vrrTableFromPvt({ ...block, units: { ...block.units, Bg: 'm3/m3' } }).ok).toBe(false);
  });
});

describe('taken into the monitor', () => {
  const taken = vrrPvtIntake(block, { pressurePsia: 2000, at: '2026-10-04T10:00:00Z' });
  const ledgerInputs = () => ({ ...defaultInputs(), mode: 'imported', wellRows: parseVrrWellCSV(vrrTemplateCSV()).rows });
  it('fills the constant set at the stated pressure and keeps the table with its source', () => {
    expect(taken.ok).toBe(true);
    expect(Number(taken.constant.Bo)).toBeCloseTo(fvfAt(taken.intake.table, 2000).Bo, 4);
    expect(taken.intake.from).toMatchObject({ recordId: 'fluid-1', recordName: 'Good Oil Well No. 4 PVT' });
    expect(taken.intake.contract.table).toBeUndefined();
    expect(vrrPvtSourceText(taken.intake, 'Bo')).toMatch(/at 2000 psia \(stated\); method .*Fluid Systems Studio project "Good Oil Well No. 4 PVT"/);
  });
  it('table mode: each period\'s FVFs are the table at the period pressure; a period outside the table keeps the constant set and is named', () => {
    const inputs = { ...ledgerInputs(), pvtMode: 'table', pvtIntake: taken.intake, fvf: { ...defaultInputs().fvf, ...taken.constant }, pressureSurveys: [{ date: '2025-01-15', p_psia: 2500 }, { date: '2025-02-15', p_psia: 2100 }, { date: '2025-03-15', p_psia: 9000 }] };
    const d = deriveVrr(inputs);
    expect(d.pvt.active).toBe(true);
    const r0 = d.ledger.rows[0];
    const want = fvfAt(taken.intake.table, d.periodsWithPressure[0].pressure);
    expect(r0.fvf.Bo).toBeCloseTo(want.Bo, 12);
    expect(r0.fvf.Bg).toBeCloseTo(want.Bg, 12);
    expect(r0.fvfFrom).toMatchObject({ Bo: 'period', Bg: 'period', Rs: 'period' });
    expect(d.pvt.outside).toEqual([2]);
    expect(d.pvt.warnings[0]).toMatch(/2025-03\) lie outside the PVT table/);
    expect(d.ledger.rows[2].fvfFrom.Bo).toBe('global');
    expect(d.ledger.closure).toBeLessThan(1e-12);
    // below the bubble point Rs and Bo fall with pressure and Bg rises
    expect(d.ledger.rows[1].fvf.Rs).toBeLessThan(d.ledger.rows[0].fvf.Rs);
    expect(d.ledger.rows[1].fvf.Bg).toBeGreaterThan(d.ledger.rows[0].fvf.Bg);
  });
  it('without pressure the table cannot be read and says so', () => {
    const d = deriveVrr({ ...ledgerInputs(), pvtMode: 'table', pvtIntake: taken.intake });
    expect(d.pvt.active).toBe(false);
    expect(d.pvt.withheld).toMatch(/No pressure attaches/);
  });
  it('periodFvfFromTable keeps a period with no pressure on the constant set', () => {
    const r = periodFvfFromTable(taken.intake.table, [null, 2000]);
    expect(r.overrides[0]).toBeNull();
    expect(r.overrides[1].Bo).toBeGreaterThan(1);
  });
});

describe('the shared intake card in the monitor', () => {
  const taken = vrrPvtIntake(block, { at: '2026-10-04T10:00:00Z' });
  const fields = vrrPvtCardFields(taken.intake);
  it('as received, with the method of each value named by the block', () => {
    const m = pvtIntakeCardModel({ intake: taken.intake, current: taken.constant, fields });
    expect(m.status).toBe('As received');
    expect(m.rows.map((r) => r.label)).toEqual(['Bo (RB/STB)', 'Bw (RB/STB)', 'Bg (RB/Mscf)', 'Rs (scf/STB)']);
    expect(m.rows[0].method).toBe(block.methods.bo.method);
  });
  it('edited after intake', () => {
    const m = pvtIntakeCardModel({ intake: taken.intake, current: { ...taken.constant, Bo: '1.3' }, fields });
    expect(m.status).toBe('Edited after intake');
    expect(m.edited).toEqual(['Bo (RB/STB)']);
  });
  it('source changed since: content, not the save time', () => {
    const resaved = { ...block, generated_at: '2026-10-05T00:00:00Z' };
    expect(pvtIntakeCardModel({ intake: taken.intake, current: taken.constant, fields, latest: { ok: true, contract: resaved } }).status).toBe('As received');
    const changed = { ...block, at_saturation: { ...block.at_saturation, Bo: block.at_saturation.Bo + 0.01 } };
    expect(pvtIntakeCardModel({ intake: taken.intake, current: taken.constant, fields, latest: { ok: true, contract: changed } }).status).toBe('Source changed since');
  });
});
