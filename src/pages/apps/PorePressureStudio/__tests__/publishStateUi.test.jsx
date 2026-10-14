/**
 * Publish state in the workstation (jsdom, harness backend): not published,
 * published and matching, then unpublished changes after a parameter change,
 * then matching again after Publish.
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

test('the chip follows the registry: not published, matches, unpublished changes, matches again', async () => {
  render(<MemoryRouter><PPWorkstation backend={makeInMemoryBackend()} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('pp-well-row', {}, { timeout: 15000 }));
  await waitFor(() => expect(screen.getByTestId('pp-publish-state')).toHaveTextContent('Not published'), { timeout: 10000 });
  fireEvent.click(screen.getByTestId('pp-publish'));
  await waitFor(() => expect(screen.getByTestId('pp-publish-state')).toHaveTextContent('Published, matches'));
  fireEvent.change(screen.getByTestId('pp-param-eatonn'), { target: { value: '3.5' } });
  fireEvent.click(screen.getByTestId('pp-apply-params'));
  await waitFor(() => expect(screen.getByTestId('pp-publish-state')).toHaveTextContent(/Unpublished changes \(\d+\.\d\d ppg\)/));
  expect(screen.getByTestId('pp-publish-state')).toHaveAttribute('data-tone', 'warn');
  expect(screen.getByTestId('pp-note-published').textContent).toMatch(/Well Design Studio and the other readers still use the published one until you publish/);
  fireEvent.click(screen.getByTestId('pp-publish'));
  await waitFor(() => expect(screen.getByTestId('pp-publish-state')).toHaveTextContent('Published, matches'));
});
