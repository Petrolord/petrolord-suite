// WDM-U2-007 in Earth Modeling: a well that states no depth reference
// elevation has no subsea depth for its tops, so it is left out of the well
// ties, the properties and the 3D scene, and the build notes name it. It is
// never tied as if its KB were 0. A row from before the datum model (kb_m
// only) keeps tying as it did (negative control).
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition, engineWell } from '../services/modelBuild';
import { buildFrameworkScene } from '../services/framework3d';
import { DATUM_COLUMNS } from '@/lib/wellDatum';

const nullDatum = Object.fromEntries(DATUM_COLUMNS.map((c) => [c, null]));

async function build(mutate) {
  const backend = makeInMemoryBackend();
  const wells = (await backend.listWells()).map(mutate);
  const surfaces = await backend.listSurfaces();
  const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
  const built = await buildModel({
    ...emptyDefinition(),
    surfaceIds: [byName.TopA.id, byName.TopB.id, byName.BaseB.id],
    topNames: ['TopA', 'TopB', 'BaseB'],
    zones: [{ name: 'A', registryZone: 'A' }, { name: 'B', registryZone: 'B' }],
  }, wells, surfaces, backend);
  return { built, wells };
}

test('the well with no reference elevation is left out of ties and the scene, and the notes say so', async () => {
  const { built, wells } = await build((w) => (w.name === 'W4' ? { ...w, kb_m: 0, ...nullDatum } : w));
  const note = built.notes.find((n) => /no depth reference elevation/.test(n));
  expect(note).toBe('1 well has no depth reference elevation, so its tops have no subsea depth and it was left out of ties and properties: W4. Set the depth reference in Well Data Manager (Header tab).');
  expect(built.ties.some((t) => t.well === 'W4')).toBe(false);
  expect(new Set(built.ties.map((t) => t.well))).toEqual(new Set(['W1', 'W2', 'W3']));
  const scene = buildFrameworkScene(built, wells, { surfaceNames: ['TopA', 'TopB', 'BaseB'] });
  expect(scene.labels.filter((l) => l.kind === 'well').map((l) => l.text)).toEqual(['W1', 'W2', 'W3']);
});

test('NEGATIVE CONTROL: with every well stating its KB, all four tie and no note is raised', async () => {
  const { built } = await build((w) => w);
  expect(built.notes.some((n) => /no depth reference elevation/.test(n))).toBe(false);
  expect(new Set(built.ties.map((t) => t.well))).toEqual(new Set(['W1', 'W2', 'W3', 'W4']));
});

test('the engine well carries the stated elevation: the datum columns win over kb_m', () => {
  expect(engineWell({ name: 'X', surface_x: 1, surface_y: 2, kb_m: 10, ...nullDatum, depth_ref_kind: 'RT', depth_ref_elev_m: 31.2 }).kb_m).toBe(31.2);
  expect(engineWell({ name: 'X', surface_x: 1, surface_y: 2, kb_m: 28 }).kb_m).toBe(28);
});
