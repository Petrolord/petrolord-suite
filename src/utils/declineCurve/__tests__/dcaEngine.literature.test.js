/**
 * dcaEngine oracle suite, Layer 1 — published literature fixtures.
 * (ReservoirEngineering-Module.md §3. Layer 0, the closed-form
 * self-consistency oracles, is dcaEngine.oracle.test.js.)
 *
 * Fixture doctrine (repo precedent, tools/validation/welltest): input data
 * and printed answers are typed from the source document with citations and
 * access dates in fixtures/dca-literature-fixtures.json, never recalled from
 * memory. An unarmed fixture file is a hard failure, not a silent skip.
 *
 * Armed sources: a publicly served professional course document (CED
 * Engineering P03-004, SC1); SPEE REP #6 itself, which grants reproduction
 * with attribution and is publicly served on whitson's manual site (SC7b —
 * closes one of the two §3 paid-reference todos with the society's own
 * canonical Table 1); and three worked examples from Ahmed, Reservoir
 * Engineering Handbook 4th ed., Ch. 16 (SC7b, the established library
 * channel). Poston & Poe (SPE 2008) remains a paid document — its todo
 * stays until the owner supplies the PDF.
 *
 * Unit bridge: the document uses nominal declines per year (or per month),
 * di = −ln(1 − de). Nominal declines scale linearly with the time unit, so
 * the engine's per-day Di is di/365 (or the engine can run per-month
 * directly with t in months). Cumulative volumes then agree without any
 * extra factor: (qi[vol/d] − q)/Di[1/d] = 365·(qi − q)/di[1/yr].
 */
import fs from 'fs';
import path from 'path';
import {
  calculateEUR,
  calculateArpsExponential,
  calculateArpsHyperbolic,
} from '../dcaEngine';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'dca-literature-fixtures.json');

describe('literature fixture harness (armed-fixture doctrine)', () => {
  test('fixture file is present and armed (missing fixtures are a hard failure)', () => {
    expect(fs.existsSync(FIXTURE_PATH)).toBe(true);
    const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    expect(fixtures.armed).toBe(true);
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(8);
    // The remaining paid reference stays visibly pending until typed.
    expect(fixtures.pending_references.length).toBeGreaterThan(0);
  });

  // Visible-but-not-failing marker for the one §3 reference still awaiting a PDF.
  test.todo('Poston & Poe (SPE 2008) worked examples (owner to supply PDF)');
});

const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const byId = (id) => fixtures.cases.find((c) => c.id === id);
const DAYS_PER_YEAR = 365;

describe('CED P03-004 (Weaver) worked examples', () => {
  test('exponential oil: q(3 yr) and Np match the printed answers', () => {
    const c = byId('ced-p03-004-exponential-oil');
    const diYear = -Math.log(1 - c.given.effective_decline_per_year);
    const DiDay = diYear / DAYS_PER_YEAR;
    const tDays = c.published.t_years * DAYS_PER_YEAR;

    const qEnd = calculateArpsExponential(c.given.qi_bbl_d, DiDay, tDays);
    expect(Math.abs(qEnd - c.published.q_end_bbl_d)).toBeLessThanOrEqual(c.tolerances.rate_abs);

    const np = calculateEUR(c.given.qi_bbl_d, DiDay, 0, qEnd, 'exponential');
    expect(Math.abs(np - c.published.np_bbl) / c.published.np_bbl).toBeLessThan(c.tolerances.np_rel);
  });

  test('shale gas hyperbolic (b = 1.2, the sign-bug branch): q(2 yr) and Np match', () => {
    const c = byId('ced-p03-004-shale-gas-hyperbolic');
    const diYear = -Math.log(1 - c.given.effective_decline_per_year);
    const DiDay = diYear / DAYS_PER_YEAR;
    const tDays = c.published.t_years * DAYS_PER_YEAR;

    const qEnd = calculateArpsHyperbolic(c.given.qi_mscf_d, DiDay, c.given.b, tDays);
    expect(Math.abs(qEnd - c.published.q_end_mscf_d)).toBeLessThanOrEqual(c.tolerances.rate_abs);

    // Np between rates IS the engine's calculateEUR with qLimit = q_end.
    const np = calculateEUR(c.given.qi_mscf_d, DiDay, c.given.b, qEnd, 'hyperbolic');
    expect(np).toBeGreaterThan(0); // pre-SC1 sign bug made every b != 1 cumulative negative
    expect(Math.abs(np - c.published.np_mscf_time_form) / c.published.np_mscf_time_form)
      .toBeLessThan(c.tolerances.np_rel);
  });

  test('harmonic rate-cumulative: all 11 printed table rows reproduce', () => {
    const c = byId('ced-p03-004-harmonic-rate-cumulative-table');
    const diYear = -Math.log(1 - c.given.effective_decline_per_year);
    const DiDay = diYear / DAYS_PER_YEAR;

    for (const row of c.published_table) {
      const tDays = row.t_years * DAYS_PER_YEAR;
      const q = calculateArpsHyperbolic(c.given.qi_bbl_d, DiDay, 1, tDays);
      expect(Math.abs(q - row.q_bbl_d)).toBeLessThanOrEqual(c.tolerances.rate_abs);
      if (row.np_bbl > 0) {
        const np = calculateEUR(c.given.qi_bbl_d, DiDay, 1, q, 'harmonic');
        const err = Math.abs(np - row.np_bbl);
        expect(err / row.np_bbl < c.tolerances.np_rel || err < c.tolerances.np_abs).toBe(true);
      }
    }
  });

  test('hyperbolic b = 1.15 monthly form: q(109 months) and Np match', () => {
    const c = byId('ced-p03-004-hyperbolic-b115-cumulative');
    // Nominal decline per month with t in months runs through the same
    // dimensionless products b*Di*t and Di*t, so the engine is called in
    // month units directly.
    const q = calculateArpsHyperbolic(c.given.qi_bbl_m, c.given.di_per_month, c.given.b, c.published.t_months);
    expect(Math.abs(q - c.published.q_bbl_m)).toBeLessThanOrEqual(c.tolerances.rate_abs);

    const np = calculateEUR(c.given.qi_bbl_m, c.given.di_per_month, c.given.b, q, 'hyperbolic');
    expect(Math.abs(np - c.published.np_bbl) / c.published.np_bbl).toBeLessThan(c.tolerances.np_rel);
  });
});

describe('SPEE REP #6 Table 1 (the society\'s canonical decline-rate table)', () => {
  // Table 1 tabulates effective decline vs nominal decline: the tangent
  // column is 1 - q_exponential(t = 1), the secant columns are
  // 1 - q_hyperbolic(t = 1; b) with qi = 1 in consistent units. The engine's
  // Arps rate forms must reproduce all 37 published rows.
  const c = byId('spee-rep6-table1-effective-nominal');

  test('tangent-effective column: all 37 rows at the 14-digit print precision', () => {
    for (const row of c.published_table) {
      const D = row.nominal_pct / 100;
      const de = 1 - calculateArpsExponential(1, D, 1);
      expect(Math.abs(de - Number(row.tangent_effective_pct) / 100))
        .toBeLessThanOrEqual(c.tolerances.tangent_frac_abs);
    }
  });

  test('secant-effective columns: all 37 rows for b = 0, 0.5, 1, 1.5, 2', () => {
    for (const row of c.published_table) {
      const D = row.nominal_pct / 100;
      for (const [bStr, printed] of Object.entries(row.secant_effective_pct)) {
        const b = Number(bStr);
        const q1 = b === 0
          ? calculateArpsExponential(1, D, 1)
          : calculateArpsHyperbolic(1, D, b, 1);
        expect(Math.abs(1 - q1 - Number(printed) / 100))
          .toBeLessThanOrEqual(c.tolerances.secant_frac_abs);
      }
    }
  });
});

describe('Ahmed REH 4th ed. Chapter 16 worked examples', () => {
  test('Example 16-1 (dry gas, rate-cumulative): times to rate and graph cumulative', () => {
    const c = byId('ahmed-reh-16-1-exponential-rate-cum');
    const { qi_mmscf_d: qi, di_lsq_per_day: diLsq, di_graph_per_day: diGraph } = c.given;

    // Part b, printed with the least-squares Di: the printed times land on
    // the printed rates through the engine's exponential form.
    expect(Math.abs(calculateArpsExponential(qi, diLsq, c.published.t_to_last_days) - c.published.q_last_mmscf_d))
      .toBeLessThanOrEqual(c.tolerances.rate_abs);
    expect(Math.abs(calculateArpsExponential(qi, diLsq, c.published.t_to_econ_days) - c.published.q_econ_mmscf_d))
      .toBeLessThanOrEqual(c.tolerances.rate_abs);

    // Part a: the book's 633,600 MMscf is a graph read off the rate-cum
    // straight line whose printed slope is the graph-point Di.
    const gp = calculateEUR(qi, diGraph, 0, c.published.q_econ_mmscf_d, 'exponential');
    expect(Math.abs(gp - c.published.gp_at_econ_mmscf) / c.published.gp_at_econ_mmscf)
      .toBeLessThan(c.tolerances.gp_rel);
  });

  test('Example 16-2 (monthly exponential): 12-row forecast table and economic limit', () => {
    const c = byId('ahmed-reh-16-2-exponential-monthly-forecast');
    const { qi_mmscf_m: qi, di_per_month: di } = c.given;

    for (const row of c.published_table) {
      const q = calculateArpsExponential(qi, di, row.t_months);
      expect(Math.abs(q - row.q_mmscf_m)).toBeLessThanOrEqual(c.tolerances.rate_abs);
      if (row.misprint) continue; // documented dropped-digit misprint in the book
      const gp = calculateEUR(qi, di, 0, q, 'exponential');
      expect(Math.abs(gp - row.gp_mmscf)).toBeLessThanOrEqual(c.tolerances.gp_abs);
    }

    // Economic limit: 30 MMscf/month is reached at the printed 97 months
    // with the printed 31.6 MMMscf cumulative.
    const tEcon = Math.log(qi / c.published.q_econ_mmscf_m) / di;
    expect(Math.abs(tEcon - c.published.t_econ_months)).toBeLessThanOrEqual(c.tolerances.t_econ_abs);
    const gpEcon = calculateEUR(qi, di, 0, c.published.q_econ_mmscf_m, 'exponential');
    expect(Math.abs(gpEcon - c.published.gp_econ_mmscf) / c.published.gp_econ_mmscf)
      .toBeLessThan(c.tolerances.gp_econ_rel);
  });

  test('Example 16-3 (Ikoku hyperbolic): all 25 forecast rows, rate and cumulative', () => {
    const c = byId('ahmed-reh-16-3-ikoku-hyperbolic-forecast');
    const { qi_mmscf_d: qi, b, di_per_year: diYear } = c.given;
    const diDay = diYear / DAYS_PER_YEAR;

    for (const row of c.published_table) {
      const q = calculateArpsHyperbolic(qi, diYear, b, row.t_years);
      expect(Math.abs(q - row.q_mmscf_d) / row.q_mmscf_d).toBeLessThan(c.tolerances.rate_rel);
      if (row.gp_mmmscf > 0) {
        // Daily-rate units: qi MMscf/day with per-day Di gives Gp in MMscf.
        const gp = calculateEUR(qi, diDay, b, q, 'hyperbolic');
        expect(Math.abs(gp - row.gp_mmmscf * 1000) / (row.gp_mmmscf * 1000))
          .toBeLessThan(c.tolerances.gp_rel);
      }
    }
  });
});
