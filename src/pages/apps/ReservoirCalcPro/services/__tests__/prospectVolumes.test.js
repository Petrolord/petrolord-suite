import { unriskedFromRun, runVolumeUnit, toMMboe } from '../prospectVolumes';

describe('prospect volumes handoff (RCP-T1-002/003)', () => {
  const run = { raw: {}, stats: { stooip: { mean: 228.89e6, p90: 178.81e6, p50: 225.54e6, p10: 284.03e6 }, giip: { mean: 12e9, p90: 8e9, p50: 11e9, p10: 17e9 } } };
  test('a Monte Carlo run reaches the inventory in MMSTB', () => {
    expect(unriskedFromRun(run, 'oil', 'field')).toEqual({ mean: 228.89, p90: 178.81, p50: 225.54, p10: 284.03, unit: 'MMbbl' });
  });
  test('gas in Bscf, metric in MMsm3', () => {
    expect(unriskedFromRun(run, 'gas', 'field')).toMatchObject({ mean: 12, unit: 'Bcf' });
    expect(runVolumeUnit('oil', 'metric')).toBe('MMsm3');
  });
  test('no run, no volumes', () => {
    expect(unriskedFromRun(null)).toBeNull();
    expect(unriskedFromRun({ stats: { stooip: {} } })).toBeNull();
  });
  test('boe conversion at 6 Mscf per barrel', () => {
    expect(toMMboe(6, 'Bcf')).toBeCloseTo(1, 12);
    expect(toMMboe(1, 'MMsm3')).toBeCloseTo(6.289811, 6);
    expect(toMMboe(10, 'MMbbl')).toBe(10);
  });
});
