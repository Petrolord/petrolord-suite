// The prompt end to end: waiting worker at load -> activated, no banner;
// after the reload lands on the new build the banner does not come back.
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, act } from '@testing-library/react';

const mockState = { needRefresh: false, waiting: false, update: jest.fn() };
jest.mock('virtual:pwa-register/react', () => {
  const R = require('react');
  return {
    useRegisterSW: (opts) => {
      const [needRefresh, setNeedRefresh] = R.useState(false);
      R.useEffect(() => {
        opts.onRegisteredSW('/sw.js', { waiting: mockState.waiting ? {} : null, update: async () => {} });
        if (mockState.needRefresh) setNeedRefresh(true);
      }, []);
      return { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [false, () => {}], updateServiceWorker: mockState.update };
    },
  };
});
let mockRunning = { sha: 'aaaaaaaaa' };
jest.mock('@/lib/platformBuild', () => ({ get PLATFORM_BUILD() { return mockRunning; } }));

import PwaUpdatePrompt from '../PwaUpdatePrompt';

const serveVersion = (stamp) => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => stamp }));
};

beforeEach(() => {
  mockState.update = jest.fn();
  window.sessionStorage.clear();
});

test('a new build waiting at load is activated on the spot, and the banner does not come back after the refresh', async () => {
  serveVersion({ sha: 'bbbbbbbbb' });
  mockRunning = { sha: 'aaaaaaaaa' };
  mockState.waiting = true; mockState.needRefresh = true;
  const first = render(<PwaUpdatePrompt />);
  await waitFor(() => expect(mockState.update).toHaveBeenCalledWith(true));
  expect(screen.queryByTestId('pwa-prompt')).toBeNull();
  first.unmount();

  // The reload landed: the running build is the server's build.
  mockRunning = { sha: 'bbbbbbbbb' };
  mockState.update = jest.fn();
  render(<PwaUpdatePrompt />);
  await act(async () => { await Promise.resolve(); });
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(screen.queryByTestId('pwa-prompt')).toBeNull();
  expect(mockState.update).not.toHaveBeenCalledWith(true);
});

test('a waiting worker for the same build never shows the banner', async () => {
  serveVersion({ sha: 'aaaaaaaaa' });
  mockRunning = { sha: 'aaaaaaaaa' };
  mockState.waiting = false; mockState.needRefresh = true;
  render(<PwaUpdatePrompt />);
  await waitFor(() => expect(mockState.update).toHaveBeenCalledWith(false));
  expect(screen.queryByTestId('pwa-prompt')).toBeNull();
});

test('a new build found mid-session shows the banner', async () => {
  serveVersion({ sha: 'ccccccccc' });
  mockRunning = { sha: 'aaaaaaaaa' };
  mockState.waiting = false; mockState.needRefresh = true;
  render(<PwaUpdatePrompt />);
  expect(await screen.findByTestId('pwa-prompt')).toHaveTextContent(/new version/);
});
