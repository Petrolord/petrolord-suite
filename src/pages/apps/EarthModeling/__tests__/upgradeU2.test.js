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

describe('U2-005: contacts per fault block', () => {
  // Zone A spans about 1500 to 1640 m. Block 1 (inside the L-shaped fault)
  // gets its own OWC at 1540 m; the zone OWC 1580 m applies to block 0.
  const withFault = (byName, fluidsInput) => baseDef(byName, { faultPolygons: [{ name: 'F1', vertices: FAULT_POLYGON }], fluidsInput });

  test('each block equals a build with that block\'s contact for the whole zone', async () => {
    const f = await fixture();
    const per = await buildModel(withFault(f.byName, [{ owc: '1580', owcUnit: 'm', bo: '1.2', blocks: { 1: { owc: '1540', owcUnit: 'm' } } }]), f.wells, f.surfaces, f.backend);
    const at1580 = await buildModel(withFault(f.byName, [{ owc: '1580', owcUnit: 'm', bo: '1.2' }]), f.wells, f.surfaces, f.backend);
    const at1540 = await buildModel(withFault(f.byName, [{ owc: '1540', owcUnit: 'm', bo: '1.2' }]), f.wells, f.surfaces, f.backend);
    const v = per.zones[0].volumes;
    for (const k of ['hcpv_m3', 'oil_hcpv_m3', 'stoiip_m3', 'oil_bulk_m3']) {
      expect(Math.abs(v['0'][k] - at1580.zones[0].volumes['0'][k])).toBeLessThanOrEqual(1e-6 * at1580.zones[0].volumes['0'][k]);
      expect(Math.abs(v['1'][k] - at1540.zones[0].volumes['1'][k])).toBeLessThanOrEqual(1e-6 * at1540.zones[0].volumes['1'][k]);
      expect(Math.abs(v.total[k] - (v['0'][k] + v['1'][k]))).toBeLessThanOrEqual(1e-6 * v.total[k]);
    }
    // negative control: the one zone contact books block 1 more than 10% higher
    expect(at1580.zones[0].volumes['1'].stoiip_m3 / v['1'].stoiip_m3).toBeGreaterThan(1.1);
    expect(per.zones[0].fluids.blocks).toEqual({ 1: { goc: null, owc: 1540 } });
  });

  test('a block contact in feet keeps its unit; a GOC below the block OWC is refused', async () => {
    const f = await fixture();
    const ft = await buildModel(withFault(f.byName, [{ owc: '1580', owcUnit: 'm', blocks: { 1: { owc: String(1540 / 0.3048), owcUnit: 'ft' } } }]), f.wells, f.surfaces, f.backend);
    expect(ft.zones[0].fluids.blocks['1'].owc).toBeCloseTo(1540, 6);
    await expect(buildModel(withFault(f.byName, [{ owc: '1580', blocks: { 1: { goc: '1600' } } }]), f.wells, f.surfaces, f.backend))
      .rejects.toThrow(/block 1: the GOC is deeper than the OWC/);
  });

  test('a block without a contact while the zone has none counts its whole column (said in QC)', async () => {
    const f = await fixture();
    const b = await buildModel(withFault(f.byName, [{ blocks: { 1: { owc: '1540' } } }]), f.wells, f.surfaces, f.backend);
    const whole = await buildModel(withFault(f.byName, []), f.wells, f.surfaces, f.backend);
    const v = b.zones[0].volumes;
    expect(Math.abs(v['0'].hcpv_m3 - whole.zones[0].volumes['0'].hcpv_m3)).toBeLessThanOrEqual(1e-6 * v['0'].hcpv_m3);
    expect(v['1'].hcpv_m3).toBeLessThan(whole.zones[0].volumes['1'].hcpv_m3);
  });

  test('the open-edge report reads each block\'s contact', async () => {
    const f = await fixture();
    // a deep block-0 contact reaches the frame edge; block 1 shallow alone does too at its own edge nodes
    const deep = await buildModel(withFault(f.byName, [{ owc: '1700', blocks: { 1: { owc: '1501' } } }]), f.wells, f.surfaces, f.backend);
    const shallow = await buildModel(withFault(f.byName, [{ owc: '1501', blocks: { 1: { owc: '1501' } } }]), f.wells, f.surfaces, f.backend);
    expect(deep.zones[0].openEdge.nodes).toBeGreaterThan(shallow.zones[0].openEdge.nodes);
  });
});

describe('U2-006: the leg bounded by the closure and spill (Mapping\'s closure engine)', () => {
  // A cone (depth 1800 + 0.1 r) whose flank meets a monocline shallowing to
  // the east (depth 2000 - 0.05 x): the surface is the shallower of the two.
  // Along the +x axis the cone reaches 1933.3 m where the monocline takes
  // over and rises to 1850 m at the east edge, so the dome spills through a
  // saddle at 1933.3 m (x = 1333 m). An OWC at 2000 m is below the spill.
  const S = { x0: -3000, y0: -3000, dx: 20, dy: 20, nx: 301, ny: 301 };
  const topAt = (x, y) => Math.min(1800 + 0.1 * Math.hypot(x, y), 2000 - 0.05 * x);
  const topGrid = () => {
    const g = new Float64Array(S.nx * S.ny);
    for (let r = 0; r < S.ny; r++) for (let c = 0; c < S.nx; c++) g[r * S.nx + c] = topAt(S.x0 + c * S.dx, S.y0 + r * S.dy);
    return g;
  };

  test('an OWC below the spill fills the trap to the spill only (analytic cone volume)', async () => {
    const { boundLegByClosure } = await import('../services/trapBound');
    const { zoneVolumesWithContacts } = await import('../engine/volumes');
    const top = topGrid();
    const base = Float64Array.from(top, (v) => v + 400);
    const owc = new Float64Array(top.length).fill(2000);
    const r = boundLegByClosure(S, top, owc);
    expect(r.traps).toHaveLength(1);
    const t = r.traps[0];
    expect(t.closed).toBe(false);
    expect(t.limitedByEdge).toBe(false);
    expect(t.spillM).toBeGreaterThan(1925);
    expect(t.spillM).toBeLessThan(1935);
    expect(Math.abs(t.spillXY.x - 1333)).toBeLessThan(60);
    const bounded = zoneVolumesWithContacts(S, top, base, null, {}, { owc: r.owc }).total;
    // the cone above the spill: V = pi r^2 h / 3 with h = spill - 1800, r = h / 0.1
    const h = t.spillM - 1800;
    const cone = Math.PI * (h / 0.1) ** 2 * h / 3;
    expect(Math.abs(bounded.oil_bulk_m3 / cone - 1)).toBeLessThan(0.02);
    // negative control: the plain contact books the flank to the east edge, several times larger
    const plain = zoneVolumesWithContacts(S, top, base, null, {}, { owc: 2000 }).total;
    expect(plain.oil_bulk_m3 / bounded.oil_bulk_m3).toBeGreaterThan(3);
    expect(r.cutNodes).toBeGreaterThan(0);
  });

  test('an OWC above the spill keeps the contact (closed trap)', async () => {
    const { boundLegByClosure } = await import('../services/trapBound');
    const top = topGrid();
    const owc = new Float64Array(top.length).fill(1900);
    const r = boundLegByClosure(S, top, owc);
    const dome = r.traps.find((t) => t.crestM === 1800);
    expect(dome.closed).toBe(true);
    // every node within 900 m of the crest (inside the 1890 m contour) keeps 1900 m
    for (let row = 0; row < S.ny; row++) {
      for (let c = 0; c < S.nx; c++) {
        const x = S.x0 + c * S.dx; const y = S.y0 + row * S.dy;
        if (Math.hypot(x, y) < 880) expect(r.owc[row * S.nx + c]).toBe(1900);
      }
    }
    // the monocline rises above 1900 m only at the east edge: that is no trap, it is cut and said
    const edge = r.traps.find((t) => t.crestM < 1900 && t.crestM > 1800);
    expect(edge.limitedByEdge).toBe(true);
  });

  test('a cone cut by the frame spills at the edge and is flagged open', async () => {
    const { boundLegByClosure } = await import('../services/trapBound');
    const small = { x0: -1000, y0: -1000, dx: 20, dy: 20, nx: 101, ny: 101 };
    const top = new Float64Array(small.nx * small.ny);
    for (let r = 0; r < small.ny; r++) for (let c = 0; c < small.nx; c++) top[r * small.nx + c] = 1800 + 0.1 * Math.hypot(small.x0 + c * small.dx, small.y0 + r * small.dy);
    const res = boundLegByClosure(small, top, new Float64Array(top.length).fill(2000));
    expect(res.openEdge).toBe(true);
    expect(res.traps[0].limitedByEdge).toBe(true);
    expect(res.traps[0].spillM).toBeCloseTo(1900, 0);
  });

  test('through buildModel: the tick bounds the leg and the model says where it spills', async () => {
    const backend = makeInMemoryBackend();
    // one well on the crest carrying the zone's properties (the constant method)
    const wells = [{ id: 'wd', name: 'D-1', surface_x: 0, surface_y: 0, kb_m: 0, deviation: [], tops: [], zones: [{ name: 'Dome', top_md_m: 1800, base_md_m: 2100, properties: { phi_avg: 0.2, sw_avg: 0.3, ntg: 0.8 } }] }];
    // a coarser lattice of the same structure keeps the build quick
    const C = { x0: -3000, y0: -3000, dx: 40, dy: 40, nx: 151, ny: 151 };
    const up = (name, g) => backend.saveSurface({ name, kind: 'structure', zDomain: 'depth', zUnit: 'm', spec: C, grid: Float32Array.from(g, (v) => -v) });
    const top = new Float64Array(C.nx * C.ny);
    for (let r = 0; r < C.ny; r++) for (let c = 0; c < C.nx; c++) top[r * C.nx + c] = topAt(C.x0 + c * C.dx, C.y0 + r * C.dy);
    const a = await up('Dome top', top);
    const b = await up('Dome base', Float64Array.from(top, (v) => v + 400));
    const surfaces = await backend.listSurfaces();
    const def = (trap) => ({ ...emptyDefinition(), surfaceIds: [a.id, b.id], topNames: ['', ''], zones: [{ name: 'Dome', registryZone: 'Dome' }], fluidsInput: [{ owc: '2000', owcUnit: 'm', bo: '1.2', ...(trap ? { trap: 'closure' } : {}) }] });
    const plain = await buildModel(def(false), wells, surfaces, backend);
    const bounded = await buildModel(def(true), wells, surfaces, backend);
    expect(plain.zones[0].openEdge.open).toBe(true);
    expect(bounded.zones[0].openEdge.open).toBe(false);
    expect(bounded.zones[0].trap.traps[0].spillM).toBeLessThan(1935);
    expect(plain.zones[0].volumes.total.stoiip_m3 / bounded.zones[0].volumes.total.stoiip_m3).toBeGreaterThan(3);
  });
});

describe('U2-002: Sw from the SCAL saturation-height function', () => {
  // Petrophysics PETRO-U2-010's published hand example (SCAL Studio's
  // default rock and J: a 0.25, b 1.4, Swirr 0.15; k 150 mD, phi 0.22;
  // sigma 26, theta 30; gamma 1.05 and 0.80): 100 ft above the FWL,
  // Sw = 0.304502 (checked in Python, 2026-09-29).
  const project = {
    name: 'P', schema: 1, samples: [],
    capillary: { jMode: 'manual', manual: { a: '0.25', b: '1.4', Swirr: '0.15' }, SwirrOverride: '', includedSampleIds: [], reservoir: { k_md: '150', phi: '0.22', sigma_dyncm: '26', thetaDeg: '30' } },
    height: { gammaW: '1.05', gammaHc: '0.80', fwl_tvdss: '6000' },
  };
  let shm; let swAtHeight; let shmGrid;
  beforeAll(async () => {
    const petro = await import('@/pages/apps/PetrophysicsStudio/services/saturationHeight');
    swAtHeight = petro.swAtHeight;
    shm = petro.shmFromScalProject(project);
    shmGrid = await import('../services/shmGrid');
  });

  test('the table gives the published hand example and Petrophysics\' bisection everywhere', () => {
    const t = shmGrid.shmTable(shm);
    expect(Math.abs(shmGrid.swFromTable(t, 100) - 0.30450244384574077)).toBeLessThan(1e-4);
    for (const h of [0.5, 2, 5, 10, 20, 35, 50, 75, 150, 300, 600, 2000]) {
      expect(Math.abs(shmGrid.swFromTable(t, h) - swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, h))).toBeLessThan(1e-4);
    }
    expect(shmGrid.swFromTable(t, 0)).toBe(1);
    expect(shmGrid.swFromTable(t, -5)).toBe(1);
  });

  test('modelled porosity scales the height as Leverett does (checked against swAtHeight run with that porosity)', () => {
    const t = shmGrid.shmTable(shm);
    for (const phi of [0.12, 0.3]) {
      const viaScale = shmGrid.swFromTable(t, 100 * Math.sqrt(0.22 / phi));
      const direct = swAtHeight(shm.jSpec, { ...shm.reservoir, phi }, shm.fluids, 100);
      expect(Math.abs(viaScale - direct)).toBeLessThan(1e-4);
    }
  });

  test('per node: the mean Sw over the leg above the contact; negative control on the height sign', () => {
    const spec = { nx: 2, ny: 1, dx: 50, dy: 50, x0: 0, y0: 0 };
    const fwlM = 1640;
    const top = Float64Array.from([1600, 1630]);
    const base = Float64Array.from([1620, 1700]);
    const g = shmGrid.shmSwGrid({ spec, top, base, shm, fwlM });
    // reference: 400 sub-samples of Petrophysics' Sw over each leg
    const ref = (a, b) => { let s = 0; for (let k = 0; k < 400; k++) { const d = a + ((k + 0.5) / 400) * (b - a); s += swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, (fwlM - d) / 0.3048); } return s / 400; };
    expect(Math.abs(g.sw[0] - ref(1600, 1620))).toBeLessThan(2e-3);
    expect(Math.abs(g.sw[1] - ref(1630, 1640))).toBeLessThan(2e-3);
    expect(g.sw[1]).toBeGreaterThan(g.sw[0]); // closer to the FWL, wetter
    // negative control: heights taken as depth minus FWL read every sample above the FWL as water
    const flipped = (() => { let s = 0; for (let k = 0; k < 24; k++) { const d = 1600 + ((k + 0.5) / 24) * 20; s += swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, (d - fwlM) / 0.3048); } return s / 24; })();
    expect(flipped).toBe(1);
    expect(g.sw[0]).toBeLessThan(0.6);
    // an OWC above the FWL ends the leg there
    const withOwc = shmGrid.shmSwGrid({ spec, top, base, shm, fwlM, contact: Float64Array.from([1610, 1610]) });
    expect(Math.abs(withOwc.sw[0] - ref(1600, 1610))).toBeLessThan(2e-3);
    expect(() => shmGrid.shmSwGrid({ spec, top, base, shm, fwlM: NaN })).toThrow(/free-water level/);
  });

  test('through buildModel: Sw rises toward the FWL, the FWL bounds the leg when no OWC is typed', async () => {
    const f = await fixture();
    const { resolveShm } = await import('../services/shmResolve');
    const def = baseDef(f.byName, { methods: { phi: 'constant', sw: 'shm', ntg: 'constant' }, shm: { projectId: 'scal-sample', fwl: '1640', fwlUnit: 'm' } });
    const shmResolved = await resolveShm(def.shm, f.backend);
    expect(shmResolved.ok).toBe(true);
    expect(shmResolved.fwlM).toBe(1640);
    const b = await buildModel({ ...def, shmResolved }, f.wells, f.surfaces, f.backend);
    const z = b.zones[0];
    expect(z.shm.fwlAsContact).toBe(true);
    expect(b.notes.some((n) => /free-water level \(1640.0 m\) bounds the hydrocarbon leg/.test(n))).toBe(true);
    // the shallowest node (the frame's south-west corner, top 1500 m) is drier than the deepest
    const sw = z.props.sw;
    const top = b.clamped[0];
    let shallow = 0; let deep = 0;
    for (let j = 0; j < top.length; j++) { if (top[j] < top[shallow]) shallow = j; if (top[j] > top[deep]) deep = j; }
    expect(sw[shallow]).toBeLessThan(sw[deep]);
    expect(z.provenance.sw[0].methodUsed).toBe('shm');
    // the typed FWL in feet reads the same
    const ft = await resolveShm({ projectId: 'scal-sample', fwl: String(1640 / 0.3048), fwlUnit: 'ft' }, f.backend);
    expect(ft.fwlM).toBeCloseTo(1640, 9);
    // no project picked: the build says what to do
    await expect(buildModel({ ...def, shmResolved: await resolveShm({}, f.backend) }, f.wells, f.surfaces, f.backend)).rejects.toThrow(/Pick one in the dock/);
  });
});

describe('U2-001: Seismolord faults as a polygon per zone top (hook + fixture)', () => {
  // The fixture fault strikes north and dips 60 degrees east through x = 1500
  // m at 1500 m depth; on a planar horizon d = a + b (x - 1000) + c (y - 2000)
  // its trace is x = (1500 + k (a - 1500 - 1000 b + c (y - 2000))) / (1 - k b), k = 1 / tan 60.
  const K = 1 / Math.tan(Math.PI / 3);
  const PL = { TopA: [1500, 0.05, 0.02], TopB: [1530, 0.06, 0.02], BaseB: [1561, 0.02, 0.02] };
  const traceX = (name, y) => { const [a, b, c] = PL[name]; return (1500 + K * (a - 1500 - 1000 * b + c * (y - 2000))) / (1 - K * b); };

  test('the contract shapes normalise; a time-only fault and a single stick are refused with the reason', async () => {
    const { normalizeSeismicFault } = await import('../services/seismicFaultZones');
    const { seismicFaultFixture } = await import('../services/fixture');
    const ok = normalizeSeismicFault(seismicFaultFixture());
    expect(ok.ok).toBe(true);
    expect(ok.rails).toHaveLength(3);
    const doc = normalizeSeismicFault({ id: 'd', name: 'Doc shape', z_domain: 'depth', sticks: [[[0, 0, 1000], [10, 0, 1100]], [[0, 50, 1000], [10, 50, 1100]]] });
    expect(doc.ok).toBe(true);
    expect(doc.rails[1][1]).toEqual({ x: 10, y: 50, d: 1100 });
    const t = seismicFaultFixture();
    t.surface = t.surface.map((r) => r.map((p) => ({ ...p, depthM: null })));
    expect(normalizeSeismicFault(t).reason).toMatch(/no velocity model/);
    expect(normalizeSeismicFault({ name: 'one', sticks: [[{ x: 0, y: 0, depthM: 1 }, { x: 1, y: 0, depthM: 2 }]] }).reason).toMatch(/two or more sticks/);
  });

  test('the trace on each zone top is the analytic plane-plane intersection', async () => {
    const { normalizeSeismicFault, faultTraceOnSurface } = await import('../services/seismicFaultZones');
    const { seismicFaultFixture, planeGrid, MODEL_SPEC } = await import('../services/fixture');
    const { rails } = normalizeSeismicFault(seismicFaultFixture());
    for (const name of ['TopA', 'TopB', 'BaseB']) {
      const { trace, dip } = faultTraceOnSurface(rails, Float64Array.from(planeGrid(name)), MODEL_SPEC);
      // rails at y = 1950 and 3000 are outside the frame (2000..2950), the middle one is inside
      expect(trace.length).toBeGreaterThanOrEqual(1);
      for (const p of trace) expect(Math.abs(p.x - traceX(name, p.y))).toBeLessThan(1e-3);
      expect(dip.x).toBeGreaterThan(0.99);
    }
    // a sloping fault: the trace moves east with depth (TopA to BaseB)
    expect(traceX('BaseB', 2475) - traceX('TopA', 2475)).toBeGreaterThan(20);
  });

  test('through buildModel: each zone gets its own hanging-wall block; a vertical polygon misplaces nodes', async () => {
    const f = await fixture();
    const sf = (await f.backend.listSeismicFaults()).faults[0];
    const { normalizeSeismicFault } = await import('../services/seismicFaultZones');
    const n = normalizeSeismicFault(sf);
    // the frame rect, padded; the rails extend past it so every top is cut
    const def = baseDef(f.byName, {
      faultPolygons: [{ name: 'F-East 60 hanging wall', vertices: [[1500, 1990], [2300, 1990], [2300, 3000], [1500, 3000]], rails: n.rails.map((r) => r.map((p) => [p.x, p.y, p.d])), seismicFaultId: sf.id, source: 'seismolord' }],
      // a 10 m cell puts nodes between the traces on TopA (x 1520 m) and TopB (x 1542 m)
      frame: { cellM: '10', boundaryId: '' },
    });
    const b = await buildModel(def, f.wells, f.surfaces, f.backend);
    const S = b.specM;
    let misVertical = 0;
    for (let z = 0; z < 2; z++) {
      const lab = b.zones[z].labels;
      const name = z === 0 ? 'TopA' : 'TopB';
      for (let r = 0; r < S.ny; r++) {
        for (let c = 0; c < S.nx; c++) {
          const x = S.x0 + c * S.dx; const y = S.y0 + r * S.dy;
          const tx = traceX(name, y);
          if (Math.abs(x - tx) < 1e-6) continue;
          expect(lab[r * S.nx + c]).toBe(x > tx ? 1 : 0); // hanging wall = east
          if (z === 1 && b.zones[0].labels[r * S.nx + c] !== (x > tx ? 1 : 0)) misVertical += 1;
        }
      }
    }
    // negative control: zone A's polygon used for zone B (a vertical fault) puts nodes in the wrong block
    expect(misVertical).toBeGreaterThan(0);
    expect(b.zones[0].census).not.toEqual(b.zones[1].census);
    expect(b.polygonsByZone).toHaveLength(2);
    // volumes add up per zone over its own blocks
    for (const zz of b.zones) {
      const v = zz.volumes;
      expect(Math.abs(v.total.bulk_m3 - (v['0'].bulk_m3 + v['1'].bulk_m3))).toBeLessThan(1e-3);
    }
  });

  test('the hook names the contract and the way out', async () => {
    const { SEISMIC_FAULTS_HOOK } = await import('../services/seismicFaultZones');
    expect(SEISMIC_FAULTS_HOOK.method).toBe('listSeismicFaults');
    expect(SEISMIC_FAULTS_HOOK.contract).toMatch(/seismicFaultsReader/);
    expect(SEISMIC_FAULTS_HOOK.reason).toMatch(/not on main yet/);
    const { makeRegistryBackend } = await import('../services/registryBackend');
    expect(typeof makeRegistryBackend()[SEISMIC_FAULTS_HOOK.method]).toBe('undefined');
  });
});
