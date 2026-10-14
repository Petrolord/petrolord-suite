/**
 * The Bowers crossplot on shale samples (2026-10-14): a sand is faster at its
 * density than a shale, so on every sample the sands below the top read as
 * unloading; with Pressures from shale samples on, the crossplot reads the
 * same shale samples the pressures do.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import { bowersCrossplot } from '../services/bowersCrossplot';
import PPWorkstation from '../components/PPWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });

// shales on one loading trend V = 300 rho^0.9 (m/s, kg/m3) at every depth; every
// fourth sample below 1,000 m a sand, 10% slower than a shale at its density
function well() {
  const zBmlM = []; const dtUsPerM = []; const rhoKgM3 = []; const isShale = [];
  for (let i = 0; i < 200; i++) {
    const z = 10 * i; const rho = 1900 + 0.25 * z; const sand = z >= 1000 && i % 4 === 0;
    const v = 300 * rho ** 0.9 * (sand ? 0.9 : 1);
    zBmlM.push(z); dtUsPerM.push(1e6 / v); rhoKgM3.push(rho); isShale.push(!sand);
  }
  return { input: { zBmlM, dtUsPerM, rhoKgM3 }, isShale };
}

test('negative control: on every sample the sands below the top read as unloading', () => {
  const { input } = well();
  const r = bowersCrossplot(input, { topM: 1000, A: 10, B: 0.75 });
  expect(r.unloadedCount).toBe(25);
});

test('on the shale samples nothing is unloaded and the loading trend is the shales\' own', () => {
  const { input, isShale } = well();
  const r = bowersCrossplot(input, { topM: 1000, A: 10, B: 0.75, isShale });
  expect(r.unloadedCount).toBe(0);
  expect(r.belowCount).toBe(75);
  expect(r.trend.b).toBeCloseTo(0.9, 9);
});

test('the crossplot view says it reads the shale samples', async () => {
  render(<MemoryRouter><PPWorkstation backend={makeInMemoryBackend()} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('pp-well-row', {}, { timeout: 15000 }));
  await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 10000 });
  fireEvent.click(screen.getByTestId('pp-shale-pressures'));
  fireEvent.click(screen.getByTestId('pp-apply-params'));
  fireEvent.click(screen.getByTestId('pp-view-crossplot'));
  await waitFor(() => expect(screen.getByTestId('pp-xp-shale').textContent).toMatch(/^On the \d+ shale samples \(VSH at or above 0\.60\)\. $/));
});
