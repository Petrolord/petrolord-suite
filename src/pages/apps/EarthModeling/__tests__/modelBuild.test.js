/**
 * G8.2 glue — the full build pipeline (in-memory backend -> model
 * definition -> engine) reproduces the oracle goldens end-to-end,
 * exactly what the /dev/earth-modeling harness UI displays. Fixture
 * surfaces are float32 (the registry storage type), so grid-derived
 * numbers compare at 1e-5 relative; definition-level data (census,
 * counts, provenance) is exact.
 */

import fs from 'fs';
import path from 'path';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition, frameSpec } from '../services/modelBuild';
import { FAULT_POLYGON } from '../services/fixture';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'earthmodel');
const G = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8'));

const close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

describe('buildModel on the harness fixture', () => {
  let built;

  beforeAll(async () => {
    const backend = makeInMemoryBackend();
    const wells = await backend.listWells();
    const surfaces = await backend.listSurfaces();
    const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
    const definition = {
      ...emptyDefinition(),
      name: 'Harness model',
      surfaceIds: [byName.TopA.id, byName.TopB.id, byName.BaseB.id],
      topNames: ['TopA', 'TopB', 'BaseB'],
      zones: [
        { name: 'Zone A', registryZone: 'A' },
        { name: 'Zone B', registryZone: 'B' },
      ],
      faultPolygons: [{ name: 'F1', vertices: FAULT_POLYGON }],
    };
    built = await buildModel(definition, wells, surfaces, backend);
  });

  test('clamp counts and fault-block census match the goldens exactly', () => {
    expect(built.counts).toEqual(G.framework.clamp_counts);
    expect(built.census).toEqual({ 0: 326, 1: 174 });
  });

  test('well-tie residuals match the goldens', () => {
    const goldByKey = new Map(G.well_ties.map((r) => [`${r.well}|${r.top}`, r]));
    expect(built.ties.length).toBe(G.well_ties.length);
    for (const row of built.ties) {
      const gold = goldByKey.get(`${row.well}|${row.top}`);
      if (gold.residual_m === null) {
        expect(row.residualM).toBeNull();
      } else {
        expect(Math.abs(row.residualM - gold.residual_m)).toBeLessThan(5e-4);
      }
    }
  });

  test('constant population fell back nowhere and volumes match the goldens', () => {
    for (const zone of built.zones) {
      for (const prov of Object.values(zone.provenance)) {
        for (const p of prov) {
          expect(p.methodUsed).toBe('constant');
          expect(p.fellBack).toBe(false);
        }
      }
    }
    const goldZones = { 'Zone A': G.volumes.zone_a, 'Zone B': G.volumes.zone_b };
    for (const zone of built.zones) {
      const gold = goldZones[zone.name];
      expect(Object.keys(zone.volumes).sort()).toEqual(Object.keys(gold).sort());
      for (const [block, table] of Object.entries(gold)) {
        for (const field of ['bulk_m3', 'net_m3', 'pore_m3', 'hcpv_m3']) {
          if (!close(zone.volumes[block][field], table[field], 1e-5)) {
            throw new Error(`${zone.name}.${block}.${field}: ${zone.volumes[block][field]} vs ${table[field]}`);
          }
        }
        expect(zone.volumes[block].cells).toBe(table.cells);
      }
    }
  });

  test('zone-A total bulk is the closed-form 45,000,000 m3', () => {
    const bulk = built.zones[0].volumes.total.bulk_m3;
    expect(Math.abs(bulk - 45_000_000) / 45_000_000).toBeLessThan(1e-5);
  });

  test('unbuildable definitions throw specific errors', async () => {
    const backend = makeInMemoryBackend();
    const wells = await backend.listWells();
    const surfaces = await backend.listSurfaces();
    await expect(buildModel({ ...emptyDefinition(), surfaceIds: [surfaces[0].id] }, wells, surfaces, backend))
      .rejects.toThrow(/at least 2 surfaces/);
    await expect(buildModel({ ...emptyDefinition(), surfaceIds: ['gone', surfaces[0].id] }, wells, surfaces, backend))
      .rejects.toThrow(/no longer in the registry/);
  });
});


describe('EM0: model frame and boundary clip', () => {
  test('frameSpec keeps the origin and extent and recounts the nodes for the cell', () => {
    const top = { x0: 1000, y0: 2000, dx: 100, dy: 100, nx: 11, ny: 6 };
    expect(frameSpec(top, '')).toEqual(top);
    expect(frameSpec(top, 25)).toEqual({ x0: 1000, y0: 2000, dx: 25, dy: 25, nx: 41, ny: 21 });
    expect(frameSpec(top, 300)).toEqual({ x0: 1000, y0: 2000, dx: 300, dy: 300, nx: 4, ny: 2 });
    expect(() => frameSpec({ ...top, nx: 2001, ny: 2001 }, 0.5)).toThrow(/four million/);
  });

  test('a boundary from the backend nulls every node outside it, so the census of live thickness shrinks', async () => {
    const backend = makeInMemoryBackend();
    const wells = await backend.listWells();
    const surfaces = await backend.listSurfaces();
    const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
    const base = {
      ...emptyDefinition(),
      surfaceIds: [byName.TopA.id, byName.TopB.id],
      topNames: ['TopA', 'TopB'],
      zones: [{ name: 'Zone A', registryZone: 'A' }],
    };
    const whole = await buildModel(base, wells, surfaces, backend);
    const [lease] = await backend.listBoundaries();
    const clipped = await buildModel({ ...base, frame: { cellM: '', boundaryId: lease.id } }, wells, surfaces, backend);
    expect(clipped.boundary).toEqual({ id: lease.id, name: lease.name });
    expect(clipped.zones[0].volumes.total.cells).toBeLessThan(whole.zones[0].volumes.total.cells);
    expect(clipped.zones[0].volumes.total.cells).toBeGreaterThan(0.5 * whole.zones[0].volumes.total.cells);
    await expect(buildModel({ ...base, frame: { cellM: '', boundaryId: 'gone' } }, wells, surfaces, backend)).rejects.toThrow(/no longer in the registry/);
  });
});


describe('EM1: well adjustment', () => {
  test('adjusting to the wells shrinks every tie residual and reports before and after', async () => {
    const backend = makeInMemoryBackend();
    const wells = await backend.listWells();
    const surfaces = await backend.listSurfaces();
    const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
    const base = {
      ...emptyDefinition(),
      surfaceIds: [byName.TopA.id, byName.TopB.id, byName.BaseB.id],
      topNames: ['TopA', 'TopB', 'BaseB'],
      zones: [{ name: 'Zone A', registryZone: 'A' }, { name: 'Zone B', registryZone: 'B' }],
    };
    const plain = await buildModel(base, wells, surfaces, backend);
    expect(plain.adjustment).toBeNull();
    const adjusted = await buildModel({ ...base, adjust: { enabled: true, radiusM: '' } }, wells, surfaces, backend);
    expect(adjusted.adjustment.radius).toBeGreaterThan(0);
    expect(adjusted.adjustment.report).toHaveLength(3);
    for (const r of adjusted.adjustment.report) {
      expect(r.adjusted).toBe(true);
      expect(r.after).toBeLessThan(r.before);
    }
    const worstBefore = Math.max(...plain.ties.filter((t) => t.residualM !== null).map((t) => Math.abs(t.residualM)));
    const worstAfter = Math.max(...adjusted.ties.filter((t) => t.residualM !== null).map((t) => Math.abs(t.residualM)));
    expect(worstBefore).toBeGreaterThan(30);
    expect(worstAfter).toBeLessThan(0.1 * worstBefore);
    // the ties carry their pre-adjustment residual for the QC table
    const w2 = adjusted.ties.find((t) => t.well === 'W2' && t.top === 'TopA');
    expect(Math.abs(w2.residualBeforeM - (-35.75883821136131))).toBeLessThan(5e-4);
    // a typed radius is honoured
    const r50 = await buildModel({ ...base, adjust: { enabled: true, radiusM: '50' } }, wells, surfaces, backend);
    expect(r50.adjustment.radius).toBe(50);
  });
});
