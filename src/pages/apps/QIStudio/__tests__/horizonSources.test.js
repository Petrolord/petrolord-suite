// Horizons for a QI job: the volume's own, then picks on any other volume of
// its lattice (QI showcase finding, 2026-10-16: the simultaneous inversion of
// the angle stacks and the maps of its products saw no horizons, because the
// framework was picked on the full stack).
import { latticeSiblings, mergeLatticeHorizons } from '../services/horizonSources';

const meta = (ilCount = 128) => ({ il: { min: 1000, max: 999 + ilCount, step: 1, count: ilCount }, xl: { min: 1960, max: 2127, step: 1, count: 168 }, ns: 876, dt_us: 4000, corners: [[0, 0], [1, 0], [0, 1]] });
const NEAR = { id: 'near', name: 'EKENE3D-v4-near.sgy', survey_meta: meta() };
const FULL = { id: 'full', name: 'EKENE3D-v4-full.sgy', survey_meta: meta() };
const SMALL = { id: 'small', name: 'EKENE3D-v4-small.sgy', survey_meta: meta(32) };
const BARE = { id: 'bare', name: 'no meta' };

test('siblings share the lattice; the target itself and other lattices are left out', () => {
  expect(latticeSiblings(NEAR, [NEAR, FULL, SMALL, BARE]).map((v) => v.id)).toEqual(['full']);
  expect(latticeSiblings(BARE, [NEAR, FULL])).toEqual([]);
});

test('own horizons first, then the siblings named by where they were picked, no duplicates', () => {
  const own = [{ id: 'h0', name: 'Local pick', volume_id: 'near' }];
  const sib = [{ id: 'h1', name: 'Top Ekene Sand', volume_id: 'full' }, { id: 'h0', name: 'Local pick', volume_id: 'near' }, { id: 'h9', name: 'Stray', volume_id: 'small' }];
  const out = mergeLatticeHorizons(own, sib, [FULL]);
  expect(out.map((h) => h.name)).toEqual(['Local pick', 'Top Ekene Sand (on EKENE3D-v4-full.sgy)']);
  expect(out[1]).toMatchObject({ id: 'h1', picked_on: 'EKENE3D-v4-full.sgy' });
});
