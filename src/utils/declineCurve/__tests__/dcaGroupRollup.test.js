import { rollupGroup, latestScenarioByWell } from '../dcaGroupRollup';

const wells = {
  w1: { id: 'w1', name: 'Alpha-1' },
  w2: { id: 'w2', name: 'Alpha-2' },
  w3: { id: 'w3', name: 'Alpha-3' },
};

const sc = (id, wellId, stream, createdAt, eur, rates) => ({
  id, name: `sc-${id}`, wellId, stream, createdAt,
  forecastResults: { eur, rates },
});

const scenarios = [
  sc('a', 'w1', 'oil', '2026-01-01T00:00:00Z', 1000, [
    { date: '2026-02-15', rate: 100 },
    { date: '2026-03-15', rate: 80 },
  ]),
  // Older w1 scenario: must lose to the one above
  sc('a0', 'w1', 'oil', '2025-06-01T00:00:00Z', 5000, [
    { date: '2026-02-15', rate: 999 },
  ]),
  sc('b', 'w2', 'oil', '2026-01-02T00:00:00Z', 600, [
    { date: '2026-02-20', rate: 50 },
    { date: '2026-04-20', rate: 30 },
  ]),
  // Wrong stream: ignored for oil roll-ups
  sc('c', 'w3', 'gas', '2026-01-03T00:00:00Z', 9999, [
    { date: '2026-02-01', rate: 7777 },
  ]),
];

describe('latestScenarioByWell', () => {
  it('keeps only the most recent scenario per well for the stream', () => {
    const latest = latestScenarioByWell(scenarios, 'oil');
    expect(Object.keys(latest).sort()).toEqual(['w1', 'w2']);
    expect(latest.w1.id).toBe('a');
  });
});

describe('rollupGroup', () => {
  const group = { id: 'g', name: 'Alpha pad', wellIds: ['w1', 'w2', 'w3'] };

  it('sums EUR across member wells with scenarios and reports the rest', () => {
    const r = rollupGroup(group, wells, scenarios, 'oil');
    expect(r.totalEur).toBe(1600);
    expect(r.perWell.map((w) => w.wellId).sort()).toEqual(['w1', 'w2']);
    expect(r.missingWells).toEqual([{ wellId: 'w3', wellName: 'Alpha-3' }]);
  });

  it('combines rates by calendar month across wells', () => {
    const r = rollupGroup(group, wells, scenarios, 'oil');
    expect(r.combinedRates).toEqual([
      { month: '2026-02', rate: 150, wells: 2 },
      { month: '2026-03', rate: 80, wells: 1 },
      { month: '2026-04', rate: 30, wells: 1 },
    ]);
  });

  it('returns null for an empty group and handles no-scenario groups', () => {
    expect(rollupGroup({ id: 'e', wellIds: [] }, wells, scenarios, 'oil')).toBeNull();
    const r = rollupGroup({ id: 'g2', wellIds: ['w3'] }, wells, scenarios, 'oil');
    expect(r.totalEur).toBe(0);
    expect(r.missingWells).toHaveLength(1);
    expect(r.combinedRates).toEqual([]);
  });
});
