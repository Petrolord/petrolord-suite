// Closed loop: the golden case doc (MD sections) through ctRun reproduces
// the oracle numbers in tubular_cases.json, plus catalog resolution and the
// tubing case-delta algebra.
import golden from '../../../../../packages/engines/test-data/drilling/goldens/tubular_cases.json';
import {
  runAll, runCasingString, resolveSection, findCatalogRow, catalogRatings,
  browsableCatalog, tubingCaseDeltas, defaultCaseDoc, emwKgM3, fmtSF,
  depthDisp, depthStore,
} from '../services/ctRun';
import { goldenCaseDoc, HARNESS_STATIONS, makeInMemoryBackend } from '../services/inMemoryBackend';

const G = 9.80665;

function expectClose(a, b, rtol, atol = 0) {
  if (!Number.isFinite(a)) throw new Error(`non-finite value ${a} (expected ~ ${b})`);
  const tol = atol + rtol * Math.abs(b);
  if (Math.abs(a - b) > tol) {
    throw new Error(`expected ${a} ~ ${b} (rtol ${rtol}, atol ${atol})`);
  }
}

describe('catalog resolution', () => {
  test('golden sections resolve to the oracle SI dims', () => {
    const doc = goldenCaseDoc();
    const [s1, s2] = doc.strings.casingStrings[0].sections.map(
      (s) => resolveSection({ ...s, kind: 'casing' }),
    );
    expectClose(s1.odM, golden.sections[0].odM, 1e-12);
    expectClose(s1.wallM, golden.sections[0].wallM, 1e-12);
    expect(s1.yieldPa).toBe(golden.sections[0].yieldPa);
    expect(s1.connectionEfficiency).toBe(1.0);
    expectClose(s2.wallM, golden.sections[1].wallM, 1e-12);
    expect(s2.connectionEfficiency).toBe(0.85);
  });

  test('unknown rows and grades throw actionable errors', () => {
    expect(() => resolveSection({ odIn: 9.625, weightLbFt: 48, grade: 'L-80', kind: 'casing' }))
      .toThrow(/catalog row/);
    expect(() => resolveSection({ odIn: 9.625, weightLbFt: 47, grade: 'Z-99', kind: 'casing' }))
      .toThrow(/grade/);
    expect(findCatalogRow('tubing', 3.5, 9.3)).toBeTruthy();
    expect(findCatalogRow('tubing', 3.5, 47)).toBeNull();
  });

  test('browsable catalog carries engine ratings matching the golden table', () => {
    const cat = browsableCatalog();
    for (const r of golden.ratings) {
      const hit = cat.find((x) => x.odIn === r.odIn
        && Math.abs(x.weightLbFt - r.weightLbFt) < 1e-9 && x.grade === r.grade);
      if (!hit) continue; // golden covers 3 grades; browsable may add more
      expectClose(hit.burstPa, r.burstPa, 1e-6, 1);
      expectClose(hit.collapsePa, r.collapsePa, 1e-6, 1);
      expect(hit.collapseRegime).toBe(r.regime);
      expectClose(hit.bodyYieldN, r.bodyYieldN, 1e-6, 1);
    }
    expect(catalogRatings(findCatalogRow('casing', 9.625, 47), 'nope')).toBeNull();
  });
});

describe('golden closed loop (tubular_cases.json)', () => {
  const doc = goldenCaseDoc();
  const results = runAll({ caseDoc: doc, stations: HARNESS_STATIONS });
  const str = results.casing[0];

  test('shoe TVD and MD-weighted string weight match the oracle', () => {
    expectClose(str.shoeTvdM, golden.shoeTvdM, 1e-9, 1e-6);
    expectClose(str.weightKgM, golden.string.weightKgM, 1e-9);
  });

  for (const gc of golden.cases) {
    test(`${gc.kind}: section SFs, governing depths and status match`, () => {
      const got = str.cases.find((c) => c.kind === gc.kind);
      expect(got).toBeTruthy();
      expect(got.sections.length).toBe(gc.sections.length);
      for (let i = 0; i < gc.sections.length; i += 1) {
        const g = gc.sections[i];
        const r = got.sections[i];
        expect(r.status).toBe(g.status);
        for (const k of ['burstSF', 'collapseSF', 'tensionSF', 'triaxSF']) {
          if (g[k] == null) continue;
          expectClose(r[k], g[k], 1e-6, 1e-9);
        }
        expect(r.collapseRegime).toBe(g.collapseRegime);
        if (g.burstAtTvdM != null) expectClose(r.burstAtTvdM, g.burstAtTvdM, 1e-9, 1e-6);
        if (g.collapseAtTvdM != null) expectClose(r.collapseAtTvdM, g.collapseAtTvdM, 1e-9, 1e-6);
        expectClose(r.burstRatingPa, g.burstRatingPa, 1e-6, 1);
        expectClose(r.bodyYieldN, g.bodyYieldN, 1e-6, 1);
      }
    });
  }

  test('KPIs report the governing minimum over all cases', () => {
    const all = str.cases.flatMap((c) => c.sections.map((s) => s.burstSF))
      .filter(Number.isFinite);
    expectClose(results.kpis.minBurst.value, Math.min(...all), 1e-12);
    // Overall is the max severity over every casing and tubing case.
    const statuses = [
      ...str.cases.map((c) => c.status),
      ...results.tubing.cases.map((c) => c.status),
    ];
    const expected = statuses.includes('FAIL') ? 'FAIL'
      : statuses.includes('WARNING') ? 'WARNING' : 'PASS';
    expect(results.kpis.overall).toBe(expected);
    expect(statuses).toContain('WARNING'); // golden pressure test WARNs
    expect(results.kpis.totalCasingBuoyedN).toBeGreaterThan(0);
  });

  test('tubing cases run the Lubinski set with the golden packer', () => {
    expect(results.tubing).toBeTruthy();
    expect(results.tubing.cases.length).toBe(3);
    const prod = results.tubing.cases.find((c) => c.kind === 'production');
    // Production heats the string: thermal force is compressive (negative)
    // and large enough here to buckle the free string — a WARNING flag.
    expect(prod.loads.forces.thermalN).toBeLessThan(0);
    expect(prod.loads.buckling.state).not.toBe('none');
    expect(prod.status).toBe('WARNING');
    const stim = results.tubing.cases.find((c) => c.kind === 'stimulation');
    // Stimulation cools: thermal force is tensile; the combined shortening
    // exceeds the 1.5 m seal stroke, which is a planning FAIL.
    expect(stim.loads.forces.thermalN).toBeGreaterThan(0);
    expect(stim.loads.packer.strokeOk).toBe(false);
    expect(stim.status).toBe('FAIL');
    expect(results.tubing.erosional.veMs).toBeGreaterThan(0);
  });
});

describe('tubing case deltas', () => {
  test('balanced landed condition gives zero deltas', () => {
    const { dPiPa, dPoPa } = tubingCaseDeltas({
      lc: { params: {} },
      environment: { packerFluidKgM3: 1150, mudKgM3: 1440 },
      packerTvdM: 2000,
    });
    expectClose(dPiPa, 0, 0, 1e-9);
    expectClose(dPoPa, 0, 0, 1e-9);
  });

  test('production case: light column + surface pressure algebra', () => {
    const z = 2000;
    const { dPiPa, dPoPa } = tubingCaseDeltas({
      lc: { params: { surfacePressurePa: 10e6, internalKgM3: 700 } },
      environment: { packerFluidKgM3: 1150 },
      packerTvdM: z,
    });
    expectClose(dPiPa, 10e6 + (700 - 1150) * G * z, 1e-9);
    expectClose(dPoPa, 0, 0, 1e-9);
  });
});

describe('doc + helpers', () => {
  test('default case doc is self-consistent and runnable on the harness well', () => {
    const doc = defaultCaseDoc({ shoeMdM: 2800 });
    const res = runAll({ caseDoc: doc, stations: HARNESS_STATIONS });
    expect(res.casing.length).toBe(1);
    expect(res.tubing).toBeTruthy();
    expect(['PASS', 'WARNING', 'FAIL']).toContain(res.kpis.overall);
  });

  test('shoe beyond the trajectory throws an actionable error', () => {
    const doc = defaultCaseDoc({ shoeMdM: 9000 });
    expect(() => runAll({ caseDoc: doc, stations: HARNESS_STATIONS }))
      .toThrow(/beyond the definitive trajectory/);
  });

  test('unit and formatting helpers', () => {
    expect(fmtSF(Infinity)).toBe('n/a');
    expect(fmtSF(120)).toBe('>99');
    expect(fmtSF(1.234)).toBe('1.23');
    expectClose(emwKgM3(1440 * G * 1000, 1000), 1440, 1e-12);
    expect(emwKgM3(1e6, 0)).toBeNull();
    expectClose(depthDisp(100, 'ft'), 328.0839895, 1e-9);
    expectClose(depthStore(328.0839895, 'ft'), 100, 1e-9);
    expect(depthDisp(100, 'm')).toBe(100);
  });

  test('in-memory backend seeds the golden case', async () => {
    const be = makeInMemoryBackend();
    const cases = await be.listCases('wb-1');
    expect(cases.length).toBe(1);
    expect(cases[0].name).toBe('Golden 9-5/8 Design');
    const traj = await be.getDefinitiveTrajectory('wb-1');
    expect(traj.stations.length).toBeGreaterThan(2);
    const mw = await be.loadMudWindow();
    expect(mw.length).toBeGreaterThan(5);
    expectClose(mw[mw.length - 1].fpEmw, 1.8, 1e-9);
  });
});
