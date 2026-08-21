/**
 * W2.1 attribute-volume service: registration (kind/parent provenance),
 * quota preflight from the parent lattice, the worker drive (uploads +
 * one-ack-per-upload + token refresh), v2 manifest write, the final
 * 'ready' flip with storage accounting, and best-effort cleanup on
 * failure (a broken derived job deletes itself; recompute is the resume
 * story).
 */

const mockFrom = jest.fn();
const mockStorageFrom = jest.fn();
const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...a) => mockFrom(...a),
    storage: { from: (...a) => mockStorageFrom(...a) },
    auth: {
      getUser: (...a) => mockGetUser(...a),
      getSession: (...a) => mockGetSession(...a),
    },
  },
}));

import {
  computeAttributeVolume, defaultDerivedName, derivedStorageBytes,
} from '@/pages/apps/Seismolord/services/attributeJobService';

const PARENT_MANIFEST = {
  manifest_version: 1,
  app: 'seismolord',
  volume_id: 'parent-1',
  name: 'Dome Survey',
  geometry: {
    il: { min: 100, max: 104, step: 1, count: 5 },
    xl: { min: 200, max: 205, step: 1, count: 6 },
    ns: 10,
    dt_us: 4000,
    corners: [[0, 0], [1, 0], [0, 1]],
  },
  brick: {
    size: 4,
    grid: [2, 2, 3],
    count: 12,
    dtype: 'float32le',
    layout: 'il-major,xl,sample-fastest',
    path_pattern: 'bricks/{i}-{j}-{k}.f32',
    null_value: 1.0e30,
  },
  stats: { min: -1, max: 1, mean: 0, rms: 0.5, live_samples: 300 },
  trace_count: 30,
};

const PARENT_ROW = {
  id: 'parent-1', name: 'Dome Survey', status: 'ready',
  storage_path: 'u1/parent-1', crs: 'EPSG:32631',
};

const JOB_RESULT = {
  brickGrid: { ni: 2, nj: 2, nk: 3, brickSize: 4 },
  stats: { min: 0, max: 2, mean: 1, rms: 1.2, live_samples: 300 },
  traceCount: 30,
};

/** Worker double: on 'compute', emits N bricks (parking on acks like the
 *  real channel would) then compute:done. On 'cancel', emits error. */
class FakeWorker {
  constructor({ bricks = 3, failWith = null } = {}) {
    this.bricks = bricks;
    this.failWith = failWith;
    this.onmessage = null;
    this.onerror = null;
    this.acks = 0;
    this.cancelled = false;
    this.config = null;
    this.terminated = false;
  }

  emit(msg) { setTimeout(() => this.onmessage && this.onmessage({ data: msg }), 0); }

  postMessage(msg) {
    if (msg.type === 'brick:ack') { this.acks += 1; return; }
    if (msg.type === 'cancel') {
      if (!this.cancelled) {
        this.cancelled = true;
        this.emit({ type: 'error', id: msg.id, message: 'Attribute computation cancelled.' });
      }
      return;
    }
    if (msg.type !== 'compute') return;
    this.config = msg.config;
    const { id } = msg;
    if (this.failWith) {
      this.emit({ type: 'error', id, message: this.failWith });
      return;
    }
    // yield between bricks so a mid-job cancel interleaves like the real
    // worker (which stops computing when the cancel message lands)
    (async () => {
      for (let n = 0; n < this.bricks && !this.cancelled; n++) {
        this.emit({
          type: 'brick', id, i: n, j: 0, k: 0, buffer: new ArrayBuffer(16),
        });
        this.emit({
          type: 'progress', id, phase: 'compute', done: n + 1, total: this.bricks,
        });
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!this.cancelled) this.emit({ type: 'compute:done', id, result: JOB_RESULT });
    })();
  }

  terminate() { this.terminated = true; }
}

/** Records every supabase interaction behind chainable builders. */
function wireSupabase({ quotaRows = [], insertError = null } = {}) {
  const log = {
    inserted: null, updated: null, deletedId: null, uploads: [], removed: [],
  };
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-1' } } });

  mockFrom.mockImplementation(() => ({
    select: (cols) => {
      // quota accounting now filters .eq('user_id', ...) on own rows
      if (cols === 'survey_meta') {
        return { eq: () => Promise.resolve({ data: quotaRows, error: null }) };
      }
      return Promise.resolve({ data: [], error: null });
    },
    insert: (payload) => ({
      select: () => ({
        single: () => {
          if (insertError) return Promise.resolve({ data: null, error: { message: insertError } });
          log.inserted = payload;
          return Promise.resolve({ data: { ...payload }, error: null });
        },
      }),
    }),
    update: (patch) => ({
      eq: () => ({
        select: () => ({
          single: () => {
            log.updated = patch;
            return Promise.resolve({ data: { id: 'ignored', ...patch }, error: null });
          },
        }),
      }),
    }),
    delete: () => ({
      eq: (col, val) => {
        log.deletedId = val;
        return Promise.resolve({ error: null });
      },
    }),
  }));

  mockStorageFrom.mockImplementation(() => ({
    getPublicUrl: () => ({
      data: { publicUrl: 'https://proj.supabase.co/storage/v1/object/public/seismic/x' },
    }),
    upload: (path) => {
      log.uploads.push(path);
      return Promise.resolve({ error: null });
    },
    update: () => Promise.resolve({ error: null }),
    list: () => Promise.resolve({ data: [], error: null }),
    remove: (paths) => {
      log.removed.push(...paths);
      return Promise.resolve({ error: null });
    },
  }));

  return log;
}

// jsdom's crypto has no randomUUID
let uuidCounter = 0;
beforeAll(() => {
  if (!globalThis.crypto) globalThis.crypto = {};
  if (!globalThis.crypto.randomUUID) {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
    });
  }
});

beforeEach(() => {
  mockFrom.mockReset();
  mockStorageFrom.mockReset();
  mockGetUser.mockReset();
  mockGetSession.mockReset();
});

describe('helpers', () => {
  test('derivedStorageBytes is the parent brick-store footprint', () => {
    expect(derivedStorageBytes(PARENT_MANIFEST)).toBe(12 * 4 ** 3 * 4);
    expect(() => derivedStorageBytes({})).toThrow(/brick block/);
  });

  test('defaultDerivedName strips the label parenthetical and adds the window', () => {
    expect(defaultDerivedName('Dome', 'envelope')).toBe('Dome [Envelope]');
    expect(defaultDerivedName('Dome', 'rms', { windowMs: 80 })).toBe('Dome [RMS amplitude 80 ms]');
    expect(defaultDerivedName('Dome', 'variance', { windowMs: 40 })).toBe('Dome [Variance 40 ms]');
  });
});

describe('computeAttributeVolume', () => {
  test('happy path: registers, uploads bricks + manifest, flips to ready', async () => {
    const log = wireSupabase();
    const worker = new FakeWorker({ bricks: 3 });
    const progress = [];

    const { manifest, volumeId } = await computeAttributeVolume({
      parent: PARENT_ROW,
      parentManifest: PARENT_MANIFEST,
      attribute: { name: 'envelope' },
      workerFactory: () => worker,
      onProgress: (p) => progress.push(p),
    });

    // registration carried the provenance
    expect(log.inserted).toMatchObject({
      user_id: 'u1',
      status: 'ingesting',
      kind: 'attribute',
      parent_volume_id: 'parent-1',
      attribute_params: { name: 'envelope', params: {} },
      crs: 'EPSG:32631',
      name: 'Dome Survey [Envelope]',
    });

    // worker was pointed at the PARENT's brick store
    expect(worker.config.storagePath).toBe('u1/parent-1');
    expect(worker.config.token).toBe('tok-1');
    expect(worker.config.attribute).toEqual({ name: 'envelope', params: {} });

    // one ack per uploaded brick, bricks under the NEW volume's dir
    expect(worker.acks).toBe(3);
    const brickUploads = log.uploads.filter((p) => p.includes('/bricks/'));
    expect(brickUploads).toHaveLength(3);
    expect(volumeId).toBe(log.inserted.id);
    expect(brickUploads[0]).toMatch(new RegExp(`^u1/${volumeId}/bricks/`));
    expect(log.uploads.some((p) => p.endsWith('manifest.json'))).toBe(true);

    // v2 manifest with verbatim parent geometry
    expect(manifest.manifest_version).toBe(2);
    expect(manifest.kind).toBe('attribute');
    expect(manifest.parent.volume_id).toBe('parent-1');
    expect(manifest.geometry).toEqual(PARENT_MANIFEST.geometry);
    expect(manifest.stats).toEqual(JOB_RESULT.stats);

    // ready flip with storage accounting
    expect(log.updated.status).toBe('ready');
    expect(log.updated.survey_meta.storage_bytes).toBe(12 * 4 ** 3 * 4);
    expect(log.updated.survey_meta.attribute).toEqual({ name: 'envelope', params: {} });
    expect(worker.terminated).toBe(true);
    expect(progress.some((p) => p.phase === 'upload')).toBe(true);
    expect(log.deletedId).toBeNull();
  });

  test('a neighborhood (discontinuity) attribute registers and completes too', async () => {
    const log = wireSupabase();
    const worker = new FakeWorker({ bricks: 2 });
    const { manifest } = await computeAttributeVolume({
      parent: PARENT_ROW,
      parentManifest: PARENT_MANIFEST,
      attribute: { name: 'variance', params: { windowMs: 40, radius: 1 } },
      workerFactory: () => worker,
    });
    expect(log.inserted.attribute_params).toEqual({
      name: 'variance', params: { windowMs: 40, radius: 1 },
    });
    expect(worker.config.attribute.name).toBe('variance');
    expect(manifest.attribute).toEqual({ name: 'variance', params: { windowMs: 40, radius: 1 } });
    expect(log.updated.status).toBe('ready');
  });

  test('quota preflight refuses before any registration', async () => {
    const log = wireSupabase({
      quotaRows: [{ survey_meta: { storage_bytes: 20 * 1024 ** 3 } }],
    });
    await expect(computeAttributeVolume({
      parent: PARENT_ROW,
      parentManifest: PARENT_MANIFEST,
      attribute: { name: 'envelope' },
      workerFactory: () => new FakeWorker(),
    })).rejects.toThrow(/quota/i);
    expect(log.inserted).toBeNull();
  });

  test('refuses a non-ready parent and unknown attributes', async () => {
    wireSupabase();
    await expect(computeAttributeVolume({
      parent: { ...PARENT_ROW, status: 'ingesting' },
      parentManifest: PARENT_MANIFEST,
      attribute: { name: 'envelope' },
      workerFactory: () => new FakeWorker(),
    })).rejects.toThrow(/\(ready\) parent/);
    await expect(computeAttributeVolume({
      parent: PARENT_ROW,
      parentManifest: PARENT_MANIFEST,
      attribute: { name: 'wavelet-magic' },
      workerFactory: () => new FakeWorker(),
    })).rejects.toThrow(/Unknown attribute/);
  });

  test('worker failure cleans up the registered row and its storage', async () => {
    const log = wireSupabase();
    await expect(computeAttributeVolume({
      parent: PARENT_ROW,
      parentManifest: PARENT_MANIFEST,
      attribute: { name: 'rms', params: { windowMs: 80 } },
      workerFactory: () => new FakeWorker({ failWith: 'brick fetch failed (500)' }),
    })).rejects.toThrow('brick fetch failed (500)');
    expect(log.inserted).not.toBeNull();
    expect(log.deletedId).toBe(log.inserted.id);
  });

  test('cancellation via the token cancels the worker and cleans up', async () => {
    const log = wireSupabase();
    const worker = new FakeWorker({ bricks: 50 });
    const cancelToken = {};
    const promise = computeAttributeVolume({
      parent: PARENT_ROW,
      parentManifest: PARENT_MANIFEST,
      attribute: { name: 'envelope' },
      workerFactory: () => worker,
      cancelToken,
      onProgress: () => { cancelToken.cancelled = true; },
    });
    await expect(promise).rejects.toThrow(/cancelled/i);
    expect(worker.cancelled).toBe(true);
    expect(log.deletedId).toBe(log.inserted.id);
  });
});
