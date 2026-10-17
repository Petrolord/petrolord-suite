/**
 * The 3D grid scene (3D grid upgrade): the shell, the skeleton, I/J/K
 * slices, the cell filter and the contact planes, on a small synthetic grid
 * whose counts can be worked out by hand: 4 x 3 columns, 2 zones of 2 and 3
 * layers, a flat top at 1000 m and 1 m layers.
 */
import { gridScene, contactScene, cornerDepths, cellValue, cellLayers, zoneContacts, colourOf } from '../services/grid3d/scene';

const nx = 4; const ny = 3; const N = nx * ny;
const flat = (d) => new Float64Array(N).fill(d);
const layer = (t, phi) => ({ top: flat(t), base: flat(t + 1), props: { phi: new Float32Array(N).fill(phi) } });
const built = {
  spec: { x0: 0, y0: 0, dx: 25, dy: 25, nx, ny },
  clamped: [flat(1000), flat(1002), flat(1005)],
  zones: [
    { name: 'A', layers: [layer(1000, 0.1), layer(1001, 0.2)], mc: { fluids: { owc: 1003.5 } } },
    { name: 'B', layers: [layer(1002, 0.15), layer(1003, 0.25), layer(1004, 0.3)], mc: { fluids: { owc: 1003.5 } } },
  ],
};
const toModel = (x, y, d) => [x, -d, y];

test('corner depths are the mean of the live nodes around each corner', () => {
  const z = Float64Array.from([1, 2, 3, 4]);
  const c = cornerDepths(z, 2, 2);
  expect(c.length).toBe(9);
  expect(c[4]).toBe(2.5); // the middle corner sees all four
  expect(c[0]).toBe(1); // a corner sees one node
});

test('the shell: top and base faces of every column, side walls round the edge, skeleton lines every n cells', () => {
  const g = gridScene(built, { toModel, prop: 'zone', mode: 'shell', density: 1 });
  const perimeterFaces = 2 * (nx + ny); // side faces of edge columns per layer
  expect(g.nK).toBe(5);
  expect(g.mesh.quads).toBe(2 * N + perimeterFaces * 5);
  expect(g.skeleton.length).toBeGreaterThan(0);
  const none = gridScene(built, { toModel, prop: 'zone', mode: 'shell', density: 0 });
  expect(none.skeleton.length).toBe(0);
});

test('slices: an I slice is ny x nK cells, a J slice nx x nK, a K slice nx x ny', () => {
  expect(gridScene(built, { toModel, mode: 'slices', slices: { i: 1 } }).mesh.quads).toBe(ny * 5);
  expect(gridScene(built, { toModel, mode: 'slices', slices: { j: 2 } }).mesh.quads).toBe(nx * 5);
  expect(gridScene(built, { toModel, mode: 'slices', slices: { k: 3 } }).mesh.quads).toBe(N);
});

test('the cell filter keeps only the cells in the range (porosity 0.2 to 0.26: two layers)', () => {
  const g = gridScene(built, { toModel, prop: 'phi', mode: 'filter', filter: { lo: 0.2, hi: 0.26 } });
  expect(g.counts.cells).toBe(2 * N);
  const all = gridScene(built, { toModel, prop: 'phi', mode: 'filter', filter: null });
  expect(all.counts.cells).toBe(5 * N);
});

test('the fluid zone of a cell from its zone contact: oil above the OWC, water below', () => {
  const layers = cellLayers(built); const contacts = zoneContacts(built);
  expect(cellValue(built, layers, contacts, 2, 0, 'fluid')).toBe(1); // 1002 to 1003, above 1003.5
  expect(cellValue(built, layers, contacts, 4, 0, 'fluid')).toBe(0); // 1004 to 1005
  expect(colourOf('fluid', 0)).toEqual([0.15, 0.39, 0.92]);
});

test('a contact shared by two zones is one plane, drawn where it cuts them, with its outline', () => {
  const c = contactScene(built, { toModel });
  // one plane for the contact both zones share; it cuts zone B only (zone A ends at 1002)
  expect(c.map((x) => `${x.kind} ${x.zones.join(',')}`)).toEqual(['owc 0,1']);
  expect(c[0].mesh.quads).toBe(N);
  expect(c[0].lines.length / 6).toBe(2 * (nx + ny));
});

test('the Details histograms take a 3D grid\'s half a million cells (no spread into Math.min)', async () => {
  const { histogram, minMax } = await import('../components/PropertyQc');
  const vals = Array.from({ length: 500000 }, (_, i) => (i % 1000) / 1000);
  expect(minMax(vals)).toEqual([0, 0.999]);
  const h = histogram(vals, 10);
  expect(h.counts.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
});
