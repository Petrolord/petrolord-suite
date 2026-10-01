/**
 * BF-U1 PL10: a 60-layer, 300 Ma column (a real Gulf of Guinea well from a
 * dated Stratigraphy column) runs in the browser thread; the time is printed
 * for the upgrade doc and bounded loosely (CI runners vary).
 */
import { SimulationEngine } from '../services/SimulationEngine';
import { finalDepthProfile } from '../services/resultsView';

test('60 layers over 300 Ma with a source every tenth layer finish and end at 0 Ma', async () => {
  const strat = Array.from({ length: 60 }, (_, i) => ({
    id: `L${i}`, name: `Layer ${i}`, ageStart: 300 - i * 5, ageEnd: 295 - i * 5, thickness: 120,
    lithology: ['shale', 'sandstone', 'limestone'][i % 3],
    sourceRock: i % 10 === 5 ? { isSource: true, toc: 3, hi: 400, kerogen: 'type2' } : { isSource: false },
  }));
  const t0 = Date.now();
  const r = await SimulationEngine.run({ stratigraphy: strat, heatFlow: { type: 'constant', value: 60 }, erosionEvents: [{ age: 30, amount: 500 }] });
  const ms = Date.now() - t0;
  // eslint-disable-next-line no-console
  console.log(`PL10: 60 layers, 300 Ma, ${r.data.timeSteps.length} steps in ${ms} ms`);
  expect(r.data.timeSteps[r.data.timeSteps.length - 1]).toBe(0);
  expect(finalDepthProfile(r)).toHaveLength(60);
  expect(ms).toBeLessThan(60000);
});
