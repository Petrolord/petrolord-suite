// Earth Modeling upgrade U1 (practitioner lens, 2026-09-30). Every test
// calls the shipped code; the numeric ones carry a negative control in the
// comment (what the code before the fix returned). Finding ids are in
// docs/upgrade/EarthModeling-UPGRADE.md.

import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition, parseFluidsInput, modelFrame, publishPayload, contactEdgeReport } from '../services/modelBuild';
import { MODEL_SPEC, planeGrid, FAULT_POLYGON } from '../services/fixture';
import { depthDownToSurfaceZ } from '@/lib/surfaceConvention';
import { isNull } from '@/lib/gridding/gridmath';

const FT = 0.3048;

async function fixture() {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const surfaces = await backend.listSurfaces();
  const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
  return { backend, wells, surfaces, byName };
}

const baseDef = (byName, extra = {}) => ({
  ...emptyDefinition(),
  surfaceIds: [byName.TopA.id, byName.TopB.id, byName.BaseB.id],
  topNames: ['TopA', 'TopB', 'BaseB'],
  zones: [{ name: 'Zone A', registryZone: 'A' }, { name: 'Zone B', registryZone: 'B' }],
  ...extra,
});

/** The oracle fixture re-expressed on a FEET frame: XY and z in ft, wells in ft. */
async function feetFixture({ xyUnit = 'ft', crs = null } = {}) {
  const backend = makeInMemoryBackend();
  const wellsM = await backend.listWells();
  const byName = {};
  for (const name of ['TopA', 'TopB', 'BaseB']) {
    const elevM = depthDownToSurfaceZ(planeGrid(name));
    const grid = Float32Array.from(elevM, (v) => v / FT);
    const row = await backend.saveSurface({
      name: `${name} ft`, kind: 'structure', zDomain: 'depth', zUnit: 'ft', grid,
      spec: { x0: MODEL_SPEC.x0 / FT, y0: MODEL_SPEC.y0 / FT, dx: MODEL_SPEC.dx / FT, dy: MODEL_SPEC.dy / FT, nx: MODEL_SPEC.nx, ny: MODEL_SPEC.ny },
    });
    row.xy_unit = xyUnit;
    row.crs = crs;
    byName[name] = row;
  }
  const surfaces = await backend.listSurfaces();
  // the saved rows are copies; carry the xy unit onto the listed rows
  for (const s of surfaces) { const hit = Object.values(byName).find((r) => r.id === s.id); if (hit) Object.assign(s, { xy_unit: hit.xy_unit, crs: hit.crs }); }
  const wells = wellsM.map((w) => ({ ...w, surface_x: w.surface_x / FT, surface_y: w.surface_y / FT, crs }));
  return { backend, wells, surfaces, byName };
}

describe('EM-U1-001 (S1): a feet frame gives the metre answer', () => {
  let metric; let feet;
  beforeAll(async () => {
    const m = await fixture();
    metric = await buildModel(baseDef(m.byName, { faultPolygons: [{ name: 'F1', vertices: FAULT_POLYGON }] }), m.wells, m.surfaces, m.backend);
    const f = await feetFixture();
    feet = await buildModel(baseDef(f.byName, { faultPolygons: [{ name: 'F1', vertices: FAULT_POLYGON.map(([x, y]) => [x / FT, y / FT]) }] }), f.wells, f.surfaces, f.backend);
  });

  test('bulk, pore and HCPV per block equal the metre frame (before: 10.76x)', () => {
    for (let z = 0; z < 2; z++) {
      for (const k of Object.keys(metric.zones[z].volumes)) {
        for (const col of ['bulk_m3', 'net_m3', 'pore_m3', 'hcpv_m3']) {
          const a = metric.zones[z].volumes[k][col]; const b = feet.zones[z].volumes[k][col];
          expect(Math.abs(b - a) / a).toBeLessThan(1e-4);
        }
      }
    }
    expect(feet.census).toEqual(metric.census);
  });

  test('tie residuals, the deviated well included, equal the metre frame (before: survey metres added to feet)', () => {
    for (const t of metric.ties) {
      const f = feet.ties.find((x) => x.well === t.well && x.top === t.top);
      if (t.residualM === null) expect(f.residualM).toBeNull();
      else expect(Math.abs(f.residualM - t.residualM)).toBeLessThan(0.01);
    }
  });

  test('the model knows its frame: native spec in feet, metres per unit, frame in metres', () => {
    expect(feet.xyToM).toBeCloseTo(FT, 12);
    expect(feet.spec.dx).toBeCloseTo(50 / FT, 6);
    expect(feet.specM.dx).toBeCloseTo(50, 6);
    expect(metric.xyToM).toBe(1);
  });

  test('a cell typed in metres is metres on a feet frame (before: 100 ft cells)', async () => {
    const f = await feetFixture();
    const b = await buildModel(baseDef(f.byName, { frame: { cellM: '100', boundaryId: '' } }), f.wells, f.surfaces, f.backend);
    expect(b.specM.dx).toBeCloseTo(100, 6);
    expect(b.spec.dx).toBeCloseTo(100 / FT, 6);
    const m = await fixture();
    const bm = await buildModel(baseDef(m.byName, { frame: { cellM: '100', boundaryId: '' } }), m.wells, m.surfaces, m.backend);
    expect(Math.abs(b.zones[0].volumes.total.bulk_m3 - bm.zones[0].volumes.total.bulk_m3) / bm.zones[0].volumes.total.bulk_m3).toBeLessThan(1e-4);
  });
});

describe('EM-U1-002 (S2): only depth structures enter the stack', () => {
  test('a time, an attribute and an isochore row are refused with the reason', async () => {
    const { backend, wells, byName } = await fixture();
    const g = planeGrid('TopA');
    const time = await backend.saveSurface({ name: 'Seis TWT', kind: 'structure', zDomain: 'time', zUnit: 'ms', grid: g, spec: MODEL_SPEC });
    const attr = await backend.saveSurface({ name: 'PHIE map', kind: 'attribute', zDomain: 'attribute', zUnit: null, grid: g, spec: MODEL_SPEC });
    const iso = await backend.saveSurface({ name: 'A isochore', kind: 'isochore', zDomain: 'depth', zUnit: 'ft', grid: g, spec: MODEL_SPEC });
    const surfaces = await backend.listSurfaces();
    for (const [row, re] of [[time, /time surface.*Depth-convert/], [attr, /attribute map/], [iso, /isochore/]]) {
      await expect(buildModel(baseDef(byName, { surfaceIds: [byName.TopA.id, row.id] }), wells, surfaces, backend)).rejects.toThrow(re);
    }
  });

  test('an isochore in feet makes a parallel horizon in metres', async () => {
    const { backend, wells, byName } = await fixture();
    const t = new Float32Array(MODEL_SPEC.nx * MODEL_SPEC.ny).fill(100); // 100 ft
    const iso = await backend.saveSurface({ name: 'Iso 100 ft', kind: 'isochore', zDomain: 'depth', zUnit: 'ft', grid: t, spec: MODEL_SPEC });
    const surfaces = await backend.listSurfaces();
    const d = { id: 'derived-x', name: 'TopA + iso', kind: 'parallel', sourceId: byName.TopA.id, isochoreId: iso.id };
    const b = await buildModel({ ...emptyDefinition(), derived: [d], surfaceIds: [byName.TopA.id, 'derived-x'], zones: [{ name: 'Z', registryZone: 'A' }] }, wells, surfaces, backend);
    const th = b.thickness[0].find((v) => !isNull(v));
    expect(th).toBeCloseTo(100 * FT, 3);
  });

  test('two stacked surfaces in different XY units are refused', async () => {
    const f = await feetFixture();
    const m = await fixture();
    const surfaces = [...f.surfaces.filter((s) => s.xy_unit === 'ft'), ...m.surfaces];
    const backend = { ...m.backend, downloadSurfaceGrid: (s) => (s.xy_unit === 'ft' ? f.backend.downloadSurfaceGrid(s) : m.backend.downloadSurfaceGrid(s)) };
    await expect(buildModel(baseDef(m.byName, { surfaceIds: [f.byName.TopA.id, m.byName.TopB.id] }), m.wells, surfaces, backend))
      .rejects.toThrow(/XY unit/);
  });
});

describe('EM-U1-003 (S2): published layers carry the frame', () => {
  test('a structure layer leaves with its CRS, XY unit and metres elevation', async () => {
    const f = await feetFixture({ xyUnit: 'ftUS', crs: 'EPSG:2274' });
    const b = await buildModel(baseDef(f.byName), f.wells, f.surfaces, f.backend);
    const p = publishPayload(b, { layer: 'top', grid: b.clamped[0], modelName: 'M', zoneName: 'Zone A', methods: {} });
    expect(p.crs).toBe('EPSG:2274');
    expect(p.xyUnit).toBe('ftUS');
    expect(p.zUnit).toBe('m');
    expect(p.kind).toBe('structure');
    expect(p.grid[0]).toBeLessThan(0);
    const iso = publishPayload(b, { layer: 'thickness', grid: b.thickness[0], modelName: 'M', zoneName: 'Zone A', methods: {} });
    expect(iso.kind).toBe('isochore');
    expect(iso.zUnit).toBe('m');
    const phi = publishPayload(b, { layer: 'phi', grid: b.zones[0].props.phi, modelName: 'M', zoneName: 'Zone A', methods: {} });
    expect(phi.zDomain).toBe('attribute');
    expect(phi.zUnit).toBe('fraction');
  });
});

describe('EM-U1-004 (S2): a rotated top gives an unrotated model frame', () => {
  test('modelFrame covers the rotated extent without rotation', () => {
    const f = modelFrame({ x0: 0, y0: 0, dx: 100, dy: 100, nx: 11, ny: 11, rotation_deg: 30 }, '');
    expect(f.rotation_deg).toBeUndefined();
    expect(f.x0).toBeCloseTo(-1000 * Math.sin(Math.PI / 6), 6);
    expect(f.x0 + (f.nx - 1) * f.dx).toBeGreaterThanOrEqual(1000 * Math.cos(Math.PI / 6) - 1e-6);
  });
});

describe('EM-U1-005 (S2): properties stay fractions', () => {
  test('an extrapolated trend is clamped to 0..1 and counted (before: Sw above 1, negative HCPV)', async () => {
    const { backend, wells, surfaces, byName } = await fixture();
    const steep = wells.map((w) => ({ ...w, zones: w.zones.map((z) => ({ ...z, properties: { ...z.properties, sw_avg: w.name === 'W3' ? 0.98 : w.name === 'W1' ? 0.1 : 0.5 } })) }));
    const b = await buildModel(baseDef(byName, { methods: { phi: 'constant', sw: 'trend', ntg: 'constant' } }), steep, surfaces, backend);
    const sw = b.zones[0].props.sw;
    for (const v of sw) if (!isNull(v)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    expect(b.propertyClamps.some((c) => c.prop === 'sw' && c.nodes > 0)).toBe(true);
    for (const k of Object.keys(b.zones[0].volumes)) expect(b.zones[0].volumes[k].hcpv_m3).toBeGreaterThanOrEqual(0);
  });
});

describe('EM-U1-006 (S2) and 007 (S2): contacts and FVF read as typed', () => {
  test('each contact keeps the unit it was typed in', () => {
    const [f] = parseFluidsInput([{ goc: '5000', gocUnit: 'ft', owc: '1550', owcUnit: 'm' }]);
    expect(f.goc).toBeCloseTo(5000 * FT, 9);
    expect(f.owc).toBe(1550);
    // legacy rows with one unit still read
    expect(parseFluidsInput([{ goc: '5000', owc: '5100', unit: 'ft' }])[0].owc).toBeCloseTo(5100 * FT, 9);
  });

  test('a negative contact is an elevation and reads as depth below datum, with a note', () => {
    const [f] = parseFluidsInput([{ owc: '-1550', owcUnit: 'm' }]);
    expect(f.owc).toBe(1550);
    expect(f.notes[0]).toMatch(/elevation/);
  });

  test('Bg typed in RB/Mscf converts to rm3/sm3 (before: 0.8 RB/Mscf read as 0.8 rm3/sm3, GIIP 178x low)', () => {
    const [f] = parseFluidsInput([{ bg: '0.8', bgUnit: 'RB/Mscf', owc: '1600', owcUnit: 'm' }]);
    expect(f.bg).toBeCloseTo(0.8 * 0.158987294928 / 28.316846592, 9);
  });

  test('Bg without Bo or a GOC makes a gas zone: GIIP from the top down to the contact', async () => {
    const { backend, wells, surfaces, byName } = await fixture();
    const b = await buildModel(baseDef(byName, { fluidsInput: [{ owc: '1700', owcUnit: 'm', bg: '0.005', bgUnit: 'm3/m3' }] }), wells, surfaces, backend);
    const t = b.zones[0].volumes.total;
    expect(t.gas_hcpv_m3).toBeGreaterThan(0);
    expect(t.oil_hcpv_m3).toBe(0);
    expect(t.giip_m3).toBeCloseTo(t.gas_hcpv_m3 / 0.005, 3);
  });
});

describe('EM-U1-008 (S2): an open hydrocarbon leg is said', () => {
  test('a contact below the frame edge flags the zone as open; one above the crest does not', async () => {
    const { backend, wells, surfaces, byName } = await fixture();
    const deep = await buildModel(baseDef(byName, { fluidsInput: [{ owc: '1700', owcUnit: 'm' }] }), wells, surfaces, backend);
    const rep = contactEdgeReport(deep.specM, deep.clamped[0], deep.zones[0].fluids);
    expect(rep.open).toBe(true);
    expect(deep.zones[0].openEdge.open).toBe(true);
    const shallow = await buildModel(baseDef(byName, { fluidsInput: [{ owc: '1400', owcUnit: 'm' }] }), wells, surfaces, backend);
    expect(shallow.zones[0].openEdge.open).toBe(false);
  });
});
