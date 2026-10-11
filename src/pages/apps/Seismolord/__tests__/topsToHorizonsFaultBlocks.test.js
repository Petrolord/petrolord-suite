/**
 * A fault the tracker must not cross, on the engines' exact-truth synthetic
 * field: throw 33 m (about one wavelet period, so the nearest event of the
 * right kind across the fault is the wrong one), two wells on the footwall
 * and one alone on the hanging wall, and the fault given as the automatic
 * picker leaves it (a stick every 8th inline, none on the last).
 *
 * On Ekene the same shape let the deep horizons run straight through the
 * growth fault: the barrier stopped short of the survey edge, the tracker
 * walked round its end, and the leave-one-well-out check, which re-tracked
 * without the fault jump, reported the throw as its error.
 */
import { buildSyntheticField } from '../engine/syntheticField';
import { runFieldMatch, runFrameworkTrack } from '../services/topsToHorizonsPipeline';

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) > 1e29;
const base = buildSyntheticField().spec;
const field = buildSyntheticField({
  faults: [{ ...base.faults[0], throwM: 33 }],
  wells: base.wells.filter((w) => ['W-1', 'W-2', 'W-3'].includes(w.name)),
});
const { geom, dtUs, dtMs } = field;
const ORDER = field.spec.interfaces.map((i) => i.name);
const sticks = field.truth.faults[0].sticksLattice({ everyIl: 8 }).filter((st) => st.points[0].il % 8 === 0);

const suiteWells = (f) => f.wells.map((w, i) => ({
  id: `w${i}`,
  name: w.name,
  surfaceX: w.surfaceX,
  surfaceY: w.surfaceY,
  kbM: w.kbM,
  tdMdM: w.tdMdM,
  deviation: w.deviation,
  tops: w.tops.map((t) => ({ name: t.name, md: t.md })),
  checkshots: w.checkshots,
  checkshotsDerived: false,
  logs: w.logs,
}));

let r;
beforeAll(async () => {
  const match = await runFieldMatch({
    getTrace: field.getTrace, geom, dtUs, affine: field.affine, wells: suiteWells(field), order: ORDER,
  });
  r = await runFrameworkTrack({
    getTrace: field.getTrace, geom, dtUs, match: match.match, wells: match.wells, faults: [{ name: 'F1', sticks }], lowo: true,
  });
}, 240000);

test('the fault stops 5 inlines short of the edge, as automatic sticks do', () => {
  expect(Math.max(...sticks.map((s) => s.points[0].il))).toBe(64);
  expect(geom.nIl - 1).toBe(69);
});

test('TOP_A stays on its true horizon on both sides of the fault', () => {
  const a = r.horizons.find((h) => h.name === 'TOP_A');
  const truth = field.truth.horizons.TOP_A;
  const side = field.truth.faults[0];
  let n = { hw: 0, fw: 0 };
  let ok = { hw: 0, fw: 0 };
  for (let il = 0; il < geom.nIl; il++) {
    for (let xl = 0; xl < geom.nXl; xl++) {
      const c = il * geom.nXl + xl;
      if (isNull(a.picks[c]) || isNull(truth[c])) continue;
      const k = side.sideAt(il, xl, 900) > 0 ? 'hw' : 'fw';
      n[k] += 1;
      if (Math.abs(a.picks[c] - truth[c]) <= 1) ok[k] += 1;
    }
  }
  expect(n.hw).toBeGreaterThan(500);
  expect(n.fw).toBeGreaterThan(500);
  expect(ok.hw / n.hw).toBeGreaterThan(0.95);
  expect(ok.fw / n.fw).toBeGreaterThan(0.95);
});

test('leave-one-well-out reaches the lone hanging-wall well through the jump, within a sample', () => {
  const a = r.horizons.find((h) => h.name === 'TOP_A');
  expect(a.lowo.n).toBe(3);
  expect(a.lowo.reached).toBe(3);
  expect(a.lowo.rmsMs).toBeLessThan(1.5 * dtMs);
});

describe('a horizon with wells on one side only leans on the throw measured where the others have both', () => {
  // TOP_E is left out of the hanging-wall well, so only the footwall seeds
  // it; the horizons above have a well in each block and measure the throw
  const vfield = buildSyntheticField({
    faults: [{ ...base.faults[0], throwM: 33, dipDeg: 89.5 }],
    wells: base.wells.filter((w) => ['W-1', 'W-2', 'W-3'].includes(w.name)),
  });
  const vsticks = vfield.truth.faults[0].sticksLattice({ everyIl: 8 }).filter((st) => st.points[0].il % 8 === 0);
  let vr;
  beforeAll(async () => {
    const wells = suiteWells(vfield).map((w) => (w.name === 'W-3' ? { ...w, tops: w.tops.filter((t) => t.name !== 'TOP_E') } : w));
    const match = await runFieldMatch({
      getTrace: vfield.getTrace, geom: vfield.geom, dtUs: vfield.dtUs, affine: vfield.affine, wells, order: ORDER,
    });
    vr = await runFrameworkTrack({
      getTrace: vfield.getTrace, geom: vfield.geom, dtUs: vfield.dtUs, match: match.match, wells: match.wells, faults: [{ name: 'F1', sticks: vsticks }], lowo: false,
    });
  }, 240000);

  test('TOP_E is carried across with a prior from the horizons seeded on both sides, onto its true horizon', () => {
    const e = vr.horizons.find((h) => h.name === 'TOP_E');
    const j = e.jumps.find((x) => !x.skipped);
    expect(j).toBeTruthy();
    expect(j.priorThrow).not.toBeNull();
    expect(j.priorThrow).toBeDefined();
    const truth = vfield.truth.horizons.TOP_E;
    let n = 0; let ok = 0;
    for (let c = 0; c < e.picks.length; c++) {
      if (!e.confidence || isNull(e.picks[c]) || isNull(truth[c]) || e.confidence[c] === 1) continue; // the jumped cells
      n += 1;
      if (Math.abs(e.picks[c] - truth[c]) <= 1) ok += 1;
    }
    expect(n).toBeGreaterThan(300);
    expect(ok / n).toBeGreaterThan(0.9);
  });
});
