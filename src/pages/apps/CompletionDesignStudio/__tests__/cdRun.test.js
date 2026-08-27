// Closed loop: the golden case doc built from completion_cases.json runs
// through cdRun + the vendored engines and must reproduce the oracle's
// clearance/through-bore/volumes/space-out numbers. Plus the ct-case
// program snapshot mapping, BOM grouping, and the nodal sizing table.
import fs from 'fs';
import path from 'path';
import {
  buildGoldenCaseDoc, runAll, bomFromCase, bomCsv, programFromCtCase,
  resolveProgram, defaultCaseDoc, tubingSizingTable, catalogForTubingSize,
  componentFromCatalog, EQUIPMENT_CATALOG,
} from '../services/cdRun';
import { buildGoldenCaseDoc as buildCtGolden } from '../../CasingTubingDesignPro/services/ctRun';

const goldensDir = path.join(
  __dirname, '..', '..', '..', '..', '..', 'packages', 'engines', 'test-data', 'drilling', 'goldens',
);
const golden = JSON.parse(fs.readFileSync(path.join(goldensDir, 'completion_cases.json'), 'utf8'));
const tubularGolden = JSON.parse(fs.readFileSync(path.join(goldensDir, 'tubular_cases.json'), 'utf8'));

const close = (a, b, rtol = 1e-9, atol = 0) => {
  expect(Number.isFinite(a)).toBe(true);
  expect(Math.abs(a - b)).toBeLessThanOrEqual(atol + rtol * Math.abs(b));
};

describe('golden closed loop', () => {
  const doc = buildGoldenCaseDoc(golden);
  const res = runAll({ caseDoc: doc });

  test('stack-up reproduces the oracle rows', () => {
    close(res.stack.bottomMdM, golden.results.bottomMdM, 1e-9);
    golden.results.stackRows.forEach((r, i) => {
      close(res.stack.components[i].topMdM, r.topMdM, 1e-9, 1e-9);
      close(res.stack.components[i].bottomMdM, r.bottomMdM, 1e-9, 1e-9);
    });
  });

  test('clearance rows, statuses and controlling strings match', () => {
    expect(res.clearance.rows.length).toBe(golden.results.clearance.length);
    res.clearance.rows.forEach((r, i) => {
      const g = golden.results.clearance[i];
      close(r.clearanceM, g.clearanceM, 1e-6, 1e-9);
      expect(r.status).toBe(g.status);
      expect(r.controlling).toBe(g.controlling);
    });
  });

  test('through-bore and volumes match the oracle', () => {
    close(res.throughBore.minIdM, golden.results.throughBore.minIdM, 1e-6);
    expect(res.throughBore.controlling).toBe(golden.results.throughBore.controlling);
    const g = golden.results.volumes;
    close(res.volumes.stringCapacityM3, g.stringCapacityM3, 1e-6);
    close(res.volumes.annulusAbovePackerM3, g.annulusAbovePackerM3, 1e-6);
    close(res.volumes.belowPackerM3, g.belowPackerM3, 1e-6);
    expect(res.volumes.warnings).toEqual([]);
  });

  test('space-out card reproduces the golden heating case; KPIs are honest', () => {
    const g = golden.results.spaceOut[0];
    close(res.spaceOut.remainingM, g.result.remainingM, 1e-12);
    expect(res.spaceOut.status).toBe(g.result.status);
    expect(res.kpis.componentCount).toBe(doc.string.components.length);
    expect(res.kpis.banner).toBe('PASS');
    expect(res.kpis.throughBoreControlling).toMatch(/XN/);
  });
});

describe('program handling', () => {
  test('ct-case snapshot maps the D6 golden casing program', () => {
    const ctDoc = buildCtGolden(tubularGolden);
    const prog = programFromCtCase({ id: 'ct-1', name: 'Golden', ...ctDoc });
    expect(prog.source).toBe('ct_case');
    expect(prog.strings.length).toBe(1);
    expect(prog.strings[0].sections.map((s) => s.weightLbFt)).toEqual([47, 53.5]);
    const resolved = resolveProgram(prog);
    close(resolved[0].sections[0].idM, 8.681 * 0.0254, 1e-9);
  });

  test('unknown casing rows fail loudly', () => {
    expect(() => resolveProgram({
      strings: [{ name: 'x', sections: [{ topMdM: 0, bottomMdM: 100, odIn: 9.625, weightLbFt: 99 }] }],
    })).toThrow(/catalog/);
  });
});

describe('BOM', () => {
  test('groups identical items and keeps the nominal-dimensions marker', () => {
    const doc = buildGoldenCaseDoc(golden);
    const bom = bomFromCase(doc);
    const tubing = bom.find((r) => r.type === 'tubing');
    expect(tubing.quantity).toBeGreaterThan(1);
    close(
      bom.reduce((s, r) => s + r.totalLengthM, 0),
      golden.results.bottomMdM - golden.stack.hangerMdM,
      1e-9,
    );
    const csv = bomCsv(doc);
    expect(csv).toMatch(/verify vendor sheet/);
    expect(csv.split('\n').length).toBe(bom.length + 1);
  });
});

describe('default doc and catalog helpers', () => {
  test('default case doc runs clean and passes', () => {
    const res = runAll({ caseDoc: defaultCaseDoc({ tdMdM: 3000 }) });
    expect(res.kpis.banner).toBe('PASS');
    expect(res.volumes.warnings).toEqual([]);
  });

  test('catalogForTubingSize filters by size and keeps packers', () => {
    const kit = catalogForTubingSize(3.5);
    expect(kit.some((r) => r.type === 'packer')).toBe(true);
    expect(kit.some((r) => r.forTubingOdIn === 2.875)).toBe(false);
    const c = componentFromCatalog(EQUIPMENT_CATALOG[0], { lengthM: 42 });
    expect(c.lengthM).toBe(42);
    expect(c.id).toBeTruthy();
  });
});

describe('tubing sizing (Production nodal engine)', () => {
  test('friction falls monotonically with tubing ID at fixed rate', () => {
    const { rows } = tubingSizingTable({
      sizing: {
        whpPsi: 250, qoStbd: 3000, wct: 0.2, gor: 500, api: 35, gasSg: 0.75,
        whtF: 90, bhtF: 210, correlation: 'beggsBrill',
      },
      stations: null,
      nodeMdM: 2600,
    });
    expect(rows.length).toBeGreaterThan(3);
    const ordered = [...rows].sort((a, b) => a.idIn - b.idIn);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i].frictionPsi).toBeLessThan(ordered[i - 1].frictionPsi);
    }
    for (const r of rows) {
      expect(r.ok).toBe(true);
      expect(r.bhpPsi).toBeGreaterThan(250);
    }
  });

  test('deviated survey path uses the golden slant stations', () => {
    const geomechGolden = JSON.parse(
      fs.readFileSync(path.join(goldensDir, 'geomech_cases.json'), 'utf8'),
    );
    const slant = geomechGolden.cases.find((c) => c.well === 'slant');
    const { rows, nodeMdFt } = tubingSizingTable({
      sizing: { whpPsi: 250, qoStbd: 2000, wct: 0.1, gor: 400 },
      stations: slant.stations,
      nodeMdM: 2600,
    });
    close(nodeMdFt, 2600 * 3.280839895, 1e-9);
    expect(rows.every((r) => Number.isFinite(r.bhpPsi))).toBe(true);
  });
});
