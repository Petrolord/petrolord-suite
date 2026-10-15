/**
 * @jest-environment node
 */
// property_prediction (QI programme Q9a): calibration at the wells equals the
// run module's on the same traces; a volume run writes porosity at Q10, Q50
// and Q90, or facies probabilities and the most likely code, with their
// labels; then the guards: an impedance volume from an absolute inversion,
// ownership, the output ids.
import { propertyPrediction, validatePropertyJob, outputKeys } from '../src/handlers/propertyPrediction.js';
import {
  calibrateProperty, propertyIssues, propertyProtocolText, predictTrace,
} from '../../../src/pages/apps/QIStudio/services/propertyRun';
import { packLog, unpackLog } from '../../../src/pages/apps/QIStudio/services/logPacking';
import { NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { KINDS } from '../src/handlers/index.js';

jest.setTimeout(240000);
const UID = '11111111-1111-4111-8111-111111111111';
const AIV = '22222222-2222-4222-8222-222222222222';
const OUT = (n) => `33333333-3333-4333-8333-33333333333${n}`;
const NIL = 6; const NXL = 4; const NS = 128; const B = 16; const DT_MS = 4;
const GRID = [1, 1, NS / B];
const aiAt = (il, xl, s) => 7000 + 1100 * Math.sin((s + 9 * il + 5 * xl) / 8) + 250 * Math.sin((s + il) / 2.1);
const manifestFor = (params) => ({
  manifest_version: 2, app: 'seismolord', volume_id: AIV, name: 'Dome AI', kind: 'attribute',
  attribute: { name: 'qi_inversion', params },
  geometry: { il: { min: 1, max: NIL, step: 1, count: NIL }, xl: { min: 1, max: NXL, step: 1, count: NXL }, ns: NS, dt_us: DT_MS * 1000, corners: [[0, 0], [1, 0], [0, 1]] },
  brick: { size: B, grid: GRID, count: GRID[0] * GRID[1] * GRID[2], dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1.0e30 },
  stats: { min: 5000, max: 9000, mean: 7000, rms: 7000, live_samples: NIL * NXL * NS },
  trace_count: NIL * NXL,
});
const STORE = (() => {
  const m = new Map();
  for (let k = 0; k < GRID[2]; k++) m.set(`0-0-${k}`, new Float32Array(B ** 3).fill(NULL_VALUE));
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) {
    m.get(`0-0-${Math.floor(s / B)}`)[((il % B) * B + (xl % B)) * B + (s % B)] = aiAt(il, xl, s);
  }
  return m;
})();
const fetcher = () => async (path) => STORE.get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer;
const WELLS = [[0, 0], [2, 3], [4, 1], [5, 3]].map(([il, xl], k) => {
  const ai = Array.from({ length: NS }, (_, s) => Math.fround(aiAt(il, xl, s)));
  return {
    name: `W${k + 1}`, il, xl,
    ln_ai: ai.map(Math.log),
    phi: ai.map((v, s) => 0.40 - 3.5e-5 * v + 0.003 * Math.sin(s * 1.7 + k)),
    fac: ai.map((v) => (v < 6400 ? 1 : v < 7400 ? 2 : 3)),
  };
});
const prop = (kind) => ({
  kind, upscaleHz: 50,
  wells: WELLS.map((w) => ({ name: w.name, il: w.il, xl: w.xl, ln_ai: w.ln_ai, target: kind === 'facies' ? w.fac : w.phi })),
  ...(kind === 'facies' ? { names: { 1: 'gas sand', 2: 'brine sand', 3: 'shale' } } : {}),
});
const SRC = { id: AIV, user_id: UID, status: 'ready', name: 'Dome AI', kind: 'attribute', parent_volume_id: 'x', storage_path: `${UID}/${AIV}` };
const outRow = (id) => ({ id, user_id: UID, status: 'ingesting', name: `out ${id}`, kind: 'attribute', parent_volume_id: AIV, storage_path: `${UID}/${id}` });
function adminFor(volumes, log = { updates: [], deletes: [] }) {
  return {
    from: () => {
      let id = null;
      const b = {
        select: () => b,
        eq: (col, v) => { if (col === 'id') id = v; return b; },
        maybeSingle: async () => ({ data: volumes[id] || null, error: null }),
        update: (row) => ({ eq: (c, v) => { log.updates.push({ id: v, row }); return { eq: async () => ({ error: null }) }; } }),
        delete: () => ({ eq: (c, v) => { log.deletes.push(v); return { eq: async () => ({ error: null }) }; } }),
      };
      return b;
    },
    rpc: async (name) => ({ data: name.startsWith('seismic_storage_usage') ? 0 : 1e12, error: null }),
    storage: { from: () => ({ remove: async () => ({}) }) },
  };
}
const ctxFor = (params, { cancelled = false } = {}) => ({ params, job: { user_id: UID }, progress: () => {}, get cancelled() { return cancelled; }, log: {} });
const depsFor = (volumes, manifestParams = { output: 'AI', method: 'model_based' }, extra = {}) => ({
  admin: adminFor(volumes, extra.log), makeFetcher: fetcher, readManifest: async () => manifestFor(manifestParams), ...extra,
});

test('the job kind is registered', () => expect(KINDS).toContain('property_prediction'));

test('calibrate equals the run module on the same traces', async () => {
  const out = await propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: prop('porosity') }), depsFor({ [AIV]: SRC }));
  const traces = WELLS.map((w) => Float32Array.from({ length: NS }, (_, s) => aiAt(w.il, w.xl, s)));
  const ref = calibrateProperty({ pr: prop('porosity'), aiTraces: traces, dtMs: DT_MS });
  expect(out.rows).toEqual(ref.rows);
  expect(out.summary.b).toBeCloseTo(-3.5e-5, 6);
  for (const r of out.rows) expect(r.corr).toBeGreaterThan(0.95);
});

test('truly blind check (QI upgrade P1.2): each well is predicted from the inversion\'s held-back estimate when the volume records it', async () => {
  // the held-back estimates read 6 percent high at W1 to W3; W4 has none and was used by the inversion
  const held = WELLS.slice(0, 3).map((w) => ({ name: w.name, il: w.il, xl: w.xl, ln_ai: packLog(Array.from({ length: NS }, (_, s) => Math.log(1.06 * aiAt(w.il, w.xl, s)))) }));
  const params = { output: 'AI', method: 'model_based', wells: WELLS.map((w) => w.name), blind_traces: held };
  const out = await propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: prop('porosity') }), depsFor({ [AIV]: SRC }, params));
  const vol = WELLS.map((w) => Float32Array.from({ length: NS }, (_, s) => aiAt(w.il, w.xl, s)));
  const blindAi = [...held.map((h) => Float64Array.from(unpackLog(h.ln_ai), Math.exp)), vol[3]];
  expect(out.rows).toEqual(calibrateProperty({ pr: prop('porosity'), aiTraces: blindAi, dtMs: DT_MS }).rows);
  // negative control: from the volume at every well the check reads differently (and better)
  const fromVolume = calibrateProperty({ pr: prop('porosity'), aiTraces: vol, dtMs: DT_MS }).rows;
  expect(out.rows[0].rms).toBeGreaterThan(fromVolume[0].rms * 2);
  expect(out.blind_protocol.rows.map((r) => r.source)).toEqual(['held_back', 'held_back', 'held_back', 'volume_not_blind']);
  expect(out.blind_protocol.fully_blind).toBe(false);
  expect(propertyIssues(out, 'Dome AI').some((i) => /not blind at W4/.test(i.title))).toBe(true);
  // a well the inversion did not use is blind by construction
  const out2 = await propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: prop('porosity') }), depsFor({ [AIV]: SRC }, { ...params, wells: ['W1', 'W2', 'W3'] }));
  expect(out2.blind_protocol.rows[3].source).toBe('not_in_inversion');
  expect(out2.blind_protocol.fully_blind).toBe(true);
  expect(propertyProtocolText(out2)).toMatch(/never saw it/);
  expect(propertyProtocolText({})).toMatch(/not fully blind/);
});

describe('net-to-gross and water saturation (QI upgrade P1.3)', () => {
  // NTG at seismic scale follows AI (low AI is net sand); Sw rises with AI
  const propOf = (kind) => ({
    kind, upscaleHz: 50,
    wells: WELLS.map((w) => ({ name: w.name, il: w.il, xl: w.xl, ln_ai: w.ln_ai, target: w.ln_ai.map((v, s) => (kind === 'ntg' ? (Math.exp(v) < 7000 ? 1 : 0) : Math.min(1, Math.max(0, 0.2 + 1.1e-4 * (Math.exp(v) - 6000) + 0.01 * Math.sin(s)))) ) })),
  });
  const ids = { q10: OUT(1), q50: OUT(2), q90: OUT(3) };
  const vols = () => ({ [AIV]: SRC, [OUT(1)]: outRow(OUT(1)), [OUT(2)]: outRow(OUT(2)), [OUT(3)]: outRow(OUT(3)) });
  test('a check that passes the gate writes NTG held within 0 and 1; Sw is labelled a fluid hypothesis', async () => {
    const cal = await propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: propOf('ntg') }), depsFor({ [AIV]: SRC }));
    expect(cal.gate.pass).toBe(true);
    expect(cal.settings.gate.pass).toBe(true);
    const uploads = new Map();
    const storage = { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } };
    await propertyPrediction(ctxFor({ mode: 'volume', ai_volume_id: AIV, volume_ids: ids, property: propOf('ntg') }), depsFor(vols(), undefined, { storage }));
    const man = JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT(2)}/manifest.json`)));
    expect(man.attribute.params).toMatchObject({ product: 'q50', qi_class: 'calibrated_prediction', product_label: 'NTG, Q50 (held within 0 and 1)' });
    let lo = Infinity; let hi = -Infinity;
    for (const n of [1, 2, 3]) for (let k = 0; k < GRID[2]; k++) for (const v of new Float32Array(uploads.get(`${UID}/${OUT(n)}/bricks/0-0-${k}.f32`).buffer.slice(0))) if (Math.abs(v) < 1e29) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    // negative control: the unclamped transform leaves 0 to 1 here (so the clamp is doing work)
    const raw = calibrateProperty({ pr: propOf('ntg'), aiTraces: WELLS.map((w) => Float32Array.from({ length: NS }, (_, s) => aiAt(w.il, w.xl, s))), dtMs: DT_MS });
    const q10 = predictTrace(raw.model, propOf('ntg'), Float32Array.from({ length: NS }, (_, s) => aiAt(1, 2, s)))[0];
    expect(Math.min(...q10.filter(Number.isFinite))).toBeLessThan(0);
    const up2 = new Map();
    await propertyPrediction(ctxFor({ mode: 'volume', ai_volume_id: AIV, volume_ids: ids, property: propOf('sw') }), depsFor(vols(), undefined, { storage: { upload: async (path, bytes) => { up2.set(path, bytes); return {}; } } }));
    expect(JSON.parse(new TextDecoder().decode(up2.get(`${UID}/${OUT(2)}/manifest.json`))).attribute.params.qi_class).toBe('fluid_hypothesis');
  });
  test('a check that fails the gate is refused with its reasons, and the registered rows go', async () => {
    const strict = { ...propOf('ntg'), gate: { min_corr: 0.9999 } };
    const cal = await propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: strict }), depsFor({ [AIV]: SRC }));
    expect(cal.gate.pass).toBe(false);
    expect(cal.gate.reasons[0]).toMatch(/left-out correlation .* under 0.9999/);
    const log = { updates: [], deletes: [] };
    await expect(propertyPrediction(ctxFor({ mode: 'volume', ai_volume_id: AIV, volume_ids: ids, property: strict }), depsFor(vols(), undefined, { log, storage: { upload: async () => ({}) } }))).rejects.toMatchObject({ stage: 'gate_failed' });
    expect(log.deletes.sort()).toEqual([OUT(1), OUT(2), OUT(3)].sort());
    // a check that is not blind fails the gate too (the inversion used the wells and recorded no held-back estimate)
    const notBlind = await propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: propOf('sw') }), depsFor({ [AIV]: SRC }, { output: 'AI', method: 'model_based', wells: WELLS.map((w) => w.name) }));
    expect(notBlind.gate.pass).toBe(false);
    expect(notBlind.gate.reasons[0]).toMatch(/not fully blind/);
    // porosity is not gated (its behaviour is unchanged)
    const por = await propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: { ...prop('porosity'), gate: { min_corr: 0.9999 } } }), depsFor({ [AIV]: SRC }));
    expect(por.gate).toBeUndefined();
  });
});

test('porosity volumes: Q10 <= Q50 <= Q90, labelled calibrated predictions', async () => {
  const uploads = new Map();
  const storage = { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } };
  const ids = { q10: OUT(1), q50: OUT(2), q90: OUT(3) };
  const volumes = { [AIV]: SRC, [OUT(1)]: outRow(OUT(1)), [OUT(2)]: outRow(OUT(2)), [OUT(3)]: outRow(OUT(3)) };
  const out = await propertyPrediction(ctxFor({ mode: 'volume', ai_volume_id: AIV, volume_ids: ids, property: prop('porosity') }), depsFor(volumes, undefined, { storage }));
  expect(out.volume_ids).toEqual(ids);
  const man = [1, 2, 3].map((n) => JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${OUT(n)}/manifest.json`))));
  expect(man.map((m) => m.attribute.params.product)).toEqual(['q10', 'q50', 'q90']);
  expect(man.every((m) => m.attribute.params.qi_class === 'calibrated_prediction')).toBe(true);
  const at = (n, s) => new Float32Array(uploads.get(`${UID}/${OUT(n)}/bricks/0-0-${Math.floor(s / B)}.f32`).buffer.slice(0))[((1 % B) * B + 2) * B + (s % B)];
  for (let s = 10; s < 120; s += 10) {
    expect(at(1, s)).toBeLessThan(at(2, s));
    expect(at(2, s)).toBeLessThan(at(3, s));
    expect(at(2, s)).toBeCloseTo(0.40 - 3.5e-5 * aiAt(1, 2, s), 2);
  }
});

test('facies volumes: one probability per facies and the code; fluids are hypotheses; an absent facies row is removed', async () => {
  const uploads = new Map();
  const log = { updates: [], deletes: [] };
  const storage = { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } };
  const pr = { ...prop('facies'), names: { 1: 'gas sand', 2: 'brine sand', 3: 'shale', 4: 'coal' } };
  const ids = { 'p:1': OUT(1), 'p:2': OUT(2), 'p:3': OUT(3), 'p:4': OUT(4), best: OUT(5) };
  const volumes = { [AIV]: SRC };
  for (const id of Object.values(ids)) volumes[id] = outRow(id);
  const out = await propertyPrediction(ctxFor({ mode: 'volume', ai_volume_id: AIV, volume_ids: ids, property: pr }), depsFor(volumes, undefined, { storage, log }));
  expect(Object.keys(out.volume_ids).sort()).toEqual(['best', 'p:1', 'p:2', 'p:3']);
  expect(log.deletes).toContain(OUT(4)); // no coal at the wells
  const man = (id) => JSON.parse(new TextDecoder().decode(uploads.get(`${UID}/${id}/manifest.json`)));
  expect(man(OUT(1)).attribute.params.qi_class).toBe('fluid_hypothesis');
  expect(man(OUT(3)).attribute.params.qi_class).toBe('calibrated_prediction');
  const at = (id, s) => new Float32Array(uploads.get(`${UID}/${id}/bricks/0-0-${Math.floor(s / B)}.f32`).buffer.slice(0))[((1 % B) * B + 2) * B + (s % B)];
  for (let s = 10; s < 120; s += 7) {
    const sum = at(out.volume_ids['p:1'], s) + at(out.volume_ids['p:2'], s) + at(out.volume_ids['p:3'], s);
    expect(sum).toBeCloseTo(1, 4);
    expect([1, 2, 3]).toContain(at(out.volume_ids.best, s));
  }
  for (const r of out.rows) expect(r.accuracy).toBeGreaterThan(0.8);
});

test('guards: an absolute impedance volume, ownership, output ids', async () => {
  expect(validatePropertyJob({ mode: 'volume', ai_volume_id: AIV, property: prop('porosity') })).toMatch(/volume_ids/);
  expect(outputKeys(prop('facies'))).toEqual(['p:1', 'p:2', 'p:3', 'best']);
  await expect(propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: prop('porosity') }), depsFor({ [AIV]: SRC }, { output: 'relative AI' }))).rejects.toMatchObject({ stage: 'validate_failed' });
  await expect(propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: prop('porosity') }), depsFor({ [AIV]: SRC }, { output: 'AI', product: 'spread' }))).rejects.toMatchObject({ stage: 'validate_failed' });
  await expect(propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: prop('porosity') }), depsFor({ [AIV]: { ...SRC, user_id: 'x' } }))).rejects.toMatchObject({ stage: 'not_found' });
  expect(await propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, property: prop('porosity') }, { cancelled: true }), depsFor({ [AIV]: SRC }))).toBeNull();
});

describe('facies in AI and Vp/Vs', () => {
  const VPV = '25555555-5555-4555-8555-555555555555';
  // facies by sample band: 1 gas (AI 6800, Vp/Vs 1.62), 2 brine (AI 7600, 1.92), 3 shale (AI 6800, 2.2)
  const facAt = (il, xl, s) => [1, 2, 3][Math.floor((s + 7 * il + 3 * xl) / 16) % 3];
  const aiOf = (f) => (f === 2 ? 7600 : 6800); const vOf = (f) => (f === 1 ? 1.62 : f === 2 ? 1.92 : 2.2);
  const storeOf = (fn) => {
    const m = new Map(); for (let k = 0; k < GRID[2]; k++) m.set(`0-0-${k}`, new Float32Array(B ** 3).fill(NULL_VALUE));
    for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let s = 0; s < NS; s++) m.get(`0-0-${Math.floor(s / B)}`)[((il % B) * B + (xl % B)) * B + (s % B)] = fn(facAt(il, xl, s));
    return m;
  };
  const S2 = [storeOf(aiOf), storeOf(vOf)];
  const W2 = [[0, 0], [2, 3], [4, 1], [5, 2]].map(([il, xl], k) => ({
    name: `W${k + 1}`, il, xl,
    ln_ai: Array.from({ length: NS }, (_, s) => Math.log(aiOf(facAt(il, xl, s)))),
    vpvs: Array.from({ length: NS }, (_, s) => vOf(facAt(il, xl, s))),
    target: Array.from({ length: NS }, (_, s) => facAt(il, xl, s)),
  }));
  const pr2 = { kind: 'facies', names: { 1: 'gas sand', 2: 'brine sand', 3: 'shale' }, attributes: 'ai_vpvs', upscaleHz: 50, wells: W2 };
  const deps2 = (vpManifest = { output: 'VPVS', product: 'vpvs' }, extra = {}) => ({
    admin: adminFor({ [AIV]: SRC, [VPV]: { ...SRC, id: VPV, storage_path: `${UID}/${VPV}` }, ...(extra.volumes || {}) }, extra.log),
    makeFetcher: (m, k = 0) => async (path) => S2[k].get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
    readManifest: async (path) => (path.includes(VPV) ? { ...manifestFor({}), attribute: { name: 'qi_prestack_inversion', params: vpManifest } } : { ...manifestFor({}), attribute: { name: 'qi_prestack_inversion', params: { product: 'ai', output: 'AI' } } }),
    ...extra,
  });
  test('calibrated in AI and Vp/Vs, each left-out well is classified well; a volume run writes the probabilities', async () => {
    const out = await propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, second_volume_id: VPV, property: pr2 }), deps2());
    expect(out.summary.attributes).toBe('ai_vpvs');
    for (const r of out.rows) expect(r.accuracy).toBeGreaterThan(0.8);
    const uploads = new Map();
    const storage = { upload: async (path, bytes) => { uploads.set(path, bytes); return {}; } };
    const ids = { 'p:1': OUT(1), 'p:2': OUT(2), 'p:3': OUT(3), best: OUT(4) };
    const volumes = {}; for (const id of Object.values(ids)) volumes[id] = outRow(id);
    const vout = await propertyPrediction(ctxFor({ mode: 'volume', ai_volume_id: AIV, second_volume_id: VPV, volume_ids: ids, property: pr2 }), deps2(undefined, { storage, volumes }));
    const code = (s) => new Float32Array(uploads.get(`${UID}/${vout.volume_ids.best}/bricks/0-0-${Math.floor(s / B)}.f32`).buffer.slice(0))[((1 % B) * B + 2) * B + (s % B)];
    let ok = 0; for (let s = 8; s < NS - 8; s++) if (code(s) === facAt(1, 2, s)) ok += 1;
    expect(ok / (NS - 16)).toBeGreaterThan(0.8);
  });
  test('the second volume must be the Vp/Vs of a simultaneous inversion', async () => {
    await expect(propertyPrediction(ctxFor({ mode: 'calibrate', ai_volume_id: AIV, second_volume_id: VPV, property: pr2 }), deps2({ product: 'si' }))).rejects.toMatchObject({ stage: 'validate_failed', message: expect.stringMatching(/Vp\/Vs of a simultaneous inversion/) });
    expect(validatePropertyJob({ mode: 'calibrate', ai_volume_id: AIV, property: pr2 })).toMatch(/second_volume_id/);
  });
});
