/**
 * Smoke test: mount the whole Produced Water Treatment Studio page
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

import ProducedWaterTreatment from '@/pages/apps/ProducedWaterTreatment';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 400 });
});

describe('ProducedWaterStudio page', () => {
  it('runs the default train on real droplet physics', async () => {
    render(
      <MemoryRouter>
        <ProducedWaterTreatment />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Produced Water Treatment Studio')).toBeInTheDocument();

    // The fluid card proves temperature and salinity now do something:
    // the predecessor collected both and used neither.
    expect((await screen.findAllByText(/The water itself/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Water viscosity/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Density difference/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/driving force for gravity separation/i).length).toBeGreaterThan(0);

    // Stage table with cut sizes, not fixed efficiencies.
    expect(screen.getAllByText(/Stage by stage/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cut size d50c/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Droplet median out/i).length).toBeGreaterThan(0);
    // The coupling statement that is the whole point.
    expect(screen.getAllByText(/do not together\s+remove 99.9 percent|do not together remove 99.9 percent/i).length).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Droplets' }));
    await waitFor(() => expect(screen.getAllByText(/Inlet droplets against the cut sizes/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/what that device mostly misses/i).length).toBeGreaterThan(0);
  });

  it('shows the numbers the app used to supply silently', async () => {
    render(
      <MemoryRouter>
        <ProducedWaterTreatment />
      </MemoryRouter>,
    );
    await screen.findByText('Produced Water Treatment Studio');
    // the liner turndown and the centrifugal field were hidden constants
    expect(screen.getAllByText(/Inside each device/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Turndown against design/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Centrifugal field/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Filter coefficient at this loading/i).length).toBeGreaterThan(0);
    // and the shipped default sizes its liner bank near its design point
    // instead of running it at 7.667 times design
    expect(screen.getAllByText(/0.958 x/).length).toBeGreaterThan(0);
  });

  it('THE FC7 DEFECT: a cleared equipment box gives no spec verdict', async () => {
    const { container } = render(
      <MemoryRouter>
        <ProducedWaterTreatment />
      </MemoryRouter>,
    );
    await screen.findByText('Produced Water Treatment Studio');
    // it used to print MEETS with a 27.78 ppm margin over a train that
    // had silently dropped a stage
    expect(screen.getAllByText('MEETS').length).toBeGreaterThan(0);

    const label = screen.getByText('Plate area (m2)');
    const box = label.parentElement.querySelector('input');
    expect(box).toBeTruthy();
    fireEvent.change(box, { target: { value: '' } });

    await waitFor(() => expect(screen.getAllByText(/No verdict/i).length).toBeGreaterThan(0));
    expect(screen.queryByText('MEETS')).toBeNull();
    expect(screen.getAllByText(/did not run/i).length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/positive projected plate area/);
  });
});
