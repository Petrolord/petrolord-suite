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

  it('WITHHOLDS the emergency vent rather than printing a figure that may be 24 times too small', async () => {
    render(
      <MemoryRouter>
        <StorageTankDesigner />
      </MemoryRouter>,
    );
    await screen.findByText('Storage Tank & Venting Designer');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Venting' }));
    await waitFor(() => expect(screen.getAllByText(/Emergency \(fire\) venting/i).length).toBeGreaterThan(0));
    // The duty is still computed and shown.
    expect(screen.getAllByText(/Heat input/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MMBtu\/hr/i).length).toBeGreaterThan(0);
    // The vent capacity is not, and the screen says why rather than
    // leaving a dash. The old screen printed 1,678,956 scfh of air here.
    expect(screen.getAllByText(/Required vent/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/withheld/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/API 2000 air-equivalence relation/i)).toBeInTheDocument();
    expect(screen.getByText(/factor of about 24/i)).toBeInTheDocument();
    expect(screen.queryByText(/scfh air/i)).not.toBeInTheDocument();
  });

  it('derives the vapour space from the geometry, so the defaults cannot contradict themselves', async () => {
    render(
      <MemoryRouter>
        <StorageTankDesigner />
      </MemoryRouter>,
    );
    await screen.findByText('Storage Tank & Venting Designer');
    // A 40 ft shell at a 38 ft design liquid level is 2 ft of vapour space.
    // The losses block used to default to 12 ft with nothing linking them,
    // so the standing loss shown was 17,276 lb/yr where the tank as drawn
    // implies 4,854.
    expect(screen.getAllByText(/Vapour space/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/shell height less the design liquid level/i)).toBeInTheDocument();
    // there is no longer a typed vapour space field to contradict it
    expect(screen.queryByText(/^Vapour space \(ft\)$/)).not.toBeInTheDocument();
  });

  it('exposes the latitude factor and the minimum plate that used to be invisible', async () => {
    render(
      <MemoryRouter>
        <StorageTankDesigner />
      </MemoryRouter>,
    );
    await screen.findByText('Storage Tank & Venting Designer');
    // latitudeFactor was persisted into every saved study, scaled the
    // governing vacuum case by 75 percent over its range, and had no field.
    expect(screen.getAllByText(/Latitude factor/i).length).toBeGreaterThan(0);
    // and the minimum plate thickness was a governing reason with no number
    expect(screen.getAllByText(/Minimum plate \(in\)/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/bands this by diameter/i)).toBeInTheDocument();
  });
});
