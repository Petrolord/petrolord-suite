/**
 * DCA U2-013: Petroleum Economics Studio keeps the source of a Forecast
 * Scenario Hub case. The import used to recompute the case and keep nothing;
 * the file now carries the `fsh-case-1` contract, and inside it the Decline
 * Curve Analysis forecast behind a received case with the fields edited after
 * that handoff. Gates: the rows equal the hub's own annual profile; the
 * contract (and the DCA contract inside it) survives in the file; the
 * cash-flow engine gives the same result with and without the record; the
 * source is re-read by id and a change is named. Negative control: the old
 * import (rows only) has no provenance to show.
 */
import { computeCashFlow } from '../../../../../supabase/functions/_shared/epe-engine.ts';
import {
  PIA_WORKED_EXAMPLE_CFG, PIA_WORKED_EXAMPLE_PROD, PIA_WORKED_EXAMPLE_CAPEX, PIA_WORKED_EXAMPLE_OPEX,
} from '../../../../../tools/validation/fixtures/epe-pia-worked-example.ts';
import { epeRowsFromHubContract, hubProvenanceOf, hubProvenanceText, HUB_PROVENANCE_KEY, hubFileName } from '../epeHubIntake';
import { volumeRowsOf, dcaProvenanceOf } from '../epeDcaIntake';
import { buildHubCaseContract, compareHubWithSource, getHubCase } from '@/utils/forecastScenarioContract';
import { compareCases } from '@/utils/forecastScenarioCalculations';
import { caseFromDcaContract } from '@/utils/forecastScenarioIntake';
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { buildDcaForecastContract } from '@/utils/declineCurve/dcaForecastContract';

const AT = new Date('2026-10-03T12:00:00Z');
const dcaContract = () => {
  let w = { ...sampleWell('p1'), id: 's1' };
  w = withStreamResults(w, 'oil', { fitResults: fitWell(w, 'oil', { now: AT }).fit });
  w = withStreamResults(w, 'oil', { forecastResults: forecastWell(w, 'oil', { now: AT }) });
  return buildDcaForecastContract({ projectId: 'p1', projectName: 'Gate', payload: { payloadVersion: 2, wells: { s1: w } }, wellId: 's1', stream: 'oil', build: 'test' }).contract;
};
const received = () => {
  const c = caseFromDcaContract(dcaContract(), { id: 'dca1', receivedAt: '2026-10-03T10:00:00Z' }).case;
  return { ...c, years: 10, economicLimit: 12 }; // edited here after the handoff
};
const SET = () => ({
  name: 'Gate set',
  startDate: '2027-01-01',
  econ: { pricePerBbl: 70, opexPerBbl: 18, discountRatePct: 10 },
  cases: [
    { id: 'base', name: 'Base', qi: 1200, declineAnnualPct: 18, b: 0.5, years: 20, economicLimit: 30 },
    received(),
  ],
});

describe('the fsh-case-1 contract and the EPE file', () => {
  it('rows are the hub annual profile; the contract and the DCA source ride in the file', () => {
    const made = buildHubCaseContract({ projectId: 'h1', projectName: 'Gate set', projectSavedAt: '2026-10-03', payload: SET(), caseId: 'dca1', build: 'b' });
    expect(made.ok).toBe(true);
    const k = made.contract;
    expect(k.schema).toBe('fsh-case-1');
    expect(k.upstream.contract.schema).toBe('dca-forecast-1');
    expect(k.upstream.editedAfterHandoff).toEqual(['horizon', 'economic limit']);
    const data = epeRowsFromHubContract(k, 2027, { receivedAt: AT.toISOString(), build: 'b' });
    const rows = volumeRowsOf(data);
    const hub = compareCases([SET().cases[1]], SET().econ, '2027-01-01T00:00:00Z').summaries[0];
    expect(rows.map((r) => r.oil_bbl)).toEqual(hub.annual.map((v) => Math.round(v)).filter((v) => v > 0));
    expect(rows[0].year).toBe(2027);
    const p = hubProvenanceOf({ data });
    expect(p.fingerprint).toBe(k.fingerprint);
    expect(p.upstream.contract.fingerprint).toBe(dcaContract().fingerprint);
    expect(dcaProvenanceOf({ data })).toBeNull();
    expect(hubFileName(k)).toBe('FSH - Ekene-1 (sample) (DCA).generated');
    const t = hubProvenanceText(p);
    expect(t).toMatch(/From case "Ekene-1 \(sample\) \(DCA\)" of the scenario set "Gate set" \(Forecast Scenario Hub\); the case came from Ekene-1 \(sample\), oil, Exponential fitted 2026-10-03, project "Gate" \(Decline Curve Analysis\), edited in the hub after that handoff \(horizon, economic limit\)/);
    expect(t).toMatch(/Forecast year 1 is 2027 here/);
  });

  it('a case entered in the hub says so', () => {
    const k = buildHubCaseContract({ projectId: 'h1', projectName: 'Gate set', payload: SET(), caseId: 'base' }).contract;
    expect(k.upstream).toBeNull();
    expect(hubProvenanceText({ ...k, receivedAt: AT.toISOString(), firstYear: 2027 })).toMatch(/; entered in the hub\./);
  });

  it('the cash-flow engine never sees the record', () => {
    const k = buildHubCaseContract({ projectId: 'h1', payload: SET(), caseId: 'dca1' }).contract;
    const run = (prodRows) => computeCashFlow({ cfg: PIA_WORKED_EXAMPLE_CFG, prodRows, capexRows: PIA_WORKED_EXAMPLE_CAPEX, opexRows: PIA_WORKED_EXAMPLE_OPEX });
    const plain = run(PIA_WORKED_EXAMPLE_PROD);
    const tagged = run([...PIA_WORKED_EXAMPLE_PROD, { [HUB_PROVENANCE_KEY]: k }]);
    expect(tagged.kpis.npv).toBeCloseTo(plain.kpis.npv, 2);
    expect(tagged.cashFlowData).toEqual(plain.cashFlowData);
  });

  it('the source is read again by id; an edit in the hub is named', async () => {
    let payload = SET();
    const fake = { from: () => ({ select: () => ({ eq: (_, id) => ({ limit: async () => ({ data: id === 'h1' ? [{ id: 'h1', project_name: 'Gate set', updated_at: 'x', inputs_data: payload }] : [], error: null }) }) }) }) };
    const first = await getHubCase(fake, { projectId: 'h1', caseId: 'dca1' });
    expect(compareHubWithSource(first.contract, await getHubCase(fake, { projectId: 'h1', caseId: 'dca1' })).state).toBe('unchanged');
    payload = { ...payload, cases: payload.cases.map((c) => (c.id === 'dca1' ? { ...c, qi: c.qi * 0.9 } : c)) };
    const cmp = compareHubWithSource(first.contract, await getHubCase(fake, { projectId: 'h1', caseId: 'dca1' }));
    expect(cmp.state).toBe('changed');
    expect(cmp.text).toMatch(/the case parameters, the volumes/);
    expect(compareHubWithSource(first.contract, await getHubCase(fake, { projectId: 'gone', caseId: 'dca1' })).state).toBe('missing');
  });

  it('negative control: the old import (rows only) has no source to show', () => {
    const rows = [{ year: 2027, oil_bbl: 1000 }, { year: 2028, oil_bbl: 900 }];
    expect(hubProvenanceOf({ data: rows })).toBeNull();
    expect(hubProvenanceText(null)).toBeNull();
  });
});
