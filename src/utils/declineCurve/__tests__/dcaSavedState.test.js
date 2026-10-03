/**
 * PL5 and RL12 for Decline Curve Analysis: a project as the September
 * release saved it (e2e/fixtures/dca/saved), and the round trip of a project
 * saved now (the .pld family copies inputs_data as it is, so a JSON round
 * trip is what travels).
 */
import fs from 'fs';
import path from 'path';
import { migrateDcaPayload, analysisStatus, analysisOf } from '@/utils/declineCurve/dcaModel';
import { sampleWell } from '@/utils/declineCurve/sampleWell';
import { fitWell, forecastWell, withStreamResults } from '@/utils/declineCurve/dcaAnalysis';
import { collectDcaReportArgs } from '@/utils/declineCurve/dcaReport';
import { buildDcaForecastContract } from '@/utils/declineCurve/dcaForecastContract';

const FIXTURE = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../e2e/fixtures/dca/saved/project-2026-09-before-u1.json'), 'utf8'));

describe('a project saved before DCA-U1', () => {
  it('opens with its fit on Ekene-1, says it was saved before per-well fits, and asks for a new fit before reporting', () => {
    const p = migrateDcaPayload(FIXTURE.inputs_data);
    const ek = p.wells['w-ek1'];
    expect(analysisOf(ek).streams.oil.fitResults.qi).toBe(120);
    expect(analysisOf(ek).carried).toMatch(/saved before fits were kept per well/);
    expect(analysisOf(p.wells['w-empty']).streams.oil.fitResults).toBeNull();
    const st = analysisStatus(ek, 'oil');
    expect(st.fit).toBe('unrecorded');
    const m = collectDcaReportArgs({ well: ek, stream: 'oil' });
    expect(m.ok).toBe(false);
    expect(m.refusal).toMatch(/fit again to confirm it/);
    // one new fit makes it whole
    const f = fitWell(ek, 'oil');
    expect(f.ok).toBe(true);
    const w = withStreamResults(withStreamResults(ek, 'oil', { fitResults: f.fit }), 'oil', { forecastResults: forecastWell(withStreamResults(ek, 'oil', { fitResults: f.fit }), 'oil') });
    expect(analysisStatus(w, 'oil').reportable).toBe(true);
  });

  it('keeps its September scenario', () => {
    const p = migrateDcaPayload(FIXTURE.inputs_data);
    expect(p.scenarios[0].name).toBe('Base (September)');
  });
});

describe('a project saved now survives a JSON round trip whole', () => {
  it('the fit and forecast stay current, the report and the contract are the same', () => {
    const AT = new Date('2026-10-03T12:00:00Z');
    let w = { ...sampleWell('p1'), id: 's1' };
    w = withStreamResults(w, 'oil', { fitResults: fitWell(w, 'oil', { now: AT }).fit });
    w = withStreamResults(w, 'oil', { forecastResults: forecastWell(w, 'oil', { now: AT }) });
    const payload = { id: 'p1', name: 'Now', payloadVersion: 2, wells: { s1: w }, scenarios: [] };
    const back = migrateDcaPayload(JSON.parse(JSON.stringify(payload)));
    expect(analysisStatus(back.wells.s1, 'oil').reportable).toBe(true);
    const a = collectDcaReportArgs({ well: w, stream: 'oil', generatedAt: AT });
    const b = collectDcaReportArgs({ well: back.wells.s1, stream: 'oil', generatedAt: AT });
    expect(b.eurRows).toEqual(a.eurRows);
    expect(b.inputs).toEqual(a.inputs);
    const ca = buildDcaForecastContract({ projectId: 'p1', payload, wellId: 's1', stream: 'oil' });
    const cb = buildDcaForecastContract({ projectId: 'p1', payload: back, wellId: 's1', stream: 'oil' });
    expect(cb.contract.fingerprint).toBe(ca.contract.fingerprint);
  });
});
