/**
 * The Tops to Horizons pipeline as the dialog runs it (field match with
 * automatic ties, automatic faults over an area of interest, the tracked
 * framework), on the engines' exact-truth synthetic field. The wells are
 * given in the Suite's well-row shape (surfaceX/surfaceY/kbM, tops as
 * {name, md}, effective checkshots, logs in SI).
 */
import { buildSyntheticField } from '../engine/syntheticField';
import {
  runFieldMatch, runFrameworkTrack, runFaultDetect, applyChoices, defaultAoi, clampAoi, AOI_MAX_SAMPLES,
} from '../services/topsToHorizonsPipeline';

const isNull = (v) => !Number.isFinite(v) || Math.abs(v) > 1e29;
const field = buildSyntheticField();
const { geom, dtUs, dtMs } = field;
const ORDER = field.spec.interfaces.map((i) => i.name);

const suiteWells = (f, { logs = true, shiftMs = 0 } = {}) => f.wells.map((w, i) => ({
  id: `w${i}`,
  name: w.name,
  surfaceX: w.surfaceX,
  surfaceY: w.surfaceY,
  kbM: w.kbM,
  tdMdM: w.tdMdM,
  deviation: w.deviation,
  tops: w.tops.map((t) => ({ name: t.name, md: t.md })),
  checkshots: w.checkshots.map((c) => ({ ...c, twt_ms: c.twt_ms + shiftMs })),
  checkshotsDerived: false,
  logs: logs ? w.logs : null,
}));

const accuracy = (picks, truth) => {
  let n = 0; let ok = 0;
  for (let c = 0; c < picks.length; c++) {
    if (isNull(picks[c]) || isNull(truth[c])) continue;
    n += 1;
    if (Math.abs(picks[c] - truth[c]) <= 1) ok += 1;
  }
  return { n, acc: n ? ok / n : 0 };
};

describe('field match', () => {
  test('ties every well, votes normal polarity at zero phase, and matches every top', async () => {
    const stages = new Set();
    const r = await runFieldMatch({
      getTrace: field.getTrace,
      geom,
      dtUs,
      affine: field.affine,
      wells: suiteWells(field, { shiftMs: 8 }),     // imported checkshots 8 ms late
      order: ORDER,
      onProgress: (s) => stages.add(s),
    });
    expect([...stages]).toEqual(['tie', 'tops']);
    expect(r.ties).toHaveLength(5);
    for (const t of r.ties) {
      expect(t.quality).toBe('good');
      expect(Math.abs(t.shiftMs + 8)).toBeLessThanOrEqual(dtMs);
    }
    expect(r.convention).toMatchObject({ polarity: 'normal', phaseDeg: 0 });
    // the tie became each well's time source
    for (const w of r.wells) for (const t of w.tops) expect(t.source).toBe('tie');
    const kinds = Object.fromEntries(r.match.tops.filter((t) => t.role === 'mapped').map((t) => [t.name, t.kind]));
    expect(kinds).toEqual({
      TOP_A: 'peak', TOP_B: 'trough', TOP_C: 'peak', SU: 'peak', TOP_D: 'trough', TOP_E: 'peak',
    });
    expect(r.match.tops.find((t) => t.name === 'TOP_C2').role).toBe('conformable');
    // thumbnails for the review board
    expect(r.wells[0].thumbs.TOP_A.values.length).toBeGreaterThan(40);
    expect(r.skipped).toEqual([]);
  }, 60000);

  test('without logs there is no tie: the checkshots are the time source', async () => {
    const r = await runFieldMatch({
      getTrace: field.getTrace, geom, dtUs, affine: field.affine, wells: suiteWells(field, { logs: false }), order: ORDER,
    });
    expect(r.ties).toEqual([]);
    expect(r.convention.voters).toBe(0);
    for (const w of r.wells) for (const t of w.tops) expect(t.source).toBe('checkshots');
  }, 60000);

  test('a well with no time-depth relation is skipped with its reason', async () => {
    const wells = suiteWells(field);
    wells[0] = { ...wells[0], checkshots: [] };
    const r = await runFieldMatch({
      getTrace: field.getTrace, geom, dtUs, affine: field.affine, wells, order: ORDER, autoTie: false,
    });
    expect(r.skipped).toEqual([{ name: 'W-1', reason: expect.stringMatching(/no time-depth relation/) }]);
  }, 60000);
});

describe('faults, then the framework', () => {
  let match;
  beforeAll(async () => {
    match = await runFieldMatch({
      getTrace: field.getTrace, geom, dtUs, affine: field.affine, wells: suiteWells(field), order: ORDER,
    });
  }, 60000);

  test('the default area of interest covers the wells, inside the cap', () => {
    const a = defaultAoi(match.wells, geom);
    expect(a.il0).toBe(0);
    expect(a.il1).toBe(geom.nIl - 1);
    const n = (a.il1 - a.il0 + 1) * (a.xl1 - a.xl0 + 1) * (a.s1 - a.s0 + 1);
    expect(n).toBeLessThanOrEqual(AOI_MAX_SAMPLES);
    // a huge survey is shrunk to fit
    const big = defaultAoi(match.wells, { nIl: 2000, nXl: 2000, ns: 3000 }, { marginCells: 2000, marginSamples: 3000 });
    expect((big.il1 - big.il0 + 1) * (big.xl1 - big.xl0 + 1) * (big.s1 - big.s0 + 1)).toBeLessThanOrEqual(AOI_MAX_SAMPLES);
    expect(clampAoi({ il0: 50, il1: -3, xl0: 0, xl1: 9e9, s0: 5, s1: 4 }, geom))
      .toEqual({ il0: 0, il1: 50, xl0: 0, xl1: geom.nXl - 1, s0: 4, s1: 5 });
  });

  test('an area over the cap is refused with the size', async () => {
    await expect(runFaultDetect({
      getTrace: field.getTrace, geom: { nIl: 400, nXl: 400, ns: 400 }, dtMs, aoi: { il0: 0, il1: 399, xl0: 0, xl1: 399, s0: 0, s1: 399 },
    })).rejects.toThrow(/64\.0 million samples/);
  });

  test('automatic faults in survey coordinates, then a framework that uses them stays on the truth', async () => {
    const aoi = defaultAoi(match.wells, geom);
    const det = await runFaultDetect({
      getTrace: field.getTrace, geom, dtMs, aoi,
    });
    expect(det.faults.length).toBeGreaterThanOrEqual(1);
    for (const st of det.faults[0].sticks) {
      for (const p of st.points) {
        expect(p.il).toBeGreaterThanOrEqual(aoi.il0);
        expect(p.s).toBeGreaterThanOrEqual(aoi.s0);
      }
    }
    const progress = [];
    const r = await runFrameworkTrack({
      getTrace: field.getTrace,
      geom,
      dtUs,
      match: match.match,
      wells: match.wells,
      faults: det.faults,
      onProgress: (s) => progress.push(s),
    });
    const names = r.horizons.map((h) => h.name).sort();
    expect(names).toEqual(['SU', 'TOP_A', 'TOP_B', 'TOP_C', 'TOP_C2', 'TOP_D', 'TOP_E']);
    for (const h of r.horizons) {
      if (h.role !== 'mapped' || h.name === 'TOP_C' || h.name === 'TOP_D') continue;
      const s = accuracy(h.picks, field.truth.horizons[h.name]);
      expect(s.acc).toBeGreaterThan(0.95);
      expect(h.seeds.length).toBeGreaterThanOrEqual(4);
      expect(h.confidence.length).toBe(h.picks.length);
    }
    const c2 = r.horizons.find((h) => h.name === 'TOP_C2');
    expect(c2).toMatchObject({ role: 'conformable', representative: 'TOP_C' });
    expect(r.mistieStats.rmsMs).toBeLessThan(2 * dtMs);
    // leave-one-well-out ran (small survey) and is honest
    const a = r.horizons.find((h) => h.name === 'TOP_A');
    expect(a.lowo.n).toBe(5);
    expect(a.lowo.rmsMs).toBeLessThan(dtMs);
    expect(progress.some((p) => p.startsWith('track:'))).toBe(true);
    expect(progress.some((p) => p.startsWith('lowo:'))).toBe(true);
  }, 180000);

  test('the interpreter excludes a top and moves one well to another event', () => {
    const top = match.match.tops.find((t) => t.name === 'TOP_A');
    // an event the board offers from the thumbnail (not among the voted
    // kind's alternatives): any sample is accepted
    const alt = { sample: top.atWells['W-1'].choice.sample + 8 };
    const edited = applyChoices(match.match, { exclude: ['TOP_E'], events: { TOP_A: { 'W-1': alt.sample } } });
    expect(edited.tops.map((t) => t.name)).not.toContain('TOP_E');
    const a = edited.tops.find((t) => t.name === 'TOP_A');
    expect(a.atWells['W-1'].choice.sample).toBe(alt.sample);
    expect(a.atWells['W-1'].choice.override).toBe(true);
    // the original match is untouched
    expect(top.atWells['W-1'].choice.sample).not.toBe(alt.sample);
  });
});
