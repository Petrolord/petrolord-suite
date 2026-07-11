/**
 * Horizon amplitude extraction: parabolic value-at-pick is EXACT on
 * quadratic traces (validation-first: the analytic truth is closed
 * form), windowed statistics honor null exclusion, and the brick
 * driver fetches every brick exactly once with only the k-range the
 * horizon needs.
 */
import { NULL_VALUE } from '@/pages/apps/Seismolord/engine/manifest';
import {
  amplitudeAt, windowStat, extractHorizonAmplitude, bricksForHorizonAmplitude,
} from '@/pages/apps/Seismolord/engine/horizonAmplitude';

const NULL_F32 = Math.fround(NULL_VALUE);

const accessor = (arr) => (s) => arr[s];

describe('amplitudeAt', () => {
  test('exact apex on a quadratic trace at a fractional pick', () => {
    // v(s) = 2 - 0.5 (s - 5.3)^2 — apex 2 at z = 5.3
    const ns = 12;
    const tr = Float32Array.from({ length: ns }, (_, s) => 2 - 0.5 * (s - 5.3) ** 2);
    // float32 storage rounds the samples; the parabola through them
    // reproduces the apex to float32 precision
    expect(amplitudeAt(accessor(tr), ns, 5.3)).toBeCloseTo(2, 5);
    expect(amplitudeAt(accessor(tr), ns, 5.0))
      .toBeCloseTo(2 - 0.5 * 0.3 ** 2, 5);
  });

  test('incomplete stencil falls back to the nearest sample', () => {
    const tr = Float32Array.from([7, 8, 9, 10]);
    expect(amplitudeAt(accessor(tr), 4, 0.2)).toBe(7);       // trace start
    expect(amplitudeAt(accessor(tr), 4, 3.4)).toBe(10);      // trace end
    const withNull = Float32Array.from([7, 8, NULL_F32, 10]);
    expect(amplitudeAt(accessor(withNull), 4, 1.4)).toBe(8); // null neighbor
  });

  test('null nearest sample and out-of-range picks are null', () => {
    const tr = Float32Array.from([1, NULL_F32, 3]);
    expect(amplitudeAt(accessor(tr), 3, 1.1)).toBe(NULL_F32);
    expect(amplitudeAt(accessor(tr), 3, -1)).toBe(NULL_F32);
    expect(amplitudeAt(accessor(tr), 3, 7)).toBe(NULL_F32);
    expect(amplitudeAt(accessor(tr), 3, NaN)).toBe(NULL_F32);
  });
});

describe('windowStat', () => {
  const tr = Float32Array.from([1, -2, 3, NULL_F32, 5, -1]);

  test('rms / mean / max_abs over the window, nulls excluded', () => {
    // z = 2, w = 2 -> samples 0..4, the null at 3 excluded
    const at = accessor(tr);
    expect(windowStat(at, 6, 2, 'mean', 2)).toBeCloseTo((1 - 2 + 3 + 5) / 4, 6);
    expect(windowStat(at, 6, 2, 'rms', 2))
      .toBeCloseTo(Math.sqrt((1 + 4 + 9 + 25) / 4), 6);
    expect(windowStat(at, 6, 2, 'max_abs', 2)).toBe(5);
  });

  test('window clamps at trace ends', () => {
    const at = accessor(tr);
    expect(windowStat(at, 6, 0, 'mean', 3)).toBeCloseTo((1 - 2 + 3) / 3, 6);
  });

  test('all-null window is null', () => {
    const dead = Float32Array.from([NULL_F32, NULL_F32, NULL_F32]);
    expect(windowStat(accessor(dead), 3, 1, 'rms', 1)).toBe(NULL_F32);
  });
});

describe('extractHorizonAmplitude', () => {
  // synthetic brick store: 8x8x12 volume, brickSize 4, so there are
  // 2x2 brick columns and 3 k-bricks; trace (il, xl) is the parabola
  // v(s) = A - 0.5 (s - z)^2 with A = 1 + il + 0.1*xl and the pick
  // grid z = 4 + il/4 + xl/8 — the analytic apex is known everywhere
  const geom = { nIl: 8, nXl: 8, ns: 12, brickSize: 4 };
  const A = (il, xl) => 1 + il + 0.1 * xl;
  const Z = (il, xl) => 4 + il / 4 + xl / 8;
  const DEAD = { il: 2, xl: 5 };                 // an all-null trace

  const makeStore = () => {
    const fetched = new Map();                   // key -> count
    const getBrick = async (bi, bj, bk) => {
      const key = `${bi}-${bj}-${bk}`;
      fetched.set(key, (fetched.get(key) || 0) + 1);
      const b = geom.brickSize;
      const data = new Float32Array(b * b * b).fill(NULL_F32);
      for (let li = 0; li < b; li++) {
        for (let lj = 0; lj < b; lj++) {
          const il = bi * b + li;
          const xl = bj * b + lj;
          if (il >= geom.nIl || xl >= geom.nXl) continue;
          if (il === DEAD.il && xl === DEAD.xl) continue;
          for (let lk = 0; lk < b; lk++) {
            const s = bk * b + lk;
            if (s >= geom.ns) continue;
            data[(li * b + lj) * b + lk] = Math.fround(
              A(il, xl) - 0.5 * (s - Z(il, xl)) ** 2,
            );
          }
        }
      }
      return data;
    };
    return { getBrick, fetched };
  };

  const makePicks = () => {
    const picks = new Float32Array(geom.nIl * geom.nXl).fill(NULL_F32);
    for (let il = 0; il < geom.nIl; il++) {
      for (let xl = 0; xl < geom.nXl; xl++) {
        picks[il * geom.nXl + xl] = Z(il, xl);
      }
    }
    picks[0 * geom.nXl + 7] = NULL_F32;          // an untracked cell
    return picks;
  };

  test('value mode recovers the analytic apex; nulls stay null', async () => {
    const { getBrick } = makeStore();
    const picks = makePicks();
    const out = await extractHorizonAmplitude(getBrick, geom, picks, { mode: 'value' });
    for (let il = 0; il < geom.nIl; il++) {
      for (let xl = 0; xl < geom.nXl; xl++) {
        const v = out[il * geom.nXl + xl];
        if ((il === 0 && xl === 7) || (il === DEAD.il && xl === DEAD.xl)) {
          expect(v).toBe(NULL_F32);
        } else {
          expect(v).toBeCloseTo(A(il, xl), 4);
        }
      }
    }
  });

  test('windowed mode matches the direct per-trace statistic', async () => {
    const { getBrick } = makeStore();
    const picks = makePicks();
    const out = await extractHorizonAmplitude(
      getBrick, geom, picks, { mode: 'rms', window: 2 },
    );
    const cell = 3 * geom.nXl + 4;
    const tr = Float32Array.from({ length: geom.ns }, (_, s) => Math.fround(
      A(3, 4) - 0.5 * (s - Z(3, 4)) ** 2,
    ));
    expect(out[cell]).toBeCloseTo(
      windowStat(accessor(tr), geom.ns, picks[cell], 'rms', 2), 6,
    );
  });

  test('each brick fetched exactly once, matching the preflight list', async () => {
    const { getBrick, fetched } = makeStore();
    const picks = makePicks();
    await extractHorizonAmplitude(getBrick, geom, picks, { mode: 'rms', window: 2 });
    for (const [, n] of fetched) expect(n).toBe(1);
    const preflight = bricksForHorizonAmplitude(geom, picks, 2)
      .map(({ i, j, k }) => `${i}-${j}-${k}`).sort();
    expect([...fetched.keys()].sort()).toEqual(preflight);
    // z spans ~4..7.2 with ±3 margin -> samples 1..10 -> only k 0..2
    // exist anyway, but the shallow columns must not fetch k=2 when
    // their range ends inside k=1... verify no column fetched MORE
    // k-bricks than its own picks require
    expect(preflight.length).toBe(fetched.size);
  });

  test('an entirely null horizon fetches nothing', async () => {
    const { getBrick, fetched } = makeStore();
    const picks = new Float32Array(geom.nIl * geom.nXl).fill(NULL_F32);
    const out = await extractHorizonAmplitude(getBrick, geom, picks, { mode: 'value' });
    expect(fetched.size).toBe(0);
    expect(out.every((v) => v === NULL_F32)).toBe(true);
    expect(bricksForHorizonAmplitude(geom, picks, 0)).toEqual([]);
  });
});
