/**
 * QI programme Q1 / A2 (2026-10-06): the multi-well crossplot workbench.
 * The points are the engines' elastic set on each harness well; these
 * gates check the multi-well assembly, the per-well and pooled statistics,
 * the pooling warning (with a negative control), the shared EEI K, fluid
 * colouring, facies counts, and the canvas batching of large clouds.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { DEFAULT_ROCK } from '../services/scenario';
import { DEFAULT_UNITS } from '../services/units';
import {
  loadWellForWorkbench, workbenchData, faciesCounts, commonZoneNames, ALL_SAMPLES,
} from '../services/workbench';
import { elasticPoint, meanK } from '../engine/elasticSet';
import { impedanceAxis } from '../services/elastic';
import Crossplot, { BIG_CLOUD } from '../../PetrophysicsStudio/components/Crossplot';
import WorkbenchPanel from '../components/WorkbenchPanel';

const SI = { velocity: 'm/s', density: 'kg/m3', depth: 'm' };

async function wellsOf(opts = { trend: true }) {
  const backend = makeInMemoryBackend(opts);
  const wells = await backend.listWells();
  return { backend, wells };
}
async function loadNamed(names) {
  const { backend, wells } = await wellsOf({ trend: true, minerals: true });
  return Promise.all(names.map((n) => loadWellForWorkbench(backend, wells.find((w) => w.name === n))));
}

describe('workbenchData', () => {
  test('every valid sample of every well, with per-well and pooled statistics', async () => {
    const loaded = await loadNamed(['KETA RP-1', 'TREND RP-5 (wet trend, gas bed)']);
    const d = workbenchData(loaded, { x: 'ai', y: 'vpvs', units: SI });
    const valid = (m) => m.vp.filter((v, i) => elasticPoint(v, m.vs[i], m.rho[i]).ai > 0).length;
    expect(d.points.length).toBe(valid(loaded[0].model) + valid(loaded[1].model));
    expect(d.stats.map((s) => s.n)).toEqual([valid(loaded[0].model), valid(loaded[1].model)]);
    // the AI of a point is the engine's, in SI here
    const p = d.points.find((q) => q.wi === 1);
    const m = loaded[1].model;
    expect(p.x).toBeCloseTo(elasticPoint(m.vp[p.i], m.vs[p.i], m.rho[p.i]).ai * impedanceAxis('m/s', 'kg/m3').factor, 9);
    const N = d.stats[0].n + d.stats[1].n;
    expect(d.pooled.meanX).toBeCloseTo((d.stats[0].meanX * d.stats[0].n + d.stats[1].meanX * d.stats[1].n) / N, 3);
  });

  test('warns when one well sits far from the pooled population; the same well twice does not (negative control)', async () => {
    // a 4200 m/s mixed-mineral rock against the 2650 to 3300 m/s trend well
    const two = await loadNamed(['MINERAL RP-8 (Petrophysics mineral model)', 'TREND RP-5 (wet trend, gas bed)']);
    const d = workbenchData(two, { x: 'vp', y: 'rho', units: SI });
    expect(d.warnings.length).toBeGreaterThan(0);
    expect(d.warnings[0]).toMatch(/within-well standard deviations from the pooled mean/);
    const same = await loadNamed(['TREND RP-5 (wet trend, gas bed)', 'TREND RP-5 (wet trend, gas bed)']);
    expect(workbenchData(same, { x: 'vp', y: 'rho', units: SI }).warnings).toEqual([]);
  });

  test('EEI uses one K over the pooled samples of the interval', async () => {
    const loaded = await loadNamed(['KETA RP-1', 'TREND RP-5 (wet trend, gas bed)']);
    const d = workbenchData(loaded, { x: 'eei', y: 'vpvs', chi: 0, units: SI });
    const pooled = { vp: [], vs: [] };
    for (const w of loaded) { pooled.vp.push(...w.model.vp); pooled.vs.push(...w.model.vs); }
    expect(d.eeiInfo.K).toBeCloseTo(meanK(pooled), 12);
    // chi 0: EEI is AI
    const ai = workbenchData(loaded, { x: 'ai', y: 'vpvs', units: SI });
    expect(d.points[5].x).toBeCloseTo(ai.points[5].x, 3);
  });

  test('fluid colouring finds the 25 gas-bed samples; display units apply', async () => {
    const loaded = await loadNamed(['TREND RP-5 (wet trend, gas bed)']);
    const d = workbenchData(loaded, { x: 'vp', y: 'vs', color: 'fluid', units: SI });
    expect(d.points.filter((p) => p.group === 'hydrocarbon')).toHaveLength(25);
    const ft = workbenchData(loaded, { x: 'vp', y: 'rho', units: { velocity: 'ft/s', density: 'g/cc', depth: 'ft' } });
    expect(ft.points[0].x).toBeCloseTo(d.points[0].x / 0.3048, 6);
    expect(ft.points[0].y).toBeLessThan(4);
  });

  test('zones the wells share; an interval restricts the samples', async () => {
    const loaded = await loadNamed(['KETA RP-1', 'TREND RP-5 (wet trend, gas bed)']);
    expect(commonZoneNames(loaded)).toEqual([]);
    const one = await loadNamed(['TREND RP-5 (wet trend, gas bed)']);
    expect(commonZoneNames(one)).toEqual(['GAS BED']);
    const bed = workbenchData(one, { x: 'vp', y: 'vs', zoneName: 'GAS BED', units: SI });
    const all = workbenchData(one, { x: 'vp', y: 'vs', zoneName: ALL_SAMPLES, units: SI });
    expect(bed.points.length).toBe(25);
    expect(all.points.length).toBeGreaterThan(700);
  });
});

describe('faciesCounts', () => {
  const pts = [{ x: 1, y: 1, wi: 0 }, { x: 5, y: 5, wi: 1 }, { x: 1.5, y: 1.5, wi: 1 }];
  const box = (a, b) => [[a, a], [b, a], [b, b], [a, b]];
  test('counts per well, first polygon wins, the rest untagged', () => {
    const r = faciesCounts(pts, [{ polygon: box(0, 2) }, { polygon: box(0, 10) }], 2);
    expect(r.counts).toEqual([[1, 1], [0, 1]]);
    expect(r.untagged).toBe(0);
    expect(faciesCounts(pts, [{ polygon: box(20, 30) }], 2).untagged).toBe(3);
  });
});

describe('the canvas draws a large cloud batched by colour', () => {
  let calls;
  beforeEach(() => {
    calls = { arc: 0, rect: 0, fill: 0 };
    const ctx = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'measureText') return () => ({ width: 10 });
        if (k in calls) return () => { calls[k] += 1; };
        return () => {};
      },
      set: () => true,
    });
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx);
    global.ResizeObserver = class { observe() {} disconnect() {} };
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  });
  afterEach(() => jest.restoreAllMocks());
  const cloud = (n) => Array.from({ length: n }, (_, i) => ({ x: (i % 997) / 997, y: (i % 991) / 991, color: i % 2 ? '#2563eb' : '#d97706' }));

  test(`above ${BIG_CLOUD} points: squares in one path per colour, no per-point arcs`, () => {
    render(<Crossplot points={cloud(BIG_CLOUD + 5000)} xLabel="x" yLabel="y" xDomain={[0, 1]} yDomain={[0, 1]} />);
    expect(calls.arc).toBe(0);
    expect(calls.rect).toBeGreaterThan(BIG_CLOUD);
  });
  test('negative control: a small cloud keeps its round dots', () => {
    render(<Crossplot points={cloud(100)} xLabel="x" yLabel="y" xDomain={[0, 1]} yDomain={[0, 1]} />);
    expect(calls.arc).toBe(100);
  });
});

describe('the Multi-well panel', () => {
  beforeEach(() => {
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    global.ResizeObserver = class { observe() {} disconnect() {} };
  });
  afterEach(() => jest.restoreAllMocks());

  test('plots the current well, adds a second, and shows the statistics', async () => {
    const { backend, wells } = await wellsOf();
    const keta = wells.find((w) => w.name === 'KETA RP-1');
    const trend = wells.find((w) => w.name.startsWith('TREND'));
    render(<WorkbenchPanel wells={wells} backend={backend} rock={DEFAULT_ROCK} units={DEFAULT_UNITS} currentWellId={keta.id} />);
    expect(await screen.findByText(/samples from 1 well, every sample drawn/, {}, { timeout: 20000 })).toBeTruthy();
    fireEvent.click(screen.getByTestId(`rp-workbench-well-${trend.id}`));
    await waitFor(() => expect(screen.getByTestId('rp-workbench-summary').textContent).toMatch(/from 2 wells/), { timeout: 20000 });
    expect(screen.getByTestId('rp-workbench-stats').textContent).toMatch(/All wells/);
  });
});

describe('facies written back to the wells', () => {
  const box = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  test('codes 1..n by polygon, 0 inside none, null where a value is missing; provenance reproduces it', async () => {
    const { prepareFaciesLog, FACIES_MNEMONIC } = await import('../services/workbench');
    const [w] = await loadNamed(['TREND RP-5 (wet trend, gas bed)']);
    const d = workbenchData([w], { x: 'vp', y: 'vs', units: SI });
    // gas bed: low Vp and high Vs/Vp; a polygon around the gas points and one around everything else
    const gasPts = d.points.filter((p) => w.model.sw[p.i] < 1);
    const gx = gasPts.map((p) => p.x); const gy = gasPts.map((p) => p.y);
    const facies = [
      { name: 'Gas sand', polygon: box(Math.min(...gx) - 1, Math.max(...gx) + 1, Math.min(...gy) - 1, Math.max(...gy) + 1) },
      { name: 'Everything', polygon: box(0, 10000, 0, 10000) },
    ];
    const log = prepareFaciesLog(w, facies, { x: 'vp', y: 'vs', units: SI, pipelineVersion: 'rp-1.3.0', engine: 'rock-physics-studio' });
    expect(log.mnemonic).toBe(FACIES_MNEMONIC);
    expect(log.nSamples).toBe(w.model.n);
    for (const p of gasPts) expect(log.data[p.i]).toBe(1);
    expect(log.provenance.samples_per_code[1]).toBeGreaterThanOrEqual(25);
    expect(log.provenance.codes.map((c) => c.name)).toEqual(['Gas sand', 'Everything']);
    expect(log.description).toMatch(/1 Gas sand, 2 Everything; 0 inside no polygon/);
    // negative control: a polygon far away tags nothing (all 0)
    const none = prepareFaciesLog(w, [{ name: 'Nowhere', polygon: box(1e6, 2e6, 1e6, 2e6) }], { x: 'vp', y: 'vs', units: SI, pipelineVersion: 'x', engine: 'y' });
    expect(none.provenance.samples_per_code[1]).toBe(0);
    expect(() => prepareFaciesLog(w, [], { x: 'vp', y: 'vs', units: SI })).toThrow(/at least one facies polygon/);
  });

  test('publish writes RP_FACIES to own wells, skips shared ones, and a republish replaces it', async () => {
    const { prepareFaciesLog, faciesWriteTargets } = await import('../services/workbench');
    const { backend, wells } = await wellsOf({ trend: true });
    const keta = wells.find((w) => w.name === 'KETA RP-1');
    const w = await loadWellForWorkbench(backend, keta);
    const log = prepareFaciesLog(w, [{ name: 'All', polygon: box(-1e9, 1e9, -1e9, 1e9) }], { x: 'vp', y: 'rho', units: SI, pipelineVersion: 'rp-1.3.0', engine: 'rock-physics-studio' });
    await backend.publishCurves(keta.id, [log], null);
    await backend.publishCurves(keta.id, [log], null);
    const logs = await backend.listLogs(keta.id);
    expect(logs.filter((l) => l.mnemonic === 'RP_FACIES')).toHaveLength(1);
    const akoma = await loadWellForWorkbench(backend, wells.find((x) => x.name.startsWith('AKOMA')));
    const t = faciesWriteTargets([w, akoma]);
    expect(t.own.map((r) => r.well.name)).toEqual(['KETA RP-1']);
    expect(t.skipped).toEqual(['AKOMA-2 (org shared)']);
  });
});
