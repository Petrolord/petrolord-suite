import {
  WD, pD, pDprime, influxConstant, tDCoefficient,
  vanEverdingenHurst, fetkovich, carterTracy, computeInflux,
  normalizeHistory, classifyInflux, sampleAquiferData,
} from '@/utils/aquiferInfluxCalculations';

const near = (a, b, relTol = 0.02) => Math.abs(a - b) <= relTol * Math.abs(b) + 1e-9;

describe('dimensionless cumulative influx WD(tD)', () => {
  it('small-time limit → 2·sqrt(tD/π)', () => {
    const tD = 0.001;
    expect(near(WD(tD), 2 * Math.sqrt(tD / Math.PI), 1e-6)).toBe(true);
  });

  it('matches van Everdingen-Hurst tabulated values (Dake)', () => {
    // Published infinite-aquifer WD table values.
    expect(near(WD(1), 1.569, 0.01)).toBe(true);
    expect(near(WD(10), 7.417, 0.01)).toBe(true);
    expect(near(WD(50), 24.82, 0.01)).toBe(true);
    expect(near(WD(100), 43.01, 0.01)).toBe(true);
  });

  it('joins smoothly across the tD = 200 breakpoint', () => {
    const lo = WD(199.9);
    const hi = WD(200.1);
    expect(near(lo, hi, 0.01)).toBe(true);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (const t of [0.005, 0.05, 0.5, 5, 50, 500, 5000]) {
      const v = WD(t);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('returns 0 for non-positive tD', () => {
    expect(WD(0)).toBe(0);
    expect(WD(-1)).toBe(0);
  });
});

describe('dimensionless pressure pD(tD)', () => {
  it('matches the log approximation at large tD', () => {
    const t = 1000;
    expect(near(pD(t), 0.5 * (Math.log(t) + 0.80907), 0.005)).toBe(true);
    expect(near(pD(100), 2.707, 0.01)).toBe(true);
  });

  it('derivative → 1/(2·tD) for large tD', () => {
    const t = 5000;
    expect(near(pDprime(t), 1 / (2 * t), 0.005)).toBe(true);
  });

  it('pD is increasing, pD′ is positive and decreasing', () => {
    expect(pD(10)).toBeGreaterThan(pD(1));
    expect(pDprime(1)).toBeGreaterThan(0);
    expect(pDprime(1)).toBeGreaterThan(pDprime(10));
  });
});

describe('aquifer constants', () => {
  const p = { theta: 360, phi: 0.2, ct: 7e-6, h: 50, rR: 2000, k: 100, muw: 0.5 };
  it('U = 1.119·f·φ·ct·h·rR²', () => {
    const expected = 1.119 * 1 * 0.2 * 7e-6 * 50 * 2000 * 2000;
    expect(near(influxConstant(p), expected, 1e-9)).toBe(true);
  });
  it('halving θ halves U', () => {
    expect(near(influxConstant({ ...p, theta: 180 }), influxConstant(p) / 2, 1e-9)).toBe(true);
  });
  it('tD coefficient is positive and scales with k', () => {
    const c1 = tDCoefficient(p);
    const c2 = tDCoefficient({ ...p, k: 200 });
    expect(c1).toBeGreaterThan(0);
    expect(near(c2, 2 * c1, 1e-9)).toBe(true);
  });
});

describe('history normalisation', () => {
  it('sorts, filters invalid, dedupes times', () => {
    const rows = normalizeHistory([
      { t: 365, p: 3700 }, { t: 0, p: 3800 }, { t: -5, p: 3000 },
      { t: 100, p: 0 }, { t: 365, p: 3690 },
    ]);
    expect(rows.map((r) => r.t)).toEqual([0, 365]);
    expect(rows[1].p).toBe(3690); // last dupe wins
  });
});

describe('van Everdingen-Hurst', () => {
  const params = { k: 200, muw: 0.55, phi: 0.209, ct: 6.9e-6, h: 19.65, rR: 2000, theta: 180 };

  it('two-point step matches U·(Δp/2)·WD(tD)', () => {
    const history = [{ t: 0, p: 3793 }, { t: 365, p: 3600 }];
    const r = vanEverdingenHurst(history, params);
    const U = influxConstant(params);
    const C = tDCoefficient(params);
    const expected = U * ((3793 - 3600) / 2) * WD(C * 365);
    expect(near(r.cumulativeWe, expected, 1e-6)).toBe(true);
  });

  it('produces positive, monotonically increasing We on a declining history', () => {
    const { history } = sampleAquiferData();
    const r = vanEverdingenHurst(history, params);
    expect(r.series.length).toBe(history.length);
    let prev = -1;
    for (const s of r.series) {
      expect(s.We).toBeGreaterThanOrEqual(prev);
      prev = s.We;
    }
    expect(r.cumulativeWe).toBeGreaterThan(0);
  });

  it('scales linearly with pressure drawdown', () => {
    const h1 = [{ t: 0, p: 4000 }, { t: 365, p: 3900 }];
    const h2 = [{ t: 0, p: 4000 }, { t: 365, p: 3800 }]; // 2× drawdown
    const r1 = vanEverdingenHurst(h1, params);
    const r2 = vanEverdingenHurst(h2, params);
    expect(near(r2.cumulativeWe, 2 * r1.cumulativeWe, 1e-6)).toBe(true);
  });
});

describe('Fetkovich finite aquifer', () => {
  const params = {
    ct: 6.9e-6, W: 6.3e8, J: 4.5,
    theta: 180, k: 200, h: 19.65, muw: 0.55, phi: 0.209, rR: 2000, re: 20000,
  };
  const history = sampleAquiferData().history;

  it('gives positive, increasing We bounded by Wei', () => {
    const r = fetkovich(history, params);
    expect(r.cumulativeWe).toBeGreaterThan(0);
    expect(r.cumulativeWe).toBeLessThan(r.Wei);
    let prev = -1;
    for (const s of r.series) {
      expect(s.We).toBeGreaterThanOrEqual(prev);
      prev = s.We;
    }
  });

  it('derives W and J from geometry when omitted', () => {
    const geoParams = { ct: 6.9e-6, theta: 180, k: 200, h: 19.65, muw: 0.55, phi: 0.209, rR: 2000, re: 20000 };
    const r = fetkovich(history, geoParams);
    expect(r.W).toBeGreaterThan(0);
    expect(r.J).toBeGreaterThan(0);
    expect(r.cumulativeWe).toBeGreaterThan(0);
  });

  it('errors when neither J nor geometry is available', () => {
    const r = fetkovich(history, { ct: 6.9e-6, W: 1e8 });
    expect(r.error).toBeTruthy();
  });
});

describe('Carter-Tracy', () => {
  const params = { k: 200, muw: 0.55, phi: 0.209, ct: 6.9e-6, h: 19.65, rR: 2000, theta: 180 };
  const history = sampleAquiferData().history;

  it('gives positive, increasing We', () => {
    const r = carterTracy(history, params);
    expect(r.cumulativeWe).toBeGreaterThan(0);
    let prev = -1;
    for (const s of r.series) {
      expect(s.We).toBeGreaterThanOrEqual(prev);
      prev = s.We;
    }
  });

  it('agrees with van Everdingen-Hurst within ~15% (same aquifer)', () => {
    const veh = vanEverdingenHurst(history, params);
    const ct = carterTracy(history, params);
    expect(near(ct.cumulativeWe, veh.cumulativeWe, 0.15)).toBe(true);
  });
});

describe('classification & orchestrator', () => {
  it('classifies strength from We/Wei fraction', () => {
    expect(classifyInflux({ cumulativeWe: 0 }).level).toBe('none');
    expect(classifyInflux({ cumulativeWe: 1e5, Wei: 1e8 }).level).toBe('weak');
    expect(classifyInflux({ cumulativeWe: 5e6, Wei: 1e8 }).level).toBe('moderate');
    expect(classifyInflux({ cumulativeWe: 5e7, Wei: 1e8 }).level).toBe('strong');
  });

  it('computeInflux returns rate + classification and honours method', () => {
    const s = sampleAquiferData();
    const veh = computeInflux({ ...s, method: 'veh' });
    const fet = computeInflux({ ...s, method: 'fetkovich', params: { ...s.params, W: 6.3e8, J: 4.5 } });
    expect(veh.method).toBe('veh');
    expect(fet.method).toBe('fetkovich');
    expect(veh.rate).toBeGreaterThan(0);
    expect(veh.classification.level).toBeTruthy();
  });
});
