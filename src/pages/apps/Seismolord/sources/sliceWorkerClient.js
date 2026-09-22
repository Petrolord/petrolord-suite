// Main-thread side of the slice worker: opens sources and hands the viewer
// SliceSource proxies. Every request has a timeout and an error state;
// if the worker dies (out of memory is the usual cause) every pending
// request fails with WORKER_CRASHED, and the next request starts a fresh
// worker and reopens its source, so Retry works.

import { createSliceWorker } from '../services/sliceWorkerFactory';
import { cacheBudgetBytes, reportedDeviceMemory } from './memoryBudget';
import { SOURCE_KINDS, SOURCE_ERRORS, sourceError } from './sliceSource';

/** A slice fails when nothing arrives for this long. It counts silence,
 *  not total time: an uncached float32 inline is hundreds of MB, which a
 *  10 Mbps link needs minutes for, and every brick that lands re-arms it. */
export const SLICE_TIMEOUT_MS = 60000;
export const BRICK_TIMEOUT_MS = 60000;
/** An index build fails when no progress arrives for this long. */
export const INDEX_IDLE_TIMEOUT_MS = 30000;

let sourceSeq = 0;
const nextSourceId = (kind) => {
  sourceSeq += 1;
  return `${kind}-${Date.now().toString(36)}-${sourceSeq}`;
};

export class SliceWorkerClient {
  /**
   * @param {{createWorker?: () => Worker, budgetBytes?: number,
   *   sliceTimeoutMs?: number, indexIdleTimeoutMs?: number}} [opts]
   */
  constructor(opts = {}) {
    this.createWorker = opts.createWorker || createSliceWorker;
    this.budgetBytes = opts.budgetBytes || cacheBudgetBytes(reportedDeviceMemory());
    this.sliceTimeoutMs = opts.sliceTimeoutMs || SLICE_TIMEOUT_MS;
    this.indexIdleTimeoutMs = opts.indexIdleTimeoutMs || INDEX_IDLE_TIMEOUT_MS;
    this.worker = null;
    this.generation = 0;
    this.seq = 0;
    this.pending = new Map();      // id -> {resolve, reject, onPartial, onProgress, timer, ...}
    this.tokenGetters = new Map(); // sourceId -> getToken
  }

  #ensureWorker() {
    if (this.worker) return this.worker;
    const w = this.createWorker();
    this.generation += 1;
    w.onmessage = (e) => this.#onMessage(e.data);
    w.onerror = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      this.#crash(e?.message || 'The slice worker stopped.');
    };
    w.onmessageerror = () => this.#crash('The slice worker sent a message that could not be read.');
    w.postMessage({ type: 'init', budgetBytes: this.budgetBytes });
    this.worker = w;
    return w;
  }

  /** The worker died: fail everything pending; the next call restarts it. */
  #crash(message) {
    const w = this.worker;
    this.worker = null;
    try { w?.terminate?.(); } catch { /* already gone */ }
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.reject(sourceError(SOURCE_ERRORS.WORKER_CRASHED, message));
    }
  }

  #onMessage(msg) {
    if (!msg) return;
    if (msg.type === 'token-request') {
      const get = this.tokenGetters.get(msg.sourceId);
      Promise.resolve()
        .then(() => (get ? get(msg.force) : Promise.reject(new Error('No sign-in for this survey.'))))
        .then((token) => this.worker?.postMessage({ type: 'token', id: msg.id, token }))
        .catch((e) => this.worker?.postMessage({ type: 'token', id: msg.id, error: e.message }));
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'partial') {
      if (p.idleMs) this.#arm(msg.id, p, p.idleMs);
      if (p.onPartial) p.onPartial(msg.slice);
      return;
    }
    if (msg.type === 'progress') {
      if (p.idleMs) this.#arm(msg.id, p, p.idleMs);
      if (p.onProgress) p.onProgress(msg.done, msg.total, msg.phase);
      return;
    }
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    if (msg.type === 'result') p.resolve(msg.value);
    else if (msg.type === 'error') p.reject(sourceError(msg.code, msg.message));
  }

  #arm(id, p, ms) {
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (!this.pending.has(id)) return;
      this.pending.delete(id);
      this.worker?.postMessage({ type: 'cancel', id });
      p.reject(sourceError(SOURCE_ERRORS.TIMEOUT, p.timeoutMessage || 'The request took too long.'));
    }, ms);
  }

  /**
   * @param {Object} msg
   * @param {{signal?: AbortSignal, timeoutMs?: number, idleMs?: number,
   *   onPartial?: Function, onProgress?: Function, transfer?: Transferable[],
   *   timeoutMessage?: string}} [opts]
   */
  request(msg, opts = {}) {
    const w = this.#ensureWorker();
    this.seq += 1;
    const id = this.seq;
    return new Promise((resolve, reject) => {
      const p = {
        resolve, reject, onPartial: opts.onPartial, onProgress: opts.onProgress,
        idleMs: opts.idleMs, timeoutMessage: opts.timeoutMessage, timer: null,
      };
      if (opts.signal) {
        if (opts.signal.aborted) {
          reject(sourceError(SOURCE_ERRORS.ABORTED, 'ABORTED'));
          return;
        }
        opts.signal.addEventListener('abort', () => {
          if (!this.pending.has(id)) return;
          clearTimeout(p.timer);
          this.pending.delete(id);
          this.worker?.postMessage({ type: 'cancel', id });
          reject(sourceError(SOURCE_ERRORS.ABORTED, 'ABORTED'));
        }, { once: true });
      }
      this.pending.set(id, p);
      const ms = opts.idleMs || opts.timeoutMs;
      if (ms) this.#arm(id, p, ms);
      w.postMessage({ ...msg, id }, opts.transfer || []);
    });
  }

  /**
   * Open the SEG-Y the user picked, straight from disk.
   * @param {File|Blob} file
   * @param {{mapping?: Object, name?: string, signal?: AbortSignal,
   *   onProgress?: (done: number, total: number, phase: string) => void}} [opts]
   * @returns {Promise<SliceSourceProxy>}
   */
  async openLocal(file, opts = {}) {
    const sourceId = nextSourceId(SOURCE_KINDS.LOCAL);
    const open = () => this.request({
      type: 'openLocal', sourceId, file, mapping: opts.mapping, name: opts.name ?? file?.name,
    }, {
      signal: opts.signal,
      onProgress: opts.onProgress,
      idleMs: this.indexIdleTimeoutMs,
      timeoutMessage: 'Reading the trace headers stopped making progress.',
    });
    const info = await open();
    return this.#proxy(sourceId, SOURCE_KINDS.LOCAL, info, open);
  }

  /**
   * Open an ingested volume's brick store.
   * @param {{manifest: Object, storagePath: string, supabaseUrl: string,
   *   getToken: (force?: boolean) => Promise<string>, persistent?: boolean}} p
   * @returns {Promise<SliceSourceProxy>}
   */
  async openBricks({
    manifest, storagePath, supabaseUrl, getToken, persistent = true,
  }) {
    const sourceId = nextSourceId(SOURCE_KINDS.BRICKS);
    this.tokenGetters.set(sourceId, getToken);
    const open = () => this.request({
      type: 'openBricks', sourceId, manifest, storagePath, supabaseUrl, persistent,
    }, { timeoutMs: this.sliceTimeoutMs });
    const info = await open();
    return this.#proxy(sourceId, SOURCE_KINDS.BRICKS, { ...info, manifest }, open);
  }

  /** Worker cache statistics (benchmark harness). */
  stats() {
    return this.request({ type: 'stats' }, { timeoutMs: 5000 });
  }

  #proxy(sourceId, kind, info, reopen) {
    const client = this;
    let generation = this.generation;
    const ready = async () => {
      if (generation === client.generation && client.worker) return;
      await reopen();
      generation = client.generation;
    };
    const proxy = {
      id: sourceId,
      kind,
      manifest: info.manifest,
      index: info.index || null,
      capabilities: info.capabilities || { time: kind !== SOURCE_KINDS.LOCAL },
      budgetBytes: client.budgetBytes,
      closed: false,
      /**
       * @param {{orientation: string, index: number, level?: number, step?: number,
       *   prefetch?: boolean}} req
       * @param {{signal?: AbortSignal, onPartial?: Function, timeoutMs?: number,
       *   onProgress?: (done: number, total: number) => void}|AbortSignal} [o]
       */
      async getSlice(req, o = {}) {
        const opts = o instanceof AbortSignal ? { signal: o } : o;
        await ready();
        return client.request({
          type: 'slice',
          sourceId,
          orientation: req.orientation,
          index: req.index,
          level: req.level || 0,
          step: req.step || 1,
          prefetch: req.prefetch !== false,
        }, {
          signal: opts.signal,
          onPartial: opts.onPartial,
          onProgress: opts.onProgress,
          idleMs: opts.timeoutMs || client.sliceTimeoutMs,
          timeoutMessage: 'Loading the slice stopped making progress.',
        });
      },
      async getBrick(i, j, k, o = {}) {
        await ready();
        return client.request({
          type: 'brick', sourceId, i, j, k,
        }, { signal: o.signal, timeoutMs: BRICK_TIMEOUT_MS });
      },
      async getTrace(il, xl, o = {}) {
        await ready();
        return client.request({
          type: 'trace', sourceId, il, xl,
        }, { signal: o.signal, timeoutMs: BRICK_TIMEOUT_MS });
      },
      close() {
        if (proxy.closed) return;
        proxy.closed = true;
        client.tokenGetters.delete(sourceId);
        client.worker?.postMessage({ type: 'close', sourceId });
      },
    };
    return proxy;
  }
}

let shared = null;
/** The one client (and so the one worker and one budget) of this tab. */
export function getSliceClient() {
  if (!shared) shared = new SliceWorkerClient();
  return shared;
}

/**
 * @typedef {Object} SliceSourceProxy
 * @property {string} id
 * @property {'local'|'bricks'} kind
 * @property {Object} manifest
 * @property {{time: boolean}} capabilities
 * @property {number} budgetBytes
 * @property {(req: Object, opts?: Object) => Promise<Object>} getSlice
 * @property {(i: number, j: number, k: number) => Promise<Float32Array>} getBrick
 * @property {(il: number, xl: number) => Promise<Float32Array>} getTrace
 * @property {() => void} close
 */
