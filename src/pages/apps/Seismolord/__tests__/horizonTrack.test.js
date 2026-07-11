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
  snapPick, autotrack2D, regionGrow3D, horizonStats, smoothHorizon,
  fillHorizonHoles, horizonDifference,
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

  test('zero-crossing modes find the nearest crossing of the right direction', () => {
    // sine, period 20: rising (- to +) crossings at 0/20/40, falling at 10/30
    const trace = new Float32Array(64);
    for (let i = 0; i < 64; i++) trace[i] = Math.sin((2 * Math.PI * i) / 20);
    const neg = snapPick(trace, 9, { mode: 'zero_neg', window: 3 });
    expect(neg.sample).toBeCloseTo(10, 1);
    expect(neg.amp).toBeGreaterThan(0.5);        // flank amplitude, not ~0
    // no rising crossing within +-3 of sample 9
    expect(snapPick(trace, 9, { mode: 'zero_pos', window: 3 })).toBeNull();
    const pos = snapPick(trace, 19, { mode: 'zero_pos', window: 3 });
    expect(pos.sample).toBeCloseTo(20, 1);
  });

  test('zero crossing interpolates the sub-sample position linearly', () => {
    // straight ramp crossing zero at exactly 10.25
    const trace = Float32Array.from({ length: 32 }, (_, i) => (i - 10.25) * 2);
    const hit = snapPick(trace, 10, { mode: 'zero_pos', window: 3 });
    expect(hit.sample).toBeCloseTo(10.25, 5);
  });

  test('autotrack2D follows a dipping zero crossing across traces', () => {
    // 8 traces; trace t crosses (- to +) at sample 10 + 0.5 t
    const ns = 32;
    const nTraces = 8;
    const data = new Float32Array(nTraces * ns);
    for (let t = 0; t < nTraces; t++) {
      for (let s = 0; s < ns; s++) data[t * ns + s] = s - (10 + 0.5 * t);
    }
    const { picks, tracked } = autotrack2D(
      { data, width: ns, height: nTraces }, 0, 10,
      { mode: 'zero_pos', window: 3, maxJump: 2 },
    );
    expect(tracked).toBe(nTraces);
    for (let t = 0; t < nTraces; t++) expect(picks[t]).toBeCloseTo(10 + 0.5 * t, 3);
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

describe('smoothHorizon', () => {
  test('a constant grid is a fixed point and a planar ramp stays planar inside', () => {
    const flat = new Float32Array(5 * 5).fill(20);
    expect(Array.from(smoothHorizon(flat, 5, 5))).toEqual(Array.from(flat));
    // ramp along xl: interior cells average to themselves
    const ramp = Float32Array.from({ length: 25 }, (_, k) => k % 5);
    const sm = smoothHorizon(ramp, 5, 5);
    expect(sm[2 * 5 + 2]).toBeCloseTo(2, 5);        // interior unchanged
  });

  test('reduces noise around a plane', () => {
    const n = 9;
    const noisy = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) noisy[k] = 30 + (k % 2 === 0 ? 1 : -1);
    const sm = smoothHorizon(noisy, n, n);
    let devIn = 0;
    let devOut = 0;
    for (let k = 0; k < n * n; k++) {
      devIn += Math.abs(noisy[k] - 30);
      devOut += Math.abs(sm[k] - 30);
    }
    expect(devOut).toBeLessThan(devIn * 0.5);
  });

  test('preserves coverage exactly: nulls stay null, live cells stay live', () => {
    const g = new Float32Array(4 * 4).fill(10);
    g[5] = NULL_F32;
    g[10] = NULL_F32;
    const sm = smoothHorizon(g, 4, 4);
    expect(sm[5]).toBe(NULL_F32);
    expect(sm[10]).toBe(NULL_F32);
    for (let k = 0; k < 16; k++) {
      if (k === 5 || k === 10) continue;
      expect(sm[k]).toBeCloseTo(10, 5);             // nulls never enter means
    }
  });
});

describe('smoothHorizon median', () => {
  test('median kills a single spike exactly; mean only dampens it', () => {
    const g = new Float32Array(5 * 5).fill(10);
    g[2 * 5 + 2] = 40;                                 // one bad autotrack pick
    const med = smoothHorizon(g, 5, 5, { method: 'median' });
    expect(med[2 * 5 + 2]).toBe(10);                   // spike gone
    const mean = smoothHorizon(g, 5, 5, { method: 'mean' });
    expect(mean[2 * 5 + 2]).toBeGreaterThan(10);       // only dampened
  });

  test('median preserves coverage and ignores nulls', () => {
    const g = new Float32Array(4 * 4).fill(7);
    g[5] = NULL_F32;
    const med = smoothHorizon(g, 4, 4, { method: 'median' });
    expect(med[5]).toBe(NULL_F32);
    expect(med[0]).toBe(7);
  });
});

describe('fillHorizonHoles', () => {
  test('fills an interior hole in a flat horizon with the flat value', () => {
    const n = 7;
    const g = new Float32Array(n * n).fill(20);
    for (const [i, x] of [[2, 2], [2, 3], [3, 2], [3, 3], [3, 4]]) g[i * n + x] = NULL_F32;
    const { grid, filled } = fillHorizonHoles(g, n, n);
    expect(filled).toBe(5);
    for (let c = 0; c < n * n; c++) expect(grid[c]).toBeCloseTo(20, 3);
  });

  test('reconstructs a planar dip through the hole', () => {
    const n = 9;
    const g = Float32Array.from({ length: n * n }, (_, c) => 10 + (c % n) * 2);
    g[4 * n + 4] = NULL_F32;
    g[4 * n + 5] = NULL_F32;
    const { grid } = fillHorizonHoles(g, n, n);
    expect(grid[4 * n + 4]).toBeCloseTo(10 + 4 * 2, 2);   // membrane = the plane
    expect(grid[4 * n + 5]).toBeCloseTo(10 + 5 * 2, 2);
  });

  test('never grows the exterior: border-connected nulls stay null', () => {
    const n = 6;
    const g = new Float32Array(n * n).fill(15);
    // notch open to the border + one true interior hole
    g[0] = NULL_F32;
    g[1] = NULL_F32;
    g[n + 1] = NULL_F32;                                 // connected via g[1]
    g[3 * n + 3] = NULL_F32;                             // interior
    const { grid, filled } = fillHorizonHoles(g, n, n);
    expect(filled).toBe(1);
    expect(grid[0]).toBe(NULL_F32);
    expect(grid[1]).toBe(NULL_F32);
    expect(grid[n + 1]).toBe(NULL_F32);
    expect(grid[3 * n + 3]).toBeCloseTo(15, 3);
  });

  test('a grid with no interior holes is returned unchanged', () => {
    const g = new Float32Array(4 * 4).fill(3);
    const { grid, filled } = fillHorizonHoles(g, 4, 4);
    expect(filled).toBe(0);
    expect(Array.from(grid)).toEqual(Array.from(g));
  });
});

describe('horizonDifference', () => {
  test('b − a per cell, null when either surface is missing', () => {
    const a = Float32Array.from([10, 20, NULL_F32, 30]);
    const b = Float32Array.from([16, NULL_F32, 25, 27.5]);
    const d = horizonDifference(a, b);
    expect(d[0]).toBeCloseTo(6, 5);
    expect(d[1]).toBe(NULL_F32);
    expect(d[2]).toBe(NULL_F32);
    expect(d[3]).toBeCloseTo(-2.5, 5);   // crossing surfaces stay signed
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
