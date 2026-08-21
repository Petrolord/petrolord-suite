/**
 * faultsService write choke point (manual-findings fix pack): the new
 * in-place stick update must reloft the derived surface exactly like
 * saveFault, so sticks and surface never drift apart.
 */

let updatePayload = null;

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (payload) => {
        updatePayload = payload;
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'f1', ...payload }, error: null }),
            }),
          }),
        };
      },
    }),
  },
}));

import { updateFaultSticks } from '@/pages/apps/Seismolord/services/faultsService';
import { loftFaultSurface } from '@/pages/apps/Seismolord/engine/faultObjects';

test('updateFaultSticks writes the sticks and a freshly lofted surface', async () => {
  const sticks = [
    { points: [{ il: 10, xl: 20, s: 100 }, { il: 10, xl: 21, s: 140 }] },
    { points: [{ il: 14, xl: 20, s: 104 }, { il: 14, xl: 21, s: 150 }] },
  ];
  const row = await updateFaultSticks({ id: 'f1' }, sticks);
  expect(row.id).toBe('f1');
  expect(updatePayload.sticks).toBe(sticks);
  expect(updatePayload.surface).toEqual(loftFaultSurface(sticks));
  expect(typeof updatePayload.updated_at).toBe('string');
});

test('a single stick lofts to a null surface, same as saveFault', async () => {
  const sticks = [{ points: [{ il: 1, xl: 2, s: 3 }, { il: 1, xl: 3, s: 4 }] }];
  await updateFaultSticks({ id: 'f1' }, sticks);
  expect(updatePayload.surface).toEqual(loftFaultSurface(sticks));
});
