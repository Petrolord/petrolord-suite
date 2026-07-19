/**
 * FS5 black-oil regression pin.
 *
 * The compositional EOS path (FS1-FS8) is opt-in BESIDE the black-oil
 * default; this gate guarantees the default sample analysis is untouched
 * by any of that wiring. blackOilSnapshot.json was generated from the
 * engine before the FS5 UI landed.
 *
 * Deliberate black-oil changes must regenerate the snapshot in the same
 * PR (and say so in the PR description):
 *   node --experimental-specifier-resolution=node <<'EOF' ... (see the
 *   generator snippet in the PR that introduced this file)
 */
import { analyzeFluidSystem, sampleFluidStudioData } from '../fluidStudioCalculations';
import snap from './blackOilSnapshot.json';

const expectClose = (actual, expected, path) => {
  if (expected === null || expected === undefined) {
    expect(actual == null).toBe(true);
    return;
  }
  if (typeof expected === 'number') {
    const err = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-30);
    if (err > 1e-9) {
      throw new Error(`black-oil drift at ${path}: ${actual} vs pinned ${expected}`);
    }
    return;
  }
  if (typeof expected === 'object') {
    for (const k of Object.keys(expected)) expectClose(actual?.[k], expected[k], `${path}.${k}`);
    return;
  }
  expect(actual).toEqual(expected);
};

describe('FS5 pin: black-oil default is byte-stable next to the EOS path', () => {
  const inputs = sampleFluidStudioData();
  const res = analyzeFluidSystem(inputs);

  test('sample data still defaults to the black-oil model', () => {
    expect(inputs.fluidModel).toBe('black-oil');
  });

  test('KPIs match the pinned snapshot', () => {
    expectClose(res.pvt.kpis, snap.kpis, 'kpis');
    expectClose(res.pvt.pb, snap.pb, 'pb');
  });

  test('PVT table shape and pinned rows match', () => {
    expect(res.pvt.table.length).toBe(snap.tableLength);
    const t = res.pvt.table;
    const rows = [t[0], t[Math.floor(t.length / 2)], t[t.length - 1]];
    rows.forEach((row, i) => expectClose(row, snap.tableRows[i], `tableRows[${i}]`));
  });

  test('separator totals and backbone match', () => {
    expectClose(res.separator.totals, snap.separatorTotals, 'separatorTotals');
    const { pvt_table: _omit, ...backbone } = res.backbone;
    expectClose(backbone, snap.backbone, 'backbone');
  });

  test('warnings are unchanged', () => {
    expect(res.meta.warnings).toEqual(snap.warnings);
  });
});
