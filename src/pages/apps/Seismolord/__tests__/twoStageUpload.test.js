/**
 * @jest-environment node
 */
/**
 * Two-stage resumable upload of a manifest v4 brick store (large-survey
 * plan, section 5) against a mocked storage client: stage ordering
 * (display coarse to fine, manifest, display_ready, float32, manifest,
 * ready), per-object retry with backoff, fatal errors, resume skipping
 * what is already in Storage, pause/resume, a dropped connection, and
 * cancellation. Then the import job manager end to end: a real v4
 * conversion into a spool, the upload, the row status transitions, the
 * unload guard, and resume in a later session without the SEG-Y. The
 * uploaded store is read back through v4BrickFetcher and compared with
 * the v1 transcoder bit for bit.
 */
import zlib from 'node:zlib';
import { TextEncoder, TextDecoder } from 'node:util';
import {
  createTwoStageUpload, planUpload, backoffMs, isFatalUploadError, isNetworkError,
  UPLOAD_STATUS, OFFLINE_POLL_MS,
} from '../services/uploadV4';
import { memorySpool } from '../services/brickSpool';
import { convertToSpool, spoolKeyOf, conversionBudgetBytes } from '../services/conversionV4';
import { createDeflatePool, deflatePoolSize } from '../services/deflatePool';
import {
  createImportJobManager, JOB_PHASE, V4_STATUS, isOpenableVolume, v4SurveyMeta,
} from '../services/importJobs';
import { buildManifestV4, withV4Complete, NULL_VALUE } from '../engine/manifest';
import {
  v4BrickFetcher, DEFLATE_RAW, quantizeU8, dequantizeU8,
} from '../engine/brickCodecV4';
import { transcodeToBricks } from '../engine/brickTranscode';
import { bufferReader } from '../engine/reader';
import { makeSegy, scanOf } from '../../../../../packages/engines/__tests__/seismolordSegyFixture';
import { createSliceWorkerHandler } from '../sources/sliceWorkerHandler';

if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

const ZLIB = {
  compression: DEFLATE_RAW,
  deflate: async (b) => new Uint8Array(zlib.deflateRawSync(b)),
  inflate: async (b) => new Uint8Array(zlib.inflateRawSync(b)),
};
const DIR = 'user-1/vol-1';
const tick = () => new Promise((r) => { setImmediate(r); });

// ---- mocks -----------------------------------------------------------------

/** Storage mock: objects by path, an upload log, scripted failures. */
function mockStorage() {
  const objects = new Map();
  const log = [];
  const failures = [];   // {match: RegExp, errors: [Error...]}
  let inflight = 0;
  let maxInflight = 0;
  let hold = null;       // when set, uploads wait on this promise
  return {
    objects,
    log,
    get maxInflight() { return maxInflight; },
    failPath(match, ...errors) { failures.push({ match, errors }); },
    holdUploads() {
      let release;
      hold = new Promise((r) => { release = r; });
      return () => { hold = null; release(); };
    },
    async upload(path, bytes, { upsert } = {}) {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      try {
        if (hold) await hold;
        await tick();
        const f = failures.find((x) => x.match.test(path) && x.errors.length);
        if (f) throw f.errors.shift();
        log.push(path);
        if (objects.has(path) && !upsert) return 'exists';
        objects.set(path, bytes.slice());
        return 'uploaded';
      } finally {
        inflight -= 1;
      }
    },
    async list(dir) {
      const names = [];
      for (const p of objects.keys()) {
        if (p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/')) names.push(p.slice(dir.length + 1));
      }
      return names;
    },
  };
}

function mockNetwork() {
  let online = true;
  const listeners = new Set();
  return {
    isOnline: () => online,
    onOnline: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    goOffline() { online = false; },
    goOnline() { online = true; for (const l of listeners) l(); },
    get listeners() { return listeners.size; },
  };
}

const httpError = (status, message = `HTTP ${status}`) => Object.assign(new Error(message), { status });
const netError = () => new TypeError('Failed to fetch');

/** A spool holding a small synthetic v4 store: levels 0..3 and float32. */
async function syntheticSpool() {
  const spool = memorySpool();
  const grids = [[3, 2, 2], [2, 1, 1], [1, 1, 1], [1, 1, 1]];
  for (let L = 0; L < grids.length; L++) {
    const [a, b, c] = grids[L];
    for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) for (let k = 0; k < c; k++) {
      // eslint-disable-next-line no-await-in-loop
      await spool.put(`v4/d${L}/${i}-${j}-${k}.u8z`, new Uint8Array([L, i, j, k, 9]));
    }
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    // eslint-disable-next-line no-await-in-loop
    await spool.put(`v4/f/${i}-${j}-${k}.f32z`, new Uint8Array([7, i, j, k, 1, 2, 3, 4]));
  }
  return spool;
}

const MANIFEST = { manifest_version: 4, display: { complete: false }, f32: { complete: false } };

function makeUpload(spool, storage, extra = {}) {
  const stages = [];
  const sleeps = [];
  const states = [];
  const job = createTwoStageUpload({
    storage,
    spool,
    dir: DIR,
    manifest: MANIFEST,
    network: extra.network || mockNetwork(),
    sleep: async (ms) => { sleeps.push(ms); await tick(); },
    random: () => 0.5,
    retry: { attempts: 4, baseMs: 100, maxMs: 1000 },
    concurrency: 3,
    onStage: async (stage, m) => {
      stages.push({ stage, uploadedSoFar: storage.log.length, manifest: m });
    },
    onProgress: (s) => states.push(s.status),
    ...extra,
  });
  return { job, stages, sleeps, states };
}

const isDisplay = (p) => /\/v4\/d\d\//.test(p);
const isF32 = (p) => /\/v4\/f\//.test(p);
const isManifest = (p) => p.endsWith('/manifest.json');
const levelOf = (p) => Number(/\/v4\/d(\d)\//.exec(p)[1]);

// ---- the state machine -------------------------------------------------------

describe('upload plan', () => {
  test('display coarse to fine then i, j, k; float32 by i, j, k; strays ignored', () => {
    const plan = planUpload([
      'v4/f/1-0-0.f32z', 'v4/d0/0-0-1.u8z', 'v4/d3/0-0-0.u8z', 'v4/d0/0-0-0.u8z',
      'v4/f/0-1-0.f32z', 'v4/d1/1-0-0.u8z', 'v4/d1/0-0-0.u8z', 'junk.bin',
    ]);
    expect(plan.display).toEqual([
      'v4/d3/0-0-0.u8z', 'v4/d1/0-0-0.u8z', 'v4/d1/1-0-0.u8z', 'v4/d0/0-0-0.u8z', 'v4/d0/0-0-1.u8z',
    ]);
    expect(plan.f32).toEqual(['v4/f/0-1-0.f32z', 'v4/f/1-0-0.f32z']);
  });

  test('backoff doubles to the cap with jitter; error classes', () => {
    const r = { baseMs: 1000, maxMs: 30000 };
    expect([1, 2, 3, 6, 9].map((a) => backoffMs(a, r, () => 1 - 1e-12)).map(Math.round))
      .toEqual([1000, 2000, 4000, 30000, 30000]);
    expect(backoffMs(1, r, () => 0)).toBe(500);
    expect(isFatalUploadError(httpError(403))).toBe(true);
    expect(isFatalUploadError(httpError(413))).toBe(true);
    expect(isFatalUploadError(httpError(503))).toBe(false);
    expect(isNetworkError(netError())).toBe(true);
    expect(isNetworkError(httpError(503))).toBe(false);
  });
});

describe('two-stage upload state machine', () => {
  test('stage order: display coarse to fine, manifest, display_ready, float32, manifest, ready', async () => {
    const spool = await syntheticSpool();
    const storage = mockStorage();
    const { job, stages, states } = makeUpload(spool, storage);
    const final = await job.run();
    expect(final.status).toBe(UPLOAD_STATUS.DONE);

    const log = storage.log;
    const firstF32 = log.findIndex(isF32);
    const manifests = log.map((p, n) => (isManifest(p) ? n : -1)).filter((n) => n >= 0);
    expect(manifests).toHaveLength(2);
    // every display brick before the first manifest, every f32 after it
    expect(log.slice(0, manifests[0]).every(isDisplay)).toBe(true);
    expect(log.slice(manifests[0] + 1, manifests[1]).every(isF32)).toBe(true);
    expect(manifests[0]).toBeLessThan(firstF32);
    expect(manifests[1]).toBe(log.length - 1);
    // coarse to fine: the level sequence never increases
    const levels = log.slice(0, manifests[0]).map(levelOf);
    for (let n = 1; n < levels.length; n++) expect(levels[n]).toBeLessThanOrEqual(levels[n - 1] + 0);
    expect(levels[0]).toBe(3);
    expect(levels.at(-1)).toBe(0);

    // status hooks fire after their manifest and in order
    expect(stages.map((s) => s.stage)).toEqual(['display_ready', 'ready']);
    expect(stages[0].uploadedSoFar).toBe(manifests[0] + 1);
    expect(stages[0].manifest.display.complete).toBe(true);
    expect(stages[0].manifest.f32.complete).toBe(false);
    expect(stages[1].manifest.f32.complete).toBe(true);
    const written = JSON.parse(new TextDecoder().decode(storage.objects.get(`${DIR}/manifest.json`)));
    expect(written.display.complete && written.f32.complete).toBe(true);
    expect(states.at(-1)).toBe(UPLOAD_STATUS.DONE);
    expect(storage.maxInflight).toBeLessThanOrEqual(3);
    expect(storage.maxInflight).toBeGreaterThan(1);
  });

  test('a transient failure retries with backoff and the object lands once', async () => {
    const spool = await syntheticSpool();
    const storage = mockStorage();
    storage.failPath(/d0\/1-0-1\.u8z$/, httpError(503), httpError(500));
    const { job, sleeps } = makeUpload(spool, storage);
    const final = await job.run();
    expect(final.status).toBe(UPLOAD_STATUS.DONE);
    expect(final.retries).toBe(2);
    expect(sleeps).toEqual([75, 150]);                       // base, then doubled, x0.75 jitter
    expect(storage.log.filter((p) => p.endsWith('d0/1-0-1.u8z'))).toHaveLength(1);
  });

  test('retries run out: the job fails, and a second run resumes skipping what is up', async () => {
    const spool = await syntheticSpool();
    const storage = mockStorage();
    const e = () => httpError(503);
    storage.failPath(/v4\/f\/1-1-0\.f32z$/, e(), e(), e(), e());
    const first = makeUpload(spool, storage);
    await expect(first.job.run()).rejects.toThrow('HTTP 503');
    expect(first.job.getState().status).toBe(UPLOAD_STATUS.FAILED);
    expect(first.stages.map((s) => s.stage)).toEqual(['display_ready']);
    const displayUploads = storage.log.filter(isDisplay).length;
    expect(displayUploads).toBe(12 + 2 + 1 + 1);

    // a later session (new job object, same spool): stage 1 is recorded
    // as done in the spool, float32 bricks already up are skipped
    const upBefore = new Set(storage.log.filter(isF32));
    storage.log.length = 0;
    const second = makeUpload(spool, storage);
    const final = await second.job.run();
    expect(final.status).toBe(UPLOAD_STATUS.DONE);
    expect(storage.log.filter(isDisplay)).toHaveLength(0);
    for (const p of storage.log.filter(isF32)) expect(upBefore.has(p)).toBe(false);
    expect(final.f32.skipped).toBe(upBefore.size);
    expect(final.f32.done).toBe(12);
    expect(second.stages.map((s) => s.stage)).toEqual(['ready']);
  });

  test('a fatal error (403) fails at once without retrying', async () => {
    const spool = await syntheticSpool();
    const storage = mockStorage();
    storage.failPath(/d3\/0-0-0\.u8z$/, httpError(403, 'new row violates row-level security policy'));
    const { job, sleeps } = makeUpload(spool, storage);
    await expect(job.run()).rejects.toThrow(/row-level security/);
    expect(sleeps).toEqual([]);
    expect(job.getState().error).toMatch(/row-level security/);
  });

  test('resume skips objects already in Storage (listed) and objects reported as existing', async () => {
    const spool = await syntheticSpool();
    const storage = mockStorage();
    // a previous run got the coarse levels and part of level 0 up
    for (const k of ['v4/d3/0-0-0.u8z', 'v4/d2/0-0-0.u8z', 'v4/d1/0-0-0.u8z', 'v4/d0/0-0-0.u8z']) {
      storage.objects.set(`${DIR}/${k}`, new Uint8Array(1));
    }
    const list = storage.list;
    // listing misses one of them (eventual consistency): the upload
    // reports "exists" and that counts as done too
    storage.list = async (d) => (await list(d)).filter((n) => n !== '0-0-0.u8z' || !d.endsWith('d0'));
    const { job } = makeUpload(spool, storage);
    const final = await job.run();
    expect(final.status).toBe(UPLOAD_STATUS.DONE);
    expect(storage.log.filter((p) => /d[123]\//.test(p))).toEqual([expect.stringMatching(/d1\/1-0-0/)]);
    expect(final.display.done).toBe(16);
    expect(final.display.skipped).toBe(4);
  });

  test('pause holds new uploads until resume; in-flight ones finish', async () => {
    const spool = await syntheticSpool();
    const storage = mockStorage();
    const release = storage.holdUploads();
    const { job, states } = makeUpload(spool, storage);
    const run = job.run();
    await tick(); await tick();
    job.pause();
    release();
    for (let n = 0; n < 20; n++) await tick();              // eslint-disable-line no-await-in-loop
    const whilePaused = storage.log.length;
    expect(job.getState().status).toBe(UPLOAD_STATUS.PAUSED);
    expect(whilePaused).toBeLessThanOrEqual(3);                // only what was in flight
    for (let n = 0; n < 20; n++) await tick();              // eslint-disable-line no-await-in-loop
    expect(storage.log.length).toBe(whilePaused);
    job.resume();
    const final = await run;
    expect(final.status).toBe(UPLOAD_STATUS.DONE);
    expect(states).toContain(UPLOAD_STATUS.PAUSED);
  });

  test('a dropped connection pauses without spending retries, then continues', async () => {
    const spool = await syntheticSpool();
    const storage = mockStorage();
    const network = mockNetwork();
    let dropped = false;
    const upload = storage.upload;
    storage.upload = async (path, ...rest) => {
      if (!dropped && isF32(`/${path}`) && /v4\/f\//.test(path)) {
        dropped = true;
        network.goOffline();
        throw netError();
      }
      return upload(path, ...rest);
    };
    const { job, states, sleeps } = makeUpload(spool, storage, { network });
    const run = job.run();
    for (let n = 0; n < 200 && job.getState().status !== UPLOAD_STATUS.OFFLINE; n++) await tick(); // eslint-disable-line no-await-in-loop
    expect(job.getState().status).toBe(UPLOAD_STATUS.OFFLINE);
    for (let n = 0; n < 10; n++) await tick();              // eslint-disable-line no-await-in-loop
    const before = storage.log.length;                         // in-flight ones have landed
    for (let n = 0; n < 20; n++) await tick();              // eslint-disable-line no-await-in-loop
    expect(storage.log.length).toBe(before);                   // nothing goes while offline
    network.goOnline();
    const final = await run;
    expect(final.status).toBe(UPLOAD_STATUS.DONE);
    expect(final.retries).toBe(0);
    expect(sleeps.every((ms) => ms === OFFLINE_POLL_MS)).toBe(true);
    expect(states).toEqual(expect.arrayContaining([UPLOAD_STATUS.OFFLINE, UPLOAD_STATUS.RUNNING]));
    expect(network.listeners).toBe(0);                         // unsubscribed when done
  });

  test('a dead link that still reports online is treated as dropped after the retries', async () => {
    const spool = await syntheticSpool();
    const storage = mockStorage();
    storage.failPath(/f\/0-0-0\.f32z$/, netError(), netError(), netError(), netError(), netError());
    const { job, states } = makeUpload(spool, storage);
    const final = await job.run();
    expect(final.status).toBe(UPLOAD_STATUS.DONE);
    expect(states).toContain(UPLOAD_STATUS.OFFLINE);
  });

  test('cancel stops the job', async () => {
    const spool = await syntheticSpool();
    const storage = mockStorage();
    const release = storage.holdUploads();
    const { job } = makeUpload(spool, storage);
    const run = job.run();
    await tick();
    job.cancel();
    release();
    await expect(run).rejects.toThrow('Upload cancelled.');
    expect(job.getState().status).toBe(UPLOAD_STATUS.CANCELLED);
    expect(storage.log.some(isManifest)).toBe(false);
  });

  test('negative control: the ordering gate catches a float32 brick sent before the display manifest', async () => {
    const spool = await syntheticSpool();
    const storage = mockStorage();
    const { job } = makeUpload(spool, storage);
    await job.run();
    const bad = [...storage.log];
    const f = bad.findIndex(isF32);
    const [moved] = bad.splice(f, 1);
    bad.splice(1, 0, moved);
    const firstManifest = bad.findIndex(isManifest);
    expect(bad.slice(0, firstManifest).every(isDisplay)).toBe(false);
  });
});

// ---- conversion + job manager, end to end ------------------------------------

describe('conversion into the spool, then the background job', () => {
  const shape = { nIl: 21, nXl: 13, ns: 37 };
  const B = 8;
  const amp = (il, xl, s) => (il === 2 && xl === 3 ? NULL_VALUE : 800 * Math.sin(0.3 * s + 0.1 * il + 0.05 * xl));
  const fix = makeSegy({ ...shape, amp });
  const scan = {
    ...scanOf(shape), dtUs: 4000, coordScalar: -100, corners: { first: null, last: null }, affine: null,
  };

  function manager({ storage, rows, spools, network, unloadGuards }) {
    return createImportJobManager({
      prepare: async ({ file, name }) => {
        rows.set('vol-1', { id: 'vol-1', status: V4_STATUS.CONVERTING, name: name || file.name });
        return {
          volumeId: 'vol-1', userId: 'user-1', name: name || file.name,
          ingestRec: { fingerprint: { algo: 'x' }, pipeline: 'v4' },
          crsPlan: { needsTransform: false, storeTag: 'UNKNOWN' }, customDefs: {},
        };
      },
      updateRow: async (id, patch) => { rows.set(id, { ...rows.get(id), ...patch }); return rows.get(id); },
      getRow: async (id) => rows.get(id) || null,
      openSpool: async (id) => { if (!spools.has(id)) spools.set(id, memorySpool()); return spools.get(id); },
      listSpools: async () => [...spools.keys()],
      removeSpool: async (id) => { spools.delete(id); },
      convert: ({ spool, onProgress }) => convertToSpool({
        reader: bufferReader(fix.buffer), scan, spool, codec: ZLIB, brickSize: B, levels: 2, onProgress,
      }),
      storage,
      uploadOptions: { network: network || mockNetwork(), sleep: tick, retry: { attempts: 3, baseMs: 1, maxMs: 1 } },
      onBeforeUnload: (isPending) => { unloadGuards.push(isPending); return () => unloadGuards.splice(0); },
    });
  }

  test('rows go converting -> display_ready -> ready; the store reads back exactly', async () => {
    const storage = mockStorage();
    const rows = new Map();
    const spools = new Map();
    const unloadGuards = [];
    const m = manager({ storage, rows, spools, unloadGuards });
    const seen = [];
    m.subscribe(() => {
      const j = m.getSnapshot()[0];
      if (j && seen.at(-1) !== j.status) seen.push(j.status);
    });
    const statuses = [];
    const { volumeId, done } = await m.start({
      file: { name: 'survey.sgy', size: fix.buffer.byteLength },
      mapping: {}, scan, onRowChange: (s) => statuses.push(s),
    });
    expect(volumeId).toBe('vol-1');
    expect(unloadGuards).toHaveLength(1);                       // warns while pending
    expect(unloadGuards[0]()).toBe(true);
    await done;

    expect(statuses).toEqual([V4_STATUS.DISPLAY_READY, V4_STATUS.READY]);
    expect(seen).toEqual([V4_STATUS.CONVERTING, V4_STATUS.DISPLAY_READY, V4_STATUS.READY]);
    const row = rows.get('vol-1');
    expect(row.status).toBe(V4_STATUS.READY);
    expect(isOpenableVolume(row)).toBe(true);
    expect(isOpenableVolume({ status: V4_STATUS.CONVERTING })).toBe(false);
    expect(row.survey_meta.brick).toEqual([3, 2, 5]);
    expect(row.survey_meta.storage_bytes).toBe(row.survey_meta.v4.display_bytes + row.survey_meta.v4.f32_bytes);
    expect(m.getSnapshot()[0].phase).toBe(JOB_PHASE.DONE);
    expect(spools.size).toBe(0);                                 // local copy removed
    expect(unloadGuards).toHaveLength(0);                        // guard removed

    // the uploaded store, read through the v1 brick names, equals the
    // v1 transcoder's bricks bit for bit
    const manifest = JSON.parse(new TextDecoder().decode(storage.objects.get(`${DIR}/manifest.json`)));
    expect(manifest.manifest_version).toBe(4);
    expect(manifest.f32.complete).toBe(true);
    const fetchV4 = v4BrickFetcher(async (p) => storage.objects.get(p).slice().buffer, manifest, { inflate: ZLIB.inflate });
    const v1 = new Map();
    await transcodeToBricks(bufferReader(fix.buffer), { ...scan, sampled: false, regular: true, inlineSorted: true }, {
      brickSize: B, onBrick: ({ i, j, k, data }) => { v1.set(`${i}-${j}-${k}`, data); },
    });
    for (const [key, data] of v1) {
      // eslint-disable-next-line no-await-in-loop
      const got = new Float32Array(await fetchV4(`${DIR}/bricks/${key}.f32`));
      expect(new Uint32Array(got.buffer)).toEqual(new Uint32Array(data.buffer, data.byteOffset, data.length));
    }
    // and every display level made it up
    for (const lvl of manifest.display.levels) {
      expect([...storage.objects.keys()].filter((p) => p.includes(`/v4/d${lvl.level}/`))).toHaveLength(lvl.count);
    }
  });

  test('the slice worker reads the v4 store: slices from the display copy, float32 bricks exact, against the local SEG-Y read', async () => {
    const storage = mockStorage();
    const rows = new Map();
    const m = manager({ storage, rows, spools: new Map(), unloadGuards: [] });
    const { done } = await m.start({ file: { name: 's.sgy', size: 1 }, mapping: {}, scan });
    await done;
    const manifest = JSON.parse(new TextDecoder().decode(storage.objects.get(`${DIR}/manifest.json`)));
    expect(manifest.manifest_version).toBe(4);

    // the real worker handler, driven in-process; the oracle is the same
    // handler's local-file source, which Stream L gates bit for bit
    // against the brick-assembled slices
    const waiters = new Map();
    const onPost = (msg) => {
      if ((msg.type === 'result' || msg.type === 'error') && waiters.has(msg.id)) {
        waiters.get(msg.id)(msg);
        waiters.delete(msg.id);
      }
    };
    const handler = createSliceWorkerHandler(onPost, {
      makeReader: (file) => bufferReader(file.buf),
      makeFetcher: () => async (p) => {
        if (!storage.objects.has(p)) throw new Error(`no object ${p}`);
        return storage.objects.get(p).slice().buffer;
      },
      inflate: ZLIB.inflate,
    });
    let seq = 0;
    const send = (h, msg) => {
      seq += 1;
      const reply = new Promise((resolve) => { waiters.set(seq, resolve); });
      h.onMessage({ ...msg, id: seq });
      return reply;
    };
    const call = async (msg) => {
      const r = await send(handler, msg);
      if (r.type === 'error') throw new Error(`${r.code}: ${r.message}`);
      return r.value;
    };
    handler.onMessage({ type: 'init', budgetBytes: 64 * 1024 * 1024 });   // no reply
    await call({
      type: 'openBricks', sourceId: 'V4', manifest, storagePath: DIR, supabaseUrl: 'http://x', persistent: false,
    });
    await call({ type: 'openLocal', sourceId: 'L', file: { buf: fix.buffer, name: 's.sgy', size: fix.buffer.byteLength }, mapping: {} });
    const u32 = (s) => new Uint32Array(s.data.buffer, s.data.byteOffset, s.data.length);
    const cases = [
      ...Array.from({ length: shape.nIl }, (_, i) => ['inline', i]),
      ...Array.from({ length: shape.nXl }, (_, i) => ['xline', i]),
    ];
    // slices come from the 8-bit display copy: the local read through the
    // display codec, bit for bit
    const { clip } = manifest.display;
    for (const [orientation, index] of cases) {
      // eslint-disable-next-line no-await-in-loop
      const a = await call({ type: 'slice', sourceId: 'V4', orientation, index });
      // eslint-disable-next-line no-await-in-loop
      const b = await call({ type: 'slice', sourceId: 'L', orientation, index });
      expect(a.codec).toBe('u8');
      const e = b.data.map((v) => dequantizeU8(quantizeU8(v, clip), clip));
      expect(u32(a)).toEqual(new Uint32Array(e.buffer));
    }
    // computation reads float32 through the v4 wrap: every trace (assembled
    // from float32 bricks) exact
    for (let il = 0; il < shape.nIl; il++) {
      for (let xl = 0; xl < shape.nXl; xl++) {
        // eslint-disable-next-line no-await-in-loop
        const a = await call({ type: 'trace', sourceId: 'V4', il, xl });
        // eslint-disable-next-line no-await-in-loop
        const b = await call({ type: 'trace', sourceId: 'L', il, xl });
        expect(new Uint32Array(a.buffer, a.byteOffset, a.length)).toEqual(new Uint32Array(b.buffer, b.byteOffset, b.length));
      }
    }
    // negative control: the same store with the v4 wrap bypassed reads
    // v1 brick names that a v4 store does not have, and fails
    const bare = createSliceWorkerHandler(onPost, {
      makeFetcher: () => async (p) => {
        if (!storage.objects.has(p)) throw new Error(`no object ${p}`);
        return storage.objects.get(p).slice().buffer;
      },
      inflate: ZLIB.inflate,
    });
    const opened = await send(bare, {
      type: 'openBricks', sourceId: 'V1', manifest: { ...manifest, manifest_version: 1, display: undefined, f32: undefined },
      storagePath: DIR, supabaseUrl: 'http://x', persistent: false,
    });
    expect(opened.type).toBe('result');
    const r = await send(bare, { type: 'slice', sourceId: 'V1', orientation: 'inline', index: 0 });
    expect(r.type).toBe('error');
  });

  test('display_ready while float32 is still going: the store serves the display copy', async () => {
    const storage = mockStorage();
    const rows = new Map();
    const spools = new Map();
    // stop the float32 stage with a fatal error to freeze at display_ready
    storage.failPath(/v4\/f\/0-0-0\.f32z$/, httpError(403));
    const m = manager({ storage, rows, spools, unloadGuards: [] });
    const { done } = await m.start({ file: { name: 's.sgy', size: 1 }, mapping: {}, scan });
    await done;
    expect(rows.get('vol-1').status).toBe(V4_STATUS.DISPLAY_READY);
    expect(m.getSnapshot()[0].phase).toBe(JOB_PHASE.FAILED);
    expect(spools.has('vol-1')).toBe(true);                     // kept for a retry
    const manifest = JSON.parse(new TextDecoder().decode(storage.objects.get(`${DIR}/manifest.json`)));
    expect(manifest.display.complete).toBe(true);
    expect(manifest.f32.complete).toBe(false);
    const fetchV4 = v4BrickFetcher(async (p) => storage.objects.get(p).slice().buffer, manifest, { inflate: ZLIB.inflate });
    const got = new Float32Array(await fetchV4(`${DIR}/bricks/0-0-0.f32`));
    expect(got).toHaveLength(B ** 3);
    expect(Math.abs(got[1] - amp(0, 0, 1))).toBeLessThanOrEqual(manifest.display.clip / 254 + 1e-3);

    // retry (same session) finishes stage 2 only
    storage.log.length = 0;
    await m.resume('vol-1');
    expect(rows.get('vol-1').status).toBe(V4_STATUS.READY);
    expect(storage.log.some(isDisplay)).toBe(false);
  });

  test('a later session finds the spooled upload and resumes it without the SEG-Y', async () => {
    const storage = mockStorage();
    const rows = new Map();
    const spools = new Map();
    const network = mockNetwork();
    const first = manager({ storage, rows, spools, network, unloadGuards: [] });
    // the tab closes during stage 1: model it as the network dropping
    // for good after a few objects, then the page going away
    let sent = 0;
    const upload = storage.upload;
    storage.upload = async (...a) => {
      sent += 1;
      if (sent === 4) { network.goOffline(); throw netError(); }
      return upload(...a);
    };
    await first.start({ file: { name: 's.sgy', size: 1 }, mapping: {}, scan });
    for (let n = 0; n < 400 && first.getSnapshot()[0].phase !== JOB_PHASE.OFFLINE; n++) await tick(); // eslint-disable-line no-await-in-loop
    expect(first.getSnapshot()[0].phase).toBe(JOB_PHASE.OFFLINE);
    expect(rows.get('vol-1').status).toBe(V4_STATUS.CONVERTING);
    first.cancel('vol-1');                                       // the old page is gone
    for (let n = 0; n < 20; n++) await tick();                // eslint-disable-line no-await-in-loop
    expect(first.getSnapshot()[0].phase).toBe(JOB_PHASE.CANCELLED);
    const upFirst = [...storage.objects.keys()].filter(isDisplay).length;
    expect(upFirst).toBeGreaterThan(0);

    // new session: fresh manager, same spools and storage; the file is not needed
    storage.upload = upload;
    storage.log.length = 0;
    const second = manager({ storage, rows, spools, unloadGuards: [] });
    expect(await second.discover()).toEqual(['vol-1']);
    expect(second.getSnapshot()[0].phase).toBe(JOB_PHASE.RESUMABLE);
    await second.resume('vol-1');
    expect(rows.get('vol-1').status).toBe(V4_STATUS.READY);
    expect(second.getSnapshot()[0].phase).toBe(JOB_PHASE.DONE);
    // the objects the first session sent were skipped
    expect(storage.log.filter(isDisplay).length)
      .toBe([...storage.objects.keys()].filter(isDisplay).length - upFirst);
  });

  test('discovery drops spools with no finished conversion or no live row', async () => {
    const spools = new Map([['a', memorySpool()], ['b', memorySpool()], ['c', memorySpool()]]);
    await spools.get('b').putJson('job', { name: 'b' });
    await spools.get('c').putJson('job', { name: 'c' });
    const rows = new Map([['b', { id: 'b', status: V4_STATUS.READY }], ['c', { id: 'c', status: V4_STATUS.DISPLAY_READY }]]);
    const m = manager({ storage: mockStorage(), rows, spools, unloadGuards: [] });
    expect(await m.discover()).toEqual(['c']);
    expect([...spools.keys()]).toEqual(['c']);
  });

  test('a conversion that fails leaves no spool and says why', async () => {
    const storage = mockStorage();
    const rows = new Map();
    const spools = new Map();
    const bad = makeSegy({ ...shape, amp });
    new DataView(bad.buffer).setInt32(3600 + 20 * bad.traceBytes + 192, 999, false);
    const m = createImportJobManager({
      prepare: async () => ({
        volumeId: 'v', userId: 'u', name: 'n', ingestRec: {}, crsPlan: {}, customDefs: {},
      }),
      updateRow: async () => {},
      getRow: async () => null,
      openSpool: async (id) => { spools.set(id, memorySpool()); return spools.get(id); },
      listSpools: async () => [...spools.keys()],
      removeSpool: async (id) => { spools.delete(id); },
      convert: ({ spool }) => convertToSpool({
        reader: bufferReader(bad.buffer), scan, spool, codec: ZLIB, brickSize: B, levels: 1, clip: 1000,
      }),
      storage,
    });
    const { done } = await m.start({ file: { name: 'x', size: 1 }, mapping: {}, scan });
    await done;
    const j = m.getSnapshot()[0];
    expect(j.phase).toBe(JOB_PHASE.FAILED);
    expect(j.conversionFailed).toBe(true);
    expect(j.error).toMatch(/Trace 20 has \(il 101, xl 999\)/);
    expect(spools.size).toBe(0);
    expect(storage.log).toHaveLength(0);
  });
});

describe('helpers', () => {
  test('spool keys follow the plan of record object paths', () => {
    expect(spoolKeyOf({ kind: 'f32', level: 0, i: 1, j: 2, k: 3 })).toBe('v4/f/1-2-3.f32z');
    expect(spoolKeyOf({ kind: 'display', level: 2, i: 1, j: 2, k: 3 })).toBe('v4/d2/1-2-3.u8z');
  });

  test('conversion budget and deflate pool size', () => {
    expect(conversionBudgetBytes(8)).toBe(320 * 1024 * 1024);
    expect(conversionBudgetBytes(undefined)).toBe(320 * 1024 * 1024);
    expect(conversionBudgetBytes(16)).toBe(640 * 1024 * 1024);
    expect(deflatePoolSize(4)).toBe(2);
    expect(deflatePoolSize(16)).toBe(3);
    expect(deflatePoolSize(2)).toBe(1);
  });

  test('the deflate pool round-trips through its workers and keeps the caller buffer', async () => {
    const fakeWorker = () => {
      const w = {
        onmessage: null,
        terminated: false,
        postMessage({ id, buf }) {
          setImmediate(() => {
            const out = zlib.deflateRawSync(Buffer.from(buf));
            const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
            w.onmessage({ data: { id, buf: ab } });
          });
        },
        terminate() { w.terminated = true; },
      };
      return w;
    };
    const pool = createDeflatePool(2, fakeWorker);
    const inputs = Array.from({ length: 7 }, (_, n) => new Uint8Array(4096).map((_v, i) => (i * (n + 1)) & 255));
    const outs = await Promise.all(inputs.map((b) => pool.deflate(b)));
    outs.forEach((o, n) => expect(new Uint8Array(zlib.inflateRawSync(o))).toEqual(inputs[n]));
    expect(inputs[0].byteLength).toBe(4096);                     // not detached
    pool.close();
  });

  test('survey meta keeps every v1 field and adds the v4 sizes', () => {
    const scan = { ...scanOf({ nIl: 4, nXl: 3, ns: 5 }), dtUs: 4000, coordScalar: -100, corners: {}, affine: null };
    const record = {
      brickGrid: { ni: 1, nj: 1, nk: 1, brickSize: 8 }, stats: { min: 0 }, traceCount: 12, compression: 'deflate-raw',
      display: { clip: 5, clipPercentile: 99.9, clipSource: {}, percentiles: {}, histogram: {}, levels: [{ level: 0, dims: [4, 3, 5], grid: [1, 1, 1] }] },
      bricks: { display: { storedBytes: 10 }, f32: { storedBytes: 30 } },
    };
    const m = buildManifestV4({ volumeId: 'v', name: 'n', scan, transcode: record, sourceFileName: 'f', sourceFileSize: 1 });
    const meta = v4SurveyMeta(withV4Complete(m, { display: true }), record, { fingerprint: 1 });
    expect(meta).toMatchObject({
      il: m.geometry.il, xl: m.geometry.xl, ns: 5, dt_us: 4000, brick: [1, 1, 1], brick_size: 8,
      storage_bytes: 40, v4: { display_bytes: 10, f32_bytes: 30, clip: 5, levels: 1 }, ingest: { fingerprint: 1 },
    });
  });
});
