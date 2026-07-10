/**
 * Phase 3 acceptance (docs/scope/Seismolord-PLAN.md): ≥95% of tracked z
 * within 2 samples of the analytic dome, with null propagation and the
 * time-increases-downward convention asserted. Runs against the real
 * fixture volumes through the real brick pipeline.
 */
import fs from 'fs';
import path from 'path';

import { bufferReader } from '@/pages/apps/Seismolord/engine/reader';
import { scanGeometry } from '@/pages/apps/Seismolord/engine/segyScan';
import { transcodeToBricks } from '@/pages/apps/Seismolord/engine/brickTranscode';
import { assembleSlice, assembleTrace } from '@/pages/apps/Seismolord/engine/sliceAssembly';
import {
  snapPick, autotrack2D, regionGrow3D, horizonStats,
} from '@/pages/apps/Seismolord/engine/horizonTrack';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';

const NULL_F32 = Math.fround(NULL_VALUE);
const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'seismolord');

const loadGolden = (name) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'goldens', `${name}.json`), 'utf8'));

const readerFor = (name) => {
  const buf = fs.readFileSync(path.join(DATA_DIR, 'segy', `${name}.sgy`));
  return bufferReader(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};

/** Dome truth in SAMPLES per (ilIdx, xlIdx), from the committed golden. */
const domeTruthSamples = (golden) => {
  const blob = golden.dome_truth_twt_ms;
  const bytes = Buffer.from(blob.base64, 'base64');
  const ms = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const dtMs = golden.geometry.dt_us / 1000;
  return { truth: ms, toSamples: (v) => v / dtMs, dtMs };
};

async function fixtureVolume(name, golden) {
  const reader = readerFor(name);
  const scan = await scanGeometry(reader, {
    ilByte: golden.geometry.il_byte, xlByte: golden.geometry.xl_byte,
  });
  const bricks = new Map();
  const result = await transcodeToBricks(reader, scan, {
    onBrick: ({ i, j, k, data }) => bricks.set(`${i}-${j}-${k}`, data),
  });
  const geom = {
    nIl: scan.il.count,
    nXl: scan.xl.count,
    ns: scan.ns,
    brickSize: result.brickGrid.brickSize,
    grid: [result.brickGrid.ni, result.brickGrid.nj, result.brickGrid.nk],
  };
  const getBrick = (i, j, k) => Promise.resolve(bricks.get(`${i}-${j}-${k}`));
  const getTrace = (il, xl) => assembleTrace(getBrick, geom, il, xl);
  return { geom, getBrick, getTrace };
}

describe('snapPick', () => {
  test('parabolic refinement recovers a sub-sample peak position', () => {
    // Ricker-ish peak centred at 20.3 samples
    const trace = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      const d = i - 20.3;
      trace[i] = (1 - 2 * (0.3 * d) ** 2) * Math.exp(-((0.3 * d) ** 2));
    }
    const hit = snapPick(trace, 22, { mode: 'peak', window: 4 });
    expect(hit).not.toBeNull();
    expect(Math.abs(hit.sample - 20.3)).toBeLessThan(0.05);
  });

  test('trough mode finds negative lobes and peak mode ignores them', () => {
    const trace = new Float32Array(32);
    for (let i = 0; i < 32; i++) trace[i] = -Math.exp(-((i - 15) ** 2) / 8);
    expect(snapPick(trace, 15, { mode: 'trough', window: 3 }).sample).toBeCloseTo(15, 1);
    expect(snapPick(trace, 15, { mode: 'peak', window: 3 })).toBeNull();
  });

  test('null samples never produce a pick', () => {
    const trace = new Float32Array(32).fill(NULL_F32);
    expect(snapPick(trace, 16, { window: 5 })).toBeNull();
  });
});

describe.each(['dome_ibm', 'dome_ieee'])('dome tracking acceptance on %s', (name) => {
  const golden = loadGolden(name);
  const g = golden.geometry;

  test('3D region-grow: >=95% of tracked z within 2 samples of the analytic dome', async () => {
    const { geom, getTrace } = await fixtureVolume(name, golden);
    const { truth, toSamples } = domeTruthSamples(golden);

    const seed = {
      ilIdx: Math.floor(geom.nIl / 2),
      xlIdx: Math.floor(geom.nXl / 2),
      sample: toSamples(golden.dome_truth_twt_ms.crest_ms), // crest ≈ shallowest
    };
    const { picks, tracked } = await regionGrow3D(getTrace, geom, seed, {
      mode: 'peak', window: 3, maxJump: 4, minAbsAmp: 0.2,
    });

    // full coverage of the regular dome expected
    expect(tracked / (geom.nIl * geom.nXl)).toBeGreaterThanOrEqual(0.95);

    let within2 = 0;
    let live = 0;
    for (let i = 0; i < picks.length; i++) {
      if (picks[i] === NULL_F32) continue;
      live += 1;
      if (Math.abs(picks[i] - toSamples(truth[i])) <= 2) within2 += 1;
    }
    expect(live).toBe(tracked);
    expect(within2 / live).toBeGreaterThanOrEqual(0.95);

    // time increases downward: dome deepens (sample increases) away from crest
    const centre = picks[seed.ilIdx * geom.nXl + seed.xlIdx];
    const corner = picks[0];
    expect(corner).toBeGreaterThan(centre);

    const stats = horizonStats(picks);
    expect(stats.coverage).toBeGreaterThanOrEqual(0.95);
    expect(stats.minSample).toBeGreaterThan(0);
  });

  test('2D guided autotrack follows the dome across the centre inline', async () => {
    const { geom, getBrick } = await fixtureVolume(name, golden);
    const { truth, toSamples } = domeTruthSamples(golden);
    const ilIdx = Math.floor(geom.nIl / 2);
    const slice = await assembleSlice(getBrick, geom, 'inline', ilIdx);

    const startTrace = Math.floor(geom.nXl / 2);
    const { picks, tracked } = autotrack2D(slice, startTrace,
      toSamples(golden.dome_truth_twt_ms.crest_ms), { mode: 'peak', window: 3, maxJump: 4 });

    expect(tracked / geom.nXl).toBeGreaterThanOrEqual(0.95);
    let within2 = 0;
    let live = 0;
    for (let x = 0; x < geom.nXl; x++) {
      if (picks[x] === NULL_F32) continue;
      live += 1;
      if (Math.abs(picks[x] - toSamples(truth[ilIdx * geom.nXl + x])) <= 2) within2 += 1;
    }
    expect(within2 / live).toBeGreaterThanOrEqual(0.95);
  });
});

describe('null propagation', () => {
  test('region-grow marks unreachable traces NULL and stats exclude them', async () => {
    const golden = loadGolden('dome_ibm');
    const { geom, getTrace } = await fixtureVolume('dome_ibm', golden);
    // absurd amplitude floor: only the seed survives
    const seed = { ilIdx: 16, xlIdx: 16, sample: 25 };
    const { picks, tracked } = await regionGrow3D(getTrace, geom, seed, {
      mode: 'peak', window: 3, maxJump: 4, minAbsAmp: 100,
    });
    expect(tracked).toBe(1);
    const stats = horizonStats(picks);
    expect(stats.tracked).toBe(1);
    expect(stats.coverage).toBeCloseTo(1 / (geom.nIl * geom.nXl), 10);
    // every other cell is the propagating null, bit-exactly
    expect(picks[0]).toBe(NULL_F32);
  });

  test('cancellation aborts the grow loop', async () => {
    const golden = loadGolden('dome_ibm');
    const { geom, getTrace } = await fixtureVolume('dome_ibm', golden);
    let calls = 0;
    await expect(regionGrow3D(getTrace, geom, { ilIdx: 16, xlIdx: 16, sample: 25 }, {
      shouldCancel: () => ++calls > 5,
    })).rejects.toThrow(/cancelled/);
  });
});
