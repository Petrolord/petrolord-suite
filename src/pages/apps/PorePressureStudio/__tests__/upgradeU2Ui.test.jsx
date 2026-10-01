/**
 * Pore Pressure Studio U2 in the workstation (jsdom): the doors and the
 * words. Geometry and the real browser are in e2e/pore-pressure-u2.spec.js.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import PPWorkstation from '../components/PPWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });

const mount = (opts = {}) => render(
  <MemoryRouter><PPWorkstation backend={makeInMemoryBackend(opts)} /></MemoryRouter>,
);
const ready = async () => {
  const row = await screen.findByTestId('pp-well-row');
  fireEvent.click(row);
  await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 10000 });
};
const setField = (id, v) => fireEvent.change(screen.getByTestId(id), { target: { value: v } });
const apply = () => fireEvent.click(screen.getByTestId('pp-apply-params'));

describe('U2-003 margins and casing seats in the workstation', () => {
  test('the seats line follows the margins typed in the dock (ppg)', async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByTestId('pp-unit-pressure'), { target: { value: 'ppg' } });
    await waitFor(() => expect(screen.getByTestId('pp-casing-seats')).toBeInTheDocument());
    expect(screen.getByTestId('pp-casing-seats')).toHaveTextContent(/trip margin 0.50 ppg, kick margin 0.50 ppg/);
    expect(screen.getByTestId('pp-param-trip')).toHaveValue(0.5);
    // the goldens' well needs no string at nu 0.4; at nu 0.25 it needs one
    expect(screen.getByTestId('pp-casing-seats')).toHaveAttribute('data-seats', '0');
    setField('pp-param-nu', '0.25');
    apply();
    await waitFor(() => expect(Number(screen.getByTestId('pp-casing-seats').getAttribute('data-seats'))).toBeGreaterThan(0));
    expect(screen.getByTestId('pp-casing-seat-0')).toHaveTextContent(/shoe at least/);
    expect(screen.getByTestId('pp-casing-sections')).toHaveTextContent(/margin to the design FG/);
    // margins that close the window are said
    setField('pp-param-trip', '3');
    setField('pp-param-kick', '3');
    apply();
    await waitFor(() => expect(screen.getByTestId('pp-casing-closed')).toBeInTheDocument());
    expect(screen.getByTestId('pp-prognosis-chart')).toBeInTheDocument();
  });
});
