/**
 * SC2 — the Leverett-principle suite.
 *
 * Leverett (1941), "Capillary Behavior in Porous Solids," Trans. AIME 142,
 * is the locked golden reference for SCAL Studio
 * (ReservoirEngineering-Module.md §4.2). The paper's central, machine-
 * testable claim is the COLLAPSE: capillary pressure curves measured on
 * rocks of different k, phi and fluid systems reduce to a single
 * dimensionless J(Sw) curve through J = C * (Pc/(sigma*cos(theta))) *
 * sqrt(k/phi). That claim is tested here EXACTLY: synthetic Pc data
 * generated for three very different rocks from one J curve must collapse
 * back to that curve to machine precision, and the multi-sample averaging
 * must return the source.
 *
 * The paper's numeric correlation is published as drainage/imbibition
 * CURVES, not tables, and the paper itself is paywalled (OnePetro,
 * SPE-941152-G). Per the repo's armed-fixture doctrine (values typed from
 * the source, never recalled), the figure-read golden joins the suite when
 * the owner supplies the paper — tracked as the todo below and in
 * SCALStudio-STATUS.md, exactly like the SPEE and Poston & Poe DCA
 * fixtures.
 */
import {
  computeJTable,
  averageJCurves,
  fitJPowerLaw,
  pcFromJ,
} from '../scalCalculations';

// One "true" J curve (a power law, evaluated on true Sw with Swirr = 0.1).
const TRUE_J = { a: 0.25, b: 1.35, Swirr: 0.1 };
const jTrue = (Sw) => TRUE_J.a * Math.pow((Sw - TRUE_J.Swirr) / (1 - TRUE_J.Swirr), -TRUE_J.b);

// Three rocks with very different k/phi and lab fluid systems.
const ROCKS = [
  { name: 'coarse sand', k_md: 850, phi: 0.31, sigma_dyncm: 72, thetaDeg: 0 },      // air-brine
  { name: 'tight sand', k_md: 8, phi: 0.12, sigma_dyncm: 367, thetaDeg: 40 },       // air-mercury convention: 480*cos(40) printed as sigma*cos pair
  { name: 'mid perm', k_md: 120, phi: 0.22, sigma_dyncm: 26, thetaDeg: 30 },        // oil-brine
];

const SW_GRID = Array.from({ length: 13 }, (_, i) => 0.2 + i * 0.06); // 0.2 .. 0.92

// Generate each rock's lab Pc from the true J: Pc = J * sigma*cos / (C*sqrt(k/phi))
const labPcFor = (rock) => {
  const back = pcFromJ(
    { type: 'table', rows: SW_GRID.map((Sw) => ({ Sw, J: jTrue(Sw) })) },
    rock,
    { n: SW_GRID.length - 1, SwMin: SW_GRID[0], SwMax: SW_GRID[SW_GRID.length - 1] },
  );
  return back.rows.map((r) => ({ Sw: r.Sw, Pc_psi: r.Pc_psi }));
};

describe('Leverett collapse (the 1941 claim, exact)', () => {
  test('three rocks with different k, phi and fluids collapse to one J curve at 1e-9', () => {
    const jTables = ROCKS.map((rock) => {
      const res = computeJTable(labPcFor(rock), rock);
      expect(res.ok).toBe(true);
      return res.rows;
    });
    for (let i = 0; i < SW_GRID.length; i++) {
      const values = jTables.map((rows) => rows[i].J);
      const spread = Math.max(...values) - Math.min(...values);
      expect(spread).toBeLessThan(1e-9);
      expect(values[0]).toBeCloseTo(jTrue(SW_GRID[i]), 9);
    }
  });

  test('averageJCurves over the three rocks returns the source curve', () => {
    const samples = ROCKS.map((rock) => ({
      name: rock.name,
      jRows: computeJTable(labPcFor(rock), rock).rows.map((r) => ({ Sw: r.Sw, J: r.J })),
    }));
    // Explicit Swirr (the Capillary tab override): without it the per-sample
    // data-min heuristic distorts the Sw* axis when true Swirr sits lower.
    const avg = averageJCurves(samples, { nGrid: 21, Swirr: TRUE_J.Swirr });
    expect(avg.ok).toBe(true);
    expect(avg.sampleCount).toBe(3);
    for (const g of avg.grid) {
      // Identical underlying curves: band collapses onto the mean.
      expect(g.Jmax - g.Jmin).toBeLessThan(1e-9);
      expect(g.count).toBe(3);
    }
    // The refit of the mean curve is a usable reservoir jSpec.
    expect(avg.fit).toBeTruthy();
    expect(avg.fit.converged).toBe(true);
    expect(avg.fit.r2Log).toBeGreaterThan(0.999);
  });

  test('a mis-scaled sample breaks the collapse (the diagnostic the plot shows)', () => {
    const rock = ROCKS[0];
    const wrongK = { ...rock, k_md: rock.k_md * 4 }; // analyst typo: 4x permeability
    const good = computeJTable(labPcFor(rock), rock).rows;
    const bad = computeJTable(labPcFor(rock), wrongK).rows;
    // sqrt(4) = 2: the bad J curve rides exactly 2x above the truth.
    for (let i = 0; i < good.length; i++) {
      expect(bad[i].J / good[i].J).toBeCloseTo(2, 9);
    }
  });

  test('fitJPowerLaw on collapsed data recovers the generating parameters', () => {
    const rows = computeJTable(labPcFor(ROCKS[2]), ROCKS[2]).rows
      .map((r) => ({ Sw: r.Sw, J: r.J }));
    const fit = fitJPowerLaw(rows, { Swirr: TRUE_J.Swirr });
    expect(fit.ok).toBe(true);
    expect(Math.abs(fit.a - TRUE_J.a)).toBeLessThan(1e-6);
    expect(Math.abs(fit.b - TRUE_J.b)).toBeLessThan(1e-6);
  });
});

describe('Leverett 1941 figure-read golden (owner-sourced)', () => {
  // The paper's unconsolidated-sand correlation figure, typed with a stated
  // curve-reading tolerance once the owner supplies the paper (paywalled;
  // armed-fixture doctrine forbids recalling the points from memory).
  test.todo('drainage J(Sw) points typed from the published figure with provenance');
});
