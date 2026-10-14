/**
 * Traps and charge in Basin & Charge Modeling (2026-10-14, Ekene basin
 * videos). Every number comes from the shipped engine run and the shipped
 * charge contract (src/lib/basinCharge.js), never a restated formula:
 *  - the expelled mass splits into oil and gas by the source's Ro when it
 *    left the rock, and the two parts always add up to the expulsion;
 *  - a trap takes the source layers on its path; two traps that each take
 *    one source add up to one trap that takes both;
 *  - oil and gas convert to the same MMboe the mass gives (6 Bcf a MMboe);
 *  - the traps file, the events chart rows and the hand-off to Prospect
 *    Risking with the trap's numbers filled in.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SimulationEngine } from '../services/SimulationEngine';
import { buildBasinCharge, writeBasinCharge, chargeAssessment, phaseSplit, inPlaceMMboe, GAS_WINDOW_RO } from '@/lib/basinCharge';
import { parseTrapsText, assessTraps, trapIntervals } from '../services/traps';
import ChargeTimingPlot from '../components/plots/ChargeTimingPlot';
import { withLayerRoles } from '../services/resultsView';
import BasinChargeNote from '@/pages/apps/ReservoirCalcPro/components/tools/BasinChargeNote';

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
let results; let payload;
beforeAll(async () => {
  const raw = await SimulationEngine.run({ stratigraphy: strat, heatFlow: { type: 'constant', value: 58.5 }, erosionEvents: [], settings: { surfaceTemp: 25, deposition: 'continuous', timeStepMa: 0.5 } });
  results = withLayerRoles(raw, strat);
  payload = buildBasinCharge(results, { name: 'Basin demo: Ekene East kitchen', stratigraphy: strat, now: new Date('2026-10-14T12:00:00Z') });
}, 120000);

const TRAPS_FILE = `trap,formed_ma,fetch_km2,migration_efficiency,charged_by,in_place,in_place_unit,note
Ekene,12,25,0.1,Upper Akata source,12.14,MMstb,oil
Oboro,16,15,0.1,Lower Akata source,60,Bcf,gas`;

test('oil and gas add up to the expulsion at every age; gas only at the gas-window Ro', () => {
  results.meta.layers.forEach((l, li) => {
    const split = phaseSplit(results.data.expulsion[li], results.data.maturity[li]);
    split.forEach((p, i) => expect(p.oil + p.gas).toBeCloseTo(results.data.expulsion[li][i].value, 9));
  });
  const u = payload.sources.find((s) => s.id === UPPER); const l = payload.sources.find((s) => s.id === LOWER);
  // the oil-prone upper source stays below 1.3 %Ro; the deeper one expels in the gas window
  expect(u.roNow).toBeLessThan(GAS_WINDOW_RO);
  expect(u.gasKgM2).toBe(0);
  expect(u.expelledKgM2).toBeGreaterThan(1000);
  expect(l.gasKgM2).toBeGreaterThan(0.9 * l.expelledKgM2);
  // control: with the window line out of reach everything is oil
  const li = results.meta.layers.findIndex((x) => x.id === LOWER);
  const allOil = phaseSplit(results.data.expulsion[li], results.data.maturity[li], 10);
  expect(allOil[allOil.length - 1].gas).toBe(0);
});

test('a trap takes its own sources; two single-source traps add up to one that takes both', () => {
  const base = { fetchAreaKm2: 20, trapAgeMa: 14, efficiency: 0.1 };
  const up = chargeAssessment(payload, { ...base, sourceIds: [UPPER] });
  const lo = chargeAssessment(payload, { ...base, sourceIds: [LOWER] });
  const both = chargeAssessment(payload, base);
  expect(up.chargeMMboe + lo.chargeMMboe).toBeCloseTo(both.chargeMMboe, 9);
  expect(up.gasBcf).toBe(0);
  expect(up.oilMMbbl).toBeCloseTo(up.chargeMMboe, 9);
  // gas in Bcf is the same mass at 6 Bcf a MMboe, within the standard-density rounding (under 1 %)
  expect(Math.abs(lo.gasBcf / 6 + lo.oilMMbbl - lo.chargeMMboe) / lo.chargeMMboe).toBeLessThan(0.01);
  expect(chargeAssessment(payload, { ...base, sourceIds: ['k0'] })).toMatchObject({ ok: false });
});

test('the kit traps: Ekene takes oil after 12 Ma, Oboro gas after 16 Ma', () => {
  const { traps, problems } = parseTrapsText(TRAPS_FILE, strat);
  expect(problems).toEqual([]);
  expect(traps.map((t) => [t.name, t.formedMa, t.fetchKm2, t.efficiency, t.sourceIds, t.inPlace, t.inPlaceUnit])).toEqual([
    ['Ekene', 12, 25, 0.1, [UPPER], 12.14, 'MMstb'], ['Oboro', 16, 15, 0.1, [LOWER], 60, 'Bcf']]);
  expect(inPlaceMMboe(60, 'Bcf')).toBe(10);
  const [ek, ob] = assessTraps(traps, payload);
  expect(ek.a.ok && ob.a.ok).toBe(true);
  expect(ek.a.gasBcf).toBe(0);
  expect(ek.a.beforeTrapFraction).toBeLessThan(0.1);
  expect(ek.a.ratio).toBeGreaterThan(2);
  expect(ek.a.factor).toBe(0.9);
  expect(ob.a.gasFraction).toBeGreaterThan(0.9);
  expect(ob.a.beforeTrapFraction).toBe(0);
  expect(ob.a.factor).toBe(0.7);
  // timing: the same Ekene trap formed at 2 Ma catches only the late part
  const late = assessTraps([{ ...traps[0], formedMa: 2 }], payload)[0];
  expect(late.a.chargeMMboe).toBeLessThan(0.4 * ek.a.chargeMMboe);
  expect(late.a.factor).toBeLessThan(ek.a.factor);
});

test('a traps file names unknown sources and falls back to every source', () => {
  const { traps, problems } = parseTrapsText('trap,formed_ma,charged_by\nX,5,Nowhere shale', strat);
  expect(traps[0].sourceIds).toEqual([]);
  expect(problems).toEqual(['Row 2: "Nowhere shale" is not a source layer of this model; X takes every source.']);
});

test('the events chart draws each trap from the age it formed', () => {
  const traps = parseTrapsText(TRAPS_FILE, strat).traps;
  expect(trapIntervals(traps)).toEqual([{ interval: [12, 0], layer: 'Ekene' }, { interval: [16, 0], layer: 'Oboro' }]);
  render(<div style={{ height: 600 }}><ChargeTimingPlot results={results} traps={traps} /></div>);
  expect(screen.getByTestId('bf-events-row-trap-Ekene')).toHaveTextContent('formed 12 Ma');
  expect(screen.getByTestId('bf-events-row-trap-Oboro')).toHaveTextContent('formed 16 Ma');
});

test('a trap sent to Prospect Risking arrives with its fetch, age, efficiency and source filled in', () => {
  const traps = parseTrapsText(TRAPS_FILE, strat).traps;
  const p = buildBasinCharge(results, { name: 'Basin demo: Ekene East kitchen', stratigraphy: strat, trap: traps[1] });
  expect(p.trap).toMatchObject({ name: 'Oboro', formedMa: 16, fetchKm2: 15, efficiency: 0.1, sourceIds: [LOWER], inPlace: 60, inPlaceUnit: 'Bcf' });
  writeBasinCharge(p);
  window.history.pushState({}, '', `/?bfCharge=${p.id}`);
  const rec = jest.fn();
  render(<BasinChargeNote meanVolume={10} unit="MMboe" basis="in-place" onRecord={rec} />);
  expect(screen.getByTestId('rcp-bf-charge-area')).toHaveValue(15);
  expect(screen.getByTestId('rcp-bf-charge-trap')).toHaveValue(16);
  expect(screen.getByTestId('rcp-bf-charge-eff')).toHaveValue(0.1);
  expect(screen.getByTestId('rcp-bf-charge')).toHaveTextContent('trap Oboro');
  expect(screen.getByTestId('rcp-bf-charge')).not.toHaveTextContent('Upper Akata source');
  const ob = assessTraps([traps[1]], payload)[0].a;
  expect(screen.getByTestId('rcp-bf-charge-result')).toHaveTextContent(`about ${ob.chargeMMboe.toPrecision(3)} MMboe reaches the trap (gas: ${ob.gasBcf.toPrecision(3)} Bcf)`);
  // the requirement is the 60 Bcf sent with the trap, not the workspace's 10 MMboe mean typed here
  expect(screen.getByTestId('rcp-bf-charge-basis')).toHaveTextContent("Compared with the 60 Bcf in place sent with the trap (this workspace's unrisked mean is 10 MMboe).");
  expect(rec).toHaveBeenLastCalledWith(expect.objectContaining({ trap: 'Oboro', sourceIds: [LOWER], suggestedFactor: 0.7 }));
  window.history.pushState({}, '', '/');
});
