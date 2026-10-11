/**
 * The seeded tracker's options stop growth at an uninterpreted fault
 * (kit v4 listric growth fault: one seed on the top Ekene Sand picked
 * 21,198 of 21,504 traces, the footwall on a weak event at the
 * hanging-wall time). A two-block synthetic: the hanging-wall reflector
 * fades into the fault zone; the footwall holds the thrown event and a
 * weak one at the old time, above the RMS floor.
 */
import { regionGrow3D } from '@/pages/apps/Seismolord/engine/horizonTrack';
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';
import { trackerOptions, trackedSummary, TRACK_MIN_AMP_RATIO } from '../lib/trackerOptions';

const NULL_F32 = Math.fround(NULL_VALUE);
const NS = 128; const NI = 4; const NX = 40; const FAULT = 20;

function wave(c, amp) {
  const t = new Float32Array(NS);
  for (let i = 0; i < NS; i++) { const d = i - c; t[i] = amp * Math.exp(-(d * d) / 32) * Math.cos(0.35 * d); }
  return t;
}
function trace(j) {
  if (j >= FAULT) return wave(60, [0.15, 0.3, 0.5, 0.8][j - FAULT] ?? 1);
  const a = wave(40, 1); const b = wave(61, 0.12);
  return a.map((v, k) => v + b[k]);
}

describe('trackerOptions', () => {
  test('extrema modes carry the RMS floor and the amplitude memory', () => {
    expect(trackerOptions({ snapMode: 'peak', snapWindow: 3, corrThreshold: 0.7, rms: 10 }))
      .toEqual({ mode: 'peak', window: 3, maxJump: 4, minAbsAmp: 3, minAmpRatio: TRACK_MIN_AMP_RATIO });
    expect(trackerOptions({ snapMode: 'trough', snapWindow: 3, corrThreshold: 0.7, rms: 10 }).minAmpRatio).toBe(0.5);
  });

  test('zero crossings and the correlation mode take no amplitude gate', () => {
    const z = trackerOptions({ snapMode: 'zero_pos', snapWindow: 3, corrThreshold: 0.7, rms: 10 });
    expect(z.minAbsAmp).toBe(0);
    expect(z.minAmpRatio).toBeUndefined();
    const n = trackerOptions({ snapMode: 'ncc', snapWindow: 5, corrThreshold: 0.8 });
    expect(n).toEqual({ mode: 'ncc', corrHalf: 8, corrSearch: 5, corrThreshold: 0.8, maxJump: 4 });
  });

  test('Track 3D with these options stops at the fault and never picks the footwall', async () => {
    const opts = trackerOptions({ snapMode: 'peak', snapWindow: 3, corrThreshold: 0.7, rms: 0.05 / 0.3 });
    const { picks } = await regionGrow3D(async (_i, j) => trace(j), { nIl: NI, nXl: NX, ns: NS },
      { ilIdx: 1, xlIdx: 30, sample: 60 }, opts);
    for (let i = 0; i < NI; i++) {
      for (let j = 0; j < FAULT + 2; j++) expect(picks[i * NX + j]).toBe(NULL_F32);
      for (let j = FAULT + 2; j < NX; j++) expect(picks[i * NX + j]).toBeCloseTo(60, 1);
    }
  });
});

describe('trackedSummary', () => {
  test('names the survey total', () => {
    expect(trackedSummary('Top Ekene Sand', 13580, 21504)).toBe('Top Ekene Sand: 13,580 of 21,504 traces.');
    expect(trackedSummary('H', 5, 0)).toBe('H: 5 traces.');
  });
});
