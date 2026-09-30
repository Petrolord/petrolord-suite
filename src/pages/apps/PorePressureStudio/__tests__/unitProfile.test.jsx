// Suite unit profile adoption (phase 1): Pore Pressure Studio takes depth
// and pressure from the profile, the older remembered 'pp.units' choice no
// longer beats it, and an in-app change is a session view override that
// the note names. Negative control: without a provider the old default
// and the remembered choice stand.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import { StaticUnitProfileProvider } from '@/lib/units/UnitProfileContext';
import { makeProfile } from '@/lib/units/presets';
import PorePressureStudio from '../PorePressureStudio';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { window.localStorage.clear(); });

const ROUTE = '/dashboard/apps/geoscience/pore-pressure-studio';
const mount = (layers) => render(
  <MemoryRouter initialEntries={[ROUTE]}>
    {layers === undefined ? <PorePressureStudio /> : <StaticUnitProfileProvider layers={layers}><PorePressureStudio /></StaticUnitProfileProvider>}
  </MemoryRouter>,
);

test('a metric profile opens in m and MPa (nearest to kPa) and beats the remembered choice', async () => {
  window.localStorage.setItem('pp.units', JSON.stringify({ depth: 'ft', pressure: 'psi' }));
  mount({ organization: makeProfile('metric') });
  expect(await screen.findByTestId('pp-unit-depth')).toHaveValue('m');
  expect(screen.getByTestId('pp-unit-pressure')).toHaveValue('MPa');
  expect(window.localStorage.getItem('pp.units')).toBeNull();
  expect(screen.getByTestId('unit-profile-note').dataset.state).toBe('follows');
});

test('an oilfield profile opens in ft and psi; an in-app change is named and resettable', async () => {
  mount({ organization: makeProfile('oilfield') });
  const depth = await screen.findByTestId('pp-unit-depth');
  expect(depth).toHaveValue('ft');
  expect(screen.getByTestId('pp-unit-pressure')).toHaveValue('psi');
  fireEvent.change(depth, { target: { value: 'm' } });
  expect(screen.getByTestId('unit-profile-note').dataset.state).toBe('differs');
  expect(screen.getByTestId('unit-profile-note')).toHaveTextContent('depth m (profile ft)');
  fireEvent.click(screen.getByTestId('unit-profile-reset'));
  expect(screen.getByTestId('pp-unit-depth')).toHaveValue('ft');
});

test('negative control: no provider keeps the remembered choice', async () => {
  window.localStorage.setItem('pp.units', JSON.stringify({ depth: 'm', pressure: 'psi' }));
  mount(undefined);
  expect(await screen.findByTestId('pp-unit-depth')).toHaveValue('m');
  expect(screen.getByTestId('pp-unit-pressure')).toHaveValue('psi');
  expect(window.localStorage.getItem('pp.units')).not.toBeNull();
});
