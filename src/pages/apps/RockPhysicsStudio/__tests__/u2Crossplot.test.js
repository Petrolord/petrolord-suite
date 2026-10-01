/**
 * RP-U2-001 (2026-10-01): acoustic impedance against Vp/Vs with template
 * lines. The points are the engine's own substitution of the harness
 * (oracle) well; the template lines are the engines' critical-porosity and
 * mudrock lines at the scenario's conditions.
 */
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildModel } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK } from '../services/scenario';
import { computeZoneResult } from '../services/zoneResult';
import {
  crossplotPoints, templateLines, crossplotDomain, clipLine, scaleColor, availableColorKeys, CROSSPLOT_MAX_POINTS,
} from '../services/crossplot';
import { sandPoint } from '../engine/templates';
import { brine, gas } from '../engine/fluids';
import { MINERALS } from '../engine/minerals';

async function load(name, opts) {
  const backend = makeInMemoryBackend(opts);
  const well = (await backend.listWells()).find((w) => w.name === name);
  const logs = await backend.listLogs(well.id);
  const mapped = mapLogs(logs);
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await backend.downloadCurve(log);
  return { model: buildModel(curves, mapped), zones: await backend.listZones(well.id) };
}
const rock = { ...DEFAULT_ROCK, kminOverrideGPa: '37' };

test('the oracle brine sand plots at its own impedance and Vp/Vs; gas moves it down and left', async () => {
  const { model, zones } = await load('KETA RP-1');
  const res = computeZoneResult(model, zones[0], DEFAULT_SCENARIO, rock);
  const pts = crossplotPoints(model, res.indices, res.sub, 'depth');
  expect(pts.inSitu).toHaveLength(res.indices.length);
  expect(pts.step).toBe(1);
  expect(pts.inSitu[0].ai).toBeCloseTo(3200 * 2250, 3);
  expect(pts.inSitu[0].vpvs).toBeCloseTo(3200 / 1800, 9);
  // the log_domain golden: 2905.70 / 1890.98 / 2038.71
  expect(pts.substituted[0].ai / 1e6).toBeCloseTo((2905.70 * 2038.71) / 1e6, 2);
  expect(pts.substituted[0].vpvs).toBeCloseTo(2905.70 / 1890.98, 4);
  expect(pts.substituted[0].ai).toBeLessThan(pts.inSitu[0].ai);
  expect(pts.substituted[0].vpvs).toBeLessThan(pts.inSitu[0].vpvs);
  expect(pts.colorRange).toEqual([2020, 2040]);
  // negative control: Vs/Vp or SI on the axes would not be these numbers
  expect(1800 / 3200).not.toBeCloseTo(pts.inSitu[0].vpvs, 1);
});

test('samples left in situ by the Gassmann limits have no substituted point; colour follows the chosen curve', async () => {
  const { model, zones } = await load('HOSTILE RP-4 (vendor export)', { hostile: true });
  const res = computeZoneResult(model, zones[0], DEFAULT_SCENARIO, DEFAULT_ROCK);
  const pts = crossplotPoints(model, res.indices, res.sub, 'sw');
  expect(pts.inSitu.length).toBe(res.indices.length - 1); // one sample has the -999 density
  expect(pts.substituted.length).toBe(res.sub.done);
  expect(pts.substituted.length).toBeLessThan(pts.inSitu.length);
  expect(pts.colorRange).toEqual([0.25, 1]);
  expect(availableColorKeys(model).map((c) => c.key)).toEqual(['sw', 'vsh', 'phi', 'depth']);
  expect(scaleColor(0.25, pts.colorRange)).toBe('rgb(29, 78, 216)');
  expect(scaleColor(1, pts.colorRange)).toBe('rgb(220, 38, 38)');
  expect(scaleColor(NaN, pts.colorRange)).toBe('#64748b');
  const plain = await load('KETA RP-1');
  expect(availableColorKeys(plain.model).map((c) => c.key)).toEqual(['vsh', 'phi', 'depth']);
});

test('a long zone is thinned to at most the cap, and says by how much', async () => {
  const { model, zones } = await load('LONG RP-3 (5000 m)', { long: true });
  const res = computeZoneResult(model, zones[0], DEFAULT_SCENARIO, DEFAULT_ROCK);
  const pts = crossplotPoints(model, res.indices, res.sub, 'vsh');
  expect(pts.total).toBe(res.indices.length);
  expect(pts.total).toBeGreaterThan(20000);
  expect(pts.inSitu.length).toBeLessThanOrEqual(CROSSPLOT_MAX_POINTS);
  expect(pts.step).toBe(Math.ceil(pts.total / CROSSPLOT_MAX_POINTS));
});

test('template lines are the engines critical-porosity lines at the scenario conditions and mineral', () => {
  const t = templateLines(DEFAULT_SCENARIO, DEFAULT_ROCK);
  expect(t.error).toBeNull();
  const c = DEFAULT_SCENARIO.conditions;
  const br = brine(c.tC, c.pMPa, c.salinity);
  const at20 = t.brine.find((p) => Math.abs(p.phi - 0.2) < 1e-9);
  const ref = sandPoint(MINERALS.quartz, br, 0.2);
  expect(at20.ai).toBeCloseTo(ref.ai, 6);
  expect(at20.vpvs).toBeCloseTo(ref.vpvs, 12);
  // fluid B (gas by default) has its own, softer line with the lower Vp/Vs
  const g20 = t.fluidB.find((p) => Math.abs(p.phi - 0.2) < 1e-9);
  const gref = sandPoint(MINERALS.quartz, gas(c.tC, c.pMPa, 0.6), 0.2);
  expect(g20.ai).toBeCloseTo(gref.ai, 6);
  expect(g20.vpvs).toBeLessThan(at20.vpvs);
  expect(t.fluidBLabel).toBe('gas');
  // the mineral point: quartz
  expect(t.brine[0].vpvs).toBeCloseTo(Math.sqrt(36.6 / 45 + 4 / 3), 9);
  expect(t.marks.map((m) => m.label)).toEqual(['φ 0.10', 'φ 0.20', 'φ 0.30', 'φ 0.10', 'φ 0.20', 'φ 0.30']);
  expect(t.mudrock.length).toBeGreaterThan(50);
  // a K_min override moves the lines; brine as fluid B draws one line only
  const o = templateLines(DEFAULT_SCENARIO, { ...DEFAULT_ROCK, kminOverrideGPa: '30' });
  expect(o.mineral.k).toBe(30e9);
  expect(o.brine[80].ai).toBeLessThan(t.brine[80].ai);
  expect(templateLines({ ...DEFAULT_SCENARIO, fluidB: { sw: 1, hc: { kind: 'gas', gravity: 0.6 } } }, DEFAULT_ROCK).fluidB).toBeNull();
  // an unusable scenario says why, without throwing
  expect(templateLines(DEFAULT_SCENARIO, { ...DEFAULT_ROCK, minerals: { quartz: 0 } }).error).toMatch(/zero/);
  // negative control: the brine line is not the gas line
  expect(Math.abs(g20.ai - at20.ai) / at20.ai).toBeGreaterThan(0.05);
});

test('the domain pads the data and the template lines are cut to it', async () => {
  const { model, zones } = await load('KETA RP-1');
  const res = computeZoneResult(model, zones[0], DEFAULT_SCENARIO, rock);
  const pts = crossplotPoints(model, res.indices, res.sub, 'depth');
  const d = crossplotDomain(pts);
  expect(d.ai[0]).toBeLessThan(pts.substituted[0].ai);
  expect(d.ai[1]).toBeGreaterThan(pts.inSitu[0].ai);
  const t = templateLines(DEFAULT_SCENARIO, rock);
  const cut = clipLine(t.brine, d);
  expect(cut.length).toBeLessThan(t.brine.length);
  for (const p of cut) { expect(p.ai).toBeGreaterThanOrEqual(d.ai[0]); expect(p.ai).toBeLessThanOrEqual(d.ai[1]); }
  // a tight cluster still gets at least 0.5 of Vp/Vs and 40 percent of impedance, so the lines have room
  const tight = crossplotDomain({ inSitu: [{ ai: 7e6, vpvs: 1.8 }], substituted: [] });
  expect(tight.vpvs[1] - tight.vpvs[0]).toBeCloseTo(0.5, 9);
  expect((tight.ai[1] - tight.ai[0]) / 7e6).toBeCloseTo(0.4, 9);
  expect(clipLine(t.brine, tight).length).toBeGreaterThan(1);
  expect(crossplotDomain({ inSitu: [], substituted: [] })).toBeNull();
});
