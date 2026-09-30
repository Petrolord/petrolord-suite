// Earth Modeling upgrade U2 (Step 2 build, 2026-10-01). Every test calls
// the shipped code; numeric gates carry a negative control (named in the
// test or its comment). Item ids are in docs/upgrade/EarthModeling-UPGRADE.md.

import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition, BuildCancelled } from '../services/modelBuild';
import { serveBuild, runBuildOnWorker } from '../services/buildWorkerProtocol';
import { runBuild } from '../services/buildClient';
import { FAULT_POLYGON } from '../services/fixture';

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

/**
 * An in-process worker pair: the page end has postMessage/terminate/onmessage
 * like a Worker; the worker end runs serveBuild. Messages cross through a
 * structured clone on a macrotask, as they do between threads.
 */
function loopbackWorker({ build } = {}) {
  const page = { terminated: false, onmessage: null, onerror: null };
  const toPage = (m) => setTimeout(() => { if (!page.terminated && page.onmessage) page.onmessage({ data: structuredClone(m) }); }, 0);
  const handle = serveBuild(toPage, build ? { build } : {});
  page.postMessage = (m) => setTimeout(() => { if (!page.terminated) handle({ data: structuredClone(m) }); }, 0);
  page.terminate = () => { page.terminated = true; };
  return page;
}

describe('U2-004: the build on a worker, with progress and cancel', () => {
  test('the worker build equals the inline build, with progress to 100%', async () => {
    const f = await fixture();
    const def = baseDef(f.byName, { faultPolygons: [{ name: 'F1', vertices: FAULT_POLYGON }], methods: { phi: 'okrige', sw: 'trend', ntg: 'constant' } });
    const inline = await buildModel(def, f.wells, f.surfaces, f.backend);
    const events = [];
    const worker = loopbackWorker();
    const viaWorker = await runBuildOnWorker(worker, { definition: def, wells: f.wells, surfaces: f.surfaces, backend: f.backend, onProgress: (p) => events.push(p) });
    expect(worker.terminated).toBe(true);
    expect(viaWorker.census).toEqual(inline.census);
    for (let z = 0; z < 2; z++) {
      expect(viaWorker.zones[z].volumes).toEqual(inline.zones[z].volumes);
      expect(Array.from(viaWorker.zones[z].props.phi)).toEqual(Array.from(inline.zones[z].props.phi));
    }
    expect(Array.from(viaWorker.clamped[1])).toEqual(Array.from(inline.clamped[1]));
    // 3 surfaces + framework + 2 zones x (3 properties + volumes)
    expect(events.length).toBe(12);
    expect(events.map((e) => e.step)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(events[events.length - 1].fraction).toBe(1);
    expect(events.some((e) => /porosity populated/.test(e.label))).toBe(true);
  });

  test('cancel rejects with BuildCancelled and terminates the worker', async () => {
    const f = await fixture();
    const def = baseDef(f.byName);
    const ctrl = new AbortController();
    const worker = loopbackWorker();
    const run = runBuildOnWorker(worker, { definition: def, wells: f.wells, surfaces: f.surfaces, backend: f.backend, signal: ctrl.signal, onProgress: () => ctrl.abort() });
    await expect(run).rejects.toBeInstanceOf(BuildCancelled);
    expect(worker.terminated).toBe(true);
  });

  test('an unbuildable definition reports the build\'s own message', async () => {
    const f = await fixture();
    const worker = loopbackWorker();
    await expect(runBuildOnWorker(worker, { definition: { ...baseDef(f.byName), surfaceIds: [f.byName.TopA.id] }, wells: f.wells, surfaces: f.surfaces, backend: f.backend }))
      .rejects.toThrow(/at least 2 surfaces/);
  });

  test('a backend failure inside the worker comes back as the error', async () => {
    const f = await fixture();
    const broken = { ...f.backend, downloadSurfaceGrid: async () => { throw new Error('storage is down'); } };
    await expect(runBuildOnWorker(loopbackWorker(), { definition: baseDef(f.byName), wells: f.wells, surfaces: f.surfaces, backend: broken }))
      .rejects.toThrow(/storage is down/);
  });

  test('inline fallback (no Worker, as in jest) keeps progress and cancel', async () => {
    const f = await fixture();
    const events = [];
    const r = await runBuild({ definition: baseDef(f.byName), wells: f.wells, surfaces: f.surfaces, backend: f.backend, onProgress: (p) => events.push(p) });
    expect(r.where).toBe('inline');
    expect(events[events.length - 1].fraction).toBe(1);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(runBuild({ definition: baseDef(f.byName), wells: f.wells, surfaces: f.surfaces, backend: f.backend, signal: ctrl.signal }))
      .rejects.toBeInstanceOf(BuildCancelled);
    // the client uses the worker when one exists
    const w = await runBuild({ definition: baseDef(f.byName), wells: f.wells, surfaces: f.surfaces, backend: f.backend, createWorker: () => loopbackWorker() });
    expect(w.where).toBe('worker');
  });
});
