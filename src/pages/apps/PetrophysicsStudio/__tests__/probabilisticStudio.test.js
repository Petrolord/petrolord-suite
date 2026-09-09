// PT10d: the Studio half of the probabilistic feature. Gates from the plan:
// defaultUncertainty agrees with defaultScenarios at the 10th and 90th
// percentiles; the template builder (cases labelled with the direction,
// Sw's low case is its 90th percentile); the CSV columns; the worker
// message protocol under the inline fallback and under a fake worker; and
// decision 1's P-label gate over every parameter-facing string this wave
// produces (template labels, CSV headers, publish descriptions, the
// histogram percentile label).

import fs from 'fs';
import path from 'path';
import { DEFAULT_PARAMS } from '../engine/pipeline';
import { UNCERTAIN_PARAMS, quantileSuffix } from '../engine/probabilistic';
import { defaultScenarios } from '../services/scenarios';
import {
  defaultUncertainty, entryProblem, specForEngine, ensureProbabilisticTemplate, caseSource, PROBABILISTIC_TEMPLATE_ID,
  probabilisticCsvHeader, probabilisticCsv, probabilisticPublishLogs, handleRunMessage, runProbabilisticAsync, MORE_IS_BETTER,
} from '../services/probabilistic';
import { buildDefaultLayouts, activeTemplate, PROBABILISTIC_SOURCES } from '../layout/layoutSchema';
import { exportColumns, zonesCsv } from '../services/petroExport';
import { findPLabels, outcomeOrderViolation, parameterPercentileLabel, EXCEEDANCE_DEFINITION } from '@/lib/percentileConventions';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'petrophysics');
const typewell = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'typewell.json'), 'utf8'));
const curve = (name) => Float64Array.from(typewell.curves[name], (v) => (v === null ? NaN : v));
const curves = { DEPT: curve('DEPT'), GR: curve('GR'), RHOB: curve('RHOB'), NPHI: curve('NPHI'), DT: curve('DT'), RT: curve('RT') };
const params = { ...DEFAULT_PARAMS, phiShale: typewell.params.phi_shale };
const zones = Object.entries(typewell.params.zones).map(([name, [top, base]]) => ({ id: `z-${name}`, name, top_md_m: top, base_md_m: base }));
const wellData = { wellId: 'w1', curves, inventory: Object.keys(curves).map((key) => ({ key, log: { id: `log-${key}`, step_m: 0.5 } })) };

test('defaultUncertainty agrees with defaultScenarios at the 10th and 90th percentiles, median at the current value', () => {
  const u = defaultUncertainty(params);
  const sc = defaultScenarios(params);
  for (const key of Object.keys(sc.low)) {
    expect(u[key].vary).toBe(true);
    expect(u[key].type).toBe('triangular');
    expect(u[key].q10).toBeCloseTo(Math.min(sc.low[key], sc.high[key]), 6);
    expect(u[key].q90).toBeCloseTo(Math.max(sc.low[key], sc.high[key]), 6);
    expect(u[key].q50).toBeCloseTo(params[key], 6);
    expect(entryProblem(u[key])).toBeNull();
  }
  // every uncertain parameter is present; the unmoved ones are not varied
  for (const key of UNCERTAIN_PARAMS) expect(u[key]).toBeTruthy();
  expect(u.cutSw.vary).toBe(false);
  // problems are named
  expect(entryProblem({ vary: true, type: 'triangular', q10: 1, q50: 1, q90: 2 })).toMatch(/10th < 50th < 90th/);
  expect(entryProblem({ vary: true, type: 'uniform', min: 2, max: 1 })).toMatch(/min < max/);
  expect(entryProblem({ vary: true, type: 'lognormal', mean: -1, stdDev: 1 })).toMatch(/positive/);
  expect(entryProblem({ vary: false, type: 'nonsense' })).toBeNull();
  // the engine spec carries only varied, valid entries in lib/stats shapes
  const spec = specForEngine({ rw: u.rw, cutSw: u.cutSw, m: { vary: true, type: 'normal', mean: 2, stdDev: 0.05 }, bad: { vary: true, type: 'uniform', min: 3, max: 1 } });
  expect(Object.keys(spec).sort()).toEqual(['m', 'rw']);
  expect(spec.rw.type).toBe('triangular');
  expect(spec.rw.min).toBeLessThan(u.rw.q10);
  expect(spec.m).toEqual({ type: 'normal', mean: 2, stdDev: 0.05 });
});

test('the Low, best, high template: Sw low case is SW_Q90 with the direction in its label, porosity low case is PHIE_Q10', () => {
  expect(caseSource('SW', 'low')).toBe('output:SW_Q90');
  expect(caseSource('SW', 'high')).toBe('output:SW_Q10');
  expect(caseSource('PHIE', 'low')).toBe('output:PHIE_Q10');
  expect(caseSource('KPERM', 'best')).toBe('output:KPERM_Q50');
  expect(MORE_IS_BETTER.SW).toBe(false);
  const layouts = ensureProbabilisticTemplate(buildDefaultLayouts());
  expect(layouts.activeTemplateId).toBe(PROBABILISTIC_TEMPLATE_ID);
  const tpl = activeTemplate(layouts);
  const sw = tpl.tracks.find((t) => t.title.startsWith('Sw'));
  expect(sw.curves.map((c) => c.label)).toEqual(['Low case Sw (high value)', 'Best case Sw', 'High case Sw (low value)']);
  expect(sw.curves.map((c) => c.source)).toEqual(['output:SW_Q90', 'output:SW_Q50', 'output:SW_Q10']);
  const phi = tpl.tracks.find((t) => t.title.startsWith('φe'));
  expect(phi.curves[0]).toMatchObject({ label: 'Low case φe (low value)', source: 'output:PHIE_Q10' });
  expect(tpl.tracks.find((t) => t.title === 'Pay probability').fills[0].mode).toBe('ramp');
  // idempotent, and every source it uses is a known layout address
  expect(ensureProbabilisticTemplate(layouts)).toBe(layouts);
  for (const t of tpl.tracks) for (const c of t.curves) if (c.source.startsWith('output:') && !c.source.endsWith('PAY_PROB')) expect(PROBABILISTIC_SOURCES.concat(['output:PAY_PROB'])).toContain(c.source);
});

test('the run: inline fallback and a fake worker speak the same protocol; the CSV, publish payloads and export columns follow decision 1', async () => {
  const spec = specForEngine({ rw: { vary: true, type: 'triangular', q10: 0.04, q50: 0.05, q90: 0.06 }, cutSw: { vary: true, type: 'uniform', min: 0.55, max: 0.65 } });
  const payload = { curves, params, zoneParamList: [], spec, opts: { n: 60, seed: 3, zones } };
  const progress = [];
  const inline = await runProbabilisticAsync(payload, { createWorker: null, onProgress: (p) => progress.push(p) }).promise;
  expect(inline.draws.n).toBe(60);
  expect(progress.some((p) => p.phase === 'curves')).toBe(true);
  expect(progress.filter((p) => p.phase === 'zones')).toHaveLength(2);

  // a fake worker: postMessage routes through handleRunMessage, transfer list carries the curve buffers
  class FakeWorker {
    postMessage(msg) { this.transfers = []; setTimeout(() => handleRunMessage(msg, (m, transfer) => { if (transfer) this.transfers = transfer; this.onmessage?.({ data: m }); }), 0); }
    terminate() { this.terminated = true; }
  }
  const fw = new FakeWorker();
  const viaWorker = await runProbabilisticAsync(payload, { createWorker: () => fw }).promise;
  expect(fw.terminated).toBe(true);
  expect(fw.transfers.length).toBe(Object.keys(viaWorker.curves).length);
  expect(Array.from(viaWorker.curves.SW_Q50)).toEqual(Array.from(inline.curves.SW_Q50));
  expect(viaWorker.zones[0].outcomes).toEqual(inline.zones[0].outcomes);
  // an engine error travels back as a rejection; cancel rejects with 'cancelled'
  await expect(runProbabilisticAsync({ ...payload, curves: null }, { createWorker: () => new FakeWorker() }).promise).rejects.toThrow();
  const c = runProbabilisticAsync(payload, { createWorker: () => new FakeWorker() });
  c.cancel();
  await expect(c.promise).rejects.toThrow('cancelled');

  // CSV: outcomes carry P-labels, parameters never do; the definition sentence closes the file
  const header = probabilisticCsvHeader('m');
  expect(header).toContain('net_m P90');
  expect(header).toContain('ntg P10');
  expect(header).toContain('90th percentile of sw_avg');
  const paramHeaders = header.filter((h) => !/^(net_m|ntg) /.test(h));
  expect(findPLabels(paramHeaders)).toEqual([]);
  const csv = probabilisticCsv(inline, 'ft');
  expect(csv.split('\n')[0]).toContain('"top_ft"');
  expect(csv.trim().endsWith(`"${EXCEEDANCE_DEFINITION}"`)).toBe(true);
  expect(csv.split('\n').length).toBe(2 + 2 + 1); // header, two zones, sentence, trailing newline
  for (const z of inline.zones) expect(outcomeOrderViolation(z.outcomes.net_m, z.name)).toBeNull();

  // publish payloads: 18 percentile curves + PAY_PROB, descriptions are percentiles, PAY_PROB carries the sentence
  const logs = probabilisticPublishLogs(wellData, inline, params, { projectId: 'p1', interpretationName: 'Test', zoneParams: {} });
  expect(logs).toHaveLength(19);
  const sw90 = logs.find((l) => l.mnemonic === 'SW_Q90');
  expect(sw90.description).toBe('90th percentile of SW');
  expect(sw90.provenance).toMatchObject({ operation: 'probabilistic', n: 60, seed: 3, statistic: 'parameter percentile', percentile: 90, of: 'SW' });
  expect(sw90.provenance.exceedance_definition).toBeUndefined();
  const pp = logs.find((l) => l.mnemonic === 'PAY_PROB');
  expect(pp.unit).toBe('FRAC');
  expect(pp.provenance.exceedance_definition).toBe(EXCEEDANCE_DEFINITION);
  expect(findPLabels(logs.filter((l) => l.mnemonic !== 'PAY_PROB').map((l) => `${l.mnemonic} ${l.description}`))).toEqual([]);
  expect(logs.map((l) => l.mnemonic)).toContain(`PHIE_${quantileSuffix(0.1)}`);

  // export columns carry the twins when present; the zone CSV appends the block
  const cols = exportColumns(wellData, { PHIE: curves.GR, ...inline.curves });
  expect(cols.map((c) => c.key)).toEqual(expect.arrayContaining(['PHIE', 'PHIE_Q10', 'SW_Q90', 'KPERM_Q50', 'PAY_PROB']));
  expect(cols.find((c) => c.key === 'SW_Q90').descr).toBe('90th percentile of water saturation');
  expect(findPLabels(cols.filter((c) => c.key !== 'PAY_PROB').map((c) => `${c.key} ${c.descr}`))).toEqual([]);
  const zcsv = zonesCsv(zones, { [zones[0].id]: { gross_m: 20, net_m: 18, ntg: 0.9, phi_avg: 0.2, vsh_avg: 0.01, sw_avg: 0.3, k_gm_md: 200 } }, { depthUnit: 'm', columns: ['md'], primary: 'md', probabilistic: inline });
  expect(zcsv).toContain('probabilistic (60 realisations, seed 3)');
  expect(zcsv).toContain('"net_m P90"');
  // the histogram's percentile label is a parameter statistic
  expect(parameterPercentileLabel(null, 50)).toBe('50th percentile');
});
