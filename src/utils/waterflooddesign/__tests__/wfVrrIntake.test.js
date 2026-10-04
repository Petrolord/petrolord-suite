/**
 * WF-U2-004: the surveillance history from a Voidage Replacement Monitor
 * ledger, read by id (`vrr-ledger-1`). The gate calls both engines: the
 * history taken into Waterflood (analyzeWaterflood, calendar weighting) gives
 * the totals and the cumulative VRR that VRR Monitor computes on the same
 * ledger (buildFieldPeriods + computeVRRSeries, the byte-stable vrr.js core),
 * to 1e-12, including the last month. Negative control: rows dated monthly
 * with the volume over the days of their own month (the obvious conversion)
 * miss the last month.
 */
import { analyzeWaterflood } from '@/utils/waterfloodCalculations';
import { buildFieldPeriods, computeVRRSeries } from '@/utils/vrrCalculations';
import { buildVrrLedgerContract, compareVrrWithSource, getVrrLedger } from '@/utils/vrr/vrrLedgerContract';
import { surveillanceFromVrrLedger, vrrIntakeLines } from '../vrrIntake';
import { readBackLines } from '../surveillanceImport';

// a ledger as VRR Monitor stores it: daily rows in January, monthly rows after (both are allowed there)
const wellRows = [];
for (let d = 1; d <= 31; d += 1) {
  const date = `2025-01-${String(d).padStart(2, '0')}`;
  wellRows.push({ date, well: 'INJ-1', winj_stb: 900 });
  wellRows.push({ date, well: 'PROD-1', oil_stb: 400, water_stb: 150, gas_mscf: 260 });
}
wellRows.push({ date: '2025-02', well: 'INJ-1', winj_stb: 26000, ginj_mscf: 0 });
wellRows.push({ date: '2025-02', well: 'PROD-1', oil_stb: 10500, water_stb: 5200, gas_mscf: 6900 });
wellRows.push({ date: '2025-03', well: 'INJ-1', winj_stb: 30500 });
wellRows.push({ date: '2025-03', well: 'PROD-1', oil_stb: 11000, water_stb: 6100, gas_mscf: 7400 });
wellRows.push({ date: '2025-03', well: 'PROD-2', oil_stb: 2000, water_stb: 300, gas_mscf: 1100 });
const FVF = { Bo: '1.3', Bw: '1.02', Bg: '0.85', Rs: '500' };
const payload = { id: 'v1', name: 'Ekene VRR', schema: 1, inputs: { mode: 'imported', wellRows, fvf: FVF, pressureSurveys: [{ date: '2025-02', p_psia: 2400 }] } };
const contract = () => buildVrrLedgerContract({ projectId: 'v1', projectName: 'Ekene VRR', projectSavedAt: '2026-10-04T09:00:00Z', payload }).contract;
const cfg = { bo: 1.3, bw: 1.02, bg: 0.85, rs: 500, time_weighting: 'calendar' };

describe('the vrr-ledger-1 contract', () => {
  it('carries the months per well as VRR Monitor sums them, with a fingerprint', () => {
    const c = contract();
    expect(c.schema).toBe('vrr-1'); // VRR-U2-001: converged with the pressure rows; 'vrr-ledger-1' still reads (vrrContract.test.js)
    expect(c.months).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(c.wells).toEqual({ injectors: ['INJ-1'], producers: ['PROD-1', 'PROD-2'] });
    expect(c.volumes.find((v) => v.month === '2025-01' && v.well === 'PROD-1').oil_stb).toBe(12400);
    expect(c.totals.winj_stb).toBe(900 * 31 + 26000 + 30500);
    const edited = buildVrrLedgerContract({ projectId: 'v1', payload: { ...payload, inputs: { ...payload.inputs, wellRows: [...wellRows, { date: '2025-03', well: 'INJ-1', winj_stb: 1 }] } } }).contract;
    expect(edited.fingerprint).not.toBe(c.fingerprint);
    expect(compareVrrWithSource(c.fingerprint, { ok: true, contract: edited }).state).toBe('changed');
    expect(compareVrrWithSource(c.fingerprint, { ok: true, contract: c }).state).toBe('unchanged');
  });

  it('refuses a period grid by name', () => {
    const r = buildVrrLedgerContract({ projectId: 'v2', payload: { inputs: { mode: 'manual', periods: [{ label: 'Q1', Np: '1' }] } } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/field period grid, not a per-well ledger/);
  });

  it('is read by id', async () => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [{ id: 'v1', project_name: 'Ekene VRR', inputs_data: payload, updated_at: 'x' }], error: null }) };
    const got = await getVrrLedger({ from: () => q }, { projectId: 'v1' });
    expect(got.contract.fingerprint).toBe(contract().fingerprint);
  });
});

describe('taken into Waterflood surveillance', () => {
  const c = contract();
  const got = surveillanceFromVrrLedger(c, { at: '2026-10-04T09:00:00Z' });
  const wf = analyzeWaterflood(got.rows, cfg);
  const vrr = computeVRRSeries(buildFieldPeriods(wellRows), { Bo: 1.3, Bw: 1.02, Bg: 0.85, Rs: 500 });
  const last = vrr[vrr.length - 1];

  it('the totals are the ledger volumes to 1e-12', () => {
    const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
    expect(rel(wf.kpis.total_oil_bbl, c.totals.oil_stb)).toBeLessThan(1e-12);
    expect(rel(wf.kpis.total_water_bbl, c.totals.water_stb)).toBeLessThan(1e-12);
    expect(rel(wf.kpis.total_injected_bbl, c.totals.winj_stb)).toBeLessThan(1e-12);
    expect(rel(wf.kpis.total_gas_mscf, c.totals.gas_mscf)).toBeLessThan(1e-12);
  });

  it('the cumulative VRR and voidages are those of VRR Monitor (vrr.js) to 1e-12', () => {
    expect(Math.abs(wf.kpis.vrr_avg - last.cumulativeVRR)).toBeLessThan(1e-12);
    expect(Math.abs(wf.kpis.cum_produced_voidage_rb - last.cumProd) / last.cumProd).toBeLessThan(1e-12);
  });

  it('negative control: volume over its own month days misses the last month', () => {
    const naive = got.rows.map((r) => {
      const m = r.date.slice(0, 7);
      const v = c.volumes.find((x) => x.month === m && x.well === r.well);
      const days = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
      return { ...r, oil_bbl: v.oil_stb / days, water_bbl: v.water_stb / days, gas_mcf: v.gas_mscf / days, inj_bbl: v.winj_stb / days };
    });
    const k = analyzeWaterflood(naive, cfg).kpis;
    expect(Math.abs(k.total_oil_bbl - c.totals.oil_stb) / c.totals.oil_stb).toBeGreaterThan(1e-3);
  });

  it('keeps an intake record the report prints; no pressure, so no Hall plot', () => {
    expect(got.intake.from).toEqual({ app: 'Voidage Replacement Monitor', recordId: 'v1', recordName: 'Ekene VRR', savedAt: '2026-10-04T09:00:00Z', fingerprint: c.fingerprint });
    const lines = readBackLines(got.intake);
    expect(lines).toEqual(vrrIntakeLines(got.intake));
    expect(lines[0]).toBe('Voidage Replacement Monitor project "Ekene VRR", read by id 2026-10-04: 3 months (2025-01 to 2025-03), injectors INJ-1, producers PROD-1, PROD-2.');
    expect(lines.join(' ')).toMatch(/FVFs in that project \(not taken; this app uses its own\): Bo 1\.3, Bw 1\.02, Bg 0\.85, Rs 500/);
    expect(wf.capabilities.hall.available).toBe(false);
  });
});
