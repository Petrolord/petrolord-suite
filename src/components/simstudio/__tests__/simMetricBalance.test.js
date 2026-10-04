/**
 * SIM-U2-015: the material balance of a METRIC run. The worker reads the
 * PRT tables of a METRIC deck (balance sheet in SM3, cumulative table in
 * MSCM and MMSCM; checked on METRIC_BOX.DATA against the run's FOPT, FWIT,
 * FWPT and FGPT in the isolated worker gate). Here the report shows them in
 * the display units, converted from the unit the PRT printed, one known
 * value per conversion. The summary is what the worker stored for that run.
 * Negative control: read as FIELD numbers, the oil in place would be 6.29
 * times too small in STB.
 */
import fs from 'fs';
import path from 'path';
import metric from '@/dev/fixtures/sim-metric-box-summary.json';
import { buildSimReportModel } from '@/utils/simstudio/reportModel';
import { prtShow } from '@/utils/simstudio/simUnits';

const deckText = fs.readFileSync(path.join(__dirname, '../../../../worker/sim-worker/tests/integration/fixtures/metric/METRIC_BOX.DATA'), 'utf8');
const run = { id: 'run-metric', status: 'complete', deck_sha256: metric.deck_sha256, opm_version: '2026.04' };
const modelOf = (system) => buildSimReportModel({ caseRow: { name: 'Metric box', deck_source: 'upload' }, run, summary: metric, deckText, system });

describe('SIM-U2-015 METRIC balance', () => {
  it('the worker computed it and it closes', () => {
    const mb = metric.diagnostics.material_balance;
    expect(mb.computed).toBe(true);
    expect(mb.closes).toBe(true);
    expect(mb.phases.oil.unit).toBe('SM3');
    expect(mb.phases.oil.originally_in_place).toBe(335466);
  });

  it('shown in oilfield units: sm3 to STB and to Mscf, pinned', () => {
    expect(prtShow('oilVolume', 1, 'SM3', 'oilfield')).toBeCloseTo(6.289811, 5);
    expect(prtShow('gasVolume', 1000, 'SM3', 'oilfield')).toBeCloseTo(35.31467, 4);
    expect(prtShow('oilVolume', 1, 'STB', 'oilfield')).toBe(1);
    const m = modelOf('oilfield');
    expect(m.materialBalance.reported).toBe(true);
    expect(m.materialBalance.closes).toBe(true);
    const oil = m.materialBalance.rows.find((r) => r[0].startsWith('Oil'));
    expect(oil[0]).toBe('Oil (STB)');
    expect(oil[1]).toBe(Math.round(335466 * 6.289810770).toLocaleString('en-US'));
    const ooip = m.headline.rows.find((r) => r[0] === 'Oil originally in place');
    expect(ooip[1]).toBe(Math.round(335466 * 6.289810770).toLocaleString('en-US'));
    // negative control: the sm3 read as STB
    expect(oil[1]).not.toBe('335,466');
    expect(m.limits.flags.join(' ')).not.toMatch(/units_not_verified|have not been checked/);
  });

  it('shown in SI units: sm3 as sm3, gas in 10^3 sm3', () => {
    const m = modelOf('si');
    const oil = m.materialBalance.rows.find((r) => r[0].startsWith('Oil'));
    expect(oil[0]).toBe('Oil (sm3)');
    expect(oil[1]).toBe('335,466');
    const gas = m.materialBalance.rows.find((r) => r[0].startsWith('Gas'));
    expect(gas[0]).toBe('Gas (10^3 sm3)');
    expect(gas[1]).toBe(Math.round(20127977 / 1000).toLocaleString('en-US'));
    const pv = m.deck.find((r) => r[0] === 'Pore volume (simulator)');
    expect(pv[1]).toBe('500,000 rm3');
  });
});
