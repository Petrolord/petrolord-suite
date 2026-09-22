// The shared offset loader never throws: unreadable wellbores and a
// failed registry read become notes, and cancellation stops the fetch
// loop.

jest.mock('@/lib/wellsRegistry', () => ({ listWells: jest.fn() }));
jest.mock('../services/wpApi', () => ({ listDesigns: jest.fn(), listAcRuns: jest.fn() }));

import { listWells } from '@/lib/wellsRegistry';
import { listDesigns, listAcRuns } from '../services/wpApi';
import { loadOffsetCandidates, loadSiteOffsetDesigns } from '../services/offsetLoader';

const st = [{ md: 0, inc: 0, azi: 0 }, { md: 100, inc: 0, azi: 0 }];
const wellbores = [
  { id: 'me', name: 'ME', head_x: 0, head_y: 0 },
  { id: 'a', name: 'A', head_x: 10, head_y: 0 },
  { id: 'b', name: 'B', head_x: 20, head_y: 0 },
];

beforeEach(() => { jest.resetAllMocks(); });

test('failures become notes; the saved run supplies the persisted selection', async () => {
  listDesigns.mockImplementation(async (id) => {
    if (id === 'b') throw new Error('rls');
    return [{ id: 'd', name: 'P', revision: 1, status: 'definitive', stations: st }];
  });
  listWells.mockRejectedValue(new Error('offline'));
  listAcRuns.mockResolvedValue([{ offsets: [{ id: 'wp:a' }] }, { offsets: [{ id: 'old' }] }]);
  const res = await loadOffsetCandidates({ wellbore: wellbores[0], wellbores, siteCrs: 'X', designId: 'dd' });
  expect(res.candidates.map((c) => c.id)).toEqual(['wp:a']);
  expect(res.savedRunIds).toEqual(['wp:a']);
  expect(res.notes.join(' ')).toMatch(/designs of B/);
  expect(res.notes.join(' ')).toMatch(/Registry wells could not be loaded \(offline\)/);
  expect(listDesigns).not.toHaveBeenCalledWith('me');
});

test('cancellation stops the loop and reports cancelled', async () => {
  let cancelled = false;
  listDesigns.mockImplementation(async () => { cancelled = true; return []; });
  const res = await loadSiteOffsetDesigns(wellbores, 'me', { isCancelled: () => cancelled });
  expect(res.cancelled).toBe(true);
  expect(listDesigns).toHaveBeenCalledTimes(1);
  const full = await loadOffsetCandidates({ wellbore: wellbores[0], wellbores, isCancelled: () => true });
  expect(full).toMatchObject({ cancelled: true, candidates: [] });
  expect(listWells).not.toHaveBeenCalled();
});
