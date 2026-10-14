/**
 * Unsaved changes (2026-10-14): the studio keeps its work only on Save, and a
 * user who left for Well Design Studio and came back found the defaults again.
 * A chip beside Save says when the open parameters, picks or calibration differ
 * from the saved project; Save clears it; the browser asks before the page is
 * left with unsaved work. Opening a well (and the water column its datum
 * supplies) is not a change.
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

async function open() {
  render(<MemoryRouter><PPWorkstation backend={makeInMemoryBackend()} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('pp-well-row', {}, { timeout: 15000 }));
  await waitFor(() => expect(screen.getByTestId('pp-readout-pp')).toBeInTheDocument(), { timeout: 10000 });
}

test('negative control: opening the saved well is not a change', async () => {
  await open();
  await waitFor(() => expect(screen.getByTestId('pp-status').textContent).toMatch(/Loaded|Restored/));
  expect(screen.queryByTestId('pp-save-state')).toBeNull();
});

test('a parameter change shows Unsaved changes, the browser asks before leaving, and Save clears it', async () => {
  await open();
  fireEvent.change(screen.getByTestId('pp-param-eatonn'), { target: { value: '3.4' } });
  fireEvent.click(screen.getByTestId('pp-apply-params'));
  await waitFor(() => expect(screen.getByTestId('pp-save-state')).toHaveTextContent('Unsaved changes'));
  const ev = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByTestId('pp-save-project'));
  await waitFor(() => expect(screen.queryByTestId('pp-save-state')).toBeNull());
  const ev2 = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev2);
  expect(ev2.defaultPrevented).toBe(false);
});
