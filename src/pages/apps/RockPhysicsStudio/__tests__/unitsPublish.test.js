import {
  velocityToDisplay, velocityFromDisplay, densityToDisplay, depthToDisplay, readUnits, fmtVelocity, fmtDensity, velocityLabel, tidyDepth,
} from '../services/units';
import { preparePublishLogs, staleOwnCurves, describeFluid, ENGINE } from '../services/publish';

test('velocity converts to ft/s and to slowness and back', () => {
  expect(velocityToDisplay(3048, 'ft/s')).toBeCloseTo(10000, 9);
  expect(velocityToDisplay(3048, 'us/ft')).toBeCloseTo(100, 9);
  expect(velocityToDisplay(2000, 'us/m')).toBeCloseTo(500, 9);
  expect(velocityFromDisplay(100, 'us/ft')).toBeCloseTo(3048, 9);
  expect(velocityFromDisplay(10000, 'ft/s')).toBeCloseTo(3048, 9);
  expect(velocityToDisplay(3048, 'm/s')).toBe(3048);
  expect(Number.isNaN(velocityToDisplay(0, 'us/ft'))).toBe(true);
  expect(fmtVelocity(3048, 'us/ft')).toBe('100.00');
  expect(fmtVelocity(3048, 'ft/s')).toBe('10000');
  expect(velocityLabel('us/ft')).toBe('Slowness (us/ft)');
  expect(densityToDisplay(2250, 'g/cc')).toBe(2.25);
  expect(fmtDensity(2250, 'g/cc')).toBe('2.250');
  expect(depthToDisplay(304.8, 'ft')).toBeCloseTo(1000, 9);
});

test('readUnits falls back per field', () => {
  const storage = { getItem: () => JSON.stringify({ velocity: 'ft/s', density: 'bogus', depth: 'm' }) };
  expect(readUnits(storage)).toEqual({ velocity: 'ft/s', density: 'kg/m3', depth: 'm' });
  expect(readUnits({ getItem: () => { throw new Error('blocked'); } })).toEqual({ velocity: 'm/s', density: 'kg/m3', depth: 'ft' });
});

test('preparePublishLogs writes the substituted values inside the zone and the in-situ values outside, with provenance', () => {
  const model = { depth: [2000, 2000.5, 2001, 2001.5], vp: [3000, 3100, 3200, 3300], vs: [1500, 1550, 1600, 1650], rho: [2200, 2210, 2220, 2230], vsSource: 'measured' };
  const sub = { vp: [NaN, 2500, 2540, NaN], vs: [NaN, 1600, 1620, NaN], rho: [NaN, 2090, 2095, NaN], done: 2 };
  const zone = { name: 'GAS SAND', top_md_m: 2000.5, base_md_m: 2001 };
  const logs = preparePublishLogs(model, sub, [1, 2], zone, { scenario: { fluidA: { sw: 1, hc: { kind: 'gas', gravity: 0.6 } }, fluidB: { sw: 0.2, hc: { kind: 'gas', gravity: 0.6 } } }, rock: { kmin: 37e9 }, kmin: 37e9, projectId: 'p1', inputLogIds: ['l1'] });
  expect(logs.map((l) => l.mnemonic)).toEqual(['VP_SUB', 'VS_SUB', 'RHOB_SUB']);
  expect(Array.from(logs[0].data)).toEqual([3000, 2500, 2540, 3300]);
  expect(Array.from(logs[2].data)).toEqual([2200, 2090, 2095, 2230]);
  expect(logs[0]).toMatchObject({ unit: 'M/S', startMdM: 2000, stopMdM: 2001.5, stepM: 0.5, nSamples: 4, nullCount: 0 });
  expect(logs[0].description).toBe('P velocity, Gassmann 100% brine to 20% brine + 80% gas in GAS SAND');
  expect(logs[0].provenance).toMatchObject({ engine: ENGINE, project_id: 'p1', zone: { name: 'GAS SAND', samples: 2 }, vs_source: 'measured', input_log_ids: ['l1'] });
  const stale = staleOwnCurves([
    { mnemonic: 'VP_SUB', provenance: { computed: true, engine: ENGINE, project_id: 'p1' } },
    { mnemonic: 'VP_SUB', provenance: { computed: true, engine: ENGINE, project_id: 'other' } },
    { mnemonic: 'GR', provenance: {} },
  ], logs, 'p1');
  expect(stale).toHaveLength(1);
  expect(() => preparePublishLogs(model, sub, [], zone, {})).toThrow(/no samples/);
  expect(describeFluid({ sw: 0, hc: { kind: 'oil-live', api: 35 } })).toBe('100% live oil');
});

test('SI tables keep their own decimals; the other units carry theirs', () => {
  expect(fmtVelocity(2905.7, 'm/s', 2)).toBe('2905.70');
  expect(fmtVelocity(2905.7, 'ft/s', 2)).toBe('9533');
  expect(fmtDensity(2038.71, 'kg/m3', 2)).toBe('2038.71');
  expect(fmtDensity(2038.71, 'g/cc', 2)).toBe('2.039');
  expect(tidyDepth(2060, 'm')).toBe('2060');
  expect(tidyDepth(2060, 'ft')).toBe('6758.5');
});
