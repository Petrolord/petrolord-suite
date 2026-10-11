/**
 * Two faults, every well on one side of the main one (Ekene kit v4: all six
 * wells sit in the growth fault's hanging wall; the buried Ekene East fault
 * has wells on both sides and almost no throw at the Ekene Sand).
 *
 * The throw measured across the second fault was the prior for every
 * fault, so the jump across the main fault searched near zero and was
 * skipped: the main fault's far block stayed empty on every horizon. Each
 * fault now keeps its own prior.
 *
 * Field: the engines' exact-truth synthetic, F1 thrown 33 m, wells W-1 and
 * W-2 on F1's footwall only, and a second fault with no throw between the
 * two wells (a crossline-parallel trace at inline 34, ending at F1).
 */
import { buildSyntheticField } from '../engine/syntheticField';
import { runFieldMatch, runFrameworkTrack } from '../services/topsToHorizonsPipeline';

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) > 1e29;
const base = buildSyntheticField().spec;
const field = buildSyntheticField({
  faults: [{ ...base.faults[0], throwM: 33 }],
  wells: base.wells.filter((w) => ['W-1', 'W-2'].includes(w.name)),
});
const { geom, dtUs } = field;
const ORDER = field.spec.interfaces.map((i) => i.name);
const F1 = field.truth.faults[0].sticksLattice({ everyIl: 8 });
// a vertical fault with no throw at inline 34, from crossline 0 to F1
const F0 = [0, 8, 16, 24, 30].map((xl) => ({
  points: [60, 160, 260, 340].map((s) => ({ il: 34, xl, s })),
}));

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
    getTrace: field.getTrace,
    geom,
    dtUs,
    match: match.match,
    wells: match.wells,
    faults: [{ name: 'F0', sticks: F0 }, { name: 'F1', sticks: F1 }],
    lowo: false,
  });
}, 240000);

test.each(['TOP_A', 'TOP_B'])('%s is carried across the main fault onto its true horizon', (name) => {
  const h = r.horizons.find((x) => x.name === name);
  const truth = field.truth.horizons[name];
  const side = field.truth.faults[0];
  let n = 0;
  let ok = 0;
  for (let il = 0; il < geom.nIl; il++) {
    for (let xl = 0; xl < geom.nXl; xl++) {
      const c = il * geom.nXl + xl;
      if (side.sideAt(il, xl, 900) <= 0 || isNull(h.picks[c]) || isNull(truth[c])) continue;
      n += 1;
      if (Math.abs(h.picks[c] - truth[c]) <= 1) ok += 1;
    }
  }
  expect(n).toBeGreaterThan(500);
  expect(ok / n).toBeGreaterThan(0.95);
  const j = h.jumps.find((x) => !x.skipped && x.fault === 'F1');
  expect(j).toBeDefined();
  expect(j.throwSamples).toBeGreaterThan(4);
});
