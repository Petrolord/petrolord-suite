// The Fluids & Gassmann depth axis printed its raw ends after a metre to foot
// conversion ("197.0000029236" on screen, found recording the QI videos).
import { depthTick, conditionsLabel } from '../components/FluidsPanel';

test('depth ticks are whole depths', () => {
  expect(depthTick(197.0000029236)).toBe('197');
  expect(depthTick(5183.7000002)).toBe('5184');
  expect(depthTick(NaN)).toBeNaN();
});

test('the pore-fluids header rounds the conditions typed in degF and psi', () => {

  expect(conditionsLabel({ tC: 82.22222222222223, pMPa: 22.063223338138755 })).toBe('82.2 °C / 22.06 MPa');
});

test('with Sw from the SW log, the fluids table shows the brine and the hydrocarbon the log mixes, not a lone brine row', async () => {
  const { fluidTable } = await import('../components/FluidsPanel');
  const scenario = {
    conditions: { tC: 82.2, pMPa: 22.06, salinity: 0.035 },
    fluidA: { sw: 1, swFromLog: true, hc: { kind: 'oil-live', api: 32, gorLL: 71.2, gasGravity: 0.75 } },
    fluidB: { sw: 1, hc: { kind: 'gas', gravity: 0.6 } },
  };
  const t = fluidTable(scenario, true);
  expect(t.perSample).toBe(true);
  expect(t.a.label).toMatch(/^brine, mixed per sample by the SW log$/);
  expect(t.aHc.label).toMatch(/^live oil, mixed per sample by the SW log$/);
  expect(t.aHc.rho).toBeLessThan(t.a.rho);
  // negative controls: no SW curve on the well, or the box unticked, keeps the typed Sw
  for (const s of [fluidTable(scenario, false), fluidTable({ ...scenario, fluidA: { ...scenario.fluidA, swFromLog: false } }, true)]) {
    expect(s.perSample).toBe(false);
    expect(s.a.label).toBe('brine');
    expect(s.aHc).toBeUndefined();
  }
});
