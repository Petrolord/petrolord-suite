/**
 * WF-U2-008: FVF by period from the pvt-1 table at each date's reservoir
 * pressure. The gate calls the engines: the surveillance voidage with the
 * track equals the sum, day by day, of the VRR core's computePeriodVoidage
 * at each day's FVF read from the same table (tableAt) times the engine's
 * calendar weight. Negative control: the single set gives another voidage.
 * Pressures outside the table are refused by name (never extrapolated).
 */
import { analyzeWaterflood, rowDayWeights } from '@/utils/waterfloodCalculations';
import { computePeriodVoidage } from '@/utils/vrrCalculations';
import { convert } from '@/lib/units/registry';
import { reviewerPayload, BUILDERS, reportOf } from '@/components/waterflooddesign/__tests__/wfTestKit';
import { buildFvfTrack, pressureAt, cleanSurveys, surveillanceConfigWithTrack } from '../fvfTrack';
import { tableAt } from '../pvtIntake';
import { buildVrrLedgerContract } from '@/utils/vrr/vrrLedgerContract';
import { surveillanceFromVrrLedger } from '../vrrIntake';

const SURVEYS = [{ date: '2024-01-01', p_psia: 2600 }, { date: '2024-02-15', p_psia: 2450 }, { date: '2024-03-30', p_psia: 2300 }];
const withTrack = (surveys = SURVEYS) => {
  const p = reviewerPayload();
  p.surveillance = { ...p.surveillance, config: { ...p.surveillance.config, fvf_mode: 'by-period', pressure_surveys: surveys } };
  return p;
};

describe('FVF by period', () => {
  it('pressure is linear in time between surveys and held outside them', () => {
    const s = cleanSurveys([{ date: '2024-03', p_psia: 2000 }, { date: '2024-01-01', p_psia: 3000 }]);
    expect(s).toEqual([{ date: '2024-01-01', p_psia: 3000 }, { date: '2024-03-01', p_psia: 2000 }]);
    expect(pressureAt(s, '2024-01-31').p).toBeCloseTo(3000 - 1000 * 30 / 60, 9);
    expect(pressureAt(s, '2024-04-10')).toEqual({ p: 2000, held: true });
  });

  it('the voidage with the track is the VRR core day by day at each day\'s FVF from the table', () => {
    const p = withTrack();
    const r = reportOf(p);
    const sr = r.state.surveillanceResult;
    expect(sr.fvfTrack.ok).toBe(true);
    const table = p.pvtIntake.trackTable;
    const daily = sr.daily_series || null;
    // the field days as the engine aggregates them
    const byDate = new Map();
    for (const row of p.surveillance.rows) {
      const d = row.date;
      const e = byDate.get(d) || { Np: 0, Wp: 0, Gp: 0, Wi: 0 };
      e.Np += Number(row.oil_bbl) || 0; e.Wp += Number(row.water_bbl) || 0; e.Gp += Number(row.gas_mcf) || 0; e.Wi += Number(row.inj_bbl) || 0;
      byDate.set(d, e);
    }
    const dates = [...byDate.keys()].sort();
    const w = rowDayWeights(dates, 'calendar');
    let cum = 0;
    dates.forEach((d, i) => {
      const pr = pressureAt(cleanSurveys(SURVEYS), d).p;
      const fvf = { Bo: tableAt(table, 'Bo', pr), Bw: tableAt(table, 'Bw', pr), Bg: convert('fvfGas', tableAt(table, 'Bg', pr), 'RB/scf', 'RB/Mscf'), Rs: tableAt(table, 'Rs', pr) };
      cum += computePeriodVoidage({ ...byDate.get(d), Gi: 0 }, fvf).producedVoidage * w[i];
    });
    expect(Math.abs(sr.kpis.cum_produced_voidage_rb - cum) / cum).toBeLessThan(1e-12);
    expect(daily === null || typeof daily === 'object').toBe(true);
    // negative control: the single set
    const one = reportOf(reviewerPayload()).state.surveillanceResult;
    expect(Math.abs(one.kpis.cum_produced_voidage_rb - cum) / cum).toBeGreaterThan(1e-3);
  });

  it('the report prints the basis, the table and no flag', () => {
    const r = reportOf(withTrack());
    expect(r.model.basis.find((x) => x[0] === 'Formation volume factors')[1]).toMatch(/read from the pvt-1 table at each date's reservoir pressure \(90 dates, 2300 to 2600 psia from 3 surveys/);
    expect(r.model.fvfTrack.rows[0][0]).toBe('2024-01-01');
    expect(r.model.fvfTrack.rows.length).toBe(3);
    expect(r.model.limits.flags.join(' ')).not.toMatch(/FVF by period/);
  });

  it('refuses a pressure outside the table, or an intake with no table, by name; the single set is used and flagged', () => {
    const p = withTrack([{ date: '2024-01-01', p_psia: 9000 }]);
    const t = buildFvfTrack(p.surveillance.rows.map((x) => x.date), p.surveillance.config.pressure_surveys, p.pvtIntake);
    expect(t.ok).toBe(false);
    expect(t.problems[0]).toMatch(/falls outside the PVT table .* Values are not extrapolated/);
    const r = reportOf(p);
    expect(r.model.limits.flags.join(' ')).toMatch(/FVF by period was asked for and not applied/);
    expect(r.state.surveillanceResult.kpis.cum_produced_voidage_rb).toBe(reportOf(reviewerPayload()).state.surveillanceResult.kpis.cum_produced_voidage_rb);
    const old = { ...p.pvtIntake, trackTable: undefined };
    expect(buildFvfTrack(['2024-01-01'], SURVEYS, old).problems[0]).toMatch(/keeps no table: take it again/);
    const { config } = surveillanceConfigWithTrack(BUILDERS.buildSurveillanceConfig({}), { fvf_mode: 'constant' }, [], p.pvtIntake);
    expect(config.fvf_by_date).toBeUndefined();
  });

  it('a VRR Monitor ledger brings its pressure surveys along', () => {
    const c = buildVrrLedgerContract({ projectId: 'v', payload: { inputs: { mode: 'imported', wellRows: [{ date: '2025-01', well: 'P', oil_stb: 10 }, { date: '2025-01', well: 'I', winj_stb: 12 }], pressureSurveys: [{ date: '2025-01', p_psia: 2500 }, { date: 'bad', p_psia: 1 }] } } }).contract;
    const got = surveillanceFromVrrLedger(c);
    expect(got.pressureSurveys).toEqual([{ date: '2025-01-01', p_psia: 2500 }]);
    expect(got.intake.notes.join(' ')).toMatch(/1 reservoir pressure survey of the VRR project taken for FVF by period/);
  });
});
