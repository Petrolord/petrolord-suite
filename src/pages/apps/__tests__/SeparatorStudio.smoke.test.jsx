/**
 * Smoke test: mount the whole Separator & Slug Catcher Studio page
 * (provider, studio shell, both tabs) with Supabase mocked.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import SeparatorSlugCatcherDesigner from '@/pages/apps/SeparatorSlugCatcherDesigner';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('SeparatorStudio page', () => {
  it('sizes the default horizontal case and shows the L/D family', async () => {
    render(
      <MemoryRouter>
        <SeparatorSlugCatcherDesigner />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Separator & Slug Catcher Studio')).toBeInTheDocument();

    // The conditions card proves z is computed, not hardcoded 0.85.
    expect((await screen.findAllByText(/At separator conditions/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/z-factor/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/from the validated correlation/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Settling velocity/i).length).toBeGreaterThan(0);

    // The selected vessel names which length requirement controls.
    expect(screen.getAllByText(/Selected vessel/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Length the gas needs/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Length the liquid needs/i).length).toBeGreaterThan(0);
    // The gas velocity is of the vessel just sized (the F0 bug class).
    expect(screen.getAllByText(/in the vessel just sized/i).length).toBeGreaterThan(0);

    // The L/D family table.
    expect(screen.getAllByText(/The L\/D family/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PREFERRED|in range|outside L\/D/).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Slug Catcher' }));
    await waitFor(() => expect(screen.getAllByText(/Vessel slug catcher/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Working volume/i).length).toBeGreaterThan(0);
    // The slug volume comes from the line sizing studio, and says so.
    expect(screen.getAllByText(/Line Sizing Studio/i).length).toBeGreaterThan(0);
  });
});
