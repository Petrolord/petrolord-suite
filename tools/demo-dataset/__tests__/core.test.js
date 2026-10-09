// Kit v2.1 core analysis gate: the plugs cut from the truth rows must give the
// Studio's own core transform (fitPoroPerm, the Core dialog's fit) a result
// consistent with the three SCAL plugs and the LOCKED reservoir permeability,
// and must sit on the well's depth grid so an import keeps each plug at its
// depth. Negative control: the same plugs with permeability shuffled carry no
// transform.
import { buildKit } from '../build.mjs';
import { CORED, cutPlugs, coreLasRows, kTruth } from '../core.mjs';
import { writeLas } from '../writers/las.mjs';
import { parseLas } from '../../../packages/engines/engines/welldata/lasParse';
import { fitPoroPerm, kFromFit } from '../../../src/pages/apps/PetrophysicsStudio/services/coreData';

let kit;
beforeAll(() => { kit = buildKit(); });
const plugsOf = (c) => cutPlugs(kit.built.find((b) => b.well.name === c.well).rows, c);

test('the permeability model passes through the LOCKED 250 mD at phi 0.20 and the SCAL plugs', () => {
  expect(kTruth(0.2)).toBeCloseTo(250, 6);
  expect(kTruth(0.23) / 420).toBeGreaterThan(0.9); expect(kTruth(0.23) / 420).toBeLessThan(1.25);
  expect(kTruth(0.16) / 95).toBeGreaterThan(0.9); expect(kTruth(0.16) / 95).toBeLessThan(1.25);
});

describe.each(CORED.map((c) => [c.well, c]))('%s core', (_name, c) => {
  test('enough sand plugs, one per foot, and a transform the Core dialog would fit', () => {
    const plugs = plugsOf(c);
    expect(plugs.length).toBeGreaterThanOrEqual(25);
    for (let j = 1; j < plugs.length; j++) expect(plugs[j].ft - plugs[j - 1].ft).toBeGreaterThan(0.99);
    const fit = fitPoroPerm(plugs.map((p) => ({ phi: p.cpor, k: p.ckh })));
    expect(fit.ok).toBe(true);
    expect(fit.r2).toBeGreaterThan(0.5);
    // the fitted transform recovers the truth model (slope 9.2, 250 mD at 0.20)
    expect(fit.b).toBeGreaterThan(7); expect(fit.b).toBeLessThan(11.5);
    const k20 = kFromFit(fit, 0.2);
    expect(k20).toBeGreaterThan(190); expect(k20).toBeLessThan(330);
  });
  test('negative control: shuffled permeability carries no transform', () => {
    const plugs = plugsOf(c);
    const ks = plugs.map((p) => p.ckh);
    const shuffled = plugs.map((p, j) => ({ phi: p.cpor, k: ks[(j * 7 + 3) % ks.length] }));
    expect(fitPoroPerm(shuffled).r2).toBeLessThan(0.3);
  });
});

test('the Ekene-1 core LAS sits on the well grid: every plug depth is a well sample, nulls between', () => {
  const b = kit.built.find((x) => x.well.name === 'Ekene-1');
  const plugs = plugsOf(CORED[0]);
  const las = parseLas(writeLas({ well: 'Ekene-1', curves: ['CPOR', 'CKH'], rows: coreLasRows(b.rows, plugs), header: { params: {} } }));
  const curve = (m) => las.curves.find((c) => c.mnemonic === m)?.data;
  const dept = curve('DEPT') || las.depth;
  const cpor = curve('CPOR');
  // both files write depth at 4 dp; the parser holds float32, so match within 3e-4 m
  const wellDepths = b.rows.map((r) => Number(r.md.toFixed(4)));
  let n = 0; let k = 0;
  for (let i = 0; i < dept.length; i++) {
    while (k < wellDepths.length - 1 && wellDepths[k] < dept[i] - 3e-4) k += 1;
    expect(Math.abs(wellDepths[k] - dept[i])).toBeLessThan(3e-4);
    if (Number.isFinite(cpor[i])) n += 1;
  }
  expect(n).toBe(plugs.length);
});
