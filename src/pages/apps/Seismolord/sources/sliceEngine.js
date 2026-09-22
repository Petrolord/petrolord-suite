// The slice engine: every slice source, the one brick cache and the slice
// cache, under one memory budget. It runs inside workers/slice.worker.js
// (so decoding and slicing never touch the UI thread) and is plain
// JavaScript with injected I/O, so jest drives it directly.
//
// Budget (sources/memoryBudget.js): three quarters for bricks, one
// quarter for assembled slices. Bricks stream through the assembler
// (engine assembleSlices), which pins at most `assemblyConcurrency` of
// them; neighbouring slices in the same brick row are cut from the same
// bricks and kept in the slice cache, which is what makes the next inline
// or crossline instant.
//
// v4 stores (manifest_version 4, display copy uploaded) are viewed from
// the 8-bit display copy: the coarsest level of detail first (a few
// hundred KB for an inline) as a partial, then level 0; the levels in
// between are fetched alongside level 0, as further partials, only when
// level 0's measured pace says it is more than SHARPEN_IF_REMAINING_MS
// away (a slow link). Display bricks sit in the brick cache as their u8
// codes (a quarter of float32), so a survey's inline fits the budget and
// steps within a brick row are cache hits. The slice carries codec 'u8'
// and the clip; its amplitudes are the centres of the code bins (within
// clip / 254 inside the clip). Computation (getBrick, getTrace) still
// reads float32 through the v1 brick names.

import { BrickCache } from '../engine/brickCache';
import { decodeBrickPayload } from '../engine/brickCodec';
import {
  decodeU8Brick, u8DecodeTable, nativeInflateRaw, NO_COMPRESSION, DEFLATE_RAW,
} from '../engine/brickCodecV4';
import {
  assembleSlices, assembleTrace, bricksForSlice, geomFromManifest, brickKey, sliceTraceRms, sliceShape,
} from '../engine/sliceAssembly';
import { absAmplitudeSample } from '../engine/displayEnhance';
import { buildTraceIndex, manifestFromTraceIndex } from '../engine/traceIndex';
import { readLocalSlice, readLocalBrick, readLocalTrace } from '../engine/localSlice';
import { DEFAULT_BRICK_SIZE, displayBrickRelPath } from '../engine/manifest';
import { splitBudget } from './memoryBudget';
import {
  SOURCE_KINDS, SOURCE_ERRORS, sliceKey, sourceError, toEngineOrientation, isAborted,
  isOutOfMemory,
} from './sliceSource';

/** Samples kept per slice for percentile clipping (amplitudePercentile cap
 *  the viewer has always used). */
export const PERCENTILE_CAP = 1 << 18;

/** Neighbours cut from the same bricks on each side of a requested slice. */
export const SAME_ROW_NEIGHBOURS = 2;

/** v4 display copy: how long level 0 runs before its pace is measured,
 *  and the remaining time above which the levels between the coarsest
 *  and level 0 are fetched alongside it (a slow link). */
export const SHARPEN_CHECK_MS = 500;
export const SHARPEN_IF_REMAINING_MS = 5000;

const sliceBytes = (s) => s.data.byteLength + (s.traceRms ? s.traceRms.byteLength : 0)
  + (s.absSample ? s.absSample.byteLength : 0);

/** Byte-budgeted LRU of assembled slices. */
export class SliceCache {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.map = new Map();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) { this.stats.misses += 1; return null; }
    this.stats.hits += 1;
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }

  has(key) { return this.map.has(key); }

  set(key, slice) {
    if (this.map.has(key)) this.delete(key);
    const b = sliceBytes(slice);
    if (b > this.maxBytes) return;
    this.map.set(key, slice);
    this.bytes += b;
    for (const [k, v] of this.map) {
      if (this.bytes <= this.maxBytes) break;
      this.map.delete(k);
      this.bytes -= sliceBytes(v);
      this.stats.evictions += 1;
    }
  }

  delete(key) {
    const v = this.map.get(key);
    if (!v) return;
    this.map.delete(key);
    this.bytes -= sliceBytes(v);
  }

  deletePrefix(prefix) {
    for (const k of [...this.map.keys()]) if (k.startsWith(prefix)) this.delete(k);
  }

  clear() { this.map.clear(); this.bytes = 0; }
}

/** Evict the brick cache down to `targetBytes` (oldest first). */
function trimBrickCache(cache, targetBytes) {
  for (const [path, data] of cache.cache) {
    if (cache.bytes <= targetBytes) break;
    cache.cache.delete(path);
    cache.bytes -= data.byteLength;
    cache.stats.evictions += 1;
  }
}

/**
 * The display copy of a v4 manifest, when it is uploaded: per level the
 * lattice it is bricked on, and the code -> amplitude table.
 * @returns {null|{clip: number, table: Float32Array, maxLevel: number,
 *   compression: string, levels: Map<number, Object>}}
 */
export function displayCopyOf(manifest) {
  const d = manifest?.display;
  if ((manifest?.manifest_version ?? 1) !== 4 || !d?.complete || !Array.isArray(d.levels)) return null;
  const levels = new Map();
  for (const l of d.levels) {
    levels.set(l.level, {
      nIl: l.dims[0], nXl: l.dims[1], ns: l.dims[2], brickSize: d.brick_size, grid: l.bricks,
    });
  }
  if (!levels.has(0)) return null;
  return {
    clip: d.clip,
    table: u8DecodeTable(d.clip),
    maxLevel: Math.max(...levels.keys()),
    compression: d.compression || DEFLATE_RAW,
    levels,
  };
}

/**
 * A level-L slice (width and height both decimated by 2^L) spread over the
 * full slice's shape by repetition, the way a coarse local slice is.
 */
export function upsampleSlice(data, w, level, width, height) {
  if (level === 0) return data;
  const out = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    const src = (r >> level) * w;
    const dst = r * width;
    for (let c = 0; c < width; c++) out[dst + c] = data[src + (c >> level)];
  }
  return out;
}

/** Display codes (assembled into a float32 slice as 0..255) to amplitudes, in place. */
function decodeCodesInPlace(data, table) {
  for (let n = 0; n < data.length; n++) data[n] = table[data[n]];
  return data;
}

/** Attach what the main thread needs besides the samples. */
function finishSlice(s, extra) {
  return {
    ...s,
    codec: 'f32',
    absSample: absAmplitudeSample(s.data, { cap: PERCENTILE_CAP }),
    ...extra,
  };
}

export class SliceEngine {
  /**
   * @param {{budgetBytes: number, assemblyConcurrency?: number,
   *   maxConcurrentFetches?: number, sharpenCheckMs?: number,
   *   sharpenIfRemainingMs?: number}} opts
   */
  constructor({
    budgetBytes, assemblyConcurrency = 12, maxConcurrentFetches = 12,
    sharpenCheckMs = SHARPEN_CHECK_MS, sharpenIfRemainingMs = SHARPEN_IF_REMAINING_MS,
  }) {
    this.budgetBytes = budgetBytes;
    this.sharpenCheckMs = sharpenCheckMs;
    this.sharpenIfRemainingMs = sharpenIfRemainingMs;
    const split = splitBudget(budgetBytes);
    this.assemblyConcurrency = assemblyConcurrency;
    this.sources = new Map();
    this.routes = new Map();        // path prefix -> source
    this.cache = new BrickCache((path, signal) => this.#routeFetch(path, signal), {
      maxBytes: split.bricks, dtype: 'float32le', maxConcurrent: maxConcurrentFetches,
    });
    this.slices = new SliceCache(split.slices);
    this.jobs = new Map();          // slice key -> {promise, controller, waiters, bricks, background}
    this.holds = new Map();         // brick path -> pending direct requests (never cancelled by a scrub)
    this.peakBytes = 0;
  }

  setBudget(budgetBytes) {
    this.budgetBytes = budgetBytes;
    const split = splitBudget(budgetBytes);
    this.cache.maxBytes = split.bricks;
    this.slices.maxBytes = split.slices;
    trimBrickCache(this.cache, split.bricks);
  }

  stats() {
    return {
      budgetBytes: this.budgetBytes,
      brickBytes: this.cache.bytes,
      sliceBytes: this.slices.bytes,
      peakBytes: this.peakBytes,
      bricks: { ...this.cache.stats },
      slices: { ...this.slices.stats },
      sources: this.sources.size,
    };
  }

  #notePeak() {
    const now = this.cache.bytes + this.slices.bytes;
    if (now > this.peakBytes) this.peakBytes = now;
  }

  /** Brick fetch routed to the source that owns the path; returns an
   *  ArrayBuffer of float32 voxels (decoded here, in the worker). */
  async #routeFetch(path, signal) {
    let src = null;
    for (const [prefix, s] of this.routes) {
      if (path.startsWith(prefix)) { src = s; break; }
    }
    if (!src) throw new Error(`No source for brick ${path}`);
    if (src.kind === SOURCE_KINDS.LOCAL) {
      const m = /(\d+)-(\d+)-(\d+)$/.exec(path);
      const b = await readLocalBrick(src.reader, src.index, src.geom.brickSize,
        Number(m[1]), Number(m[2]), Number(m[3]), { signal });
      return b.buffer;
    }
    const raw = await src.fetcher(path, signal);
    if (src.display && path.startsWith(`${src.storagePath}/v4/d`)) {
      // display codes stored as they are: the brick cache wraps every
      // payload as float32, and a whole 64^3 u8 brick is a multiple of 4
      // bytes, so its byte accounting is exact; #displayBrick reads the
      // bytes back as codes
      const codes = await decodeU8Brick(raw, {
        compression: src.display.compression,
        inflate: src.display.compression === NO_COMPRESSION ? null : (src.inflate || nativeInflateRaw),
      });
      const b = src.display.levels.get(0).brickSize;
      if (codes.length !== b * b * b) {
        throw new Error(`Display brick ${path} has ${codes.length} codes, expected ${b * b * b}.`);
      }
      return codes.byteOffset === 0 && codes.byteLength === codes.buffer.byteLength
        ? codes.buffer : codes.slice().buffer;
    }
    const f32 = decodeBrickPayload(raw, src.dtype);
    return f32.byteOffset === 0 && f32.byteLength === f32.buffer.byteLength
      ? f32.buffer : f32.slice().buffer;
  }

  #brickPath(src, i, j, k) {
    return src.kind === SOURCE_KINDS.LOCAL
      ? `local:${src.id}/${i}-${j}-${k}` : brickKey(src.storagePath, i, j, k);
  }

  #displayPath(src, level, i, j, k) {
    return `${src.storagePath}/${displayBrickRelPath(level, i, j, k)}`;
  }

  /** One display brick's u8 codes (cache-owned view). */
  async #displayBrick(src, level, i, j, k) {
    const f = await this.cache.get(this.#displayPath(src, level, i, j, k));
    return new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
  }

  /** The source's prefixes in the brick cache and the route table. */
  #prefixes(src) {
    if (src.kind === SOURCE_KINDS.LOCAL) return [`local:${src.id}/`];
    return src.display ? [`${src.storagePath}/bricks/`, `${src.storagePath}/v4/d`]
      : [`${src.storagePath}/bricks/`];
  }

  #source(sourceId) {
    const s = this.sources.get(sourceId);
    if (!s) throw new Error('This survey is no longer open.');
    return s;
  }

  /**
   * Open a local SEG-Y: build the trace index from headers only.
   * @param {string} sourceId
   * @param {import('../engine/reader').ByteReader} reader
   * @param {{mapping?: Object, name?: string, fileSize?: number, signal?: AbortSignal,
   *   onProgress?: Function}} [opts]
   */
  async openLocal(sourceId, reader, opts = {}) {
    const t0 = Date.now();
    const index = await buildTraceIndex(reader, opts.mapping || {}, {
      signal: opts.signal, onProgress: opts.onProgress,
    });
    const manifest = manifestFromTraceIndex(index, { name: opts.name, fileSize: opts.fileSize });
    const b = DEFAULT_BRICK_SIZE;
    // virtual bricks: the same 64^3 lattice the conversion writes, cut
    // from the file on demand for tracking, traverses and extraction
    manifest.brick = {
      size: b,
      grid: [Math.ceil(index.il.count / b), Math.ceil(index.xl.count / b), Math.ceil(index.header.ns / b)],
      dtype: 'float32le',
      virtual: true,
    };
    const src = {
      id: sourceId, kind: SOURCE_KINDS.LOCAL, reader, index, manifest, geom: geomFromManifest(manifest),
    };
    this.sources.set(sourceId, src);
    this.routes.set(`local:${sourceId}/`, src);
    return {
      manifest,
      index: {
        mode: index.mode,
        sort: index.sort,
        warnings: index.warnings,
        headerReads: index.headerReads,
        deadTraces: index.deadTraces,
        ms: Date.now() - t0,
      },
      capabilities: { time: false },
    };
  }

  /**
   * Open an ingested volume's brick store (v1, or v4: slices from the
   * display copy once it is uploaded).
   * @param {string} sourceId
   * @param {{manifest: Object, storagePath: string,
   *   fetcher: (path: string, signal: AbortSignal) => Promise<ArrayBuffer>,
   *   inflate?: Function}} p inflate: deflate-raw for display bricks
   *   (defaults to the platform DecompressionStream)
   */
  openBricks(sourceId, {
    manifest, storagePath, fetcher, inflate,
  }) {
    const geom = geomFromManifest(manifest);   // version gate lives here
    const src = {
      id: sourceId,
      kind: SOURCE_KINDS.BRICKS,
      manifest,
      storagePath,
      fetcher,
      dtype: manifest.brick?.dtype || 'float32le',
      geom,
      display: displayCopyOf(manifest),
      inflate,
    };
    this.sources.set(sourceId, src);
    for (const p of this.#prefixes(src)) this.routes.set(p, src);
    return { capabilities: { time: true }, display: src.display ? { clip: src.display.clip, levels: src.display.maxLevel + 1 } : null };
  }

  close(sourceId) {
    const src = this.sources.get(sourceId);
    if (!src) return;
    for (const [key, job] of this.jobs) {
      if (key.startsWith(`${sourceId}|`)) job.controller.abort();
    }
    this.sources.delete(sourceId);
    for (const [prefix, s] of this.routes) if (s === src) this.routes.delete(prefix);
    this.slices.deletePrefix(`${sourceId}|`);
    const prefixes = this.#prefixes(src);
    // other sources may share a storage path (overlay of the same volume)
    const shared = [...this.sources.values()].some((s) => s.storagePath && s.storagePath === src.storagePath);
    if (!shared) {
      for (const [path, data] of [...this.cache.cache]) {
        if (prefixes.some((p) => path.startsWith(p))) {
          this.cache.cache.delete(path);
          this.cache.bytes -= data.byteLength;
        }
      }
    }
  }

  /** Coarse levels to show first for this request (local strided reads). */
  #levelsFor(src, o, requested) {
    if (requested > 0) return [requested];
    if (src.kind !== SOURCE_KINDS.LOCAL) return [0];
    const { index } = src;
    const contiguous = (index.sort === 'inline' && o === 'inline')
      || (index.sort === 'crossline' && o === 'xline');
    const n = o === 'inline' ? index.xl.count : index.il.count;
    return !contiguous && n >= 128 ? [2, 0] : [0];
  }

  #maxIndex(src, o) {
    const g = src.geom;
    return o === 'inline' ? g.nIl - 1 : o === 'xline' ? g.nXl - 1 : g.ns - 1;
  }

  /**
   * One slice. Serves from the slice cache, joins an identical request in
   * flight, and otherwise assembles it (bricks) or reads it (local file).
   *
   * @param {string} sourceId
   * @param {{orientation: string, index: number, level?: number, step?: number,
   *   background?: boolean}} req
   * @param {{signal?: AbortSignal, onPartial?: (slice: Object) => void,
   *   onProgress?: (done: number, total: number) => void}} [opts]
   *   onProgress: bricks assembled so far (brick sources), so a slow link
   *   shows progress and the caller can time out on silence only
   * @returns {Promise<Object>} slice (cache-owned: copy before transferring)
   */
  async getSlice(sourceId, req, { signal, onPartial, onProgress } = {}) {
    const src = this.#source(sourceId);
    const o = toEngineOrientation(req.orientation);
    const index = req.index;
    if (!(index >= 0 && index <= this.#maxIndex(src, o))) {
      throw new Error(`Slice index ${index} is outside this survey.`);
    }
    if (o === 'time' && src.kind === SOURCE_KINDS.LOCAL) {
      throw sourceError(SOURCE_ERRORS.TIME_NEEDS_CONVERSION,
        'Time slices are available after conversion, because each one needs the whole file.');
    }
    const key = sliceKey(sourceId, o, index, 0);
    const cached = this.slices.get(key);
    if (cached) return cached;

    let job = this.jobs.get(key);
    if (!job) job = this.#startJob(src, o, index, { ...req, partials: Boolean(onPartial) });
    else if (!req.background) job.background = false;
    job.waiters += 1;
    if (onPartial) job.partials.push(onPartial);
    if (job.partial && onPartial) onPartial(job.partial);
    if (onProgress) job.progress.push(onProgress);

    const onAbort = () => {
      job.waiters -= 1;
      if (job.waiters <= 0) job.controller.abort();
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      return await new Promise((resolve, reject) => {
        job.promise.then(resolve, reject);
        if (signal) {
          signal.addEventListener('abort', () => reject(sourceError(SOURCE_ERRORS.ABORTED, 'ABORTED')),
            { once: true });
          if (signal.aborted) reject(sourceError(SOURCE_ERRORS.ABORTED, 'ABORTED'));
        }
      });
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (onPartial) job.partials = job.partials.filter((f) => f !== onPartial);
      if (onProgress) job.progress = job.progress.filter((f) => f !== onProgress);
    }
  }

  #startJob(src, o, index, req) {
    const key = sliceKey(src.id, o, index, 0);
    const controller = new AbortController();
    const job = {
      controller, waiters: 0, background: Boolean(req.background), partials: [], partial: null,
      progress: [], bricks: null,
    };
    // a new foreground request cancels background work the user moved past
    if (!req.background) {
      for (const [k, j] of this.jobs) {
        if (j.background && k.startsWith(`${src.id}|`) && k !== key) j.controller.abort();
      }
    }
    // cancel the fetches the user moved away from right away: the
    // assembler's runners are parked on them and settle only when they do
    controller.signal.addEventListener('abort', () => this.#cancelOrphanedFetches(), { once: true });
    const run = async () => {
      if (src.kind === SOURCE_KINDS.LOCAL) {
        for (const level of this.#levelsFor(src, o, req.level || 0)) {
          const s = await readLocalSlice(src.reader, src.index, o, index, {
            level, signal: controller.signal,
          });
          if (level > 0) {
            job.partial = finishSlice(s, { final: false });
            for (const f of job.partials) f(job.partial);
          } else {
            const done = finishSlice(s, { final: true, level: 0 });
            this.slices.set(key, done);
            this.#notePeak();
            return done;
          }
        }
        throw new Error('No exact level was read.');
      }
      const progress = (done, total) => { for (const f of job.progress) f(done, total); };
      // bricks: cut same-row neighbours from the same fetch set
      const b = src.geom.brickSize;
      const step = Math.max(1, Math.floor(req.step || 1));
      const wanted = [index];
      if (o !== 'time' && !req.background) {
        for (let n = 1; n <= SAME_ROW_NEIGHBOURS; n++) {
          for (const nb of [index - n * step, index + n * step]) {
            if (nb < 0 || nb > this.#maxIndex(src, o)) continue;
            if (Math.floor(nb / b) !== Math.floor(index / b)) continue;
            if (this.slices.has(sliceKey(src.id, o, nb, 0)) || this.jobs.has(sliceKey(src.id, o, nb, 0))) continue;
            wanted.push(nb);
          }
        }
      }
      const d = src.display;
      const pathOf = d ? (i, j, k) => this.#displayPath(src, 0, i, j, k)
        : (i, j, k) => this.#brickPath(src, i, j, k);
      const level0 = bricksForSlice(src.geom, o, index).map(({ i, j, k }) => pathOf(i, j, k));
      job.bricks = new Set(level0);
      const getBrick = d ? (i, j, k) => this.#displayBrick(src, 0, i, j, k)
        : (i, j, k) => this.cache.get(pathOf(i, j, k));

      let finished = false;
      let done0 = 0;
      let total0 = 0;
      let started0 = 0;
      const startLevel0 = () => {
        started0 = Date.now();
        const p = assembleSlices(getBrick, src.geom, o, wanted, {
          concurrency: this.assemblyConcurrency,
          signal: controller.signal,
          onProgress: (dn, t) => { done0 = dn; total0 = t; progress(dn, t); },
        });
        p.then(() => { finished = true; }, () => { finished = true; });
        return p;
      };

      // v4 display copy, a caller that shows partials, level 0 not cached:
      // the coarsest level first; then level 0 at once, and the levels in
      // between alongside it only when level 0 is slow (a slow link), so a
      // fast one is not held up by bricks it replaces a moment later
      const showCoarse = Boolean(d) && req.partials && !req.background
        && level0.some((p) => !this.cache.cache.has(p));
      const shape = sliceShape(src.geom, o);
      const publishCoarse = async (L) => {
        const g = d.levels.get(L);
        if (!g) return;
        const idx = index >> L;
        for (const { i, j, k } of bricksForSlice(g, o, idx)) job.bricks.add(this.#displayPath(src, L, i, j, k));
        const out = await assembleSlices((i, j, k) => this.#displayBrick(src, L, i, j, k), g, o, [idx], {
          concurrency: this.assemblyConcurrency, signal: controller.signal,
        });
        if (finished) return;
        const c = out.get(idx);
        const data = upsampleSlice(decodeCodesInPlace(c.data, d.table), c.width, L, shape.width, shape.height);
        job.partial = finishSlice({
          data,
          width: shape.width,
          height: shape.height,
          traceRms: o === 'time' ? null : sliceTraceRms(data, shape.width, shape.height),
          nullValue: c.nullValue,
        }, {
          final: false, level: L, codec: 'u8', clip: d.clip,
        });
        for (const f of job.partials) f(job.partial);
      };

      let p0;
      if (showCoarse) {
        await publishCoarse(d.maxLevel);
        p0 = startLevel0();
        p0.catch(() => {});
        if (d.maxLevel > 1) {
          const early = await Promise.race([
            p0.then(() => true, () => true),
            new Promise((r) => { setTimeout(() => r(false), this.sharpenCheckMs); }),
          ]);
          if (!early && !finished) {
            const elapsed = Math.max(1, Date.now() - started0);
            const remainingMs = done0 > 0 ? ((total0 - done0) * elapsed) / done0 : Infinity;
            if (remainingMs > this.sharpenIfRemainingMs) {
              for (let L = d.maxLevel - 1; L >= 1 && !finished; L--) {
                await publishCoarse(L);
              }
            }
          }
        }
      } else {
        p0 = startLevel0();
      }
      const out = await p0;
      let primary = null;
      for (const [idx, raw] of out) {
        let s = raw;
        if (d) {
          decodeCodesInPlace(s.data, d.table);
          s = { ...s, traceRms: o === 'time' ? null : sliceTraceRms(s.data, s.width, s.height) };
        }
        const done = finishSlice(s, d ? {
          final: true, level: 0, codec: 'u8', clip: d.clip,
        } : { final: true, level: 0 });
        if (idx === index) primary = done;
        else this.slices.set(sliceKey(src.id, o, idx, 0), done);
      }
      this.slices.set(key, primary);   // primary last = most recent in LRU
      this.#notePeak();
      return primary;
    };
    job.promise = run()
      .catch((e) => {
        if (controller.signal.aborted || isAborted(e)) {
          throw sourceError(SOURCE_ERRORS.ABORTED, 'ABORTED');
        }
        if (isOutOfMemory(e)) {
          // shed what we hold so the next attempt can succeed
          this.slices.clear();
          trimBrickCache(this.cache, Math.floor(this.cache.maxBytes / 2));
          throw sourceError(SOURCE_ERRORS.OUT_OF_MEMORY, e.message);
        }
        throw e;
      })
      .finally(() => {
        if (this.jobs.get(key) === job) this.jobs.delete(key);
      });
    job.promise.catch(() => {});
    this.jobs.set(key, job);
    return job;
  }

  /** Abort brick fetches no live job needs any more (scrub cancellation). */
  #cancelOrphanedFetches() {
    const keep = new Set();
    for (const j of this.jobs.values()) {
      if (j.bricks && !j.controller.signal.aborted) for (const p of j.bricks) keep.add(p);
    }
    for (const p of this.holds.keys()) keep.add(p);
    this.cache.cancelPendingExcept(keep);
  }

  /**
   * Warm the slices either side of `index` at the current step, one at a
   * time, in the background. Any foreground request cancels them.
   */
  prefetch(sourceId, { orientation, index, step = 1 }) {
    const src = this.sources.get(sourceId);
    if (!src) return;
    const o = toEngineOrientation(orientation);
    if (o === 'time' && src.kind === SOURCE_KINDS.LOCAL) return;
    const s = Math.max(1, Math.floor(step));
    const targets = [index + s, index - s]
      .filter((n) => n >= 0 && n <= this.#maxIndex(src, o))
      .filter((n) => !this.slices.has(sliceKey(sourceId, o, n, 0)));
    (async () => {
      for (const n of targets) {
        try {
          await this.getSlice(sourceId, { orientation: o, index: n, background: true });
        } catch { return; /* cancelled or failed: foreground will retry */ }
      }
    })();
  }

  /** One brick (cache-owned). Direct requests (tracking, traverses,
   *  extraction) are held, so a slice scrub never cancels them. */
  async getBrick(sourceId, i, j, k) {
    const src = this.#source(sourceId);
    const path = this.#brickPath(src, i, j, k);
    this.holds.set(path, (this.holds.get(path) || 0) + 1);
    try {
      return await this.cache.get(path);
    } finally {
      const n = this.holds.get(path) - 1;
      if (n > 0) this.holds.set(path, n);
      else this.holds.delete(path);
    }
  }

  /** One full trace. */
  async getTrace(sourceId, ilIdx, xlIdx) {
    const src = this.#source(sourceId);
    if (src.kind === SOURCE_KINDS.LOCAL) return readLocalTrace(src.reader, src.index, ilIdx, xlIdx);
    return assembleTrace((i, j, k) => this.getBrick(sourceId, i, j, k), src.geom, ilIdx, xlIdx);
  }
}
