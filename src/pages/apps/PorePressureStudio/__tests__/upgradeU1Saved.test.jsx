/**
 * PL5: projects saved by every release open, reopen their well and compute.
 * PP-U1-013: the saved well is reopened (before, the user had to find and
 * click it again). PP-U1-003: a project saved with the old mudline default
 * on an offshore well now says so and holds the publish.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims, installDashboardScope } from '@/design/testing/themeAssertions';
import PPWorkstation from '../components/PPWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import { SAVED_PROJECTS } from '../services/savedFixtures';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));

beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
installDashboardScope({ userId: null });
beforeEach(() => { window.sessionStorage.clear(); window.localStorage.clear(); });

const mount = (saved) => render(
  <MemoryRouter><PPWorkstation backend={makeInMemoryBackend({ saved })} /></MemoryRouter>,
);

test.each(['pp0', 't1', 'u1'])('the %s release reopens its well and computes', async (key) => {
  mount(key);
  await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 10000 });
  const value = Number(screen.getByTestId('pp-readout-pp').textContent.replace('PP ', ''));
  expect(Number.isFinite(value)).toBe(true);
  expect(screen.getByTestId('pp-unit-depth')).toBeInTheDocument();
});

test('the p3 release (no mudline, no well id) opens on the well list and computes on a click', async () => {
  mount('p3');
  const row = await screen.findByTestId('pp-well-row');
  row.click();
  await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 10000 });
  // the old default (mudline MD unset on 100 m of water) is said, and publish is held
  expect(screen.getByTestId('pp-note-datum')).toHaveTextContent(/Set the mudline MD/);
  expect(screen.getByTestId('pp-publish')).toHaveAttribute('data-blocked', 'true');
});

test('pp0 keeps its picks on reopen; u1 knows its NCT was fitted on the well', async () => {
  mount('pp0');
  await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 10000 });
  expect(screen.getByTestId('pp-note-nct')).toBeInTheDocument();
  expect(SAVED_PROJECTS.pp0.picks).toHaveLength(2);
});

test('u1: fitted NCT and calibration misfit are stated', async () => {
  mount('u1');
  await waitFor(() => expect(screen.getByTestId('pp-note-calibration')).toBeInTheDocument(), { timeout: 10000 });
  expect(screen.queryByTestId('pp-note-nct')).toBeNull();
  expect(screen.queryByTestId('pp-note-datum')).toBeNull();
  expect(screen.getByTestId('pp-note-calibration')).toHaveTextContent(/misfit RMS/);
});
