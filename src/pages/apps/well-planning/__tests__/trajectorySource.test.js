// Tester fix 2026-09-07: downstream Drilling studios must find a trajectory
// on a wellbore whose design was saved but never set definitive, and say
// which source they used.

import { resolveTrajectory, latestDraftWithStations, trajectorySummary } from '../services/trajectorySource';

const st = (n, inc = 0) => Array.from({ length: n }, (_, i) => ({ md: i * 30, inc: i ? inc : 0, azi: 45 }));
const WELLBORE = { id: 'wb-1', name: 'Lad', depth_unit: 'm', kb_elev_m: 25 };

describe('resolveTrajectory', () => {
  test('a definitive design with stations wins over everything', () => {
    const r = resolveTrajectory({
      wellbore: WELLBORE,
      designs: [
        { id: 'd1', name: 'Plan A', revision: 1, status: 'draft', stations: st(5, 10) },
        { id: 'd2', name: 'Plan B', revision: 2, status: 'definitive', stations: st(7, 20) },
      ],
      surveys: [{ id: 's1', is_in_definitive: true, stations: st(4, 5) }],
      geoWell: { name: 'LAD-1', deviation: st(3) },
    });
    expect(r.source).toBe('definitive');
    expect(r.design.id).toBe('d2');
    expect(r.stations).toHaveLength(7);
    expect(r.label).toMatch(/Plan B r2 \(definitive\), 7 stations/);
    expect(r.note).toBe('');
  });

  test('the tester case: one draft design with a station cache, never promoted', () => {
    const r = resolveTrajectory({
      wellbore: WELLBORE,
      designs: [{ id: 'd1', name: 'Plan A', revision: 1, status: 'draft', stations: st(220, 30), updated_at: '2026-09-07' }],
    });
    expect(r.source).toBe('draft');
    expect(r.design.id).toBe('d1');
    expect(r.stations).toHaveLength(220);
    expect(r.label).toMatch(/Plan A r1 \(draft, not yet definitive\), 220 stations/);
    expect(r.note).toMatch(/Set definitive/);
  });

  test('actual survey composite beats a draft design', () => {
    const r = resolveTrajectory({
      wellbore: WELLBORE,
      designs: [{ id: 'd1', name: 'Plan A', revision: 1, status: 'draft', stations: st(9, 30) }],
      surveys: [
        { id: 's1', is_in_definitive: true, stations: st(4, 5), computed: st(4, 6) },
        { id: 's2', is_in_definitive: false, stations: st(40, 50) },
      ],
    });
    expect(r.source).toBe('actual');
    expect(r.design).toBeNull();
    // the computed (grid) cache of the flagged run only
    expect(r.stations).toHaveLength(4);
    expect(r.stations[1].inc).toBe(6);
  });

  test('a definitive design without stations falls through to the composite and says so', () => {
    const r = resolveTrajectory({
      wellbore: WELLBORE,
      designs: [{ id: 'd2', name: 'Plan B', revision: 2, status: 'definitive', stations: [] }],
      surveys: [{ id: 's1', is_in_definitive: true, stations: st(4, 5) }],
    });
    expect(r.source).toBe('actual');
    expect(r.note).toMatch(/definitive design has no saved stations/);
  });

  test('the bridged registry deviation is the last resort', () => {
    const r = resolveTrajectory({
      wellbore: { ...WELLBORE, geo_well_id: 'geo-1' },
      designs: [{ id: 'd1', name: 'Plan A', revision: 1, status: 'draft', stations: [] }],
      geoWell: { name: 'LAD-1', deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1000, inc: 0, azi: 0 }, { md: 2000, inc: 30, azi: 90 }] },
    });
    expect(r.source).toBe('registry');
    expect(r.stations).toHaveLength(3);
    expect(r.label).toMatch(/Registry survey of LAD-1/);
  });

  test('nothing usable: an actionable note that names the next step', () => {
    const none = resolveTrajectory({ wellbore: WELLBORE });
    expect(none.source).toBe('none');
    expect(none.stations).toEqual([]);
    expect(none.note).toMatch(/add a design from the wellbore menu/);
    const noStations = resolveTrajectory({ wellbore: WELLBORE, designs: [{ id: 'd1', name: 'A', revision: 1, status: 'draft', stations: [] }] });
    expect(noStations.source).toBe('none');
    expect(noStations.note).toMatch(/Save design/);
  });

  test('a single station is never a trajectory, and malformed stations are dropped', () => {
    const r = resolveTrajectory({ wellbore: WELLBORE, designs: [{ id: 'd1', name: 'A', revision: 1, status: 'draft', stations: [{ md: 0, inc: 0, azi: 0 }] }] });
    expect(r.source).toBe('none');
    const r2 = resolveTrajectory({ wellbore: WELLBORE, designs: [{ id: 'd1', name: 'A', revision: 1, status: 'definitive', stations: [{ md: 0, inc: 0, azi: 0 }, { md: 'x' }, { md: 30, inc: 1, azi: 2 }] }] });
    expect(r2.stations).toHaveLength(2);
  });
});

describe('latestDraftWithStations', () => {
  test('highest revision wins, then the most recent update', () => {
    const d = latestDraftWithStations([
      { id: 'a', status: 'draft', revision: 1, stations: st(3), updated_at: '2026-09-07T10:00:00Z' },
      { id: 'b', status: 'draft', revision: 1, stations: st(3), updated_at: '2026-09-07T12:00:00Z' },
      { id: 'c', status: 'archived', revision: 5, stations: st(3) },
      { id: 'd', status: 'draft', revision: 3, stations: [] },
    ]);
    expect(d.id).toBe('b');
  });
});

describe('trajectorySummary', () => {
  test('counts, TD and maximum inclination', () => {
    const s = trajectorySummary(st(11, 42));
    expect(s).toEqual({ stationCount: 11, tdMdM: 300, maxIncDeg: 42, firstMdM: 0 });
    expect(trajectorySummary([])).toBeNull();
  });
});
