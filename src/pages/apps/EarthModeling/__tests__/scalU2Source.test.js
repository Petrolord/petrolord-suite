// SCAL-U2-009: the Earth Modeling report prints the kr-1 source of the
// saturation-height function it used (the words shmFromScalProject gives:
// the J source, the rock it was scaled to, the SCAL project and time), and
// says so when the SCAL project was saved before it carried the block.
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition } from '../services/modelBuild';
import { resolveShm } from '../services/shmResolve';
import { zoneFluidLines } from '../services/modelReportPdf';

async function fixture() {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const surfaces = await backend.listSurfaces();
  const byName = Object.fromEntries(surfaces.map((s) => [s.name, s]));
  return { backend, wells, surfaces, byName };
}
const defOf = (byName) => ({
  ...emptyDefinition(),
  surfaceIds: [byName.TopA.id, byName.TopB.id, byName.BaseB.id],
  topNames: ['TopA', 'TopB', 'BaseB'],
  zones: [{ name: 'Zone A', registryZone: 'A' }, { name: 'Zone B', registryZone: 'B' }],
  methods: { phi: 'constant', sw: 'shm', ntg: 'constant' },
  shm: { projectId: 'scal-sample', fwl: '1640', fwlUnit: 'm' },
});

test('the built zone and its report lines carry the SCAL source words', async () => {
  const f = await fixture();
  const def = defOf(f.byName);
  const shmResolved = await resolveShm(def.shm, f.backend);
  const b = await buildModel({ ...def, shmResolved }, f.wells, f.surfaces, f.backend);
  const z = b.zones[0];
  expect(z.shm.source).toBe(shmResolved.sourceText);
  const lines = zoneFluidLines(z).join('\n');
  expect(lines).toContain(`SCAL source: ${shmResolved.sourceText}`);
  // the in-memory sample is a schema 1 project: the words say it carries no kr-1 block
  expect(lines).toMatch(/saved before it carried its kr-1 block/);
  expect(z.provenance.sw[0].note).toContain(shmResolved.sourceText);
});

test('a project with a kr-1 block prints its J source and rock', async () => {
  const f = await fixture();
  const { buildScalKrContract } = await import('@/utils/scalstudio/krHandoff');
  const { deriveScalState, inputsFromPayload } = await import('@/utils/scalstudio/workspace');
  const payload = await f.backend.loadScalProject('scal-sample');
  const s = deriveScalState(inputsFromPayload(payload));
  const kr = buildScalKrContract({ ...s, projectId: 'scal-sample', projectName: payload.name, generatedAt: new Date('2026-10-03T09:00:00Z') });
  const backend = { ...f.backend, loadScalProject: async () => ({ ...payload, kr }) };
  const def = defOf(f.byName);
  const shmResolved = await resolveShm(def.shm, backend);
  const b = await buildModel({ ...def, shmResolved }, f.wells, f.surfaces, f.backend);
  expect(zoneFluidLines(b.zones[0]).join('\n')).toMatch(/SCAL source: Leverett J typed as a power law, scaled to k 150 md and porosity 0\.22, from SCAL Studio project "Fixture SAND J \(sample\)" \(2026-10-03 09:00 UTC\)/);
});

test('negative control: a zone with no saturation height prints no SCAL source', () => {
  expect(zoneFluidLines({ name: 'Z', fluids: {} }).join('\n')).not.toMatch(/SCAL source/);
});
