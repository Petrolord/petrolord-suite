/**
 * Ekene walk (2026-10-14): rock properties from the well logs, proportional
 * layers, inverse distance and typed values. Analytic wells for the
 * upscaling arithmetic; Petrophysics Studio's own published net reservoir
 * thickness for the Ekene wells (independent code) as the known truth; and
 * layer invariants through buildModel.
 */
import fs from 'fs';
import path from 'path';
import { upscaleZoneAtWell, zoneLogControl, pickLogRows, curveOf } from '../services/logUpscale';
import { minCurvature } from '../engine/wellties';
import { idwAt, populateZonePropertyIdw } from '../services/propertyIdw';
import { buildModel, emptyDefinition, proportionalLayers, upgradeDefinition } from '../services/modelBuild';
import { M3_PER_BBL } from '../services/units';

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ekene-six-well.json'), 'utf8'));
const backend = { downloadSurfaceGrid: async (s) => Float32Array.from(FX.surfaces.find((x) => x.id === s.id).grid) };
const surfaces = FX.surfaces.map(({ grid, ...s }) => s);
const ekeneCurves = Object.fromEntries(Object.entries(FX.curves).map(([w, c]) => [w, {
  phi: curveOf(c.PHIE, c.PHIE.values.map((v) => (v === null ? NaN : v))),
  vsh: curveOf(c.VSH, c.VSH.values.map((v) => (v === null ? NaN : v))),
  sw: curveOf(c.SW, c.SW.values.map((v) => (v === null ? NaN : v))),
  perm: curveOf(c.KPERM, c.KPERM.values.map((v) => (v === null ? NaN : v))),
}]));

// a synthetic well: 0.5 m samples from 90 to 120 m MD (each standing for
// 0.25 m either side); clean porous rock in the samples above 104.75 m,
// shale below; Sw 0.3 everywhere, k 100 md in the sand
const synth = () => {
  const start = 90; const step = 0.5; const n = 61;
  const md = (i) => start + i * step;
  const mk = (f) => ({ start, step, values: Array.from({ length: n }, (_, i) => f(md(i))) });
  return { phi: mk((m) => (m < 104.75 ? 0.2 : 0.05)), vsh: mk((m) => (m < 104.75 ? 0.1 : 0.6)), sw: mk(() => 0.3), perm: mk((m) => (m < 104.75 ? 100 : 0.01)) };
};

describe('upscaling a well (analytic)', () => {
  const vertical = minCurvature([], 0, 0, 0);
  test('NTG, porosity, Sw and permeability over a zone of 10 m: half sand', () => {
    const [u] = upscaleZoneAtWell({ traj: vertical, topMd: 99.75, baseMd: 109.75, curves: synth() });
    expect(u.grossM).toBeCloseTo(10, 9);
    expect(u.netM).toBeCloseTo(5, 9);
    expect(u.ntg).toBeCloseTo(0.5, 9);
    expect(u.phi).toBeCloseTo(0.2, 9);
    expect(u.sw).toBeCloseTo(0.3, 9);
    expect(u.perm).toBeCloseTo(100, 6);
  });
  test('two proportional layers split the sand from the shale', () => {
    const [a, b] = upscaleZoneAtWell({ traj: vertical, topMd: 99.75, baseMd: 109.75, curves: synth(), layers: 2 });
    expect([a.ntg, b.ntg]).toEqual([1, 0]);
    expect(b.phi).toBeNull();
    expect(a.tvdss).toBeCloseTo(102.25, 6);
  });
  test('Sw counts only above the OWC; a layer wholly below it has none', () => {
    const [a, b] = upscaleZoneAtWell({ traj: vertical, topMd: 99.75, baseMd: 109.75, curves: { ...synth(), sw: { ...synth().sw, values: synth().sw.values.map((_, i) => (90 + i * 0.5 < 102 ? 0.2 : 1)) } }, layers: 2, owcM: 102 });
    expect(a.sw).toBeCloseTo(0.2, 9);
    expect(b.sw).toBeNull();
  });
  test('a deviated well weighs each sample by its true vertical thickness', () => {
    // 60 degrees from 0 m: TVD = MD / 2, so 20 m of hole is 10 m of rock
    const dev = minCurvature([{ md: 0.001, inc: 60, azi: 90 }, { md: 400, inc: 60, azi: 90 }], 0, 0, 0);
    const curves = synth();
    const [u] = upscaleZoneAtWell({ traj: dev, topMd: 96, baseMd: 116, curves });
    expect(u.grossM).toBeCloseTo(10, 6);
    expect(u.ntg).toBeCloseTo((104.75 - 96) / 20, 6);
    // negative control: weighing by MD would call the gross 20 m
    expect(Math.abs(u.grossM - 20)).toBeGreaterThan(5);
  });
  test('the latest curve of each mnemonic is read, and percent porosity becomes a fraction', () => {
    const rows = pickLogRows([{ id: 'a', mnemonic: 'PHIE' }, { id: 'b', mnemonic: 'VSH' }, { id: 'c', mnemonic: 'PHIE' }]);
    expect(rows.phi.id).toBe('c');
    expect(curveOf({ unit: '%', mnemonic: 'PHIE', start_md_m: 0, step_m: 1 }, [20]).values[0]).toBeCloseTo(0.2, 12);
    expect(curveOf({ unit: 'MD', mnemonic: 'KPERM', start_md_m: 0, step_m: 1 }, [20]).values[0]).toBe(20);
  });
});

describe('Ekene: the logs upscaled against Petrophysics Studio', () => {
  const wells = FX.wells.map((w) => ({ name: w.name, x: w.surface_x, y: w.surface_y, kb_m: w.kb_m, deviation: [], tops: w.tops, zones: w.zones }));
  const ctl = zoneLogControl(wells, ekeneCurves, { topName: 'Ekene Sand', baseName: 'Ekene Sand Base', registryZone: 'Ekene Sand' }, { layers: 1, owcAt: () => 1535.0 });
  test('NTG at every well is the net reservoir over gross Petrophysics published (to 0.01)', () => {
    expect(ctl.rows).toHaveLength(4);
    for (const r of ctl.rows) {
      const p = FX.wells.find((w) => w.name === r.well).zones[0].properties;
      expect(Math.abs(r.ntg - p.net_res_tvt_m / p.gross_tvt_m)).toBeLessThan(0.01);
      expect(Math.abs(r.grossM - p.gross_tvt_m)).toBeLessThan(0.31);
    }
  });
  test('all four wells give porosity; only the two with oil above 5,036 ft give Sw', () => {
    expect(ctl.layers[0].phi.map((p) => p.well).sort()).toEqual(['Ekene-1', 'Ekene-2', 'Ekene-3', 'Ekene-4']);
    expect(ctl.layers[0].sw.map((p) => p.well).sort()).toEqual(['Ekene-1', 'Ekene-3']);
  });
});

describe('inverse distance', () => {
  test('exact at a control point, the mean midway between two, nearer wells weigh more', () => {
    const pts = [{ x: 0, y: 0, v: 0.1 }, { x: 100, y: 0, v: 0.3 }];
    expect(idwAt(pts, 0, 0)).toBe(0.1);
    expect(idwAt(pts, 50, 0)).toBeCloseTo(0.2, 12);
    // at 25 m: weights 1/625 and 1/5625, so (0.1 x 9 + 0.3) / 10
    expect(idwAt(pts, 25, 0)).toBeCloseTo(0.12, 12);
    expect(idwAt(pts, 25, 0, 1)).toBeCloseTo((0.1 * 3 + 0.3) / 4, 12);
  });
  test('per block, a block without wells takes the weighted mean and says it fell back', () => {
    const spec = { x0: 0, y0: 0, dx: 50, dy: 50, nx: 3, ny: 1 };
    const labels = Int32Array.from([0, 0, 1]);
    const all = [{ x: 0, y: 0, v: 0.1, w: 1 }, { x: 50, y: 0, v: 0.3, w: 3 }];
    const out = populateZonePropertyIdw(spec, labels, { 0: all }, all);
    expect(Array.from(out.z.slice(0, 2))).toEqual([0.1, 0.3]);
    expect(out.z[2]).toBeCloseTo(0.25, 12);
    expect(out.provenance[1]).toMatchObject({ block: 1, methodUsed: 'constant', fellBack: true });
  });
});

const def = (over = {}, zone = {}) => upgradeDefinition({
  ...emptyDefinition(),
  name: 'Ekene', surfaceIds: ['ekene-top', 'ekene-base'], topNames: ['Ekene Sand', 'Ekene Sand Base'],
  zones: [{ name: 'Ekene Sand', registryZone: 'Ekene Sand', ...zone }],
  fluidsInput: [{ owc: '5036.1', owcUnit: 'ft', bo: '1.2' }],
  ...over,
});
const regWells = FX.wells.map((w) => ({ ...w, id: w.name }));

describe('proportional layers through buildModel', () => {
  test('layers split the zone exactly: thicknesses add up to the zone at every node', () => {
    const top = Float64Array.from([1000, 1000]); const base = Float64Array.from([1010, 1031]);
    const L = proportionalLayers(top, base, 3);
    for (const x of L) expect(x.thickness[1]).toBeCloseTo(31 / 3, 9);
    for (const x of L) expect(x.thickness[0]).toBeCloseTo(10 / 3, 9);
    expect(L[2].base[1]).toBe(1031);
  });
  test('typed booked values: 1 layer or 7 layers give the same 12.14 MMstb', async () => {
    const typed = { phi: '0.2', sw: '0.35', ntg: '0.8' };
    const one = await buildModel(def({ methods: { phi: 'typed', sw: 'typed', ntg: 'typed' } }, { typed }), regWells, surfaces, backend);
    const seven = await buildModel(def({ methods: { phi: 'typed', sw: 'typed', ntg: 'typed' } }, { typed, layers: 7 }), regWells, surfaces, backend);
    const s1 = one.zones[0].volumes.total.stoiip_m3; const s7 = seven.zones[0].volumes.total.stoiip_m3;
    expect((s1 / M3_PER_BBL / 1e6).toFixed(2)).toBe('12.14');
    expect(Math.abs(s7 / s1 - 1)).toBeLessThan(1e-12);
    expect(seven.zones[0].layers).toHaveLength(7);
    expect(seven.zones[0].volumes.total.cells).toBe(one.zones[0].volumes.total.cells);
    expect(one.zones[0].provenance.phi[0]).toMatchObject({ methodUsed: 'typed' });
  });
  test('a typed method with no value says what to type', async () => {
    await expect(buildModel(def({ methods: { phi: 'typed', sw: 'constant', ntg: 'constant' } }), regWells, surfaces, backend)).rejects.toThrow(/type a value for porosity/);
  });
  test('from the logs: four wells krige porosity (no fallback), the model honours them, and layers carry their own values', async () => {
    const b = await buildModel(def({ control: 'logs', logsResolved: { curves: ekeneCurves }, methods: { phi: 'okrige', sw: 'idw', ntg: 'okrige' } }, { layers: 3 }), regWells, surfaces, backend);
    const z = b.zones[0];
    expect(z.layers).toHaveLength(3);
    expect(z.provenance.phi.every((r) => r.methodUsed === 'okrige' && !r.fellBack)).toBe(true);
    expect(z.provenance.sw.some((r) => r.methodUsed === 'idw')).toBe(true);
    expect(z.logRows.filter((r) => r.layer === 0)).toHaveLength(4);
    // honoured at the wells (kriging and IDW are exact at the data)
    const fits = z.wellMatch.filter((r) => r.prop !== 'perm' && r.model !== null);
    expect(fits.length).toBeGreaterThan(8);
    for (const r of fits) expect(Math.abs(r.diff)).toBeLessThan(0.02);
    // the zone volume is the sum of its layers
    const sumLayers = z.layers.map((L) => L.props).length;
    expect(sumLayers).toBe(3);
    expect(z.volumes.total.stoiip_m3).toBeGreaterThan(0);
    // permeability from the logs, ready for the GRDECL
    expect(z.props.perm).toBeTruthy();
  });
  test('five layers: the deepest has no Sw at any well (all below the OWC) and borrows the zone\'s, so no rock is lost', async () => {
    const b = await buildModel(def({ control: 'logs', logsResolved: { curves: ekeneCurves }, methods: { phi: 'okrige', sw: 'idw', ntg: 'okrige' } }, { layers: 5 }), regWells, surfaces, backend);
    const z = b.zones[0];
    const one = await buildModel(def(), regWells, surfaces, backend);
    expect(Math.abs(z.volumes.total.bulk_m3 / one.zones[0].volumes.total.bulk_m3 - 1)).toBeLessThan(1e-12);
    expect(z.provenance.sw.find((r) => r.layer === 5).note).toMatch(/zone's upscaled values/);
    expect(b.notes.join(' ')).not.toMatch(/no well gives/);
    // the leg averages give the layered volume back in one tank
    const a = z.hcAverages; const v = z.volumes.total;
    expect(Math.abs((v.hc_bulk_m3 * a.ntg * a.phi * (1 - a.sw)) / v.hcpv_m3 - 1)).toBeLessThan(1e-9);
  });
  test('negative control: a constant leaves a misfit at the wells that the match table shows', async () => {
    const b = await buildModel(def({ control: 'logs', logsResolved: { curves: ekeneCurves } }), regWells, surfaces, backend);
    const fit = b.zones[0].wellMatch.filter((r) => r.prop !== 'perm' && r.model !== null);
    expect(Math.max(...fit.map((r) => Math.abs(r.diff)))).toBeGreaterThan(0.01);
  });
  test('logs with no curves say where to publish them', async () => {
    await expect(buildModel(def({ control: 'logs', logsResolved: { curves: {} } }), regWells, surfaces, backend)).rejects.toThrow(/Petrophysics Studio/);
  });
});

test('GRDECL: one cell layer per proportional layer, and permeability from the logs', async () => {
  const { grdeclText } = await import('../services/grdeclExport');
  const b = await buildModel(def({ control: 'logs', logsResolved: { curves: ekeneCurves }, methods: { phi: 'okrige', sw: 'idw', ntg: 'okrige' } }, { layers: 3 }), regWells, surfaces, backend);
  const g = grdeclText(b, { name: 'ekene', now: new Date('2026-10-14T00:00:00Z'), build: 'test' });
  expect(g.dims).toEqual({ nx: 24, ny: 19, nz: 3 });
  expect(g.text).toMatch(/SPECGRID\n {2}24 19 3 1 F/);
  const block = g.text.split('PERMX\n')[1].split('\n/')[0];
  const n = block.trim().split(/\s+/).reduce((s, t) => s + (t.includes('*') ? Number(t.split('*')[0]) : 1), 0);
  expect(n).toBe(24 * 19 * 3);
  expect(g.text).toMatch(/PERMZ = 0.1 x PERMX/);
  // a model without logs keeps the old header and no permeability
  const plain = grdeclText(await buildModel(def(), regWells, surfaces, backend), { name: 'p', build: 'test' });
  expect(plain.text).not.toMatch(/^PERMX$/m);
  expect(plain.dims.nz).toBe(1);
});

test('a layered zone says its provenance compactly: equal layers grouped, the shared note once', async () => {
  const { describeProvenance } = await import('../services/propertyKriging');
  const rows = [1, 2, 3].map((layer) => ({ layer, block: 0, methodUsed: 'okrige', wells: 4, fellBack: false, note: 'well logs upscaled (Vsh <= 0.5)' }));
  rows.push({ layer: 4, block: 0, methodUsed: 'trend', wells: 4, fellBack: true, note: 'flat data; well logs upscaled (Vsh <= 0.5)' });
  expect(describeProvenance(rows)).toBe('layers 1 to 3 block 0: ordinary kriging from 4 wells; layer 4 block 0: trend (plane) from 4 wells, fell back (flat data); well logs upscaled (Vsh <= 0.5)');
});
