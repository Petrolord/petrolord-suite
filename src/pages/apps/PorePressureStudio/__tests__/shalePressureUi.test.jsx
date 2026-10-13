/**
 * Pressures from shale samples in the workstation (jsdom): the harness well
 * carries a VSH with five sand beds; its seed project predates the option, so
 * it opens on every sample, and turning the option on carries the pressure
 * across the sands and says so.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import PPWorkstation, { DEFAULT_PARAMS } from '../components/PPWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });

test('a new project evaluates in the shales, with no sonic median', () => {
  expect(DEFAULT_PARAMS.ppFromShale).toBe(true);
  expect(DEFAULT_PARAMS.sonicMedianM).toBe(0);
});

test('the Parameters toggle turns shale pressures on and the notes say so', async () => {
  render(<MemoryRouter><PPWorkstation backend={makeInMemoryBackend()} /></MemoryRouter>);
  const row = await screen.findByTestId('pp-well-row', {}, { timeout: 15000 });
  fireEvent.click(row);
  await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 10000 });
  const box = screen.getByTestId('pp-shale-pressures');
  expect(box).not.toBeChecked();
  expect(screen.getByTestId('pp-notes').textContent).not.toMatch(/shale samples/);
  fireEvent.click(box);
  fireEvent.click(screen.getByTestId('pp-apply-params'));
  await waitFor(() => expect(screen.getByTestId('pp-notes').textContent).toMatch(/Pore pressure from \d+ shale samples \(VSH at or above 0\.60\)/));
  expect(screen.getByTestId('pp-shale-pressures')).toBeChecked();
});
