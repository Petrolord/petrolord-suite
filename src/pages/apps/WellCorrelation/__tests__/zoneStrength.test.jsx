/**
 * Geoscience showcase polish (2026-10-17): the zone tint strength sits next
 * to the zone mode, is saved with the section and restored from it.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import CorrelationWorkstation from '../components/CorrelationWorkstation';
import { makeInMemoryBackend } from '../services/inMemoryBackend';

jest.mock('@/components/wells/plotPng', () => ({ trackPlotPng: () => Promise.resolve(new Blob(['png'])) }));
const noopCtx = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
});
const mount = (backend, query = '') => render(
  <MemoryRouter initialEntries={[`/dev/well-correlation${query}`]}><CorrelationWorkstation backend={backend} /></MemoryRouter>,
);
const T = { timeout: 15000 };

test('bold zone tint is saved with the section and comes back on reopen; no fill hides the control', async () => {
  const b = makeInMemoryBackend();
  const { unmount } = mount(b, '?wells=corr-w1,corr-w2');
  await waitFor(() => expect(screen.queryAllByTestId('corr-order-row')).toHaveLength(2), T);
  const strength = await screen.findByTestId('corr-zone-strength', {}, T);
  expect(strength.value).toBe('light');
  fireEvent.change(strength, { target: { value: 'bold' } });
  fireEvent.click(screen.getByTestId('corr-save'));
  await waitFor(() => expect(screen.getByTestId('corr-status').textContent).toMatch(/Section saved/), T);
  expect((await b.loadSection()).track_layout.zoneStrength).toBe('bold');
  fireEvent.change(screen.getByTestId('corr-zone-mode'), { target: { value: 'none' } });
  expect(screen.queryByTestId('corr-zone-strength')).toBeNull();
  unmount();
  mount(b);
  await waitFor(() => expect(screen.queryAllByTestId('corr-order-row')).toHaveLength(2), T);
  expect(screen.getByTestId('corr-zone-strength').value).toBe('bold');
}, 300000);
