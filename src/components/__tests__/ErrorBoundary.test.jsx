// 2026-09-08: a vanished chunk after a deploy shows the calm "Updating
// Petrolord" panel and joins the automatic repair; any other render error
// still gets the red panel with the error text.
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';
import { resetRecoveryState, RELOAD_GUARD_KEY, HARD_RELOAD_GUARD_KEY } from '@/lib/pwa/preloadRecovery';

function Thrower({ error }) { throw error; }

let consoleError;
beforeEach(() => {
  resetRecoveryState();
  window.sessionStorage.clear();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

const STALE = new TypeError('Failed to fetch dynamically imported module: https://petrolord.com/assets/ReservoirManagement-e1dd0f37.js');

test('a vanished chunk shows the updating panel, not the red one', async () => {
  await act(async () => { render(<ErrorBoundary><Thrower error={STALE} /></ErrorBoundary>); });
  expect(screen.getByTestId('stale-build-panel')).toBeTruthy();
  expect(screen.getByText('Updating Petrolord')).toBeTruthy();
  expect(screen.queryByText('Something went wrong')).toBeNull();
  expect(screen.queryByText(/ReservoirManagement-e1dd0f37/)).toBeNull();
  // the repair records its attempt (jsdom's location.reload is a no-op)
  expect(window.sessionStorage.getItem(RELOAD_GUARD_KEY)).not.toBeNull();
});

test('when the automatic repair has given up, the panel offers a reload instead of spinning forever', async () => {
  const now = String(Date.now());
  window.sessionStorage.setItem(RELOAD_GUARD_KEY, now);
  window.sessionStorage.setItem(HARD_RELOAD_GUARD_KEY, now);
  await act(async () => { render(<ErrorBoundary><Thrower error={STALE} /></ErrorBoundary>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(screen.getByText('A newer version is available')).toBeTruthy();
  expect(screen.getByTestId('stale-build-reload')).toBeTruthy();
  expect(screen.queryByText('Something went wrong')).toBeNull();
});

test('any other render error still gets the red panel with the message', async () => {
  await act(async () => { render(<ErrorBoundary><Thrower error={new Error('x is not a function')} /></ErrorBoundary>); });
  expect(screen.getByText('Something went wrong')).toBeTruthy();
  expect(screen.getByText(/x is not a function/)).toBeTruthy();
  expect(screen.queryByTestId('stale-build-panel')).toBeNull();
  expect(consoleError).toHaveBeenCalled();
});

test('children render untouched when nothing throws', () => {
  render(<ErrorBoundary><div>fine</div></ErrorBoundary>);
  expect(screen.getByText('fine')).toBeTruthy();
});
