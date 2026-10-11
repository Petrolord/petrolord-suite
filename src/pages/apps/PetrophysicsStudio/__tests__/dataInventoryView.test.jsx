/**
 * Petrophysics Studio, Inventory view (Project Data Inventory, 2026-10-11):
 * the shared inventory over every registry well on the in-memory backend.
 * The view button follows Field, the default view stays Tracks, and what
 * the user sets by hand is saved with the interpretation as
 * facies._dataInventory (never read as a well's facies) and reopens.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { installDomShims } from '@/design/testing/themeAssertions';
import { makeInMemoryBackend } from '../services/inMemoryBackend';
import PetroWorkstation from '../components/PetroWorkstation';

const PROJECT_KEY = 'petro.dev.project.v1';
jest.setTimeout(90000);
beforeAll(() => {
  installDomShims();
  jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => { window.sessionStorage.clear(); });

test('Tracks stays the default; Inventory follows Field', async () => {
  render(<MemoryRouter><PetroWorkstation backend={makeInMemoryBackend()} /></MemoryRouter>);
  const views = await screen.findAllByTestId(/^petro-view-/);
  expect(views.map((b) => b.getAttribute('data-testid'))).toEqual(['petro-view-tracks', 'petro-view-crossplot', 'petro-view-histogram', 'petro-view-split', 'petro-view-shift', 'petro-view-field', 'petro-view-inventory']);
  expect(screen.queryByTestId('pdi-root')).not.toBeInTheDocument();
});

test('the inventory reads every registry well; a hand-set state is saved with the interpretation and reopens', async () => {
  const backend = makeInMemoryBackend();
  const wells = await backend.listWells();
  const keta = wells.find((w) => w.name === 'KETA TYPE-1');
  const { unmount } = render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  fireEvent.click(await screen.findByTestId('petro-view-inventory'));
  await screen.findByTestId('pdi-board', {}, { timeout: 30000 });
  for (const w of wells) expect(screen.getByTestId(`pdi-row-${w.name}`)).toBeInTheDocument();
  expect(screen.getByTestId('pdi-cell-KETA TYPE-1-gr')).toHaveAttribute('data-status', 'complete');
  expect(screen.getByTestId('pdi-ready-petro')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('pdi-cell-KETA TYPE-1-pressure'));
  fireEvent.change(screen.getByTestId('pdi-cell-override'), { target: { value: 'external' } });
  await waitFor(() => expect(screen.getByTestId('pdi-cell-KETA TYPE-1-pressure')).toHaveAttribute('data-status', 'external'));
  fireEvent.click(screen.getByTestId('petro-save-project'));
  await waitFor(() => {
    const rows = JSON.parse(window.sessionStorage.getItem(PROJECT_KEY) || '[]');
    expect(rows[0]?.facies?._dataInventory?.cells?.[keta.id]?.pressure?.status).toBe('external');
  });
  unmount();
  render(<MemoryRouter><PetroWorkstation backend={backend} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('petro-status').textContent).toMatch(/Restored/));
  fireEvent.click(screen.getByTestId('petro-view-inventory'));
  await screen.findByTestId('pdi-board', {}, { timeout: 30000 });
  await waitFor(() => expect(screen.getByTestId('pdi-cell-KETA TYPE-1-pressure')).toHaveAttribute('data-status', 'external'));
});
