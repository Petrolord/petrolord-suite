/**
 * Smoke test (SC3): mount the whole SCAL Studio page (provider, shell, both
 * shipped tabs) with Supabase mocked. Catches broken imports/wiring across
 * the studio kit and the scalstudio component tree.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
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

import ScalStudio from '@/pages/apps/ScalStudio';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

describe('ScalStudio page', () => {
  it('renders both shipped tabs without crashing', async () => {
    render(
      <MemoryRouter>
        <ScalStudio />
      </MemoryRouter>,
    );

    // Curves (default tab): the default Corey set computes and shows KPIs.
    expect(await screen.findByText('SCAL Studio')).toBeInTheDocument();
    expect(screen.getAllByText(/Corey parameters/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Mobile saturation span/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Relative permeability \(oil-water\)/i).length).toBeGreaterThan(0);

    // Gas-oil sub-tab of the Curves rail.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Gas-oil' }));
    expect(screen.getAllByText(/Sorg/i).length).toBeGreaterThan(0);

    // Lab Data tab (SC4): load the demo pair, fit KPIs appear.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Lab Data' }));
    expect(screen.getAllByText(/Core samples/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Demo pair/i }));
    expect(await screen.findByText(/Demo core A/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Demo core A/i));
    expect(await screen.findByText(/nw \(fit\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use fit on the Curves tab/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Normalized curves across samples/i).length).toBeGreaterThan(0);

    // Capillary tab: default manual J spec computes J and reservoir Pc.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Capillary' }));
    expect(screen.getAllByText(/J-function source/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Leverett J-function/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reservoir capillary pressure/i).length).toBeGreaterThan(0);

    // Height & Saturation (SC5): profile derives from the default manual J.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Height & Saturation' }));
    expect(screen.getAllByText(/Saturation vs height/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Chart top height/i).length).toBeGreaterThan(0);

    // Export (SC5): handoff + CSV + JSON cards render.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Export' }));
    expect(screen.getByRole('button', { name: /Send curves to Waterflood/i })).toBeInTheDocument();
    expect(screen.getAllByText(/CSV exports/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Project JSON/i).length).toBeGreaterThan(0);
  });
});
