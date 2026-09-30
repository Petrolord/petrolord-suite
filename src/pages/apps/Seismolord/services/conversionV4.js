// Conversion to a manifest v4 brick store, spooled locally (large-survey
// plan, section 3). The conversion worker is a postMessage shell around
// convertToSpool; everything here is plain and jest-tested.
//
// One conversion reads the SEG-Y in sort order (two passes over the file
// for the tester's survey at the 320 MiB budget, one at 640 MiB) and
// writes every brick of both copies into the spool. The full geometry
// scan the v1 ingest ran first (a whole extra read of the file) is not
// needed: the transcoder verifies every trace header against the grid
// the preview scan predicted, and stops with both positions named on the
// first disagreement.

import {
  gridFromScan, sampleAmplitudeClip, transcodeV4, V4_DEFAULT_BUDGET_BYTES,
} from '../engine/brickTranscodeV4';
import { displayBrickRelPath, f32BrickRelPath } from '../engine/manifest';
import { buildTraceIndex } from '../engine/traceIndex';
import { needsTraceLattice } from '../lib/segyDoor';

const MiB = 1024 * 1024;

/** Spool key (and Storage path under the volume dir) of one brick. */
export const spoolKeyOf = (b) => (b.kind === 'f32'
  ? f32BrickRelPath(b.i, b.j, b.k)
  : displayBrickRelPath(b.level, b.i, b.j, b.k));

/**
 * Conversion memory budget from the device's reported memory
 * (navigator.deviceMemory is capped at 8 by browsers, so "8" means 8 GB
 * or more). 320 MiB keeps the tab under 1.5 GB on an 8 GB laptop with
 * the viewer's cache alongside; 640 MiB reads the tester's file once
 * instead of twice where the machine reports more (never today, since
 * the value is capped, but the plan allows it when a browser reports it).
 * @param {?number} deviceMemoryGb
 */
export function conversionBudgetBytes(deviceMemoryGb) {
  if (Number.isFinite(deviceMemoryGb) && deviceMemoryGb > 8) return 640 * MiB;
  return V4_DEFAULT_BUDGET_BYTES;
}

/** The result without the bulky plan internals, safe to postMessage and
 *  to store as JSON. */
export function conversionRecord(result) {
  return {
    brickGrid: result.brickGrid,
    stats: result.stats,
    traceCount: result.traceCount,
    deadTraces: result.deadTraces,
    compression: result.compression,
    display: result.display,
    bricks: result.bricks,
    passesPerBand: result.passesPerBand,
    peakBytes: result.peakBytes,
  };
}

/**
 * SEIS-U1-002: a survey whose traces do not fill a full inline-sorted
 * rectangle (an irregular outline, a crossline-sorted or unsorted file)
 * is addressed through a trace lattice built from one pass over the trace
 * headers. Returns the grid and the geometry the manifest must carry (the
 * lattice's own inline and crossline ranges, never the preview's sampled
 * ones), or the plain grid for a regular file.
 */
export async function conversionGrid(reader, scan, { onProgress = () => {}, isCancelled = () => false } = {}) {
  if (!needsTraceLattice(scan)) return { grid: gridFromScan(scan), lattice: null };
  onProgress({ phase: 'index', done: 0, total: 1 });
  const index = await buildTraceIndex(reader, scan.mapping, {
    forceLattice: true,
    onProgress: (done, total) => onProgress({ phase: 'index', done, total }),
  });
  if (isCancelled()) throw new Error('Conversion cancelled.');
  const grid = gridFromScan({ ...scan, il: index.il, xl: index.xl }, { lattice: index.lattice });
  return {
    grid,
    lattice: {
      il: index.il,
      xl: index.xl,
      sort: index.sort,
      live_traces: index.liveTraces,
      dead_traces: index.deadTraces,
      duplicate_traces: index.duplicateTraces,
      corners: index.corners,
      affineRaw: index.affine || null,
      warnings: index.warnings,
    },
  };
}


/**
 * Convert and spool.
 *
 * @param {Object} p
 * @param {import('../engine/reader').ByteReader} p.reader the SEG-Y
 * @param {Object} p.scan scanGeometry() result (the preview's sampled scan is enough)
 * @param {Object} p.spool brickSpool.js interface
 * @param {Object} [p.codec] brick codec ({compression, deflate}); default platform
 * @param {number} [p.memoryBudgetBytes]
 * @param {number} [p.encodeConcurrency] encodes in flight (the deflate pool size)
 * @param {number} [p.levels]
 * @param {number} [p.brickSize]
 * @param {number|Object} [p.clip] skip the sampled clip pre-pass (tests)
 * @param {(p: {phase: string, done: number, total: number, bricksDone?: number,
 *   totalBricks?: number}) => void} [p.onProgress]
 * @param {() => boolean} [p.isCancelled]
 * @returns {Promise<Object>} conversionRecord(result), also stored as the
 *   spool's 'conversion' JSON
 */
export async function convertToSpool({
  reader, scan, spool, codec, memoryBudgetBytes = V4_DEFAULT_BUDGET_BYTES, encodeConcurrency = 1,
  levels, brickSize, clip, onProgress = () => {}, isCancelled = () => false,
}) {
  const { grid, lattice } = await conversionGrid(reader, scan, { onProgress, isCancelled });
  onProgress({ phase: 'clip', done: 0, total: 1 });
  const clipInfo = clip ?? await sampleAmplitudeClip(reader, grid);
  if (isCancelled()) throw new Error('Conversion cancelled.');
  onProgress({ phase: 'clip', done: 1, total: 1 });

  let last = 0;
  const result = await transcodeV4(reader, grid, {
    codec,
    clip: clipInfo,
    memoryBudgetBytes,
    encodeConcurrency,
    ...(levels != null ? { levels } : {}),
    ...(brickSize != null ? { brickSize } : {}),
    isCancelled,
    onBrick: (b) => spool.put(spoolKeyOf(b), b.bytes),
    onProgress: (done, total, phase, extra) => {
      const now = Date.now();
      if (done < total && now - last < 250) return;   // throttle the wire
      last = now;
      onProgress({
        phase: 'convert', done, total, bricksDone: extra.bricksDone, totalBricks: extra.totalBricks,
      });
    },
  });
  const record = conversionRecord(result);
  if (lattice) record.lattice = lattice;
  await spool.putJson('conversion', record);
  onProgress({ phase: 'convert', done: 1, total: 1, bricksDone: record.bricks.display.bricks + record.bricks.f32.bricks });
  return record;
}
