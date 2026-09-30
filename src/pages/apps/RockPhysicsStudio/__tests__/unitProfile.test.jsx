// Suite unit profile adoption (phase 1): Rock Physics Studio takes
// velocity, density and depth from the profile; the older remembered
// 'rp.units' choice no longer beats it. Negative control: no provider.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import { StaticUnitProfileProvider } from '@/lib/units/UnitProfileContext';
import { makeProfile } from '@/lib/units/presets';
import RockPhysicsStudio from '../RockPhysicsStudio';

jest.mock('@/contexts/SupabaseAuthContext', () => ({
  AuthContext: require('react').createContext(null),
  useAuth: () => ({ user: null }),
}));
jest.mock('../services/registryBackend', () => ({
  makeRegistryBackend: () => jest.requireActual('../services/inMemoryBackend').makeInMemoryBackend(),
}));
jest.mock('recharts', () => {
  const R = jest.requireActual('recharts');
  return { ...R, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{children}</div> };
});
HTMLCanvasElement.prototype.getContext = () => null;
beforeAll(installDomShims);
installDashboardScope({ userId: null });
beforeEach(() => { window.localStorage.clear(); });

const ROUTE = '/dashboard/apps/geoscience/rock-physics-studio';
const mount = (layers) => render(
  <MemoryRouter initialEntries={[ROUTE]}>
    {layers === undefined ? <RockPhysicsStudio /> : <StaticUnitProfileProvider layers={layers}><RockPhysicsStudio /></StaticUnitProfileProvider>}
  </MemoryRouter>,
);

test('oilfield profile: ft/s, g/cc and ft, beating the remembered choice', async () => {
  window.localStorage.setItem('rp.units', JSON.stringify({ velocity: 'us/m', density: 'kg/m3', depth: 'm' }));
  mount({});
  expect(await screen.findByTestId('rp-unit-velocity')).toHaveValue('ft/s');
  expect(screen.getByTestId('rp-unit-density')).toHaveValue('g/cc');
  expect(screen.getByTestId('rp-unit-depth')).toHaveValue('ft');
  expect(window.localStorage.getItem('rp.units')).toBeNull();
});

test('metric profile: m/s, kg/m3 and m', async () => {
  mount({ organization: makeProfile('metric') });
  expect(await screen.findByTestId('rp-unit-velocity')).toHaveValue('m/s');
  expect(screen.getByTestId('rp-unit-density')).toHaveValue('kg/m3');
  expect(screen.getByTestId('rp-unit-depth')).toHaveValue('m');
});

test('negative control: no provider keeps the old defaults', async () => {
  mount(undefined);
  expect(await screen.findByTestId('rp-unit-velocity')).toHaveValue('m/s');
  expect(screen.getByTestId('rp-unit-density')).toHaveValue('kg/m3');
});
