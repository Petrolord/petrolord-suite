/**
 * @jest-environment node
 *
 * U2-011: the corner-point export read back. An independent reader here
 * (keywords, n*v runs, Eclipse ZCORN order) rebuilds every cell and its
 * bulk volume; on the oracle fixture's zone A (thickness 30 + 0.01 (x -
 * 1000) m, bilinear) the active bulk is the analytic integral over the
 * pillar extent. Then Reservoir Simulation Studio's own deck gate
 * (worker/sim-worker/simworker/deck.py validate_bundle, the check every
 * uploaded bundle passes before OPM Flow runs) accepts a bundle that
 * INCLUDEs the file. OPM Flow 2026.04 itself parsed the same export
 * (tools/validation/earthmodel/grdecl_opm_check.sh, run 2026-10-01).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { buildModel, emptyDefinition } from '../services/modelBuild';
import { grdeclText, packValues } from '../services/grdeclExport';

/** Independent GRDECL reader: keyword -> number[] with n*v expanded. */
export function readGrdecl(text) {
  const out = {};
  const lines = text.split(/\r?\n/).map((l) => l.replace(/--.*$/, '').trim()).filter(Boolean);
  let kw = null; let buf = [];
  for (const l of lines) {
    if (!kw) { kw = l.split(/\s+/)[0]; buf = []; continue; }
    const done = l.includes('/');
    for (const t of l.replace('/', ' ').split(/\s+/).filter(Boolean)) {
      const m = t.match(/^(\d+)\*(.+)$/);
      if (m) for (let i = 0; i < Number(m[1]); i++) buf.push(Number(m[2])); else buf.push(Number(t));
    }
    if (done) { out[kw] = buf; kw = null; }
  }
  return out;
}

let built;
beforeAll(async () => {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const surfaces = await backend.listSurfaces();
  const by = Object.fromEntries(surfaces.map((s) => [s.name, s]));
  built = await buildModel({
    ...emptyDefinition(), name: 'Grid test',
    surfaceIds: [by.TopA.id, by.TopB.id, by.BaseB.id], topNames: ['TopA', 'TopB', 'BaseB'],
    zones: [{ name: 'Zone A', registryZone: 'A' }, { name: 'Zone B', registryZone: 'B' }],
    methods: { phi: 'trend', sw: 'trend', ntg: 'constant' },
  }, wells, surfaces, backend);
});

test('the read-back grid has the model\'s geometry: zone A bulk is the analytic integral', () => {
  const g = grdeclText(built, { name: 'Grid test', now: new Date('2026-10-01T00:00:00Z'), build: 'b' });
  expect(g.fileName).toBe('GRID_TEST.GRDECL');
  const r = readGrdecl(g.text);
  const [NX, NY, NZ] = r.SPECGRID;
  expect([NX, NY, NZ]).toEqual([24, 19, 2]);
  expect(r.COORD).toHaveLength((NX + 1) * (NY + 1) * 6);
  expect(r.ZCORN).toHaveLength(8 * NX * NY * NZ);
  expect(r.ACTNUM).toHaveLength(NX * NY * NZ);
  // Eclipse ZCORN order: index of corner (di, dj, dk) of cell (i, j, k)
  const zc = (i, j, k, di, dj, dk) => r.ZCORN[(2 * k + dk) * 4 * NX * NY + (2 * j + dj) * 2 * NX + 2 * i + di];
  const px = (i) => r.COORD[6 * i];
  const py = (j) => r.COORD[6 * (j * (NX + 1)) + 1];
  let bulkA = 0; let porePorA = 0;
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const area = (px(i + 1) - px(i)) * (py(j + 1) - py(j));
      let t = 0;
      for (const di of [0, 1]) for (const dj of [0, 1]) t += zc(i, j, 0, di, dj, 1) - zc(i, j, 0, di, dj, 0);
      const c = j * NX + i;
      if (!r.ACTNUM[c]) continue;
      bulkA += (t / 4) * area;
      porePorA += (t / 4) * area * r.PORO[c] * r.NTG[c];
    }
  }
  // integral of 30 + 0.01 (x - 1000) over x in 1000..2200, y in 2000..2950
  expect(Math.abs(bulkA / ((30 * 1200 + 0.005 * 1200 * 1200) * 950) - 1)).toBeLessThan(1e-9);
  // the corner depths are the model's zone top at the nodes (TopA at node 0 is 1500 m)
  expect(zc(0, 0, 0, 0, 0, 0)).toBeCloseTo(1500, 6);
  expect(px(0)).toBe(1000);
  // the pore volume is close to the model's node sum (the node footprint reaches half a cell further)
  expect(Math.abs(porePorA / built.zones[0].volumes.total.pore_m3 - 1)).toBeLessThan(0.1);
  // negative control: ZCORN read in plain cell order (eight corners per cell together) breaks the geometry
  let wrong = 0;
  for (let c = 0; c < NX * NY; c++) { let t = 0; for (let q = 0; q < 4; q++) t += r.ZCORN[8 * c + 4 + q] - r.ZCORN[8 * c + q]; wrong += (t / 4) * 2500; }
  expect(Math.abs(wrong / bulkA - 1)).toBeGreaterThan(0.01);
  // OPM Flow 2026.04 read this export (tools/validation/earthmodel/grdecl_opm_check.sh,
  // 2026-10-01): "Total number of active cells: 760 / total pore volume: 12222279 RM3",
  // 0 errors. The reader's pore volume over both zones is the same number.
  let pvAll = 0;
  for (let k = 0; k < NZ; k++) {
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const c = k * NX * NY + j * NX + i;
        if (!r.ACTNUM[c]) continue;
        let t = 0;
        for (const di of [0, 1]) for (const dj of [0, 1]) t += zc(i, j, k, di, dj, 1) - zc(i, j, k, di, dj, 0);
        pvAll += (t / 4) * (px(i + 1) - px(i)) * (py(j + 1) - py(j)) * r.PORO[c] * r.NTG[c];
      }
    }
  }
  expect(r.ACTNUM.reduce((a, b) => a + b, 0)).toBe(760);
  expect(Math.abs(pvAll - 12222279)).toBeLessThan(1);
  const sw = readGrdecl(g.swatText);
  expect(sw.SWAT).toHaveLength(NX * NY * NZ);
  expect(g.swatFileName).toBe('GRID_TEST_SWAT.INC');
});

test('Reservoir Simulation Studio\'s own deck gate accepts a bundle that includes the export', () => {
  const py = spawnSync('python3', ['--version']);
  if (py.status !== 0) return; // no Python on this runner: the OPM run below is the record
  const g = grdeclText(built, { name: 'Grid test' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em-grdecl-'));
  try {
    fs.writeFileSync(path.join(dir, g.fileName), g.text);
    fs.writeFileSync(path.join(dir, g.swatFileName), g.swatText);
    fs.writeFileSync(path.join(dir, 'MODEL.DATA'), ['RUNSPEC', 'DIMENS', ` ${g.dims.nx} ${g.dims.ny} ${g.dims.nz} /`, 'GRID', 'INCLUDE', ` '${g.fileName}' /`, 'SOLUTION', 'INCLUDE', ` '${g.swatFileName}' /`, 'SCHEDULE', 'TSTEP', ' 1 /', ''].join('\n'));
    const worker = path.join(__dirname, '..', '..', '..', '..', '..', 'worker', 'sim-worker');
    const code = [
      'import sys, types',
      'sys.modules.setdefault("httpx", types.ModuleType("httpx"))',
      `sys.path.insert(0, ${JSON.stringify(worker)})`,
      'from simworker.deck import validate_bundle',
      `validate_bundle(${JSON.stringify(dir)}, "MODEL.DATA")`,
      'print("ok")',
    ].join('\n');
    expect(execFileSync('python3', ['-c', code], { encoding: 'utf8' }).trim()).toBe('ok');
    // negative control: the same gate refuses a bundle whose include is missing
    fs.unlinkSync(path.join(dir, g.swatFileName));
    const bad = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/missing from the bundle/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the export for the OPM Flow check (written only when EM_GRDECL_OUT is set)', () => {
  const out = process.env.EM_GRDECL_OUT;
  if (!out) return;
  const g = grdeclText(built, { name: 'Grid test' });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, g.fileName), g.text);
  fs.writeFileSync(path.join(out, g.swatFileName), g.swatText);
  fs.writeFileSync(path.join(out, 'expected.json'), JSON.stringify({ dims: g.dims, active: g.active, pore_a_m3: built.zones[0].volumes.total.pore_m3 }));
});

test('packValues writes n*v runs; an unbuilt model is refused', () => {
  expect(packValues([1, 1, 1, 0, 1])).toBe('  3*1 0 1');
  expect(() => grdeclText(null)).toThrow(/Build the model first/);
});
