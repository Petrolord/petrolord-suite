/**
 * SCAL-U2-005 on the page: a saved Fluid Systems Studio project named in
 * the address (?fluidProject=<id>) is read by id, its gravities are taken
 * into the height inputs, and the shared PVT intake card says "As
 * received", then "Edited after intake" when a value is typed over.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScalStudioProvider } from '@/contexts/ScalStudioContext';
import HeightPanel from '@/components/scalstudio/HeightPanel';
import { gravitiesFromPvt } from '@/utils/scalstudio/pvtGravities';
import { goodOilBlackOil, matched, run } from '@/components/fluidstudio/__tests__/fluidTestKit';

const ws = run(matched(goodOilBlackOil()), { projectName: 'Good Oil Well No. 4 PVT', projectId: 'fluid-1' });
const ROW = { id: 'fluid-1', project_name: 'Good Oil Well No. 4 PVT', updated_at: '2026-10-02T09:00:00Z', inputs_data: { pvt: { ...ws.contract, project_id: 'fluid-1' } } };

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: global.__FLUID_ROW__, error: null })) })),
      })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

beforeAll(() => { global.__FLUID_ROW__ = ROW; });

it('takes the gravities of the project named in the address and marks an edit', async () => {
  render(
    <MemoryRouter initialEntries={['/x?fluidProject=fluid-1']}>
      <ScalStudioProvider><HeightPanel /></ScalStudioProvider>
    </MemoryRouter>,
  );
  expect(screen.getByTestId('scal-fluid-project')).toHaveValue('fluid-1');
  fireEvent.click(screen.getByTestId('scal-fluid-take'));
  const expected = gravitiesFromPvt(ROW.inputs_data.pvt).result;
  await waitFor(() => expect(Number(screen.getByTestId('height-gammaHc').value)).toBeCloseTo(expected.gammaOil, 3), { timeout: 15000 });
  expect(Number(screen.getByTestId('height-gammaW').value)).toBeCloseTo(expected.gammaWater, 3);
  await waitFor(() => expect(screen.getByTestId('pvt-intake-status')).toHaveTextContent('As received'), { timeout: 15000 });
  expect(screen.getByTestId('pvt-intake-source')).toHaveTextContent('Good Oil Well No. 4 PVT');
  fireEvent.change(screen.getByTestId('height-gammaHc'), { target: { value: '0.7' } });
  fireEvent.blur(screen.getByTestId('height-gammaHc'));
  await waitFor(() => expect(screen.getByTestId('pvt-intake-status')).toHaveTextContent('Edited after intake'), { timeout: 15000 });
});
