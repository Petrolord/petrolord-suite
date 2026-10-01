// Earth Modeling upgrade U1: saved state (PL5), culture polygons and
// frames (PL2, PL3, PL9), the 3D exaggeration on a feet frame, and the
// Save door (PL4). Every test calls the shipped code.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition, upgradeDefinition } from '../services/modelBuild';
import { SAVED_MODELS } from '../services/savedFixtures';
import { buildFrameworkScene } from '../services/framework3d';
import { FAULT_POLYGON } from '../services/fixture';
import EarthWorkstation from '../components/EarthWorkstation';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
// the culture helpers import the registry modules; only the pure entry builder is used here
const { culturePolygonEntries } = jest.requireActual('../services/registryBackend');

async function seeded() {
  const backend = makeInMemoryBackend({ savedModels: true });
  return { backend, wells: await backend.listWells(), surfaces: await backend.listSurfaces(), projects: await backend.listProjects() };
}

describe('EM-U1-010 (PL5): a model saved by every release opens and builds', () => {
  test.each(SAVED_MODELS.map((m) => m.release))('%s', async (release) => {
    const { backend, wells, surfaces, projects } = await seeded();
    const row = projects.find((p) => p.name === SAVED_MODELS.find((m) => m.release === release).name);
    const def = upgradeDefinition(row.definition);
    expect(upgradeDefinition(def)).toEqual(def); // idempotent
    const b = await buildModel(def, wells, surfaces, backend);
    expect(b.zones.length).toBe(def.surfaceIds.length - 1);
    if (release === 'G8') {
      expect(def.faultPolygons[0].vertices[0]).toEqual([975, 1975]);
      expect(b.census).toEqual({ 0: 326, 1: 174 });
      expect(def.frame).toEqual({ cellM: '', boundaryId: '' });
    }
    if (release === 'EM0-EM6') expect(b.boundary.name).toBe('Fixture lease (Mapping)');
    if (release === 'T1') {
      expect(b.zones[0].fluids.goc).toBeCloseTo(5050 * 0.3048, 6);
      expect(b.zones[0].fluids.owc).toBeCloseTo(5200 * 0.3048, 6);
      expect(b.zones[0].volumes.total.stoiip_m3).toBeGreaterThan(0);
    }
    if (release === 'U1') {
      expect(b.zones[0].fluids.gasZone).toBe(true);
      expect(b.zones[0].volumes.total.giip_m3).toBeGreaterThan(0);
    }
  });

  test('a row with missing keys still reads (the G8 shape with no topNames)', () => {
    const d = upgradeDefinition({ surfaceIds: ['a', 'b'] });
    expect(d.topNames).toEqual(['', '']);
    expect(d.krige.fit).toBe(true);
    expect(d.derived).toEqual([]);
  });
});

describe('EM-U1-012 (PL9): every ring of a culture row, and its CRS', () => {
  const ring = (x0) => [[x0, 0], [x0 + 10, 0], [x0 + 10, 10], [x0, 10], [x0, 0]];
  const feats = [{ type: 'polygon', rings: [ring(0)] }, { type: 'polygon', rings: [ring(100)] }, { type: 'polygon', rings: [ring(200)] }];
  test('a fault file of three polygons gives three fault polygons (before: the first only)', () => {
    const out = culturePolygonEntries({ id: 'c1', name: 'Faults', crs: 'EPSG:32631' }, feats);
    expect(out.map((o) => o.id)).toEqual(['c1', 'c1#2', 'c1#3']);
    expect(out.map((o) => o.name)).toEqual(['Faults (1)', 'Faults (2)', 'Faults (3)']);
    expect(out[2].vertices[0]).toEqual([200, 0]);
    expect(out[0].crs).toBe('EPSG:32631');
  });
  test('a boundary keeps every ring for the union', () => {
    const [b] = culturePolygonEntries({ id: 'b1', name: 'Lease' }, feats, { split: false });
    expect(b.rings.length).toBe(3);
  });
  test('a fault polygon or a well in another CRS than the model', async () => {
    const backend = makeInMemoryBackend();
    const surfaces = (await backend.listSurfaces()).map((s) => ({ ...s, crs: 'EPSG:32631' }));
    const wells = await backend.listWells();
    const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
    const def = { ...emptyDefinition(), surfaceIds: [byName.TopA.id, byName.TopB.id], topNames: ['TopA', 'TopB'], zones: [{ name: 'A', registryZone: 'A' }] };
    await expect(buildModel({ ...def, faultPolygons: [{ name: 'F utm32', vertices: FAULT_POLYGON, crs: 'EPSG:32632' }] }, wells, surfaces, backend))
      .rejects.toThrow(/F utm32 is in EPSG:32632 but the model is in EPSG:32631/);
    const mixed = wells.map((w, i) => (i === 0 ? { ...w, crs: 'EPSG:26391' } : w));
    const b = await buildModel(def, mixed, surfaces, backend);
    expect(b.notes.join(' ')).toMatch(/W1 \(EPSG:26391\)/);
    expect(b.ties.some((t) => t.well === 'W1')).toBe(false);
  });
});

describe('EM-U1-001 in the views: exaggeration compares metres with metres', () => {
  test('the 3D box on a feet frame has the metre frame height (before: 3.28x taller)', async () => {
    const backend = makeInMemoryBackend();
    const wells = await backend.listWells();
    const surfaces = await backend.listSurfaces();
    const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
    const b = await buildModel({ ...emptyDefinition(), surfaceIds: [byName.TopA.id, byName.BaseB.id], topNames: ['TopA', 'BaseB'], zones: [{ name: 'A', registryZone: 'A' }] }, wells, surfaces, backend);
    const FT = 0.3048;
    const feet = { ...b, spec: { ...b.spec, x0: b.spec.x0 / FT, y0: b.spec.y0 / FT, dx: b.spec.dx / FT, dy: b.spec.dy / FT }, xyToM: FT };
    const wellsFt = wells.map((w) => ({ ...w, surface_x: w.surface_x / FT, surface_y: w.surface_y / FT }));
    const m = buildFrameworkScene(b, wells, { ve: 5 });
    const f = buildFrameworkScene(feet, wellsFt, { ve: 5 });
    expect(f.ext.D).toBeCloseTo(m.ext.D, 9);
    // the deviated well's deepest point sits at the same normalised place
    const last = (s) => { const p = s.wells.find((w) => w.name === 'W2').positions; return [p[p.length - 3], p[p.length - 1]]; };
    expect(last(f)[0]).toBeCloseTo(last(m)[0], 6);
    expect(last(f)[1]).toBeCloseTo(last(m)[1], 6);
  });
});

describe('EM-U1-009 (PL4): Save overwrites the open model', () => {
  beforeAll(() => {
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    if (!window.ResizeObserver) window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  });
  test('load, save, save: still four rows; Save as a new model adds one (before: every save inserted)', async () => {
    const backend = makeInMemoryBackend({ savedModels: true });
    render(<MemoryRouter><EarthWorkstation backend={backend} /></MemoryRouter>);
    await screen.findByTestId('em-add-TopA');
    const loads = await screen.findAllByText('load');
    fireEvent.click(loads[0]);
    await waitFor(() => expect(screen.getByTestId('em-save-model').textContent).toMatch(/overwrite/));
    fireEvent.click(screen.getByTestId('em-save-model'));
    await waitFor(() => expect(screen.getByTestId('em-status').textContent).toMatch(/updated/));
    fireEvent.click(screen.getByTestId('em-save-model'));
    await waitFor(async () => expect((await backend.listProjects()).length).toBe(4));
    fireEvent.click(screen.getByTestId('em-save-as-new'));
    await waitFor(async () => expect((await backend.listProjects()).length).toBe(5));
  });
});
