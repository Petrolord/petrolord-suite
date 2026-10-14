/**
 * Sensitivity reads what a basin modeller sweeps for (2026-10-14): the
 * source's Ro, what it expelled, the charge reaching each trap and its
 * factor. Every value comes from the engine run and chargeAssessment.
 */
import { SimulationEngine } from '../services/SimulationEngine';
import { applySweptParameter } from '../components/sensitivity/SensitivityAnalysisView';
import { sensitivityOutputs, outputValue, sweepValues } from '../services/sensitivity';
import { parseTrapsText, assessTraps } from '../services/traps';
import { buildBasinCharge } from '@/lib/basinCharge';
import { withLayerRoles } from '../services/resultsView';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

const FT = 0.3048;
// the Ekene East kitchen of the video kit (tools/demo-video/seed/basin_assets.mjs), feet to metres
const K = [
  ['Seabed', 1100, 0, 2.6, 'sandstone'], ['Benin Formation', 2760, 2.6, 5.3, 'sandstone'],
  ['Agbada Formation', 1100, 5.3, 12.5, 'mixed', 45, 55], ['Ogbia Shale', 1260, 12.5, 14.8, 'shale'],
  ['Ekene Sand', 230, 14.8, 15.4, 'sandstone'], ['Ekene Sand Base', 1360, 15.4, 21, 'mixed', 35, 65],
  ['Oboro Sand', 490, 21, 22.2, 'sandstone'], ['Oboro Sand Base', 1710, 22.2, 28, 'mixed', 25, 75],
  ['Akata Formation', 1310, 28, 33, 'shale'], ['Upper Akata source', 660, 33, 35, 'shale', null, null, { toc: 2.4, hi: 330, kerogen: 'pc-B' }],
  ['Akata middle', 1970, 35, 42, 'shale'], ['Lower Akata source', 660, 42, 45, 'shale', null, null, { toc: 2.2, hi: 220, kerogen: 'pc-F' }],
];
const strat = K.map((k, i) => ({
  id: `k${i}`, name: k[0], thickness: k[1] * FT, ageEnd: k[2], ageStart: k[3], lithology: k[4],
  ...(k[4] === 'mixed' ? { lithologyMix: { sandstone: k[5], shale: k[6], limestone: 0 } } : {}),
  sourceRock: k[7] ? { isSource: true, ...k[7] } : { isSource: false, toc: 0, hi: 0, kerogen: 'type2' },
}));
const UPPER = 'k9'; const LOWER = 'k11';
const TRAPS = parseTrapsText(`trap,formed_ma,fetch_km2,migration_efficiency,charged_by,in_place,in_place_unit
Ekene,12,25,0.1,Upper Akata source,12.14,MMstb
Oboro,16,15,0.1,Lower Akata source,60,Bcf`, strat).traps;
const state = (hf) => ({ stratigraphy: strat, heatFlow: { type: 'constant', value: hf }, erosionEvents: [], settings: { surfaceTemp: 25, deposition: 'continuous', timeStepMa: 0.5, traps: TRAPS } });
const run = (hf) => SimulationEngine.run(applySweptParameter(state(58.5), 'heatFlow', hf));

test('the outputs list the sources and every trap', () => {
  const keys = sensitivityOutputs(strat, TRAPS).map((o) => o.key);
  expect(keys).toEqual([`ro:${UPPER}`, `ro:${LOWER}`, 'roMax', 'expelled', `charge:${TRAPS[0].id}`, `charge:${TRAPS[1].id}`, `factor:${TRAPS[0].id}`, `factor:${TRAPS[1].id}`]);
  expect(sweepValues(50, 70, 5)).toEqual([50, 55, 60, 65, 70]);
});

test('a hotter basin matures the source more and charges Ekene more; values are the Analysis tab\'s', async () => {
  const [cool, base, hot] = [await run(50), await run(58.5), await run(67)];
  const o = (r, k) => outputValue(r, k, { stratigraphy: strat, traps: TRAPS });
  expect(o(hot, `ro:${UPPER}`)).toBeGreaterThan(o(base, `ro:${UPPER}`));
  expect(o(base, `ro:${UPPER}`)).toBeGreaterThan(o(cool, `ro:${UPPER}`));
  expect(o(cool, `charge:${TRAPS[0].id}`)).toBeLessThan(o(base, `charge:${TRAPS[0].id}`));
  // the same numbers the Traps and charge table shows for this run
  const payload = buildBasinCharge(withLayerRoles(base, strat), { stratigraphy: strat });
  const [ek, ob] = assessTraps(TRAPS, payload);
  expect(o(base, `charge:${TRAPS[0].id}`)).toBe(ek.a.chargeMMboe);
  expect(o(base, `factor:${TRAPS[1].id}`)).toBe(ob.a.factor);
  expect(o(base, 'expelled')).toBe(payload.expelledKgM2);
}, 120000);

test('sweeping the age a trap formed on one run: the younger the trap, the less charge', async () => {
  const base = await run(58.5);
  const ages = sweepValues(0, 20, 5);
  const charge = ages.map((a) => outputValue(base, `charge:${TRAPS[0].id}`, { stratigraphy: strat, traps: TRAPS, trapOverride: { id: TRAPS[0].id, formedMa: a } }));
  for (let i = 1; i < charge.length; i++) expect(charge[i]).toBeGreaterThanOrEqual(charge[i - 1] - 1e-9);
  expect(charge[0]).toBe(0);
}, 120000);

test('the reviewer lines name the deposition and the step', async () => {
  const { reviewerLines } = await import('../services/report');
  const lines = reviewerLines({ modelName: 'm', state: state(58.5), units: { depth: 'ft', temp: 'F' }, now: new Date('2026-10-14T00:00:00Z'), build: 'b' });
  expect(lines.join('\n')).toMatch(/continuous deposition \(each layer builds up through its interval\); 0.5 Ma steps ending at 0 Ma/);
});
