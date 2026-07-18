/**
 * dcaEngine oracle suite, Layer 0 — closed-form self-consistency.
 * (ReservoirEngineering-Module.md §3: hard gate before the NextGen DCA
 * course and the @petrolord/engines extraction. Layer 1, the published
 * literature fixtures, lives in dcaEngine.literature.test.js.)
 *
 * Everything here is provable with pencil arithmetic against the Arps (1945)
 * closed forms, so this layer never depends on book sourcing:
 *   exponential  q = qi·e^(−Di·t)              EUR = (qi − qL)/Di
 *   harmonic     q = qi/(1 + Di·t)             EUR = (qi/Di)·ln(qi/qL)
 *   hyperbolic   q = qi/(1 + b·Di·t)^(1/b)     EUR = qi^b/((1−b)·Di)·(qi^(1−b) − qL^(1−b))
 *
 * Engine facts these tests pin (verified against the source):
 *   - fitArpsModel works on {date, rate} rows, t in DAYS from the first row,
 *     Di per day; exponential/harmonic by exact linearization, hyperbolic by
 *     a 0.05-step b grid over the linearized OLS.
 *   - generateForecast integrates by daily right-rectangles, so its
 *     cumulative slightly UNDERSHOOTS the analytic integral of a declining
 *     rate; the bias direction and a ≤1% magnitude are pinned here, not
 *     "fixed" (DeclineCurveContext and Forecast Scenario Hub consume the
 *     sum as-is).
 *   - calculateEUR's hyperbolic branch had a sign bug (divided by (b − 1),
 *     returning NEGATIVE EUR for every 0 < b < 1). Fixed under this suite.
 */
import {
  fitArpsModel,
  calculateEUR,
  generateForecast,
  calculateArpsExponential,
  calculateArpsHyperbolic,
} from '../dcaEngine';

// ─── closed-form helpers (independent of the engine) ─────────────────────────
const arpsRate = (qi, Di, b, t) => {
  if (b === 0) return qi * Math.exp(-Di * t);
  return qi / Math.pow(1 + b * Di * t, 1 / b);
};

const arpsEurClosedForm = (qi, Di, b, qL) => {
  if (b === 0) return (qi - qL) / Di;
  if (b === 1) return (qi / Di) * Math.log(qi / qL);
  return (Math.pow(qi, b) / ((1 - b) * Di)) * (Math.pow(qi, 1 - b) - Math.pow(qL, 1 - b));
};

const arpsTimeToLimit = (qi, Di, b, qL) => {
  if (b === 0) return Math.log(qi / qL) / Di;
  if (b === 1) return (qi / qL - 1) / Di;
  return (Math.pow(qi / qL, b) - 1) / (b * Di);
};

// Composite Simpson quadrature of q(t) from 0 to t(qLimit) — an oracle for
// EUR that shares no algebra with the closed forms above.
const simpsonEur = (qi, Di, b, qL, nPanels = 20000) => {
  const T = arpsTimeToLimit(qi, Di, b, qL);
  const h = T / nPanels;
  let s = arpsRate(qi, Di, b, 0) + arpsRate(qi, Di, b, T);
  for (let i = 1; i < nPanels; i++) {
    s += arpsRate(qi, Di, b, i * h) * (i % 2 === 1 ? 4 : 2);
  }
  return (s * h) / 3;
};

// Daily {date, rate} series from a clean Arps model, anchored at t0.
const T0 = '2020-01-01';
const makeSeries = (qi, Di, b, nDays, t0 = T0) => {
  const start = new Date(t0).getTime();
  const rows = [];
  for (let d = 0; d < nDays; d++) {
    rows.push({
      date: new Date(start + d * 86_400_000).toISOString().slice(0, 10),
      rate: arpsRate(qi, Di, b, d),
    });
  }
  return rows;
};

const relErr = (actual, truth) => Math.abs(actual - truth) / Math.abs(truth);

// ─── forward models ──────────────────────────────────────────────────────────
describe('forward models (hand arithmetic)', () => {
  test('exponential and hyperbolic closed forms at hand-checked points', () => {
    // 1000·e^(−0.001·500) = 1000·e^(−0.5) = 606.5307
    expect(calculateArpsExponential(1000, 1e-3, 500)).toBeCloseTo(606.530659, 5);
    // 1000/(1 + 0.5·0.001·1000)^2 = 1000/1.5^2 = 444.4444
    expect(calculateArpsHyperbolic(1000, 1e-3, 0.5, 1000)).toBeCloseTo(444.444444, 5);
  });
});

// ─── fit recovery on exact synthetic data ────────────────────────────────────
describe('fitArpsModel recovers exact synthetic Arps parameters', () => {
  test('exponential: qi and Di to 1e-6 relative, R2 ~ 1', () => {
    const fit = fitArpsModel(makeSeries(1000, 1e-3, 0, 180), 'Exponential');
    expect(fit.parameters.modelType).toBe('Exponential');
    expect(relErr(fit.parameters.qi, 1000)).toBeLessThan(1e-6);
    expect(relErr(fit.parameters.Di, 1e-3)).toBeLessThan(1e-6);
    expect(fit.R2).toBeGreaterThan(0.999999);
  });

  test('harmonic: qi and Di to 1e-6 relative', () => {
    const fit = fitArpsModel(makeSeries(800, 2e-3, 1, 365), 'Harmonic');
    expect(fit.parameters.modelType).toBe('Harmonic');
    expect(relErr(fit.parameters.qi, 800)).toBeLessThan(1e-6);
    expect(relErr(fit.parameters.Di, 2e-3)).toBeLessThan(1e-6);
  });

  test('hyperbolic with b on the 0.05 grid: b hit exactly, qi/Di to 1e-6', () => {
    const fit = fitArpsModel(makeSeries(1200, 1.5e-3, 0.5, 365), 'Hyperbolic');
    expect(fit.parameters.modelType).toBe('Hyperbolic');
    // grid accumulation only carries float noise, not model error
    expect(Math.abs(fit.parameters.b - 0.5)).toBeLessThan(1e-9);
    expect(relErr(fit.parameters.qi, 1200)).toBeLessThan(1e-6);
    expect(relErr(fit.parameters.Di, 1.5e-3)).toBeLessThan(1e-6);
  });

  test('hyperbolic with b OFF the grid: b within the documented 0.05 grid step', () => {
    const fit = fitArpsModel(makeSeries(1200, 1.5e-3, 0.47, 365), 'Hyperbolic');
    expect(Math.abs(fit.parameters.b - 0.47)).toBeLessThanOrEqual(0.05);
    expect(relErr(fit.parameters.qi, 1200)).toBeLessThan(0.05);
  });

  test('Auto-Select picks the generating model on clean data', () => {
    expect(fitArpsModel(makeSeries(1000, 1e-3, 0, 180), 'Auto-Select').parameters.modelType).toBe('Exponential');
    expect(fitArpsModel(makeSeries(800, 2e-3, 1, 365), 'Auto-Select').parameters.modelType).toBe('Harmonic');
    const hyp = fitArpsModel(makeSeries(1200, 1.5e-3, 0.5, 365), 'Auto-Select');
    expect(hyp.parameters.modelType).toBe('Hyperbolic');
    expect(Math.abs(hyp.parameters.b - 0.5)).toBeLessThan(1e-9);
  });
});

// ─── fit contract: windows, constraints, degenerate input ───────────────────
describe('fitArpsModel contract', () => {
  test('time window excludes out-of-window points', () => {
    // 30 days of garbage, then clean exponential re-anchored at day 30.
    const garbage = makeSeries(5000, 0, 0, 30).map((r, i) => ({ ...r, rate: 5000 + (i % 2 ? 250 : -250) }));
    const clean = makeSeries(1000, 1e-3, 0, 180, '2020-01-31');
    const fit = fitArpsModel([...garbage, ...clean], 'Exponential', {
      startDate: '2020-01-31',
      endDate: '2020-12-31',
    });
    expect(relErr(fit.parameters.qi, 1000)).toBeLessThan(1e-6);
    expect(relErr(fit.parameters.Di, 1e-3)).toBeLessThan(1e-6);
  });

  test('b constraints clamp the hyperbolic grid', () => {
    const fit = fitArpsModel(makeSeries(1200, 1.5e-3, 0.5, 365), 'Hyperbolic', null, {
      minB: 0.6,
      maxB: 2,
    });
    expect(fit.parameters.b).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });

  test('fewer than 3 usable points returns the documented empty fit', () => {
    const fit = fitArpsModel(makeSeries(1000, 1e-3, 0, 2), 'Auto-Select');
    expect(fit.parameters.modelType).toBe('None');
    expect(fit.parameters.qi).toBe(0);
    expect(fit.RMSE).toBe(Infinity);
  });
});

// ─── calculateEUR vs closed forms AND independent quadrature ────────────────
describe('calculateEUR (the sign-bug pin)', () => {
  const qi = 1000;
  const Di = 1e-3;
  const qL = 10;

  test.each([0, 0.3, 0.5, 0.9, 1.0, 1.3])(
    'b = %p matches the closed-form Arps EUR within 0.1%%',
    (b) => {
      const modelType = b === 0 ? 'exponential' : b === 1 ? 'harmonic' : 'hyperbolic';
      const eur = calculateEUR(qi, Di, b, qL, modelType);
      const truth = arpsEurClosedForm(qi, Di, b, qL);
      expect(eur).toBeGreaterThan(0); // the pre-fix bug returned NEGATIVE EUR for 0<b<1
      expect(relErr(eur, truth)).toBeLessThan(1e-3);
    },
  );

  test.each([0.3, 0.5, 1.3])(
    'b = %p also matches an independent Simpson quadrature within 0.1%%',
    (b) => {
      const eur = calculateEUR(qi, Di, b, qL, 'hyperbolic');
      expect(relErr(eur, simpsonEur(qi, Di, b, qL))).toBeLessThan(1e-3);
    },
  );

  test('hand pin: qi=1000, Di=1e-3, b=0.5, qL=10 gives +1,800,000', () => {
    // qi^b/((1−b)Di)·(qi^(1−b) − qL^(1−b)) = sqrt(1000)/(0.0005)·(sqrt(1000)−sqrt(10))
    // = 63245.55·(31.6228 − 3.1623) = 1.8e6 exactly (sqrt(1000)·sqrt(10) = 100)
    expect(calculateEUR(1000, 1e-3, 0.5, 10, 'hyperbolic')).toBeCloseTo(1_800_000, 3);
  });

  test('guards: qi at or below the limit, or non-positive Di, give 0', () => {
    expect(calculateEUR(10, 1e-3, 0.5, 10)).toBe(0);
    expect(calculateEUR(1000, 0, 0.5, 10)).toBe(0);
  });
});

// ─── generateForecast round-trips ────────────────────────────────────────────
describe('generateForecast round-trips', () => {
  test('refitting a generated forecast recovers the parameters', () => {
    const params = { qi: 1000, Di: 1e-3, b: 0.5, modelType: 'Hyperbolic' };
    const fc = generateForecast(params, { forecastDurationDays: 400, stopAtLimit: false }, T0);
    const fit = fitArpsModel(
      fc.rates.map((p) => ({ date: p.date, rate: p.rate })),
      'Hyperbolic',
    );
    // The forecast series starts at day 1, so the refit re-anchors qi to
    // q(1); compare against the model evaluated at that shift.
    expect(Math.abs(fit.parameters.b - 0.5)).toBeLessThan(1e-9);
    expect(relErr(fit.parameters.qi, arpsRate(1000, 1e-3, 0.5, 1))).toBeLessThan(1e-4);
  });

  test.each([
    [0, 'Exponential'],
    [0.5, 'Hyperbolic'],
    [1, 'Harmonic'],
  ])('timeToLimit matches the analytic inversion within 1 day (b = %p)', (b, modelType) => {
    const qi = 1000;
    const Di = 1e-3;
    const qL = 50;
    const analytic = arpsTimeToLimit(qi, Di, b, qL);
    const fc = generateForecast(
      { qi, Di, b, modelType },
      { forecastDurationDays: Math.ceil(analytic) + 400, economicLimit: qL, stopAtLimit: true },
      T0,
    );
    expect(Math.abs(fc.timeToLimit - analytic)).toBeLessThanOrEqual(1);
  });

  test('cumulative at the limit undershoots the analytic EUR by no more than 1% (daily right-rectangle bias, pinned not fixed)', () => {
    const qi = 1000;
    const Di = 1e-3;
    const qL = 50;
    for (const [b, modelType] of [[0, 'Exponential'], [0.5, 'Hyperbolic']]) {
      const truth = arpsEurClosedForm(qi, Di, b, qL);
      const fc = generateForecast(
        { qi, Di, b, modelType },
        { forecastDurationDays: 20000, economicLimit: qL, stopAtLimit: true },
        T0,
      );
      expect(fc.eur).toBeLessThanOrEqual(truth); // declining rate: right rectangles under-integrate
      expect(relErr(fc.eur, truth)).toBeLessThan(0.01);
    }
  });
});
