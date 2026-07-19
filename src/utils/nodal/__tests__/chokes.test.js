/**
 * Behavior gates for the NA3 choke module. Book anchors run in
 * literature.test.js; oracle equality in harness CASE 13.
 */
import {
  CHOKE_COEFFS,
  chokeWhp,
  chokeRate,
  chokeSize,
  criticalRatio,
  gasChokeRate,
  gasChokeUpstream,
} from '../chokes.js';

describe('Gilbert-family two-phase chokes', () => {
  test('published coefficient table is carried exactly', () => {
    expect(CHOKE_COEFFS.gilbert).toEqual({ c: 10, m: 0.546, n: 1.89 });
    expect(CHOKE_COEFFS.ros).toEqual({ c: 17.4, m: 0.5, n: 2 });
    expect(CHOKE_COEFFS.baxendell).toEqual({ c: 9.56, m: 0.546, n: 1.93 });
    expect(CHOKE_COEFFS.achong).toEqual({ c: 3.82, m: 0.65, n: 1.88 });
    expect(CHOKE_COEFFS.pilehvari).toEqual({ c: 46.67, m: 0.313, n: 2.11 });
  });

  test('whp/rate/size are mutually inverse', () => {
    const base = { q: 600, glr: 1200, s64: 20, correlation: 'achong' };
    const { pwh } = chokeWhp(base);
    expect(chokeRate({ pwh, glr: base.glr, s64: base.s64, correlation: 'achong' }).q).toBeCloseTo(base.q, 8);
    expect(chokeSize({ pwh, q: base.q, glr: base.glr, correlation: 'achong' })).toBeCloseTo(base.s64, 8);
  });

  test('bigger choke needs less wellhead pressure; more gas needs more', () => {
    const small = chokeWhp({ q: 500, glr: 800, s64: 12 }).pwh;
    const big = chokeWhp({ q: 500, glr: 800, s64: 24 }).pwh;
    expect(big).toBeLessThan(small);
    const lean = chokeWhp({ q: 500, glr: 400, s64: 12 }).pwh;
    expect(small).toBeGreaterThan(lean);
  });

  test('critical-flow validity flag trips above the 0.55 ratio', () => {
    const ok = chokeWhp({ q: 400, glr: 800, s64: 12, pDownstream: 300 });
    expect(ok.valid).toBe(true);
    const marginal = chokeWhp({ q: 400, glr: 800, s64: 12, pDownstream: 1200 });
    expect(marginal.valid).toBe(false);
  });
});

describe('gas chokes', () => {
  test('critical ratio follows the isentropic closed form', () => {
    expect(criticalRatio(1.3)).toBeCloseTo(Math.pow(2 / 2.3, 1.3 / 0.3), 12);
    expect(criticalRatio(1.3)).toBeCloseTo(0.5457, 3); // Guo Table 5.1 print
  });

  test('sonic rate is independent of downstream pressure', () => {
    const base = { pUp: 800, dIn: 1, gasSg: 0.6, tUpF: 75, k: 1.3, cd: 0.62 };
    const q1 = gasChokeRate({ ...base, pDn: 100 });
    const q2 = gasChokeRate({ ...base, pDn: 350 });
    expect(q1.regime).toBe('sonic');
    expect(q2.regime).toBe('sonic');
    expect(q1.qMscfd).toBe(q2.qMscfd);
  });

  test('subsonic rate rises as the differential opens, joining sonic at the boundary', () => {
    const base = { pUp: 1000, dIn: 0.75, gasSg: 0.7, tUpF: 100, k: 1.3, cd: 0.9 };
    const tight = gasChokeRate({ ...base, pDn: 950 });
    const wide = gasChokeRate({ ...base, pDn: 700 });
    expect(tight.regime).toBe('subsonic');
    expect(wide.regime).toBe('subsonic');
    expect(wide.qMscfd).toBeGreaterThan(tight.qMscfd);
    const atBoundary = gasChokeRate({ ...base, pDn: criticalRatio(1.3) * 1000 + 0.001 });
    const sonic = gasChokeRate({ ...base, pDn: 100 });
    // rounded field constants: the two published forms meet within 0.5%
    expect(Math.abs(atBoundary.qMscfd - sonic.qMscfd) / sonic.qMscfd).toBeLessThan(5e-3);
  });

  test('upstream inversion round-trips the forward equation in both regimes', () => {
    const base = { pDn: 300, dIn: 0.5, gasSg: 0.75, tUpF: 110, k: 1.3, cd: 0.99 };
    for (const q of [1500, 2500, 4000, 8000]) {
      const inv = gasChokeUpstream({ ...base, qMscfd: q });
      const fwd = gasChokeRate({ ...base, pUp: inv.pUp });
      expect(fwd.regime).toBe(inv.regime);
      expect(fwd.qMscfd).toBeCloseTo(q, 3);
    }
  });

  test('choke cooling: sonic drop across the bean lands near the icing band', () => {
    const res = gasChokeRate({ pUp: 800, pDn: 200, dIn: 1, gasSg: 0.6, tUpF: 75, k: 1.3, cd: 0.62 });
    expect(res.tDnF).toBeLessThan(32); // book's "heating is needed" case
  });
});
