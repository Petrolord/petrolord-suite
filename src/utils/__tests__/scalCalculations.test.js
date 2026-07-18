/**
 * SCAL engine suite (SC2) — Corey sets, normalization, LM fitting,
 * J-function, height-saturation, parsers. Companion:
 * scalCalculations.leverett.test.js (the Leverett-principle suite).
 */
import {
  LEVERETT_C,
  PSI_PER_FT_WATER,
  validateCoreyParams,
  buildCoreyOilWater,
  coreyKrGasOil,
  buildCoreyGasOil,
  normalizeKrTable,
  fitCoreyToKrTable,
  validatePcTable,
  validateSampleProps,
  computeJTable,
  fitJPowerLaw,
  makeJFunction,
  pcFromJ,
  heightFromPc,
  swVsHeight,
  parseKrCsv,
  parsePcCsv,
} from '../scalCalculations';
import { scaleKrTable } from '../fractionalFlowCalculations';

const OW = { Swc: 0.2, Sor: 0.25, krwMax: 0.35, kroMax: 0.9, nw: 2.6, no: 1.8 };

const coreyRows = (p, n = 15) => buildCoreyOilWater(p, { n }).rows;

describe('Corey oil-water set', () => {
  test('endpoint values and monotonicity over the mobile range', () => {
    const { rows } = buildCoreyOilWater(OW, { n: 50 });
    expect(rows[0].Sw).toBeCloseTo(OW.Swc, 12);
    expect(rows[0].krw).toBeCloseTo(0, 12);
    expect(rows[0].kro).toBeCloseTo(OW.kroMax, 12);
    const last = rows[rows.length - 1];
    expect(last.Sw).toBeCloseTo(1 - OW.Sor, 12);
    expect(last.krw).toBeCloseTo(OW.krwMax, 12);
    expect(last.kro).toBeCloseTo(0, 12);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].krw).toBeGreaterThanOrEqual(rows[i - 1].krw);
      expect(rows[i].kro).toBeLessThanOrEqual(rows[i - 1].kro);
    }
  });

  test('hand pin at mid-range: Swn = 0.5', () => {
    const midSw = OW.Swc + 0.5 * (1 - OW.Swc - OW.Sor);
    const { rows } = buildCoreyOilWater(OW, { n: 2 });
    const mid = rows[1];
    expect(mid.Sw).toBeCloseTo(midSw, 12);
    expect(mid.krw).toBeCloseTo(0.35 * 0.5 ** 2.6, 12);
    expect(mid.kro).toBeCloseTo(0.9 * 0.5 ** 1.8, 12);
  });
});

describe('Corey gas-oil set', () => {
  const GO = { Swc: 0.2, Sgc: 0.05, Sorg: 0.15, krgMax: 0.6, krogMax: 0.85, ng: 2.0, nog: 2.5 };

  test('normalized saturation denominator excludes Swc, Sgc and Sorg', () => {
    const denom = 1 - GO.Swc - GO.Sorg - GO.Sgc;
    const Sg = GO.Sgc + 0.5 * denom;
    const { Sgn, krg, krog } = coreyKrGasOil(Sg, GO);
    expect(Sgn).toBeCloseTo(0.5, 12);
    expect(krg).toBeCloseTo(0.6 * 0.5 ** 2, 12);
    expect(krog).toBeCloseTo(0.85 * 0.5 ** 2.5, 12);
  });

  test('sampled set spans Sgc to 1 - Swc - Sorg with correct endpoints', () => {
    const { rows } = buildCoreyGasOil(GO, { n: 20 });
    expect(rows[0].Sg).toBeCloseTo(GO.Sgc, 12);
    expect(rows[0].krg).toBeCloseTo(0, 12);
    const last = rows[rows.length - 1];
    expect(last.Sg).toBeCloseTo(1 - GO.Swc - GO.Sorg, 12);
    expect(last.krg).toBeCloseTo(GO.krgMax, 12);
    expect(last.krog).toBeCloseTo(0, 12);
  });
});

describe('validateCoreyParams', () => {
  test('accepts sound sets and names each violation', () => {
    expect(validateCoreyParams(OW).ok).toBe(true);
    expect(validateCoreyParams({ ...OW, Swc: 0.6, Sor: 0.5 }).errors.join(' ')).toMatch(/mobile saturation/);
    expect(validateCoreyParams({ ...OW, nw: 12 }).errors.join(' ')).toMatch(/between 0.5 and 8/);
    expect(validateCoreyParams({ ...OW, krwMax: 0 }).errors.join(' ')).toMatch(/krw endpoint/);
  });
});

describe('normalizeKrTable', () => {
  test('normalized curves round-trip through the existing scaleKrTable', () => {
    const rows = coreyRows(OW, 20);
    const norm = normalizeKrTable(rows);
    expect(norm.ok).toBe(true);
    expect(norm.rows[0].Swn).toBeCloseTo(0, 12);
    expect(norm.rows[norm.rows.length - 1].Swn).toBeCloseTo(1, 12);
    expect(norm.rows[norm.rows.length - 1].krwN).toBeCloseTo(1, 12);
    expect(norm.rows[0].kroN).toBeCloseTo(1, 12);

    // Denormalize with scaleKrTable onto new endpoints; the shape survives.
    const target = { Swc: 0.1, Sor: 0.3, krwMax: 0.5, kroMax: 0.8 };
    const scaled = scaleKrTable(rows, target, 20);
    const normScaled = normalizeKrTable(scaled);
    expect(normScaled.ok).toBe(true);
    for (let i = 0; i < norm.rows.length; i++) {
      expect(normScaled.rows[i].krwN).toBeCloseTo(norm.rows[i].krwN, 6);
      expect(normScaled.rows[i].kroN).toBeCloseTo(norm.rows[i].kroN, 6);
    }
  });

  test('rejects tables that cannot normalize', () => {
    expect(normalizeKrTable([{ Sw: 0.2, krw: 0, kro: 1 }]).ok).toBe(false);
  });
});

describe('fitCoreyToKrTable (LM, joint log-space residuals)', () => {
  test('recovers exact synthetic exponents to 1e-5', () => {
    const fit = fitCoreyToKrTable(coreyRows(OW, 15));
    expect(fit.ok).toBe(true);
    expect(fit.converged).toBe(true);
    expect(Math.abs(fit.params.nw - OW.nw)).toBeLessThan(1e-5);
    expect(Math.abs(fit.params.no - OW.no)).toBeLessThan(1e-5);
    expect(fit.params.krwMax).toBeCloseTo(OW.krwMax, 12); // taken from the table endpoint
    expect(fit.rmsLog).toBeLessThan(1e-6);
    expect(fit.r2Log).toBeGreaterThan(0.999999);
  });

  test('noisy table: exponents recovered within tolerance, CIs finite and ordered', () => {
    // Deterministic multiplicative noise, +/- up to ~8% (no Math.random in
    // tests). A single fixed draw gives no coverage guarantee for a 95% CI,
    // so the assertions are recovery-within-tolerance plus CI sanity, not
    // truth-inside-CI.
    const noisy = coreyRows(OW, 15).map((r, i) => ({
      Sw: r.Sw,
      krw: r.krw * (1 + 0.08 * Math.sin(3.1 * i + 0.7)),
      kro: r.kro * (1 + 0.08 * Math.sin(2.3 * i + 1.9)),
    }));
    // Noise breaks the exact endpoint zeros validateKrTable demands; restore them.
    noisy[0].krw = 0;
    noisy[noisy.length - 1].kro = 0;
    const fit = fitCoreyToKrTable(noisy);
    expect(fit.ok).toBe(true);
    expect(Math.abs(fit.params.nw - OW.nw)).toBeLessThan(0.2);
    expect(Math.abs(fit.params.no - OW.no)).toBeLessThan(0.2);
    for (const [lo, hi] of [fit.ci95.nw, fit.ci95.no]) {
      expect(Number.isFinite(lo)).toBe(true);
      expect(Number.isFinite(hi)).toBe(true);
      expect(hi).toBeGreaterThan(lo);
    }
    expect(fit.rmsLog).toBeLessThan(0.1);
  });

  test('fitEndpoints mode recovers endpoint kr values too', () => {
    const fit = fitCoreyToKrTable(coreyRows(OW, 15), { fitEndpoints: true });
    expect(fit.ok).toBe(true);
    expect(Math.abs(fit.params.krwMax - OW.krwMax)).toBeLessThan(1e-4);
    expect(Math.abs(fit.params.kroMax - OW.kroMax)).toBeLessThan(1e-4);
  });

  test('rejects invalid tables with the validator message', () => {
    expect(fitCoreyToKrTable([{ Sw: 0.5, krw: 0.1, kro: 0.5 }]).ok).toBe(false);
  });
});

describe('Leverett J computation and scaling', () => {
  const SAMPLE = { k_md: 100, phi: 0.25, sigma_dyncm: 72, thetaDeg: 0 };

  test('hand pin: Pc = 1 psi, sigma*cos = 72, k/phi = 400 gives J = 0.0601250', () => {
    const res = computeJTable(
      [{ Sw: 0.9, Pc_psi: 0.5 }, { Sw: 0.5, Pc_psi: 0.8 }, { Sw: 0.3, Pc_psi: 1 }],
      SAMPLE,
    );
    expect(res.ok).toBe(true);
    const row = res.rows.find((r) => r.Sw === 0.3);
    expect(row.J).toBeCloseTo(0.21645 * (1 / 72) * 20, 10);
    expect(row.J).toBeCloseTo(0.060125, 6);
  });

  test('Pc -> J -> Pc round trip is exact to 1e-12 (constant drift pin)', () => {
    const pcRows = [
      { Sw: 0.25, Pc_psi: 12.5 },
      { Sw: 0.45, Pc_psi: 4.2 },
      { Sw: 0.7, Pc_psi: 1.6 },
      { Sw: 0.95, Pc_psi: 0.4 },
    ];
    const jt = computeJTable(pcRows, SAMPLE);
    const back = pcFromJ(
      { type: 'table', rows: jt.rows.map((r) => ({ Sw: r.Sw, J: r.J })) },
      SAMPLE,
      { n: 3, SwMin: 0.25, SwMax: 0.95 },
    );
    expect(back.ok).toBe(true);
    // Grid nodes at n=3 over [0.25, 0.95] land on 0.25 and 0.95 exactly.
    expect(back.rows[0].Pc_psi).toBeCloseTo(12.5, 12);
    expect(back.rows[back.rows.length - 1].Pc_psi).toBeCloseTo(0.4, 12);
  });

  test('fitJPowerLaw recovers a synthetic power law', () => {
    const truth = { a: 0.3, b: 1.5, Swirr: 0.15 };
    const rows = [];
    for (let Sw = 0.2; Sw <= 0.92; Sw += 0.06) {
      const x = (Sw - truth.Swirr) / (1 - truth.Swirr);
      rows.push({ Sw, J: truth.a * Math.pow(x, -truth.b) });
    }
    const fit = fitJPowerLaw(rows, { Swirr: truth.Swirr });
    expect(fit.ok).toBe(true);
    expect(fit.converged).toBe(true);
    expect(Math.abs(fit.a - truth.a)).toBeLessThan(1e-6);
    expect(Math.abs(fit.b - truth.b)).toBeLessThan(1e-6);
    expect(fit.r2Log).toBeGreaterThan(0.999999);
  });

  test('makeJFunction table mode interpolates log-linearly with clamped ends', () => {
    const { j, domain } = makeJFunction({
      type: 'table',
      rows: [{ Sw: 0.3, J: 1 }, { Sw: 0.5, J: 0.25 }],
    });
    expect(domain).toEqual({ SwMin: 0.3, SwMax: 0.5 });
    expect(j(0.2)).toBe(1);
    expect(j(0.9)).toBe(0.25);
    // Log-linear midpoint: sqrt(1 * 0.25) = 0.5
    expect(j(0.4)).toBeCloseTo(0.5, 12);
  });

  test('validators name their failures', () => {
    expect(validateSampleProps({ k_md: 0, phi: 0.2, sigma_dyncm: 72, thetaDeg: 0 }).ok).toBe(false);
    expect(validatePcTable([{ Sw: 0.3, Pc_psi: 1 }, { Sw: 0.5, Pc_psi: 2 }, { Sw: 0.7, Pc_psi: 3 }]).errors.join(' '))
      .toMatch(/non-increasing/);
  });
});

describe('height above free water level', () => {
  test('hand pin: 10 psi across 0.30 specific-gravity contrast is 76.9 ft', () => {
    expect(heightFromPc(10, { gammaW: 1.05, gammaHc: 0.75 }))
      .toBeCloseTo(10 / (PSI_PER_FT_WATER * 0.3), 12);
    expect(heightFromPc(10, { gammaW: 1.05, gammaHc: 0.75 })).toBeCloseTo(76.9, 1);
  });

  test('throws on non-positive density contrast', () => {
    expect(() => heightFromPc(10, { gammaW: 0.9, gammaHc: 0.95 })).toThrow(/gammaW greater/);
  });

  test('swVsHeight returns a profile sorted by height', () => {
    const res = swVsHeight(
      { type: 'power', a: 0.3, b: 1.5, Swirr: 0.15 },
      { k_md: 100, phi: 0.25, sigma_dyncm: 26, thetaDeg: 30 },
      { gammaW: 1.05, gammaHc: 0.8 },
      { SwMin: 0.2, SwMax: 0.95, n: 30 },
    );
    expect(res.ok).toBe(true);
    for (let i = 1; i < res.rows.length; i++) {
      expect(res.rows[i].h_ft).toBeGreaterThan(res.rows[i - 1].h_ft);
      expect(res.rows[i].Sw).toBeLessThan(res.rows[i - 1].Sw); // Sw falls with height
    }
  });
});

describe('CSV parsers', () => {
  test('parseKrCsv accepts header aliases and skips bad rows with messages', () => {
    const { rows, errors } = parseKrCsv('Sw,krw,kro\n0.2,0,0.9\n0.5,abc,0.3\n0.75,0.35,0\n');
    expect(rows).toEqual([
      { Sw: 0.2, krw: 0, kro: 0.9 },
      { Sw: 0.75, krw: 0.35, kro: 0 },
    ]);
    expect(errors.join(' ')).toMatch(/Row 3/);
  });

  test('parsePcCsv requires its columns and reports what is missing', () => {
    const missing = parsePcCsv('Sw,notPc\n0.3,5\n');
    expect(missing.rows).toEqual([]);
    expect(missing.errors.join(' ')).toMatch(/pc_psi/i);
    const good = parsePcCsv('sw,Pc\n0.3,12\n0.6,4\n');
    expect(good.rows).toEqual([{ Sw: 0.3, Pc_psi: 12 }, { Sw: 0.6, Pc_psi: 4 }]);
  });

  test('LEVERETT_C is the published field-unit constant', () => {
    expect(LEVERETT_C).toBe(0.21645);
  });
});
