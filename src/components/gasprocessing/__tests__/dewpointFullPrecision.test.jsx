// W3 (D3): the Joule-Thomson card under the shared Full precision switch.
// Off, it prints as before. On, the dew-point chain prints at 6 decimals
// (the JT coefficient at 6 in F/100 psi) and dz/dT appears at 9, all read
// from the context's own engine result.
import React from 'react';
import { render, screen, act } from '@testing-library/react';

jest.mock('@/utils/savedProjects', () => {
  const service = {
    list: jest.fn(() => Promise.resolve([])), load: jest.fn(), save: jest.fn(), remove: jest.fn(),
  };
  return { createSavedProjectsService: () => service };
});
jest.mock('@/lib/customSupabaseClient', () => {
  const builder = {
    select: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return { supabase: { from: jest.fn(() => builder) } };
});

import { GasProcessingProvider, useGasProcessing } from '@/contexts/GasProcessingContext';
import { FullPrecisionProvider } from '@/components/fullprecision/FullPrecision';
import { DewpointResults } from '@/components/gasprocessing/SweeteningDewPanels';
import { formatFull } from '@/lib/fullPrecision';

let d;
const Probe = () => { d = useGasProcessing().dewpoint; return null; };
const mount = async (full) => act(async () => {
  render(
    <GasProcessingProvider>
      <FullPrecisionProvider initial={full}><Probe /><DewpointResults /></FullPrecisionProvider>
    </GasProcessingProvider>,
  );
});
const statValue = (label) => screen.getByText(label).nextSibling.textContent;

test('off: the card prints one decimal and no dz/dT', async () => {
  await mount(false);
  expect(d.error).toBeUndefined();
  expect(statValue('Cooling across the drop')).toMatch(/^\d+\.\d F$/);
  expect(screen.queryByText('z temperature derivative at the inlet')).toBeNull();
});

test('on: dew-point chain at 6 dp and dz/dT at 9 dp', async () => {
  await mount(true);
  expect(statValue('JT coefficient at the inlet')).toContain(formatFull(d.muFPerPsi * 100, 6));
  expect(statValue('z temperature derivative at the inlet')).toContain(formatFull(d.dzdT, 9));
  expect(statValue('Cooling across the drop')).toContain(formatFull(d.dropF, 6));
  expect(statValue('Downstream temperature')).toContain(formatFull(d.t2F, 6));
  expect(statValue('Water the cold gas can hold')).toContain(formatFull(d.waterAtOutlet.lbPerMMscf, 6));
});
