// ReservoirCalc Pro upgrade U2-009: the 2D view on the shared Mapping map
// kit. The adapter is pure; the browser half is in the e2e.

import fs from 'fs';
import path from 'path';
import { kitFromRcpGrid, kitForSurface, kitPolygons, NULL_Z } from '../services/mapKitGrid';
import { surfaceFromRegistryRow } from '../services/surfaceDoor';
import { gridSurface } from '../services/GriddingEngine';
import { sampleAtXY } from '@/lib/gridding/gridmath';

const root = path.resolve(__dirname, '../../../../..');
const saved = JSON.parse(fs.readFileSync(path.join(root, 'e2e/fixtures/map/saved/surfaces.json'), 'utf8')).surfaces;
const rowOf = (name) => saved.find((s) => s.row.name === name);

describe('U2-009 RCP grids on the kit', () => {
  it('an RCP grid becomes the kit frame: node (r, c) is z[r][c] at x[c], y[r]; NaN is the kit null', () => {
    const g = { x: [0, 10, 20], y: [100, 150], z: [[1, 2, NaN], [4, 5, 6]], cellWidth: 10, cellHeight: 50 };
    const k = kitFromRcpGrid(g);
    expect(k.spec).toEqual({ x0: 0, y0: 100, dx: 10, dy: 50, nx: 3, ny: 2 });
    expect(Array.from(k.grid)).toEqual(Array.from(Float32Array.from([1, 2, NULL_Z, 4, 5, 6])));
    // a world sample through the kit's own reader lands on the RCP value
    expect(sampleAtXY(k.grid, k.spec, 10, 150)).toBeCloseTo(5, 6);
    expect(sampleAtXY(k.grid, k.spec, 5, 125)).toBeCloseTo(3, 6);
    expect(kitFromRcpGrid({ x: [0], y: [0], z: [[1]] })).toBeNull();
  });

  it('a registry surface shows its own lattice (rotation kept); a file surface shows RCP\'s grid', () => {
    const { row, grid } = rowOf('MS5 rotated Irap');
    const s = surfaceFromRegistryRow(row, Float32Array.from(grid)).surface;
    const k = kitForSurface(s, null);
    expect(k.source).toBe('lattice');
    expect(k.spec.rotation_deg).toBe(30);
    expect(k.grid.length).toBe(row.nx * row.ny);
    const file = { ...s, lattice: undefined, id: 'f1' };
    const kg = kitForSurface(file, gridSurface(file, 'idw', 30));
    expect(kg.source).toBe('gridded');
    expect(kg.spec.nx).toBe(30);
  });

  it('AOIs become kit polygons, the active one in its own colour; degenerate rings are left out', () => {
    const aois = [{ id: 'a', name: 'A', vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }, { id: 'b', name: 'B', vertices: [{ x: 0, y: 0 }] }];
    const p = kitPolygons(aois, 'a');
    expect(p).toHaveLength(1);
    expect(p[0].color).toBe('#22d3ee');
  });
});
