/**
 * The fine 3D grid (3D grid upgrade, 2026-10-17): 25 m cells, 2.5 ft layers,
 * the smooth edge, zones from well tops, the cap, SGS porosity and facies,
 * all through buildModel (the function the workstation runs).
 *
 * Reconciliation (the RCP booked case, reconcileRcp.test.js): the old
 * layer-cake on the six-well maps' own 100 m nodes gives ReservoirCalc Pro's
 * 18,058 acre-ft, 418 acres and 12.14 MMstb. The fine grid on the same maps
 * and the same typed values must agree within 1 percent (stated tolerance):
 * its cells are 16 times smaller and its edge is the traced data limit, so
 * the hull is cut where the old node cells stepped. Layers add up exactly:
 * on the old frame the grid's layers give the old rock volume to 1e-12 for
 * every layering style (pore volumes to 1e-6: properties are single precision).
 * Negative control: without the smooth edge a 25 m frame keeps only the
 * cells inside the old hull of live nodes and loses about a tenth of the
 * area, so the same 1 percent gate fails.
 */
import fs from 'fs';
import path from 'path';
import { buildModel, emptyDefinition, newModelDefinition } from '../services/modelBuild';
import { M3_PER_ACRE_FT, M3_PER_BBL } from '../services/units';
import { grdeclText } from '../services/grdeclExport';
import { FT } from '../services/grid3d/layering';

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ekene-six-well.json'), 'utf8'));
const G = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ekene-grid.json'), 'utf8'));
const ALL = [...FX.surfaces, ...G.surfaces];
const backend = { downloadSurfaceGrid: async (s) => Float32Array.from(ALL.find((x) => x.id === s.id).grid) };
const surfaces = ALL.map(({ grid, ...s }) => s);
const ACRE = 4046.8564224;
const booked = (wells) => wells.map((w) => ({ ...w, zones: w.zones.map((z) => ({ ...z, properties: { ...z.properties, phi_avg: 0.2, sw_avg: 0.35, net_res_tvt_m: 0.8 * z.properties.gross_tvt_m } })) }));
const typedDef = (over = {}) => ({
  ...emptyDefinition(), name: 'Ekene booked', surfaceIds: ['ekene-top', 'ekene-base'], topNames: ['Ekene Sand', 'Ekene Sand Base'],
  zones: [{ name: 'Ekene Sand', registryZone: 'Ekene Sand', typed: { phi: '0.2', sw: '0.35', ntg: '0.8' } }],
  methods: { phi: 'typed', sw: 'typed', ntg: 'typed' },
  fluidsInput: [{ owc: '5036.1', owcUnit: 'ft', bo: '1.2' }],
  ...over,
});
const sum = (b, key) => b.zones.reduce((a, z) => a + (z.volumes.total?.[key] || 0), 0);
const stoiip = (b) => sum(b, 'stoiip_m3') / M3_PER_BBL / 1e6;
const curves = Object.fromEntries(Object.entries(G.curves).map(([w, c]) => [w, Object.fromEntries(
  Object.entries({ phi: c.PHIE, sw: c.SW, vsh: c.VSH, perm: c.KPERM, facies: c.RP_FACIES }).filter(([, v]) => v)
    .map(([k, v]) => [k, { start: v.start_md_m, step: v.step_m, values: v.values, unit: v.unit, mnemonic: v.mnemonic }]),
)]));
const ekeneGrid = (over = {}) => ({
  ...newModelDefinition(), name: 'Ekene grid', surfaceIds: ['ekene-top', 'ekene-base'], topNames: ['Ekene Sand', 'Ekene Sand Base'],
  zones: [{ name: 'Ekene Sand', registryZone: 'Ekene Sand', splitTops: ['Ekene Sand Middle', 'Ekene Sand Lower'] }],
  cap: { on: true, thickness: '50', unit: 'ft', name: 'Ogbia Shale cap' },
  control: 'logs', methods: { phi: 'sgs', sw: 'idw', ntg: 'idw' },
  fluidsInput: [{ owc: '5036.1', owcUnit: 'ft', bo: '1.2' }],
  logsResolved: { curves },
  ...over,
});

describe('the fine grid reconciles with the old layer-cake on the RCP booked case', () => {
  let old; let fine; let noEdge;
  beforeAll(async () => {
    const W = booked(FX.wells);
    old = await buildModel(typedDef(), W, surfaces, backend);
    fine = await buildModel(typedDef({ frame: { cellM: '25', edge: 'smooth', boundaryId: '' }, grid: { enabled: true, layerFt: 2.5, style: 'proportional' } }), W, surfaces, backend);
    noEdge = await buildModel(typedDef({ frame: { cellM: '25', boundaryId: '' }, grid: { enabled: true, layerFt: 2.5, style: 'proportional' } }), W, surfaces, backend);
  }, 120000);
  test('the old method is still RCP\'s 18,058 acre-ft, 418 acres and 12.14 MMstb', () => {
    const t = old.zones[0].volumes.total;
    expect((t.hc_bulk_m3 / M3_PER_ACRE_FT).toFixed(0)).toBe('18058');
    expect((t.hc_area_m2 / ACRE).toFixed(0)).toBe('418');
    expect(stoiip(old).toFixed(2)).toBe('12.14');
  });
  test('the 25 m x 2.5 ft grid is within 1 percent of it: GRV, HC area and STOIIP (12.09 MMstb)', () => {
    expect(fine.specM.dx).toBe(25);
    expect(fine.grid.layers).toEqual([42]);
    const rel = (a, b) => Math.abs(a / b - 1);
    expect(rel(sum(fine, 'hc_bulk_m3'), sum(old, 'hc_bulk_m3'))).toBeLessThan(0.01);
    expect(rel(sum(fine, 'hc_area_m2'), sum(old, 'hc_area_m2'))).toBeLessThan(0.01);
    expect(rel(stoiip(fine), stoiip(old))).toBeLessThan(0.01);
    expect(stoiip(fine).toFixed(2)).toBe('12.09');
  });
  test('negative control: without the smooth edge the 25 m grid loses a tenth of the area and fails the gate', () => {
    expect(Math.abs(sum(noEdge, 'hc_area_m2') / sum(old, 'hc_area_m2') - 1)).toBeGreaterThan(0.05);
    expect(Math.abs(stoiip(noEdge) / stoiip(old) - 1)).toBeGreaterThan(0.05);
  });
});

describe('layers add up to the zone exactly, in every style', () => {
  let old;
  const W = booked(FX.wells);
  beforeAll(async () => { old = await buildModel(typedDef(), W, surfaces, backend); });
  test.each(['proportional', 'top', 'base'])('%s layers on the old frame give the old volumes (rock to 1e-12, pore to 1e-6)', async (style) => {
    const b = await buildModel(typedDef({ grid: { enabled: true, layerFt: 2.5, style } }), W, surfaces, backend);
    expect(b.zones[0].layers.length).toBeGreaterThan(20);
    // the geometry is double precision, so the rock volumes add up to 1e-12; the grid
    // keeps its properties in single precision (7 digits), so the pore volumes to 1e-6
    for (const key of ['bulk_m3', 'hc_bulk_m3']) expect(sum(b, key) / sum(old, key)).toBeCloseTo(1, 12);
    for (const key of ['hcpv_m3', 'stoiip_m3']) expect(sum(b, key) / sum(old, key)).toBeCloseTo(1, 6);
    // follow top: every layer but the last is 2.5 ft where the zone is thick enough
    if (style === 'top') {
      const L = b.zones[0].layers; const j = b.zones[0].thickness.findIndex((v) => v > 30 && v < 1e29);
      expect(L[0].thickness[j]).toBeCloseTo(2.5 * FT, 6);
      expect(L[5].thickness[j]).toBeCloseTo(2.5 * FT, 6);
    }
  }, 60000);
});

describe('Ekene: the cap, three zones from the well tops, SGS porosity and facies from the logs', () => {
  let b;
  beforeAll(async () => { b = await buildModel(ekeneGrid(), G.wells, surfaces, backend); }, 180000);
  test('four zones: the 50 ft cap and Ekene Sand Upper, Middle and Lower, in 2.5 ft layers on 25 m cells', () => {
    expect(b.zones.map((z) => z.name)).toEqual(['Ogbia Shale cap', 'Ekene Sand Upper', 'Ekene Sand Middle', 'Ekene Sand Lower']);
    expect(b.zones.map((z) => z.kind)).toEqual(['cap', 'subzone', 'subzone', 'subzone']);
    expect(b.horizonNames).toEqual(['Ogbia Shale cap top', 'Ekene Sand top (6-well map)', 'Ekene Sand Middle', 'Ekene Sand Lower', 'Ekene Sand base (6-well map)']);
    expect(b.grid.layers).toEqual([20, 9, 20, 12]);
    expect(b.grid.cells).toBe(195810);
    const cap = b.zones[0].thickness.find((v) => v < 1e29);
    expect(cap).toBeCloseTo(50 * FT, 6);
  });
  test('the split horizons tie the wells that picked them (Ekene-1 within 0.1 m)', () => {
    for (const top of ['Ekene Sand Middle', 'Ekene Sand Lower']) {
      const t = b.ties.find((r) => r.well === 'Ekene-1' && r.top === top);
      expect(Math.abs(t.residualM)).toBeLessThan(0.1);
    }
  });
  test('the three zones fill the sand: their bulk is the sand\'s bulk exactly', async () => {
    const whole = await buildModel(ekeneGrid({ zones: [{ name: 'Ekene Sand', registryZone: 'Ekene Sand' }], cap: { on: false } }), G.wells, surfaces, backend);
    const parts = b.zones.slice(1).reduce((a, z) => a + z.volumes.total.bulk_m3, 0);
    expect(parts / whole.zones[0].volumes.total.bulk_m3).toBeCloseTo(1, 9);
  }, 180000);
  test('the cap is shale: no net rock, so no oil; porosity over the gross rock and Sw 1', () => {
    const cap = b.zones[0];
    expect(cap.volumes.total.net_m3).toBe(0);
    expect(cap.volumes.total.stoiip_m3).toBe(0);
    const rows = cap.logRows.filter((r) => r.well === 'Ekene-1');
    expect(rows.every((r) => r.netM === 0)).toBe(true);
    expect(rows.every((r) => r.phi > 0.05 && r.phi < 0.15)).toBe(true);
  });
  test('SGS porosity holds the upscaled porosity at the well cells and is reproducible by seed', async () => {
    const z = b.zones[1];
    expect(z.provenance.phi[0].methodUsed).toBe('sgs');
    const { nodeAt } = await import('../services/grid3d/properties');
    for (const r of z.logRows.filter((q) => q.well === 'Ekene-1' && Number.isFinite(q.phi))) {
      const j = nodeAt(b.specM, r.x, r.y);
      expect(z.layers[r.layer].props.phi[j]).toBeCloseTo(r.phi, 5);
    }
    const again = await buildModel(ekeneGrid(), G.wells, surfaces, backend);
    expect(stoiip(again)).toBe(stoiip(b));
    const other = await buildModel(ekeneGrid({ sgs: { seed: '7' } }), G.wells, surfaces, backend);
    expect(stoiip(other)).not.toBe(stoiip(b));
  }, 360000);
  test('facies by indicator from RP_FACIES: the well cells keep their code, and only the log\'s codes appear', () => {
    const z = b.zones[2];
    const { nodeAt } = require('../services/grid3d/properties');
    for (const r of z.logRows.filter((q) => q.well === 'Ekene-3' && q.facies !== null)) {
      expect(z.layers[r.layer].props.facies[nodeAt(b.specM, r.x, r.y)]).toBe(r.facies);
    }
    const seen = new Set();
    for (const L of z.layers) for (const c of L.props.facies) if (c !== 255) seen.add(c);
    expect([...seen].every((c) => [0, 1, 2, 3].includes(c))).toBe(true);
  });
  test('permeability follows the simulated porosity through the wells\' phi-k transform', () => {
    const z = b.zones[1];
    expect(z.phiK.b).toBeGreaterThan(5);
    const L = z.layers[3]; const j = L.props.phi.findIndex((v) => v < 1e29);
    expect(Math.log10(L.props.perm[j])).toBeCloseTo(z.phiK.a + z.phiK.b * L.props.phi[j], 4);
  });
  test('GRDECL carries every fine layer (61 cell layers)', () => {
    const g = grdeclText(b, { name: 'Ekene grid', now: new Date('2026-10-17T00:00:00Z'), build: 'test' });
    expect(g.dims.nz).toBe(61);
    expect(g.text).toMatch(/SPECGRID\n {2}\d+ \d+ 61 1 F/);
    expect(g.active).toBeGreaterThan(100000);
  });
});
