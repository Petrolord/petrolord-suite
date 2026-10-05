/**
 * RF-U2-014: decline EUR over the in-place volume, a cross-check beside the
 * estimate. The forecast is a real dca-forecast-1 contract built by the
 * shipped builder from a fit and forecast of the canonical DCA engine on the
 * sample well (as Petroleum Economics Studio's gate builds it); the units
 * are checked: oil bbl at stock-tank conditions is STB, gas Mscf is 1,000 scf.
 *
 * Negative controls: a gas EUR read as scf (no x 1,000) misses the implied RF
 * by 1,000 times; a water or wrong-phase forecast is refused.
 */
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { buildDcaForecastContract } from '@/utils/declineCurve/dcaForecastContract';
import { eurOf, dcaCheckFrom, dcaImpliedRf, SCF_PER_MSCF } from '../dcaCrossCheck';
import { reviewerPayload, reportOf } from './rfTestKit';

const AT = new Date('2026-10-03T12:00:00Z');
const contract = (id = 's1') => {
  let w = { ...sampleWell('p1'), id };
  w = withStreamResults(w, 'oil', { fitResults: fitWell(w, 'oil', { now: AT }).fit });
  w = withStreamResults(w, 'oil', { forecastResults: forecastWell(w, 'oil', { now: AT }) });
  return buildDcaForecastContract({ projectId: 'p1', projectName: 'Gate', payload: { payloadVersion: 2, wells: { [id]: w } }, wellId: id, stream: 'oil', build: 'test' }).contract;
};

describe('decline EUR over OOIP (RF-U2-014)', () => {
  test('the EUR of an oil contract is produced plus remaining, in STB', () => {
    const c = contract();
    expect(c.units.volume).toBe('bbl');
    expect(c.forecast.eur).toBeCloseTo(c.forecast.produced + c.forecast.remaining, 6);
    const e = eurOf(c, 'oil');
    expect(e).toMatchObject({ ok: true, unit: 'STB', value: c.forecast.eur });
  });

  test('the implied RF is the sum of the EURs over the OOIP of the case, printed beside the estimate', () => {
    const c1 = contract('s1'); const c2 = { ...contract('s2') };
    const got = dcaCheckFrom([c1, c2], { phase: 'oil', now: AT.toISOString() });
    expect(got.ok).toBe(true);
    expect(got.check.projectIds).toEqual(['p1']);
    const ooip = 2e6;
    const imp = dcaImpliedRf(got.check, { inPlace: ooip, phase: 'oil', rf: 0.3 });
    expect(imp.eur).toBeCloseTo(c1.forecast.eur + c2.forecast.eur, 6);
    expect(imp.impliedRf).toBeCloseTo((c1.forecast.eur + c2.forecast.eur) / ooip, 12);
    expect(imp.text).toMatch(/from 2 wells/);
    expect(imp.text).toMatch(/lower bound/);
    expect(imp.vsEstimate).toMatch(/The estimate is 30\.0 percent/);
  });

  test('gas: Mscf to scf (negative control: read as scf it is 1,000 times off)', () => {
    const c = contract();
    const gas = { ...c, stream: 'gas', units: { ...c.units, volume: 'Mscf' }, forecast: { ...c.forecast, eur: 2.5e6 } };
    const e = eurOf(gas, 'gas');
    expect(e).toMatchObject({ ok: true, unit: 'scf', value: 2.5e9 });
    expect(SCF_PER_MSCF).toBe(1000);
    const imp = dcaImpliedRf(dcaCheckFrom([gas], { phase: 'gas' }).check, { inPlace: 10e9, phase: 'gas' });
    expect(imp.impliedRf).toBeCloseTo(0.25, 12);
    expect(imp.impliedRf / (2.5e6 / 10e9)).toBeCloseTo(1000, 6);
  });

  test('refusals: a water or wrong-phase forecast, a contract of another kind, a mismatched kept check', () => {
    const c = contract();
    expect(eurOf({ ...c, stream: 'water' }, 'oil').reason).toMatch(/water forecast cannot check a oil/);
    expect(eurOf(c, 'gas').ok).toBe(false);
    expect(eurOf({ schema: 'wf-forecast-1' }, 'oil').ok).toBe(false);
    expect(dcaCheckFrom([], { phase: 'oil' }).ok).toBe(false);
    const kept = dcaCheckFrom([c], { phase: 'oil' }).check;
    expect(dcaImpliedRf(kept, { inPlace: 1e6, phase: 'gas' }).impliedRf).toBeNull();
  });

  test('the report prints the wells, the sum and the implied RF', () => {
    const p = reviewerPayload();
    p.dcaCheck = dcaCheckFrom([contract()], { phase: 'oil', now: AT.toISOString() }).check;
    const r = reportOf(p);
    const rows = r.model.dcaCheck.rows;
    expect(rows[0][0]).toBe('Ekene-1 (sample)');
    expect(rows[rows.length - 1][0]).toBe('EUR over OOIP');
    const imp = dcaImpliedRf(p.dcaCheck, { inPlace: r.state.derived.inPlace, phase: 'oil' });
    expect(rows[rows.length - 1][3]).toBe((imp.impliedRf * 100).toFixed(1));
    expect(r.model.dcaCheck.note).toMatch(/dca-forecast-1/);
  });
});
