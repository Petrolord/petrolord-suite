// Which horizons may guide a worker job (QI showcase, 2026-10-16): the user's
// own, picked on the job's volume or on any of the user's volumes on its
// lattice. Shared by poststack_inversion and prestack_inversion.
import { horizonLatticeProblem } from '../src/horizonLattice.js';

const G = (count) => ({ geometry: { il: { min: 1000, max: 999 + count, step: 1, count }, xl: { min: 1960, max: 2127, step: 1, count: 168 }, ns: 876, dt_us: 4000, corners: [[0, 0], [1, 0], [0, 1]] } });
const ROWS = { near: { id: 'near', user_id: 'u', storage_path: 'u/near' }, full: { id: 'full', user_id: 'u', storage_path: 'u/full' }, small: { id: 'small', user_id: 'u', storage_path: 'u/small' }, theirs: { id: 'theirs', user_id: 'x', storage_path: 'x/theirs' } };
const MANS = { 'u/near/manifest.json': G(128), 'u/full/manifest.json': G(128), 'u/small/manifest.json': G(32) };
const ctx = { uid: 'u', volumeId: 'near', manifest: G(128), rowOf: async (id) => ROWS[id] || null, readManifest: async (p) => MANS[p] };
const h = (volume_id, user_id = 'u') => ({ id: 'h', user_id, volume_id, name: 'Top Ekene Sand' });

test('own volume and same-lattice siblings are accepted', async () => {
  expect(await horizonLatticeProblem(h('near'), ctx)).toBeNull();
  expect(await horizonLatticeProblem(h('full'), ctx)).toBeNull();
});
test('other users, missing volumes and other lattices are refused', async () => {
  expect(await horizonLatticeProblem(null, ctx)).toMatchObject({ stage: 'not_found' });
  expect(await horizonLatticeProblem(h('near', 'x'), ctx)).toMatchObject({ stage: 'not_found' });
  expect(await horizonLatticeProblem(h('theirs'), ctx)).toMatchObject({ stage: 'not_found' });
  expect(await horizonLatticeProblem(h('gone'), ctx)).toMatchObject({ stage: 'not_found' });
  expect(await horizonLatticeProblem(h('small'), ctx)).toMatchObject({ stage: 'validate_failed', message: expect.stringMatching(/Top Ekene Sand was picked on a volume with another lattice/) });
});
