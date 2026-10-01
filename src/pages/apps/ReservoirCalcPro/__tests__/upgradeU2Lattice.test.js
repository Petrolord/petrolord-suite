// ReservoirCalc Pro upgrade U2-005: registry grids are integrated on their
// own lattice (closes RCP-U1-036). The gate: RCP's GRV equals Mapping's own
// quickGrv on the same row and contact within 0.1 percent, on the saved
// rows of every frame; the negative control is the old thinned-and-IDW path.

import fs from 'fs';
import path from 'path';
import { surfaceFromRegistryRow } from '../services/surfaceDoor';
import { ContactVolumetricsEngine } from '../services/ContactVolumetricsEngine';
import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import { latticeOf, MAX_LATTICE_NODES } from '../services/lattice';
import { describeGridding } from '../services/reportInfo';
import { readDepthSurface } from '@/lib/readDepthSurface';
import { quickGrv } from '@/pages/apps/MappingSurfaceStudio/services/quickGrv';

jest.setTimeout(120000);

const root = path.resolve(__dirname, '../../../../..');
const saved = JSON.parse(fs.readFileSync(path.join(root, 'e2e/fixtures/map/saved/surfaces.json'), 'utf8')).surfaces;
const rowOf = (name) => saved.find((s) => s.row.name === name);

const unitInputs = { fluidType: 'oil', ntg: 1, porosity: 1, sw: 0, fvf: 1 };
const rcpGrv = (surface, { owcM = -1550, unitSystem = 'metric', options = {} } = {}) => {
  const f = unitSystem === 'field' ? 1 / 0.3048 : 1;
  return ContactVolumetricsEngine.calculate({
    topSurface: surface, constantThickness: 500 * f, unitSystem,
    inputs: { ...unitInputs, owc: owcM * f }, options: { resolution: 120, ...options },
  });
};
/** Mapping's own GRV of the row, the way the studio loads it. */
const mappingGrv = (row, grid, contactM) => {
  const r = readDepthSurface(row, Float32Array.from(grid), { accept: ['elevation'], as: 'elevation', xy: 'native' });
  return quickGrv({ spec: r.spec, gridM: r.grid, contactM, xyToM: r.xyToM });
};

const FRAMES = ['T1 Top Dome structure', 'U1 state plane structure', 'MS5 rotated Irap', 'MS2 imported CPS-3', 'G4 Seismolord horizon'];

describe('U2-005 RCP and Mapping give one GRV on one registry surface', () => {
  for (const name of FRAMES) {
    it(`${name}: within 0.1 percent of Mapping's quickGrv`, () => {
      const { row, grid } = rowOf(name);
      const door = surfaceFromRegistryRow(row, Float32Array.from(grid));
      expect(door.ok).toBe(true);
      expect(latticeOf(door.surface)).toBeTruthy();
      const map = mappingGrv(row, grid, -1550);
      expect(map.kind).toBe('closure');
      const rcp = rcpGrv(door.surface);
      expect(rcp.gridding.interpolation).toBe('lattice');
      expect(Math.abs(rcp.grv / map.grvM3 - 1)).toBeLessThan(0.001);
    });
  }

  it('in field units the acre-ft GRV equals Mapping\'s acre-ft within 0.1 percent', () => {
    const { row, grid } = rowOf('U1 state plane structure');
    const door = surfaceFromRegistryRow(row, Float32Array.from(grid));
    const map = mappingGrv(row, grid, -1550);
    const rcp = rcpGrv(door.surface, { unitSystem: 'field' });
    expect(Math.abs(rcp.grv / map.grvAcreFt - 1)).toBeLessThan(0.001);
  });

  it('negative control: the old path (5,000 points re-gridded by IDW) misses Mapping by more than 1 percent', () => {
    const { row, grid } = rowOf('T1 Top Dome structure');
    const door = surfaceFromRegistryRow(row, Float32Array.from(grid));
    const map = mappingGrv(row, grid, -1550);
    const old = rcpGrv(door.surface, { options: { lattice: false } });
    expect(old.gridding.interpolation).toBe('idw');
    expect(Math.abs(old.grv / map.grvM3 - 1)).toBeGreaterThan(0.01);
  });

  it('the deterministic Hybrid run and its gridding line say the grid was not re-gridded', () => {
    const { row, grid } = rowOf('T1 Top Dome structure');
    const door = surfaceFromRegistryRow(row, Float32Array.from(grid));
    const res = VolumeCalculationEngine.calculateDeterministic(
      { ...unitInputs, owc: -1550, thickness: 500, topSurfaceId: 's1' }, 'metric', 'hybrid', { s1: door.surface },
    );
    expect(res.grv).toBeCloseTo(rcpGrv(door.surface).grv, 3);
    expect(describeGridding(res)).toMatch(/registry grid's own nodes \(no re-gridding\)/);
    expect(door.notes.join(' ')).toMatch(/integrated on the grid's own 11 x 9 nodes/);
  });

  it('the lattice survives a saved project (JSON) and gives the same GRV', () => {
    const { row, grid } = rowOf('MS5 rotated Irap');
    const door = surfaceFromRegistryRow(row, Float32Array.from(grid));
    const reloaded = JSON.parse(JSON.stringify(door.surface));
    expect(latticeOf(reloaded).spec.rotation_deg).toBe(30);
    expect(rcpGrv(reloaded).grv).toBeCloseTo(rcpGrv(door.surface).grv, 6);
  });

  it('the Monte Carlo hypsometry integrates the same lattice (P50 contact at the mean gives the deterministic GRV)', () => {
    const { row, grid } = rowOf('T1 Top Dome structure');
    const door = surfaceFromRegistryRow(row, Float32Array.from(grid));
    const h = ContactVolumetricsEngine.buildHypsometry({ topSurface: door.surface, constantThickness: 500, unitSystem: 'metric' });
    const det = rcpGrv(door.surface).grv;
    expect(Math.abs(h.zoneVolumes('oil', -1550, null).grvOil / det - 1)).toBeLessThan(0.002);
  });

  it('a grid larger than RCP keeps falls back to thinned points and says so', () => {
    const nx = 700; const ny = Math.ceil((MAX_LATTICE_NODES + 1000) / nx);
    const g = new Float32Array(nx * ny);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) g[r * nx + c] = -1500 - 0.01 * ((c - nx / 2) ** 2 + (r - ny / 2) ** 2) ** 0.5;
    const row = { ...rowOf('T1 Top Dome structure').row, name: 'Big', nx, ny, dx: 25, dy: 25 };
    const door = surfaceFromRegistryRow(row, g);
    expect(door.ok).toBe(true);
    expect(door.surface.lattice).toBeUndefined();
    expect(door.notes.join(' ')).toMatch(/thinned to 5,000 points and re-gridded/);
  });
});
