/**
 * @jest-environment node
 */
// Local Workspace L1: a job run in the browser on a LOCAL parent must store
// exactly the bricks the seismic worker stores for the same job on the same
// parent (docs/scope/LocalWorkspace-DESIGN.md, acceptance L1-2). Both sides
// call the worker's own handler (worker/seismic-worker/src/handlers); the
// browser side gets the browser dependencies (jobs/browserDeps), a workspace
// in memory, no service role and no bucket for its bricks. Compared brick for
// brick and by brick root; one changed parent sample is the negative control.
// Then the page-side runner: qi_jobs audit rows, the seal (registry ready,
// replica row, content id) and the clean-up of a failed job.
import { attributeVolume } from '../../../../worker/seismic-worker/src/handlers/attributeVolume.js';
import { balanceStacksJob } from '../../../../worker/seismic-worker/src/handlers/balanceStacks.js';
import { NULL_VALUE } from '../../../../packages/engines/engines/seismolord/manifest';
import { memoryDirectory } from '../memoryDir';
import { memoryRegistry } from '../registry';
import { createWorkspace, openLocalVolume } from '../workspace';
import { createLocalBrickSource } from '../localBricks';
import { buildBrowserDeps } from '../jobs/browserDeps';
import { runBrowserHandler } from '../jobs/browserHandlers';
import { createBrowserJobRunner, recipeOf } from '../jobs/browserJobs';
import { brickRootOf } from '../identity';
import { sha256Hex } from '../sha256';
import { chooseExecutor, uuidsIn } from '../router';
import { placementOf, previewsAllowed, PLACEMENT } from '../placement';

jest.setTimeout(60000);

const UID = '11111111-1111-4111-8111-111111111111';
const PARENT = '22222222-2222-4222-8222-222222222222';
const DERIVED = '33333333-3333-4333-8333-333333333333';
const NIL = 5; const NXL = 6; const NS = 10; const B = 4; const GRID = [2, 2, 3];
const MANIFEST = {
  manifest_version: 1, app: 'seismolord', volume_id: PARENT, name: 'Dome Survey',
  geometry: { il: { min: 100, max: 104, step: 1, count: NIL }, xl: { min: 200, max: 205, step: 1, count: NXL }, ns: NS, dt_us: 4000, corners: [[0, 0], [1, 0], [0, 1]] },
  brick: { size: B, grid: GRID, count: 12, dtype: 'float32le', layout: 'il-major,xl,sample-fastest', path_pattern: 'bricks/{i}-{j}-{k}.f32', null_value: 1.0e30 },
  stats: { min: -1, max: 1, mean: 0, rms: 0.5, live_samples: 300 },
  trace_count: 30,
};

function parentBricks(tweak = null) {
  const bricks = new Map();
  for (let i = 0; i < GRID[0]; i++) for (let j = 0; j < GRID[1]; j++) for (let k = 0; k < GRID[2]; k++) bricks.set(`${i}-${j}-${k}`, new Float32Array(B ** 3).fill(NULL_VALUE));
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let k = 0; k < NS; k++) {
    let v = Math.fround(Math.sin(il * 0.7 + xl * 0.3 + k * 0.5) * (1 + il));
    if (tweak && tweak[0] === il && tweak[1] === xl && tweak[2] === k) v += 5;
    bricks.get(`${Math.floor(il / B)}-${Math.floor(xl / B)}-${Math.floor(k / B)}`)[((il % B) * B + (xl % B)) * B + (k % B)] = v;
  }
  return bricks;
}

// ---- a supabase-js stand-in: rows by id, a bucket, rpc log -----------------
function fakeClient(rows) {
  const bucket = new Map();
  const log = { rpc: [], updates: [], deletes: [], upserts: [] };
  const from = (table) => {
    const f = []; let op = 'select'; let patch = null;
    const b = {
      select: () => b, insert: (x) => { op = 'insert'; patch = x; return b; },
      update: (x) => { op = 'update'; patch = x; return b; }, delete: () => { op = 'delete'; return b; },
      upsert: async (x) => { log.upserts.push([table, x]); return { error: null }; },
      eq: (c, v) => { f.push([c, v]); return b; }, in: () => b, limit: () => b, order: () => b, or: () => b,
      maybeSingle: async () => ({ data: rows[f.find(([c]) => c === 'id')?.[1]] || null, error: null }),
      single: async () => b.maybeSingle(),
      then: (res) => {
        const id = f.find(([c]) => c === 'id')?.[1];
        if (table === 'seismic_volumes' && op === 'update' && rows[id]) { Object.assign(rows[id], patch); log.updates.push([id, patch]); }
        if (table === 'seismic_volumes' && op === 'delete') { log.deletes.push(id); delete rows[id]; }
        if (table === 'qi_jobs' && op === 'select') { res({ data: [], error: null }); return; }
        res({ data: null, error: null });
      },
    };
    return b;
  };
  const storageFrom = () => ({
    async upload(path, body, { upsert } = {}) {
      if (bucket.has(path) && !upsert) return { error: { message: 'The resource already exists', statusCode: '409' } };
      bucket.set(path, new Uint8Array(await body.arrayBuffer())); return { error: null };
    },
    async update(path, body) { bucket.set(path, new Uint8Array(await body.arrayBuffer())); return { error: null }; },
    async download(path) { return bucket.has(path) ? { data: new Blob([bucket.get(path)]), error: null } : { data: null, error: { message: 'not found' } }; },
    async remove(paths) { for (const p of paths) bucket.delete(p); return { data: [], error: null }; },
    async list() { return { data: [], error: null }; },
  });
  let jobN = 0;
  return {
    bucket, log, rows, from, storage: { from: storageFrom }, supabaseUrl: 'http://x', supabaseKey: 'anon',
    auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) },
    async rpc(fn, args) {
      log.rpc.push([fn, args]);
      if (fn === 'qi_start_local_job') { jobN += 1; return { data: `00000000-0000-4000-8000-00000000000${jobN}`, error: null }; }
      if (fn === 'qi_update_local_job') return { data: { found: true, cancel_requested: false, status: 'running' }, error: null };
      return { data: /usage/.test(fn) ? 0 : 1e15, error: null };
    },
  };
}

async function localSetup(tweak = null) {
  const registry = memoryRegistry();
  await createWorkspace({ userId: UID, label: "Ayo's PC", backend: 'memory', handle: memoryDirectory('D'), registry, deviceId: 'dev-1' });
  const parent = await openLocalVolume(PARENT, { write: true, create: true, registry, userId: UID, projectId: 'p1' });
  for (const [k, v] of parentBricks(tweak)) await parent.put(`bricks/${k}.f32`, new Uint8Array(v.buffer));
  await parent.putJson('manifest', MANIFEST);
  await registry.patchVolume(PARENT, { state: 'ready' });
  // the derived volume is registered local before the job runs (state writing)
  await registry.putVolume({ volumeId: DERIVED, userId: UID, projectId: 'p1', backend: 'memory', state: 'writing', bytes: 0 });
  return registry;
}

const rowsFor = () => ({
  [DERIVED]: { id: DERIVED, user_id: UID, status: 'ingesting', name: 'Dome Survey [Envelope]', kind: 'attribute', parent_volume_id: PARENT, storage_path: `${UID}/${DERIVED}` },
  [PARENT]: { id: PARENT, user_id: UID, status: 'ready', name: 'Dome Survey', kind: null, storage_path: `${UID}/${PARENT}` },
});
const jobFor = (attribute) => ({ id: 'j1', kind: 'attribute_volume', user_id: UID, params: { volume_id: DERIVED, parent_volume_id: PARENT, attribute } });

async function serverRun(attribute, tweak = null) {
  const store = parentBricks(tweak);
  const objects = new Map();
  const rows = rowsFor();
  const admin = fakeClient(rows);
  await attributeVolume({ job: { id: 'j1', attempt: 1, user_id: UID }, params: jobFor(attribute).params, progress: () => {}, cancelled: false, log: { warn() {} } }, {
    admin,
    storage: { async upload(path, bytes) { objects.set(path, new Uint8Array(bytes)); return 'uploaded'; } },
    makeFetcher: () => async (path) => store.get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
    readManifest: async () => structuredClone(MANIFEST),
  });
  return objects;
}

async function browserRun(attribute, tweak = null) {
  const registry = await localSetup(tweak);
  const client = fakeClient(rowsFor());
  const deps = buildBrowserDeps({ client, supabaseUrl: 'http://x', getToken: async () => 'tok', registry, source: createLocalBrickSource({ registry }) });
  const outcome = await runBrowserHandler({ job: jobFor(attribute), deps });
  await deps.closeWriters();
  const store = await openLocalVolume(DERIVED, { registry });
  return { outcome, store, client, registry };
}

const rel = (path) => path.slice(`${UID}/${DERIVED}/`.length);
const rootOfObjects = async (objects) => brickRootOf(await Promise.all([...objects].filter(([p]) => p.endsWith('.f32')).map(async ([p, b]) => [rel(p), await sha256Hex(b)])));

describe.each([
  ['per-trace', { name: 'envelope', params: {} }],
  ['neighbourhood', { name: 'variance', params: {} }],
])('browser job equals the server job, %s attribute', (_l, attribute) => {
  let srv; let br;
  beforeAll(async () => { srv = await serverRun(attribute); br = await browserRun(attribute); });

  test('the job succeeds in the browser with no service role', () => {
    expect(br.outcome).toMatchObject({ ok: true });
    expect(br.client.rows[DERIVED].status).toBe('ready');
  });
  test('every brick is byte-identical, and the brick roots are equal', async () => {
    const keys = [...srv.keys()].filter((k) => k.endsWith('.f32')).map(rel).sort();
    expect(keys).toHaveLength(12);
    expect((await br.store.keys()).sort()).toEqual(keys);
    for (const k of keys) expect([k, Buffer.from(await br.store.get(k)).equals(Buffer.from(srv.get(`${UID}/${DERIVED}/${k}`)))]).toEqual([k, true]);
    expect(await br.store.brickRoot()).toBe(await rootOfObjects(srv));
  });
  test('no brick went to the bucket; the manifest did (metadata only)', () => {
    const paths = [...br.client.bucket.keys()];
    expect(paths).toEqual([`${UID}/${DERIVED}/manifest.json`]);
  });
  test('the same manifest is kept locally and in the cloud', async () => {
    const local = await br.store.getJson('manifest');
    expect(JSON.parse(new TextDecoder().decode(srv.get(`${UID}/${DERIVED}/manifest.json`)))).toEqual(local);
  });
  test('negative control: one changed parent sample changes the browser brick root', async () => {
    const t = await browserRun(attribute, [2, 3, 4]);
    expect(await t.store.brickRoot()).not.toBe(await rootOfObjects(srv));
  });
});

describe('page-side runner', () => {
  function inProcessWorker(registry, client) {
    // runs the worker's message protocol in this process
    return () => {
      const w = { onmessage: null, onerror: null, terminate() {} };
      w.postMessage = async (msg) => {
        if (msg.type !== 'run') return;
        const deps = buildBrowserDeps({ client, supabaseUrl: 'http://x', getToken: async () => 'tok', registry, source: createLocalBrickSource({ registry }) });
        const outcome = await runBrowserHandler({ job: msg.job, deps });
        await deps.closeWriters();
        w.onmessage({ data: { type: 'done', id: msg.id, outcome } });
      };
      return w;
    };
  }

  test('records the job, runs it, seals the output and reports it on the row', async () => {
    const registry = await localSetup();
    const client = fakeClient(rowsFor());
    const runner = createBrowserJobRunner({
      supabase: client, registry, device: async () => ({ deviceId: 'dev-1', label: "Ayo's PC", userId: UID }),
      makeWorker: inProcessWorker(registry, client), setInterval: () => 0, clearInterval: () => {},
    });
    const { id, done } = await runner.start({ kind: 'attribute_volume', params: jobFor({ name: 'envelope' }).params });
    const view = await done;
    expect(view.phase).toBe('done');
    const start = client.log.rpc.find(([f]) => f === 'qi_start_local_job')[1];
    expect(start).toMatchObject({ p_kind: 'attribute_volume', p_executor: 'browser', p_device_id: 'dev-1' });
    const end = client.log.rpc.filter(([f]) => f === 'qi_update_local_job').pop()[1];
    expect(end).toMatchObject({ p_job_id: id, p_status: 'succeeded' });
    expect(end.p_result_refs.executor).toBe('browser');
    expect(end.p_result_refs.local_outputs[0]).toMatchObject({ volume_id: DERIVED });
    expect(end.p_engine_commit).toMatch(/^browser-suite-/);
    const rec = await registry.getVolume(DERIVED);
    expect(rec.state).toBe('ready');
    expect(rec.brickRoot).toMatch(/^br1-/);
    expect(rec.contentId).toMatch(/^lv1-/);
    expect(client.log.upserts.find(([t]) => t === 'seismic_volume_replicas')[1]).toMatchObject({ volume_id: DERIVED, device_id: 'dev-1', device_label: "Ayo's PC", state: 'ready' });
    expect(client.log.updates.find(([vid, p]) => vid === DERIVED && p.brick_root)[1].brick_root).toBe(rec.brickRoot);
  });

  test('a failed job removes its local output and records the failure', async () => {
    const registry = await localSetup();
    const rows = rowsFor();
    rows[PARENT].user_id = 'someone-else';
    const client = fakeClient(rows);
    const runner = createBrowserJobRunner({
      supabase: client, registry, device: async () => ({ deviceId: 'dev-1', label: 'PC', userId: UID }),
      makeWorker: inProcessWorker(registry, client), setInterval: () => 0, clearInterval: () => {},
    });
    const view = await (await runner.start({ kind: 'attribute_volume', params: jobFor({ name: 'envelope' }).params })).done;
    expect(view.phase).toBe('failed');
    expect(await registry.getVolume(DERIVED)).toBeNull();
    const end = client.log.rpc.filter(([f]) => f === 'qi_update_local_job').pop()[1];
    expect(end).toMatchObject({ p_status: 'failed', p_failure_stage: 'not_found' });
  });

  test('the recipe replaces inputs by content id and drops outputs and names', () => {
    const r = recipeOf({ name: 'x', parent_volume_id: PARENT, volume_id: DERIVED, attribute: { name: 'envelope' } }, new Map([[PARENT, 'lv1-abc']]), new Set([DERIVED]));
    expect(r).toEqual({ parent_volume_id: 'lv1-abc', volume_id: '<output>', attribute: { name: 'envelope' } });
  });
});

// QI showcase (2026-10-16): Balance the stacks on stacks kept on this computer
// was refused ("needs Petrolord Local") because the helper list named kinds
// that do not exist (balance_stacks, condition_gathers). It is a post-stack,
// volume in volume out job, so it runs in the browser on the server's handler.
describe('browser job equals the server job, spectral balance', () => {
  const params = { stacks: [PARENT], volume_ids: { [PARENT]: DERIVED }, target: 'flat', f_lo_hz: 8, f_hi_hz: 60 };
  const job = { id: 'j1', kind: 'spectral_balance', user_id: UID, params };
  async function serverBalance(tweak = null) {
    const store = parentBricks(tweak);
    const objects = new Map();
    await balanceStacksJob({ job: { id: 'j1', attempt: 1, user_id: UID }, params, progress: () => {}, cancelled: false, log: { warn() {} } }, {
      admin: fakeClient(rowsFor()),
      storage: { async upload(path, bytes) { objects.set(path, new Uint8Array(bytes)); return 'uploaded'; } },
      makeFetcher: () => async (path) => store.get(path.match(/bricks\/(\d+-\d+-\d+)\.f32$/)[1]).slice().buffer,
      readManifest: async () => structuredClone(MANIFEST),
    });
    return objects;
  }
  async function browserBalance(tweak = null) {
    const registry = await localSetup(tweak);
    const client = fakeClient(rowsFor());
    const deps = buildBrowserDeps({ client, supabaseUrl: 'http://x', getToken: async () => 'tok', registry, source: createLocalBrickSource({ registry }) });
    const outcome = await runBrowserHandler({ job, deps });
    await deps.closeWriters();
    return { outcome, store: await openLocalVolume(DERIVED, { registry }), client };
  }
  test('the job runs in the browser and every brick equals the server\'s', async () => {
    const srv = await serverBalance();
    const br = await browserBalance();
    expect(br.outcome).toMatchObject({ ok: true });
    const bricks = [...srv].filter(([p]) => p.endsWith('.f32'));
    expect(bricks.length).toBe(12);
    for (const [path, bytes] of bricks) {
      const local = await br.store.get(rel(path));
      expect(Buffer.compare(Buffer.from(local), Buffer.from(bytes))).toBe(0);
    }
    expect([...br.client.bucket.keys()].some((k) => k.endsWith('.f32'))).toBe(false);
    // negative control: one changed parent sample changes the browser root
    const tweaked = await browserBalance([1, 1, 4]);
    const rootOf = async (store) => brickRootOf(await Promise.all(bricks.map(async ([p]) => [rel(p), await sha256Hex(await store.get(rel(p)))])));
    expect(await rootOf(tweaked.store)).not.toBe(await rootOf(br.store));
  });
});

describe('routing and placement', () => {
  const here = { kind: PLACEMENT.HERE };
  const cloud = { kind: PLACEMENT.CLOUD };
  test('local inputs run in the browser; cloud inputs on the server; prestack locals wait for the helper', () => {
    expect(chooseExecutor({ kind: 'poststack_inversion', inputs: [{ id: 'a', placement: here }] }).executor).toBe('browser');
    expect(chooseExecutor({ kind: 'poststack_inversion', inputs: [{ id: 'a', placement: cloud }] }).executor).toBe('server');
    expect(chooseExecutor({ kind: 'poststack_inversion', inputs: [{ id: 'a', placement: cloud }], preference: 'browser' }).executor).toBe('browser');
    expect(chooseExecutor({ kind: 'angle_stacks', inputs: [{ id: 'a', placement: here }] }).error).toMatch(/Petrolord Local/);
    expect(chooseExecutor({ kind: 'angle_stacks', inputs: [{ id: 'a', placement: here }], helperPaired: true }).executor).toBe('local');
    // stack balancing runs here; the gather conditioning kinds wait for the helper
    expect(chooseExecutor({ kind: 'spectral_balance', inputs: [{ id: 'a', placement: here }] }).executor).toBe('browser');
    for (const kind of ['radon_demultiple', 'fx_denoise']) {
      expect(chooseExecutor({ kind, inputs: [{ id: 'a', placement: here }] }).error).toMatch(/Petrolord Local/);
      expect(chooseExecutor({ kind, inputs: [{ id: 'a', placement: here }], helperPaired: true }).executor).toBe('local');
    }
    expect(chooseExecutor({ kind: 'seismic_qc', inputs: [{ id: 'a', name: 'Near stack', placement: { kind: PLACEMENT.ELSEWHERE, deviceLabel: "Ayo's PC" } }] }).error).toMatch(/Near stack lives on Ayo's PC/);
  });
  test('uuids anywhere in params', () => {
    expect([...uuidsIn({ a: PARENT, b: [{ c: DERIVED }], d: 'x' })].sort()).toEqual([PARENT, DERIVED].sort());
  });
  test('placement badges', () => {
    expect(placementOf({ storage_location: 'cloud' }).badge).toBe('Cloud');
    // a job's output being written here routes here (found live on the Ekene bench)
    expect(placementOf({ storage_location: 'local' }, { local: { state: 'writing' } })).toMatchObject({ kind: PLACEMENT.HERE, canOpen: false });
    expect(placementOf({ storage_location: 'local', user_id: UID }, { local: { state: 'ready' }, userId: UID }).badge).toBe('This computer');
    const away = placementOf({ storage_location: 'local', user_id: UID, replicas: [{ state: 'ready', device_label: "Ayo's PC", last_seen_at: new Date(Date.now() - 2 * 3600e3).toISOString() }] }, { userId: 'colleague' });
    expect(away).toMatchObject({ kind: PLACEMENT.ELSEWHERE, canOpen: false, canRequestCopy: true, badge: "Ayo's PC" });
    expect(away.title).toMatch(/Lives on Ayo's PC, last seen 2 hours ago/);
    expect(placementOf({ storage_location: 'local' }, { local: { state: 'missing' } }).kind).toBe(PLACEMENT.MISSING);
    // site data cleared: no local record, but this computer's replica is on record
    expect(placementOf({ storage_location: 'local', user_id: UID, replicas: [{ device_id: 'dev-1', state: 'ready', device_label: 'PC' }] }, { userId: UID, deviceId: 'dev-1' }).kind).toBe(PLACEMENT.MISSING);
  });
  test('previews: on by default, off for members-only projects, per-volume override wins', () => {
    expect(previewsAllowed({})).toBe(true);
    expect(previewsAllowed({ projectVisibility: 'members' })).toBe(false);
    expect(previewsAllowed({ projectVisibility: 'members', volumePreviews: 'on' })).toBe(true);
    expect(previewsAllowed({ volumePreviews: 'off' })).toBe(false);
  });
});
