/**
 * Smoke test: mount the whole Storage Tank & Venting Designer page
 * (provider, studio shell, all three tabs) with Supabase mocked.
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

import StorageTankDesigner from '@/pages/apps/StorageTankDesigner';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('StorageTankDesigner page', () => {
  it('courses the shell against both the product and the water test, then vents and loses', async () => {
    render(
      <MemoryRouter>
        <StorageTankDesigner />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Storage Tank & Venting Designer')).toBeInTheDocument();

    // The shell tab must show BOTH load cases and name the governing one:
    // that is the case people forget on a light product.
    expect((await screen.findAllByText(/one-foot method/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Water test \(in\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Governed by/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Working/i).length).toBeGreaterThan(0);

    // Venting must answer in both directions, not just pressure.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Venting' }));
    await waitFor(() => expect(screen.getAllByText(/Normal venting/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Outbreathing \(pressure\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Inbreathing \(vacuum\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Governing case/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Emergency \(fire\) venting/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Losses' }));
    await waitFor(() => expect(screen.getAllByText(/Evaporative losses/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Standing loss/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Working loss/i).length).toBeGreaterThan(0);
  });
});
