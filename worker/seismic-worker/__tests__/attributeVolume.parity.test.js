/**
 * @jest-environment node
 */
// attribute_volume (QI programme Q0b): a server-computed attribute volume
// must equal what the browser's attribute worker produces. The reference is
// the engine called exactly as workers/volumeJob.worker.js calls it, on the
// same synthetic parent store; the server's stored bricks, manifest and row
// must match it. A per-trace attribute (envelope) and a neighbourhood one
// (variance) cover both job paths. One changed parent sample is the negative
// control. Then the guards: ownership, state, quota, cancel, cleanup.
import { attributeVolume, validateAttributeParams } from '../src/handlers/attributeVolume.js';
import { derivedSurveyMeta } from '../../../src/pages/apps/Seismolord/services/attributeSurveyMeta';
import { runVolumeJob, runNeighborhoodJob } from '../../../packages/engines/engines/seismolord/volumeJob';
import { makeTraceCompute } from '../../../packages/engines/engines/seismolord/attributes';
import { makeDiscontinuityJob } from '../../../packages/engines/engines/seismolord/discontinuityJobs';
import { geomFromManifest } from '../../../packages/engines/engines/seismolord/sliceAssembly';
import { buildDerivedManifest, NULL_VALUE } from '../../../packages/engines/engines/seismolord/manifest';
import { surveyAffine } from '../../../packages/engines/engines/seismolord/surveyGeometry';
import { affineForNorth } from '../../../src/pages/apps/Seismolord/lib/northReference';

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

function parentStore(tweak = null) {
  const bricks = new Map();
  for (let i = 0; i < GRID[0]; i++) for (let j = 0; j < GRID[1]; j++) for (let k = 0; k < GRID[2]; k++) {
    bricks.set(`${i}-${j}-${k}`, new Float32Array(B ** 3).fill(NULL_VALUE));
  }
  for (let il = 0; il < NIL; il++) for (let xl = 0; xl < NXL; xl++) for (let k = 0; k < NS; k++) {
    let v = Math.fround(Math.sin(il * 0.7 + xl * 0.3 + k * 0.5) * (1 + il));
    if (tweak && tweak[0] === il && tweak[1] === xl && tweak[2] === k) v += 5;
    bricks.get(`${Math.floor(il / B)}-${Math.floor(xl / B)}-${Math.floor(k / B)}`)[((il % B) * B + (xl % B)) * B + (k % B)] = v;
  }
  return bricks;
}

const fetcherFor = (store) => () => async (path) => {
  const m = path.match(/bricks\/(\d+-\d+-\d+)\.f32$/);
  return store.get(m[1]).slice().buffer;
};

function adminMock({ derived, parent, used = 0, quota = 20 * 1024 ** 3 }) {
  const rows = { [DERIVED]: derived, [PARENT]: parent };
  const log = { updates: [], deletes: [], removed: [] };
  const from = (table) => {
    const f = [];
    let op = 'select'; let patch = null;
    const b = {
      select: () => b,
      update: (x) => { op = 'update'; patch = x; return b; },
      delete: () => { op = 'delete'; return b; },
      eq: (c, v) => { f.push([c, v]); return b; },
      maybeSingle: async () => ({ data: rows[f.find(([c]) => c === 'id')?.[1]] || null, error: null }),
      then: (res) => {
        const id = f.find(([c]) => c === 'id')?.[1];
        if (op === 'update' && rows[id]) { Object.assign(rows[id], patch); log.updates.push(patch); }
        if (op === 'delete') { log.deletes.push(id); delete rows[id]; }
        res({ error: null });
      },
    };
    return b;
  };
  return {
    rows, log, from,
    rpc: async (fn) => ({ data: fn === 'seismic_storage_quota_bytes' ? quota : used, error: null }),
    storage: { from: () => ({ remove: async (names) => { log.removed.push(...names); return { error: null }; } }) },
  };
}

function storageMock() {
  const objects = new Map();
  return {
    objects,
    async upload(path, bytes, { upsert } = {}) {
      if (objects.has(path) && !upsert) return 'exists';
      objects.set(path, new Uint8Array(bytes));
      return 'uploaded';
    },
  };
}

const derivedRow = () => ({ id: DERIVED, user_id: UID, status: 'ingesting', name: 'Dome Survey [Envelope]', kind: 'attribute', parent_volume_id: PARENT, storage_path: `${UID}/${DERIVED}` });
const parentRow = () => ({ id: PARENT, user_id: UID, status: 'ready', name: 'Dome Survey', kind: null, storage_path: `${UID}/${PARENT}` });
const ctxFor = (attribute) => ({ job: { id: 'j1', attempt: 1, user_id: UID }, params: { volume_id: DERIVED, parent_volume_id: PARENT, attribute }, progress: () => {}, cancelled: false, log: { warn() {} } });

async function serverRun(attribute, { store = parentStore(), admin = adminMock({ derived: derivedRow(), parent: parentRow() }), ctx = ctxFor(attribute) } = {}) {
  const storage = storageMock();
  const result = await attributeVolume(ctx, { admin, storage, makeFetcher: fetcherFor(store), readManifest: async () => structuredClone(MANIFEST) });
  return { storage, admin, result };
}

// The browser worker's computation, called directly.
async function reference(attribute, store = parentStore()) {
  const geom = geomFromManifest(MANIFEST);
  const out = new Map();
  const shared = {
    geom,
    fetchBrick: async (i, j, k) => store.get(`${i}-${j}-${k}`).slice(),
    shouldCancel: () => false,
    onProgress: () => {},
    onBrick: ({ i, j, k, data }) => { out.set(`${UID}/${DERIVED}/bricks/${i}-${j}-${k}.f32`, new Uint8Array(data.buffer.slice(0))); },
  };
  const { name, params = {} } = attribute;
  const result = ['variance', 'fault_likelihood', 'edge', 'dip', 'chaos'].includes(name)
    ? await runNeighborhoodJob({ ...shared, ...makeDiscontinuityJob(name, params, { dtUs: 4000, nIl: NIL, nXl: NXL, ns: NS, affine: affineForNorth(surveyAffine(MANIFEST.geometry), undefined) }) })
    : await runVolumeJob({ ...shared, compute: makeTraceCompute(name, params, { dtUs: 4000 }) });
  return { bricks: out, manifest: buildDerivedManifest({ volumeId: DERIVED, name: derivedRow().name, parentManifest: MANIFEST, attribute: { name, params }, job: result }) };
}

const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
const manifestOf = (storage) => JSON.parse(new TextDecoder().decode(storage.objects.get(`${UID}/${DERIVED}/manifest.json`)));

describe.each([
  ['per-trace', { name: 'envelope', params: {} }],
  ['neighbourhood', { name: 'variance', params: {} }],
])('attribute_volume parity, %s attribute', (_label, attribute) => {
  let ref;
  let srv;
  beforeAll(async () => {
    ref = await reference(attribute);
    srv = await serverRun(attribute);
  });

  test('stores the same bricks byte for byte', () => {
    const keys = [...ref.bricks.keys()].sort();
    expect([...srv.storage.objects.keys()].filter((k) => k.endsWith('.f32')).sort()).toEqual(keys);
    expect(keys.length).toBe(12);
    for (const k of keys) expect([k, same(srv.storage.objects.get(k), ref.bricks.get(k))]).toEqual([k, true]);
  });

  test('writes the same derived manifest and the browser row metadata', () => {
    expect(manifestOf(srv.storage)).toEqual(ref.manifest);
    expect(srv.admin.rows[DERIVED].status).toBe('ready');
    expect(srv.admin.rows[DERIVED].survey_meta).toEqual(derivedSurveyMeta(ref.manifest, PARENT));
  });

  test('negative control: one changed parent sample changes the stored bricks', async () => {
    const tampered = await serverRun(attribute, { store: parentStore([2, 3, 4]) });
    const differs = [...ref.bricks].some(([k, b]) => !same(tampered.storage.objects.get(k), b));
    expect(differs).toBe(true);
  });
});

describe('attribute_volume guards', () => {
  test('settings are validated', () => {
    expect(validateAttributeParams({ volume_id: DERIVED, parent_volume_id: PARENT, attribute: { name: 'envelope' } })).toBeNull();
    expect(validateAttributeParams({ volume_id: DERIVED, parent_volume_id: PARENT, attribute: { name: 'nonsense' } })).toMatch(/Unknown attribute/);
  });

  test("another user's parent is refused, before any read", async () => {
    const admin = adminMock({ derived: derivedRow(), parent: { ...parentRow(), user_id: 'someone-else' } });
    await expect(serverRun({ name: 'envelope' }, { admin })).rejects.toMatchObject({ stage: 'not_found' });
  });

  test('a derived volume that is already ready is not recomputed', async () => {
    const admin = adminMock({ derived: { ...derivedRow(), status: 'ready' }, parent: parentRow() });
    await expect(serverRun({ name: 'envelope' }, { admin })).rejects.toMatchObject({ stage: 'validate_failed' });
  });

  test('over quota: refused, nothing uploaded, and the registered row is removed', async () => {
    const admin = adminMock({ derived: derivedRow(), parent: parentRow(), used: 20 * 1024 ** 3, quota: 20 * 1024 ** 3 });
    const out = serverRun({ name: 'envelope' }, { admin });
    await expect(out).rejects.toMatchObject({ stage: 'over_quota' });
    expect(admin.log.deletes).toEqual([DERIVED]);
  });

  test('a cancel stops the job and removes what it uploaded and the row', async () => {
    const admin = adminMock({ derived: derivedRow(), parent: parentRow() });
    const ctx = ctxFor({ name: 'envelope' });
    let n = 0;
    ctx.progress = () => { n += 1; if (n >= 2) ctx.cancelled = true; };
    const { result, storage } = await serverRun({ name: 'envelope' }, { admin, ctx });
    expect(result).toBeNull();
    expect(admin.log.deletes).toEqual([DERIVED]);
    const uploadedBricks = [...storage.objects.keys()].filter((k) => k.endsWith('.f32'));
    expect(admin.log.removed.sort()).toEqual(uploadedBricks.sort());
  });
});
