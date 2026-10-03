/**
 * DCA-U1-008: Petroleum Economics Studio receives a Decline Curve Analysis
 * forecast as a production file. The rows are the contract's calendar-year
 * volumes; the contract rides as the last element of the file's data. The
 * gate runs the cash-flow engine itself (computeCashFlow) with and without
 * that element and requires the same result to the cent, so the provenance
 * cannot leak into the economics.
 */
import { computeCashFlow } from '../../../../../supabase/functions/_shared/epe-engine.ts';
import {
  PIA_WORKED_EXAMPLE_CFG, PIA_WORKED_EXAMPLE_PROD, PIA_WORKED_EXAMPLE_CAPEX, PIA_WORKED_EXAMPLE_OPEX,
} from '../../../../../tools/validation/fixtures/epe-pia-worked-example.ts';
import { epeRowsFromContract, dcaProvenanceOf, volumeRowsOf, dcaProvenanceText, DCA_PROVENANCE_KEY } from '../epeDcaIntake';
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { buildDcaForecastContract } from '@/utils/declineCurve/dcaForecastContract';

const AT = new Date('2026-10-03T12:00:00Z');
const contract = () => {
  let w = { ...sampleWell('p1'), id: 's1' };
  w = withStreamResults(w, 'oil', { fitResults: fitWell(w, 'oil', { now: AT }).fit });
  w = withStreamResults(w, 'oil', { forecastResults: forecastWell(w, 'oil', { now: AT }) });
  return buildDcaForecastContract({ projectId: 'p1', projectName: 'Gate', payload: { payloadVersion: 2, wells: { s1: w } }, wellId: 's1', stream: 'oil', build: 'test' }).contract;
};

describe('the production file from a contract', () => {
  it('one row per calendar year with the engine column, the contract last', () => {
    const c = contract();
    const data = epeRowsFromContract(c, { receivedAt: AT.toISOString(), build: 'b' });
    const rows = volumeRowsOf(data);
    expect(rows.map((r) => r.year)).toEqual(c.forecast.annual.filter((y) => y.volume > 0).map((y) => y.year));
    expect(Object.keys(rows[0])).toEqual(['year', 'oil_bbl']);
    // whole barrels; the sum is the remaining volume to within the rounding
    expect(Math.abs(rows.reduce((s, r) => s + r.oil_bbl, 0) - c.forecast.remaining)).toBeLessThan(rows.length);
    const p = dcaProvenanceOf({ data });
    expect(p.fingerprint).toBe(c.fingerprint);
    expect(p.receivedAt).toBe(AT.toISOString());
    expect(dcaProvenanceText(p)).toMatch(/From Decline Curve Analysis: Ekene-1 \(sample\), oil, Exponential fitted 2026-10-03, project "Gate"\. Data cut-off 2022-12-01/);
    expect(dcaProvenanceOf({ data: rows })).toBeNull();
  });
});

describe('the cash-flow engine never sees the provenance record', () => {
  it('the same KPIs and cash flow with and without it', () => {
    const run = (prodRows) => computeCashFlow({ cfg: PIA_WORKED_EXAMPLE_CFG, prodRows, capexRows: PIA_WORKED_EXAMPLE_CAPEX, opexRows: PIA_WORKED_EXAMPLE_OPEX });
    const plain = run(PIA_WORKED_EXAMPLE_PROD);
    const tagged = run([...PIA_WORKED_EXAMPLE_PROD, { [DCA_PROVENANCE_KEY]: contract() }]);
    expect(tagged.kpis.npv).toBeCloseTo(plain.kpis.npv, 2);
    expect(tagged.cashFlowData).toEqual(plain.cashFlowData);
    // negative control: a trailing record that carried a date and a volume would be counted
    const leaky = run([...PIA_WORKED_EXAMPLE_PROD, { date: '2025-06-15', month_index: 6, well1_oil_bbl: 1e6 }]);
    expect(leaky.kpis.npv).not.toBeCloseTo(plain.kpis.npv, 0);
  });
});
