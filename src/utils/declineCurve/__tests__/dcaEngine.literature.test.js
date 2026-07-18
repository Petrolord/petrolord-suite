/**
 * dcaEngine oracle suite, Layer 1 — published literature fixtures.
 * (ReservoirEngineering-Module.md §3. Layer 0, the closed-form
 * self-consistency oracles, is dcaEngine.oracle.test.js.)
 *
 * Fixture doctrine (repo precedent, tools/validation/welltest): input data
 * and printed answers are typed from the source document with citations and
 * access dates in fixtures/dca-literature-fixtures.json, never recalled from
 * memory. An unarmed fixture file is a hard failure, not a silent skip. The
 * two paid references §3 names (SPEE REP #6, Poston & Poe) are tracked as
 * jest todo entries until the owner supplies the PDFs; the armed cases come
 * from a publicly served professional course document (CED Engineering
 * P03-004) whose examples are worked in exactly the Arps nominal-decline
 * forms the engine implements.
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
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(4);
    // The paid references stay visibly pending until their tables are typed.
    expect(fixtures.pending_references.length).toBeGreaterThan(0);
  });

  // Visible-but-not-failing markers for the two §3 references awaiting PDFs.
  test.todo('SPEE Recommended Evaluation Practice #6 examples (owner to supply PDF)');
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
