// Rock Physics T1-E1: the substituted halfspace behind the fluid
// replacement AVO is the Fluids panel's Gassmann, averaged over the window.
import fs from 'fs';
import path from 'path';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { mapLogs, buildModel } from '../services/prep';
import { DEFAULT_SCENARIO, DEFAULT_ROCK, substitutedHalfspace } from '../services/scenario';
import { shuey } from '../engine/avo';

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'rockphysics');
const G = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens.json'), 'utf8')).gassmann.log_domain;

async function model() {
  const b = makeInMemoryBackend();
  const w = (await b.listWells()).find((x) => x.name === 'KETA RP-1');
  const mapped = mapLogs(await b.listLogs(w.id));
  const curves = {};
  for (const [k, log] of Object.entries(mapped)) if (log) curves[k] = await b.downloadCurve(log);
  return buildModel(curves, mapped);
}

test('the substituted brine sand halfspace is the log-domain golden', async () => {
  const m = await model();
  const hs = substitutedHalfspace(m, 2020, 2040, DEFAULT_SCENARIO, { ...DEFAULT_ROCK, kminOverrideGPa: '37' });
  expect(hs.vp).toBeCloseTo(G.vp, 6);
  expect(hs.vs).toBeCloseTo(G.vs, 6);
  expect(hs.rho).toBeCloseTo(G.rho, 6);
  expect(hs.labelA).toBe('brine');
  expect(hs.labelB).toBe('gas');
});

test('gas in the lower rock softens the intercept (brine to gas moves A down)', async () => {
  const m = await model();
  const upper = { vp: 2900, vs: 1330, rho: 2290 };
  const lowerBrine = { vp: 3200, vs: 1800, rho: 2250 };
  const lowerGas = substitutedHalfspace(m, 2020, 2040, DEFAULT_SCENARIO, { ...DEFAULT_ROCK, kminOverrideGPa: '37' });
  const a0 = shuey(upper.vp, upper.vs, upper.rho, lowerBrine.vp, lowerBrine.vs, lowerBrine.rho, 0).a;
  const a1 = shuey(upper.vp, upper.vs, upper.rho, lowerGas.vp, lowerGas.vs, lowerGas.rho, 0).a;
  expect(a1).toBeLessThan(a0);
});

test('an empty window gives null', async () => {
  const m = await model();
  expect(substitutedHalfspace(m, 5000, 5010, DEFAULT_SCENARIO, DEFAULT_ROCK)).toBeNull();
});

test('a rock that cannot hold fluid A reports why', async () => {
  const m = await model();
  // the gas sand read as brine-filled gives an unphysical dry frame
  const r = substitutedHalfspace(m, 2060, 2080, DEFAULT_SCENARIO, { ...DEFAULT_ROCK, kminOverrideGPa: '37' });
  expect(r.error).toMatch(/fluid A is the fluid actually in this rock/);
});
