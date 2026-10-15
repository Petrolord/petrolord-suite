/**
 * Truly blind wells (QI upgrade P1.2, 2026-10-15), browser side: the field
 * wavelet without each held-back well, the protocol words for old and new
 * results, the simultaneous issues, and the report stating the protocol.
 * The worker gates (poststackInversion, prestackInversion,
 * propertyPrediction tests) prove the maths with negative controls.
 */
import { leaveOneOutWavelets, waveletComparison } from '../services/ties';
import { blindProtocolText, blindProtocol } from '../services/inversionRun';
import { propertyProtocolText, blindCheckTraces } from '../services/propertyRun';
import { reportModel, buildQIStudioPdf } from '../services/report';
import { blankProject } from '../services/model';
import { packLog } from '../services/logPacking';
import { readPdf, flat } from '@/lib/reportKit/testKit';

const ricker = (f, n = 41, dt = 2) => Array.from({ length: n }, (_, i) => { const t = ((i - (n - 1) / 2) * dt) / 1000; const a = (Math.PI * f * t) ** 2; return (1 - 2 * a) * Math.exp(-a); });
const row = (name, f) => ({ wellId: name, wellName: name, tie: { wavelet: { samples: ricker(f), dtMs: 2, peakHz: f, phaseDeg: 0 } } });

test('the field wavelet without a held-back well is the average of the others', () => {
  const rows = [row('A', 20), row('B', 30), row('C', 40)];
  const bw = leaveOneOutWavelets(rows, ['A', 'B', 'C', 'D']);
  expect(bw.map((b) => b.name)).toEqual(['A', 'B', 'C']); // D has no tie
  const ref = waveletComparison([rows[1], rows[2]]);
  const got = bw[0].samples;
  expect(got.length % 2).toBe(1);
  const n = Math.min(got.length, ref.average.length);
  for (let i = 0; i < n; i++) expect(got[i]).toBeCloseTo(ref.average[i], 12);
  // negative control: the full field average (A included) is a different wavelet
  const all = waveletComparison(rows).average;
  expect(Math.max(...Array.from(all).slice(0, n).map((v, i) => Math.abs(v - got[i])))).toBeGreaterThan(1e-3);
  // two ties: leaving one out leaves one, which is no average, so no entry
  expect(leaveOneOutWavelets([row('A', 20), row('B', 30)], ['A', 'B'])).toEqual([]);
});

test('protocol words: a new result names what a held-back well was out of; an old one says it was the model only', () => {
  expect(blindProtocolText({ blind_protocol: blindProtocol({ absolute: true, blindWavelets: true }) }))
    .toBe('Truly blind: each held-back well was left out of the low-frequency model, the wavelet scale and the field wavelet average.');
  expect(blindProtocolText({ blind_protocol: blindProtocol({ absolute: false, blindWavelets: false, waveletWell: 'KETA-1' }) }))
    .toMatch(/coloured operator .* KETA-1's own tie wavelet/);
  expect(blindProtocolText({ settings: {} })).toMatch(/low-frequency model only/);
});

test('the property check reads held-back traces only on the same trace', () => {
  const ns = 8;
  const held = { name: 'W1', il: 2, xl: 3, ln_ai: packLog(Array.from({ length: ns }, () => Math.log(8000))) };
  const vol = [new Float64Array(ns).fill(7000), new Float64Array(ns).fill(7100)];
  const r = blindCheckTraces({ wells: [{ name: 'W1', il: 2, xl: 3 }, { name: 'W2', il: 4, xl: 4 }], aiParams: { wells: ['W1', 'W2'], blind_traces: [held] }, aiTraces: vol });
  expect(r.aiTraces[0][0]).toBeCloseTo(8000, 0);
  expect(r.aiTraces[1]).toBe(vol[1]);
  expect(r.protocol.rows.map((x) => x.source)).toEqual(['held_back', 'volume_not_blind']);
  // negative control: a held-back trace from another position is not used
  const moved = blindCheckTraces({ wells: [{ name: 'W1', il: 9, xl: 3 }], aiParams: { wells: ['W1'], blind_traces: [held] }, aiTraces: [vol[0]] });
  expect(moved.aiTraces[0]).toBe(vol[0]);
  expect(moved.protocol.fully_blind).toBe(false);
});

test('the report states the protocol for inversion, simultaneous and property checks', () => {
  const blind = [{ name: 'KETA-1', blind: { corr: 0.9, rmsPct: 5, n: 100 }, withWell: { corr: 0.95, rmsPct: 3, n: 100 } }];
  const project = {
    ...blankProject(),
    inversion: { v1: { blind: { at: '2026-10-15T10:00:00Z', volumeName: 'Keta 3D', result: { settings: { method: 'model_based', output: 'AI' }, blind, blind_protocol: blindProtocol({ absolute: true, blindWavelets: false }) } } } },
    simultaneous: { blind: { at: '2026-10-15T11:00:00Z', volumeName: 'near', result: { blind: [{ name: 'KETA-1', blind: { ai: { rmsPct: 4 }, si: { rmsPct: 5 }, rho: { rmsPct: 3, corr: 0.7 } } }] } } },
    properties: { a1: { porosity: { calibration: { at: '2026-10-15T12:00:00Z', volumeName: 'Keta AI', result: { settings: { kind: 'porosity' }, summary: { a: 0.4, b: -3e-5, r2: 0.7, n: 100, s: 0.02 }, rows: [{ name: 'KETA-1', n: 50, rms: 0.02, corr: 0.8, coverage: 0.8 }], blind_protocol: { fully_blind: true, rows: [{ name: 'KETA-1', source: 'held_back' }] } } } } } },
  };
  const matrix = { targets: [], rows: [], count: { good: 0, limited: 0, missing: 0 } };
  const model = reportModel({ project, inventory: [], matrix, issues: [], chosenVolumes: [], ready: [] });
  expect(model.inversion[0].protocol).toMatch(/^Truly blind/);
  expect(model.simultaneous.protocol).toMatch(/low-frequency model only/); // an older simultaneous result
  expect(model.properties[0].protocol).toMatch(/never saw it/);
  const t = flat(readPdf(buildQIStudioPdf(model, { generatedAt: new Date('2026-10-15T12:00:00Z') }).doc).text);
  expect(t).toMatch(/Truly blind: each held-back well was left out of the low-frequency model and the wavelet scale/);
  expect(t).toMatch(/never saw it/);
  expect(propertyProtocolText({})).toMatch(/not fully blind/);
});
