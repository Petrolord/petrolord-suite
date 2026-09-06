import { buildFrameworkScene, stackRange } from '../services/framework3d';
import { gridMesh } from '@/components/viewer3d/gridMesh';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition } from '../services/modelBuild';
import { FAULT_POLYGON } from '../services/fixture';
import { NULL_VALUE } from '@/lib/gridding/numeric';

test('gridMesh triangulates with holes and optional colours', () => {
  const z = Float32Array.from([1, 2, 3, 4, NULL_VALUE, 6, 7, 8, 9]);
  const m = gridMesh(z, 3, 3, (r, c, v) => (Math.abs(v) >= 1e29 ? null : [c, -v, r]), { colorOf: () => [1, 0, 0] });
  expect(m.vertexCount).toBe(9);
  // 4 quads; the centre null removes the two triangles that use it in each quad, one survives per quad
  expect(m.triangleCount).toBe(4);
  expect(m.colors.length).toBe(27);
  expect(m.positions[3 * 8 + 1]).toBe(-9);
});

test('the scene scales the frame to unit ground extent, colours by depth and places wells, tops, faults and ticks', async () => {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const surfaces = await backend.listSurfaces();
  const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
  const built = await buildModel({
    ...emptyDefinition(),
    surfaceIds: [byName.TopA.id, byName.TopB.id, byName.BaseB.id],
    topNames: ['TopA', 'TopB', 'BaseB'],
    zones: [{ name: 'A', registryZone: 'A' }, { name: 'B', registryZone: 'B' }],
  }, wells, surfaces, backend);
  const scene = buildFrameworkScene(built, wells, { ve: 3, surfaceNames: ['TopA', 'TopB', 'BaseB'], faultPolygons: [{ vertices: FAULT_POLYGON }], depthUnit: 'ft' });
  const extX = (built.spec.nx - 1) * built.spec.dx; const extY = (built.spec.ny - 1) * built.spec.dy;
  const L = Math.max(extX, extY);
  expect(scene.ext.X).toBeCloseTo(extX / L, 9);
  expect(scene.ext.Z).toBeCloseTo(extY / L, 9);
  expect(scene.ext.D).toBeCloseTo(3 * (scene.zMax - scene.zMin) / L, 9);
  expect(scene.surfaces).toHaveLength(3);
  for (const s of scene.surfaces) {
    expect(s.triangleCount).toBeGreaterThan(0);
    expect(s.colors.length).toBe(s.positions.length);
    for (let i = 1; i < s.positions.length; i += 3) { expect(s.positions[i]).toBeLessThanOrEqual(0); expect(s.positions[i]).toBeGreaterThanOrEqual(-1); }
  }
  expect(scene.wells).toHaveLength(4);
  expect(scene.tops.length).toBe(4 * 3 * 18); // 4 wells x 3 tops x 3 crosses x 6 floats
  expect(scene.faults.length).toBe(FAULT_POLYGON.length * 6);
  expect(scene.axes.edges.length).toBe(72);
  expect(scene.axes.ticks.some((t) => t.axis === 'z' && / ft$/.test(t.text))).toBe(true);
  expect(scene.labels.map((l) => l.text)).toEqual(['W1', 'W2', 'W3', 'W4']);
  const hidden = buildFrameworkScene(built, wells, { visible: [true, false, true] });
  expect(hidden.surfaces.map((s) => s.name)).toEqual(['Surface 1', 'Surface 3']);
  expect(stackRange([Float32Array.from([NULL_VALUE])])).toBeNull();
});
