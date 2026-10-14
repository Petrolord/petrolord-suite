import { matchTopName, defaultZone, defaultSectionPair } from '../services/stackDefaults';

const EKENE_TOPS = ['Seabed', 'Benin Formation', 'Agbada Formation', 'Ogbia Shale', 'Ekene Sand', 'Ekene Sand Base', 'Oboro Unconformity', 'Oboro Sand', 'Oboro Sand Base', 'Akata Formation'];
const EKENE_ZONES = ['Seabed', 'Benin Formation', 'Agbada Formation', 'Ogbia Shale', 'Ekene Sand', 'Ekene Sand Base', 'Oboro Unconformity', 'Oboro Sand', 'Oboro Sand Base'];

describe('tie tops from surface names (Ekene walk 2026-10-14)', () => {
  test.each([
    ['Ekene Sand top (6-well map)', 'Ekene Sand'],
    ['Ekene Sand base (6-well map)', 'Ekene Sand Base'],
    ['Ekene Sand (depth ft)', 'Ekene Sand'],
    ['Ekene Sand Base (2) (depth ft)', 'Ekene Sand Base'],
    ['WDS demo: Oboro Sand top', 'Oboro Sand'],
    ['Oboro Sand', 'Oboro Sand'],
    ['Ekene Sand (TWT ms)', 'Ekene Sand'],
    ['Something else', ''],
  ])('%s ties to "%s"', (surface, top) => {
    expect(matchTopName(surface, EKENE_TOPS)).toBe(top);
  });
  test('exact names still win and the harness names are unchanged', () => {
    expect(matchTopName('TopA', ['TopA', 'TopB', 'BaseB'])).toBe('TopA');
    expect(matchTopName('BaseB', ['TopA', 'TopB', 'BaseB'])).toBe('BaseB');
  });
});

describe('the zone a new model zone reads', () => {
  test('the zone named after the tie top above it', () => {
    expect(defaultZone(0, 'Ekene Sand', EKENE_ZONES)).toEqual({ name: 'Ekene Sand', registryZone: 'Ekene Sand' });
  });
  test('never the first zone of the list when nothing matches (the Seabed defect)', () => {
    expect(defaultZone(0, '', EKENE_ZONES)).toEqual({ name: 'Zone 1', registryZone: '' });
    expect(defaultZone(2, 'Akata Formation', EKENE_ZONES)).toEqual({ name: 'Zone 3', registryZone: '' });
  });
  test('harness tops TopA/TopB read zones A/B', () => {
    expect(defaultZone(0, 'TopA', ['A', 'B']).registryZone).toBe('A');
    expect(defaultZone(1, 'TopB', ['A', 'B']).registryZone).toBe('B');
  });
});

test('the first section pair skips wells with no tops', () => {
  const wells = [{ id: 'c', name: 'PPS demo: Ekene-1', tops: [] }, { id: '9', name: 'Ekene-9', tops: [{}] }, { id: '1', name: 'Ekene-1', tops: [{}] }, { id: '2', name: 'Ekene-2', tops: [{}] }];
  expect(defaultSectionPair(wells)).toEqual({ a: '1', b: '2' });
});
