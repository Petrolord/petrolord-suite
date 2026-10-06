/**
 * QI programme Q2 (2026-10-06), closes RP U2-006: the crossplot's sand lines
 * follow a chosen rock model (critical porosity, soft sand, stiff sand,
 * constant cement, Xu-White) and the granular models can be fitted to the
 * zone's water-bearing samples. The maths is the vendored engines'
 * (granular.js, inclusion.js, templates.js; oracle goldens there); these
 * gates prove the Suite wires the right model, conditions and samples.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildModel } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '../services/scenario';
import { templateLines, calibrateZoneModel, rockMineral, WET_SW } from '../services/crossplot';
import { rockModelPoint, sandPoint } from '../engine/templates';
import { brine } from '../engine/fluids';
import CrossplotPanel from '../components/CrossplotPanel';

jest.mock('recharts', () => {
  const Pass = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Pass, ScatterChart: Pass, Scatter: () => null, XAxis: Pass, YAxis: Pass,
    CartesianGrid: () => null, Tooltip: () => null, Label: () => null, Cell: () => null, LabelList: () => null,
  };
});

async function load(name) {
  const backend = makeInMemoryBackend();
  const well = (await backend.listWells()).find((w) => w.name === name);
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  return { model: buildModel(curves, mapped), zones: await backend.listZones(well.id) };
}

const cond = DEFAULT_SCENARIO.conditions;
const BR = brine(cond.tC, cond.pMPa, cond.salinity);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

describe('templateLines with a rock model', () => {
  test('the default stays the critical-porosity line, unchanged', () => {
    const a = templateLines(DEFAULT_SCENARIO, DEFAULT_ROCK);
    const at20 = a.brine.find((p) => Math.abs(p.phi - 0.2) < 1e-9);
    expect(at20.vp).toBe(sandPoint(rockMineral(DEFAULT_ROCK), BR, 0.2).vp);
    expect(a.rockModel).toBe('critical');
  });

  test.each(['soft', 'stiff', 'constantCement', 'xuWhite'])('%s: lines are the engine model at the scenario brine and mineral', (m) => {
    const t = templateLines(DEFAULT_SCENARIO, DEFAULT_ROCK, { rockModel: m, modelParams: { n: 7, pMPa: 25 } });
    expect(t.error).toBeNull();
    const at20 = t.brine.find((p) => Math.abs(p.phi - 0.2) < 1e-9);
    const ref = rockModelPoint(m, rockMineral(DEFAULT_ROCK), BR, 0.2, { n: 7, pMPa: 25 });
    expect(rel(at20.vp, ref.vp)).toBeLessThan(1e-7);
    expect(t.fluidB.length).toBeGreaterThan(10);
    // negative control: the model line is not the critical-porosity line
    expect(rel(at20.vp, sandPoint(rockMineral(DEFAULT_ROCK), BR, 0.2).vp)).toBeGreaterThan(0.01);
  });

  test('parameters move the line: more effective pressure stiffens soft sand', () => {
    const lo = templateLines(DEFAULT_SCENARIO, DEFAULT_ROCK, { rockModel: 'soft', modelParams: { pMPa: 5 } });
    const hi = templateLines(DEFAULT_SCENARIO, DEFAULT_ROCK, { rockModel: 'soft', modelParams: { pMPa: 40 } });
    const p = (t) => t.brine.find((x) => Math.abs(x.phi - 0.25) < 1e-9);
    expect(p(hi).ai).toBeGreaterThan(p(lo).ai);
  });

  test('an unknown model says why without throwing', () => {
    expect(templateLines(DEFAULT_SCENARIO, DEFAULT_ROCK, { rockModel: 'nope' }).error).toMatch(/Unknown rock model/);
  });
});

describe('calibrateZoneModel', () => {
  // a synthetic soft-sand well at n = 7, with hydrocarbon samples that must be left out
  const mineral = rockMineral(DEFAULT_ROCK);
  const phis = [0.12, 0.16, 0.2, 0.24, 0.28, 0.3, 0.22, 0.18];
  const sw = [1, 1, 0.95, 1, 0.92, 1, 0.3, 0.4];
  const pts = phis.map((phi) => rockModelPoint('soft', mineral, BR, phi, { n: 7, pMPa: 20 }));
  const model = {
    phi: Float64Array.from(phis),
    sw: Float64Array.from(sw),
    vp: Float64Array.from(pts.map((p, i) => (sw[i] < WET_SW ? p.vp * 0.85 : p.vp))),
    vs: Float64Array.from(pts.map((p) => p.vs)),
  };
  const idx = phis.map((_, i) => i);

  test('recovers n = 7 from the water-bearing samples only', () => {
    const r = calibrateZoneModel(model, idx, DEFAULT_SCENARIO, DEFAULT_ROCK, { rockModel: 'soft', modelParams: { pMPa: 20 } });
    expect(r.n).toBe(7);
    expect(r.samples).toBe(6);
    expect(r.rmsMs).toBeLessThan(1e-6);
  });

  test('negative control: counting the gas samples as wet spoils the fit', () => {
    const all = { ...model, sw: Float64Array.from(sw.map(() => 1)) };
    const r = calibrateZoneModel(all, idx, DEFAULT_SCENARIO, DEFAULT_ROCK, { rockModel: 'soft', modelParams: { pMPa: 20 } });
    expect(r.rmsMs).toBeGreaterThan(50);
  });

  test('refuses without Sw, without enough wet samples, and for models it cannot fit', () => {
    expect(calibrateZoneModel({ ...model, sw: null }, idx, DEFAULT_SCENARIO, DEFAULT_ROCK, { rockModel: 'soft' }).error).toMatch(/Sw curve/);
    expect(calibrateZoneModel(model, [6, 7, 0], DEFAULT_SCENARIO, DEFAULT_ROCK, { rockModel: 'soft' }).error).toMatch(/Only 1 water-bearing/);
    expect(calibrateZoneModel(model, idx, DEFAULT_SCENARIO, DEFAULT_ROCK, { rockModel: 'xuWhite' }).error).toMatch(/soft-sand and stiff-sand/);
  });
});

describe('the crossplot panel', () => {
  test('choosing a model shows its parameters, renames the lines and describes the model', async () => {
    const { model, zones } = await load('KETA RP-1');
    render(<CrossplotPanel model={model} zones={zones} scenario={DEFAULT_SCENARIO} rock={DEFAULT_ROCK} zoneId={zones[0].id} />);
    expect(screen.getByTestId('rp-xplot-template-note').textContent).toContain('critical porosity 0.4');
    expect(screen.queryByTestId('rp-xplot-model-params')).toBeNull();
    fireEvent.change(screen.getByTestId('rp-xplot-model'), { target: { value: 'soft' } });
    expect(screen.getByTestId('rp-xplot-param-n').value).toBe('9');
    fireEvent.change(screen.getByTestId('rp-xplot-param-n'), { target: { value: '6' } });
    expect(screen.getByTestId('rp-xplot-template-note').textContent).toContain('soft sand (Hertz-Mindlin pack, modified lower Hashin-Shtrikman; n 6, 20 MPa effective');
    expect(screen.getByTestId('rp-xplot-fit')).toBeTruthy();
    fireEvent.change(screen.getByTestId('rp-xplot-model'), { target: { value: 'xuWhite' } });
    expect(screen.queryByTestId('rp-xplot-fit')).toBeNull();
    expect(screen.getByTestId('rp-xplot-param-clayShare').value).toBe('0.2');
    expect(screen.getByTestId('rp-xplot-template-note').textContent).toContain('Xu-White (differential effective medium');
  });

  test('Fit n reports its result or the reason it cannot fit', async () => {
    const { model, zones } = await load('KETA RP-1');
    render(<CrossplotPanel model={model} zones={zones} scenario={DEFAULT_SCENARIO} rock={DEFAULT_ROCK} zoneId={zones[0].id} />);
    fireEvent.change(screen.getByTestId('rp-xplot-model'), { target: { value: 'stiff' } });
    fireEvent.click(screen.getByTestId('rp-xplot-fit'));
    expect(screen.getByTestId('rp-xplot-fit-result').textContent).toMatch(/Best n \d+|water-bearing|Sw curve|porosity curve/);
  });
});
