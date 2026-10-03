/**
 * FLUID-U2-018: quality checks of the laboratory tables, flagged and never
 * corrected. The published study (Good Oil Co. Well No. 4) is the
 * reference: its differential liberation closes its mass balance stage by
 * stage, so the check passes on it; a corrupted row does not.
 */
import { labQc, dlMassBalance, yFunctionCheck, AIR_LB_PER_SCF } from '@/utils/fluidstudio/labQc';
import { goodOilBlackOil, goodOilLabData, run } from './fluidTestKit';

const ATM = 14.696;

describe('the published study passes', () => {
  const d = goodOilLabData();
  const q = labQc(d);
  it('the mass balance of every stage closes within 0.1 percent', () => {
    expect(q.massBalance).toHaveLength(11);
    for (const m of q.massBalance) expect(Math.abs(m.deviation)).toBeLessThan(0.001);
  });
  it('worked value, the 159 psig stage: 0.7382 x 1.244 against 0.7892 x 1.075 plus 157 scf of 2.039 gravity gas', () => {
    const m = dlMassBalance(d.dl.rows).find((x) => Math.abs(x.pressure - (159 + ATM)) < 1e-6);
    const lbPerGccBbl = 62.42796 * 5.614583;
    expect(m.measured).toBeCloseTo(0.7382 * 1.244 * lbPerGccBbl, 4);
    expect(m.fromBelow).toBeCloseTo(0.7892 * 1.075 * lbPerGccBbl + AIR_LB_PER_SCF * 2.039 * 157, 4);
  });
  it('only the Y function next to the saturation pressure is flagged, as is usual there', () => {
    expect(q.flags.map((f) => f.check)).toEqual(['y-function']);
    expect(q.flags[0].pressure).toBeCloseTo(2605 + ATM, 6);
    expect(yFunctionCheck(d.cce.rows).line.slope).toBeGreaterThan(0);
  });
});

describe('a corrupted table is flagged, and nothing is changed', () => {
  it('a Bod typed wrongly breaks the trend and the mass balance of its stages', () => {
    const d = goodOilLabData();
    const before = JSON.stringify(d);
    const bad = { ...d, dl: { ...d.dl, rows: d.dl.rows.map((r) => (Math.abs(r.pressure - (1350 + ATM)) < 1e-6 ? { ...r, Bo: 1.512 } : r)) } };
    const q = labQc(bad);
    expect(q.flags.some((f) => f.check === 'trend' && f.key === 'Bo')).toBe(true);
    expect(q.flags.filter((f) => f.check === 'mass-balance').length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(d)).toBe(before);
  });
  it('a non-monotonic Rsd, a relative volume that rises with pressure, a viscosity that rises below Pb', () => {
    const d = goodOilLabData();
    const q = labQc({
      ...d,
      dl: { ...d.dl, rows: d.dl.rows.map((r, i) => (i === 3 ? { ...r, Rs: 700 } : r)) },
      cce: { ...d.cce, rows: d.cce.rows.map((r, i) => (i === 2 ? { ...r, relVol: 0.95 } : r)) },
      viscosity: { ...d.viscosity, rows: d.viscosity.rows.map((r, i) => (i === 12 ? { ...r, mu_o: 0.3 } : r)) },
    });
    const keys = q.flags.map((f) => `${f.check}:${f.key}`);
    expect(keys).toEqual(expect.arrayContaining(['trend:Rs', 'trend:relVol', 'trend:mu_o']));
  });
});

describe('the report and the contract carry the checks', () => {
  it('the report lists what was checked, what was flagged, and the mass balance table', () => {
    const ws = run(goodOilBlackOil());
    const qc = ws.report.model.lab.qc;
    expect(qc.checked.length).toBe(3);
    expect(qc.flags).toHaveLength(1);
    expect(qc.massBalance.rows).toHaveLength(11);
    expect(ws.contract.lab_data.qc.mass_balance_max_percent).toBeLessThan(0.1);
    expect(ws.contract.lab_data.qc.flags).toHaveLength(1);
  });
});
