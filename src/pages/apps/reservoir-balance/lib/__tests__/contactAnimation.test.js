/**
 * The animated contact section plays the computed contacts and nothing else.
 *
 * - On a timestep a frame is that timestep's contact from
 *   computeContactMovement, which a hand calculation from the engine's own
 *   We of a real run reproduces (Dake Exercise 9.2, Carter-Tracy aquifer).
 * - Between timesteps it is the straight-line interpolation of the two.
 * - Negative control: a run with no influx moves the OWC in no frame.
 * - The section's depth window holds every contact the series reaches.
 */
import { frameAt, sectionGeometry, contactExtent, playPosition } from '../contactAnimation';
import { computeContactMovement } from '../contactMovement';
import { runSample, SAMPLE_CASE_IDS } from './mbalTestKit';

const GEO = { initialOwcFt: 5060, initialGocFt: null, areaOwcAcres: 2000, porosity: 0.25, swi: 0.05, sorWater: 0.25, fluidSystem: 'oil' };

test('A-1 on every timestep the frame is the computed contact, and the hand calculation from the engine We agrees', () => {
  const s = runSample(SAMPLE_CASE_IDS.dake);
  const pd = s.result.plot_data;
  const r = computeContactMovement(GEO, pd);
  expect(r.ok).toBe(true);
  for (let i = 0; i < r.series.length; i++) {
    const fr = frameAt(r.series, i);
    expect(fr.onStep).toBe(true);
    expect(fr.owcFt).toBe(r.series[i].owcFt);
    // hand calculation: 5.615 (We - Wp Bw) / (A 43,560 phi (1 - Swi - Sorw))
    const net = (pd.We[i] ?? 0) - (pd.cum_water_stb[i] ?? 0) * (pd.Bw[i] ?? 1);
    const dh = Math.max(0, (5.615 * net) / (2000 * 43560 * 0.25 * (1 - 0.05 - 0.25)));
    expect(5060 - fr.owcFt).toBeCloseTo(dh, 9);
  }
  // the Dake aquifer moves the contact by a visible amount
  expect(r.series.at(-1).dhOwcFt).toBeGreaterThan(10);
});

test('A-2 between timesteps the contacts and the date are interpolated on a straight line', () => {
  const series = [
    { step: 0, date: '2020-01-01', pressure: 3200, owcFt: 5060, gocFt: 4950 },
    { step: 1, date: '2020-07-01', pressure: 3100, owcFt: 5050, gocFt: 4960 },
  ];
  const fr = frameAt(series, 0.25);
  expect(fr.onStep).toBe(false);
  expect(fr.owcFt).toBeCloseTo(5057.5, 9);
  expect(fr.gocFt).toBeCloseTo(4952.5, 9);
  expect(fr.pressure).toBeCloseTo(3175, 9);
  const a = Date.parse('2020-01-01T00:00:00Z'); const b = Date.parse('2020-07-01T00:00:00Z');
  expect(fr.dateMs).toBeCloseTo(a + 0.25 * (b - a), 0);
  expect(frameAt(series, 9).owcFt).toBe(5050); // clamped to the last timestep
  expect(frameAt(series, -3).owcFt).toBe(5060);
});

test('A-3 negative control: with no influx no frame moves the OWC', () => {
  const s = runSample(SAMPLE_CASE_IDS.ahmed);
  const r = computeContactMovement({ ...GEO, swi: 0.24 }, s.result.plot_data);
  expect(r.ok).toBe(true);
  for (let t = 0; t <= r.series.length - 1; t += 0.37) expect(frameAt(r.series, t).owcFt).toBe(5060);
});

test('A-4 the section holds every contact, crest above the GOC and flank below the OWC', () => {
  const series = [{ owcFt: 5060, gocFt: 4950 }, { owcFt: 5032, gocFt: 4971 }];
  const g = sectionGeometry({ initialOwcFt: 5060, initialGocFt: 4950, series });
  expect(g.crestFt).toBeLessThan(4950);
  expect(g.flankFt).toBeGreaterThan(5060);
  expect(g.minFt).toBeLessThanOrEqual(g.crestFt);
  expect(g.maxFt).toBeGreaterThanOrEqual(g.flankFt + g.thicknessFt);
  // a contact meets the top of the sand where topAt gives its depth
  const [x0, x1] = contactExtent(g, 5000);
  expect(g.topAt(x0)).toBeCloseTo(5000, 6);
  expect(g.topAt(x1)).toBeCloseTo(5000, 6);
  expect(contactExtent(g, g.crestFt - 1)).toBeNull();
});

test('A-5 playback crosses the series at a constant rate and stops on the last timestep', () => {
  expect(playPosition(9, 0, 0, 8000)).toBe(0);
  expect(playPosition(9, 0, 4000, 8000)).toBe(4);
  expect(playPosition(9, 0, 99999, 8000)).toBe(8);
  expect(playPosition(9, 2, 2000, 8000)).toBe(4);
});
