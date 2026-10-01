/**
 * BF-U2-007: Petrophysics porosity and TOC as Basin inputs. KETA-2 (the
 * harness well: deviated, dated, with a PHIT and a TOC curve) is built into
 * a model through the registry door; the curves are read by their declared
 * unit, moved to the model's vertical depth through the survey, averaged by
 * layer and applied. The fitted surface porosity makes the engine's own
 * porosity equal the log's mean (the engine is called, not restated).
 */
import { buildBasinModelRow, verticalDepthOf } from '@/lib/basinHandoff';
import { REGISTRY_WELLS_DEV, REGISTRY_INTERVALS_DEV, REGISTRY_LOGS_DEV, registryCurveDev } from '../services/backend';
import { pickPetroCurves, readCurve, toModelDepth, porosityByLayer, tocByLayer, applyPorosityFit, applyToc, layerIntervals } from '../services/petroInputs';
import { BurialCompactionEngine } from '../services/BurialCompactionEngine';
import { SimulationEngine } from '../services/SimulationEngine';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const well = REGISTRY_WELLS_DEV.find((w) => w.id === 'reg-well-2');
const row = buildBasinModelRow({ well, tops: well.tops, intervals: REGISTRY_INTERVALS_DEV['reg-well-2'], userId: 'u' }).row;
const strat = row.stratigraphy.map((l) => (l.name === 'Top Paleocene Source' ? { ...l, sourceRock: { isSource: true, toc: 2, hi: 400, kerogen: 'type2' } } : l));
const logs = REGISTRY_LOGS_DEV['reg-well-2'];
const frame = verticalDepthOf(well);
const topTvd = Math.min(...strat.map((l) => l.provenance.top_tvd_m));
const samplesOf = (kind) => {
  const { [kind]: log } = pickPetroCurves(logs);
  const r = readCurve(log, registryCurveDev(log), kind);
  expect(r.ok).toBe(true);
  return toModelDepth(log, r.values, { tvdOf: frame.tvd, topTvdM: topTvd });
};

test('curves are picked, read by unit and cleaned of vendor nulls', () => {
  const p = pickPetroCurves(logs);
  expect(p.porosity.mnemonic).toBe('PHIT');
  expect(p.toc.mnemonic).toBe('TOC');
  expect(pickPetroCurves([{ mnemonic: 'PHIE', unit: 'V/V' }]).notes[0]).toMatch(/Only PHIE/);
  const toc = readCurve(p.toc, registryCurveDev(p.toc), 'toc');
  expect(toc.values.filter(Number.isFinite).length).toBe(40);
  expect(readCurve({ mnemonic: 'PHIT', unit: '%' }, [25, 30, -999.25], 'porosity').values.slice(0, 2)).toEqual([0.25, 0.3]);
  expect(readCurve({ mnemonic: 'PHIT', unit: 'PU' }, [150], 'porosity').note).toMatch(/1 sample outside 0 to 1 dropped/);
  expect(readCurve({ mnemonic: 'PHIT', unit: 'G/C3' }, [2.3], 'porosity')).toMatchObject({ ok: false, reason: expect.stringMatching(/not a fraction or percent/) });
  expect(readCurve({ mnemonic: 'TOC', unit: 'W/W' }, [0.04], 'toc').values[0]).toBeCloseTo(4, 12);
  expect(readCurve({ mnemonic: 'PHIT', unit: '' }, [22, 25, 28], 'porosity').note).toMatch(/read as percent/);
});

test('the fitted surface porosity makes the engine porosity equal the log mean over the logged depths', () => {
  const samples = samplesOf('porosity');
  const rows = porosityByLayer(samples, strat);
  const shale = rows.find((r) => r.name === 'Top Oligocene Shale');
  expect(shale.usable).toBe(true);
  expect(shale.n).toBeGreaterThan(50);
  // the log (0.50 at the surface, 0.45/km) is tighter at depth than the library shale's trend from 0.63
  expect(shale.logPhi).toBeLessThan(shale.modelPhi);
  const fitted = applyPorosityFit(strat, rows);
  const layer = fitted.find((l) => l.name === 'Top Oligocene Shale');
  expect(layer.compaction.phi0).toBeCloseTo(shale.phi0Fit, 4);
  expect(layer.provenance.phi0_from_log).toBe(true);
  const { phi0, c } = BurialCompactionEngine.resolveParams(layer);
  const iv = layerIntervals(fitted).find((x) => x.layer.id === layer.id);
  const inside = samples.filter((p) => p.z >= iv.top && p.z < iv.base);
  const engineMean = inside.reduce((a, p) => a + BurialCompactionEngine.porosity(p.z, phi0, c), 0) / inside.length;
  expect(engineMean).toBeCloseTo(shale.logPhi, 3);
  // control: before the fit the engine's mean misses the log
  const before = BurialCompactionEngine.resolveParams(strat.find((l) => l.id === layer.id));
  const was = inside.reduce((a, p) => a + BurialCompactionEngine.porosity(p.z, before.phi0, before.c), 0) / inside.length;
  expect(Math.abs(was - shale.logPhi)).toBeGreaterThan(0.02);
});

test('depths go through the survey: the deviated well reads at TVD below the model surface', () => {
  const log = logs[0];
  const viaSurvey = toModelDepth(log, registryCurveDev(log), { tvdOf: frame.tvd, topTvdM: topTvd });
  const asMd = toModelDepth(log, registryCurveDev(log), { topTvdM: 0 });
  expect(frame.basis).toBe('tvd');
  expect(viaSurvey[viaSurvey.length - 1].z).toBeLessThan(asMd[asMd.length - 1].z - 50);
});

test('the log TOC lands on the source layer only, and the run takes it', async () => {
  const rows = tocByLayer(samplesOf('toc'), strat);
  const src = rows.find((r) => r.name === 'Top Paleocene Source');
  expect(src).toMatchObject({ isSource: true, usable: true, current: 2 });
  expect(src.toc).toBeGreaterThan(4.5);
  expect(rows.filter((r) => r.usable).map((r) => r.name)).toEqual(['Top Paleocene Source']);
  const next = applyToc(strat, rows);
  expect(next.find((l) => l.name === 'Top Paleocene Source').sourceRock.toc).toBeCloseTo(src.toc, 2);
  expect(next.filter((l) => l.provenance?.toc_from_log)).toHaveLength(1);
  const gen = async (s) => {
    const r = await SimulationEngine.run({ stratigraphy: s, heatFlow: { type: 'constant', value: 90 }, erosionEvents: [], settings: { surfaceTemp: 20 } });
    const li = r.meta.layers.findIndex((l) => l.name === 'Top Paleocene Source');
    return r.data.generation[li].slice(-1)[0].value;
  };
  const g0 = await gen(strat); const g1 = await gen(next);
  expect(g1 / g0).toBeCloseTo(src.toc / 2, 2);
}, 120000);
