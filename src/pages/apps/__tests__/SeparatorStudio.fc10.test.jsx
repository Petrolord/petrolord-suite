/**
 * FC1-0 render gates for the Separator & Slug Catcher Studio: a cleared
 * field stays blank and the run names it; no out-of-band vessel is shown
 * as selected.
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
});

const inputFor = (label) => {
  const labelEl = screen.getAllByText(label, { selector: 'label' })[0];
  return labelEl.parentElement.querySelector('input');
};

const renderStudio = async () => {
  render(<MemoryRouter><SeparatorSlugCatcherDesigner /></MemoryRouter>);
  await screen.findByText('Separator & Slug Catcher Studio');
};

describe('SeparatorStudio FC1-0', () => {
  it('labels the example case, and a cleared gas gravity stays blank and is named', async () => {
    await renderStudio();
    expect(screen.getAllByText(/Example case: a new study opens with illustrative values/).length).toBeGreaterThan(0);

    // Negative control: the example case sizes and selects a vessel.
    expect(screen.queryByText(/Missing required inputs/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Selected vessel/i).length).toBeGreaterThan(0);

    const gasSg = inputFor('Gas gravity');
    fireEvent.change(gasSg, { target: { value: '' } });
    await waitFor(() => expect(screen.getAllByText('Missing required inputs: Gas gravity.').length).toBeGreaterThan(0));
    expect(gasSg.value).toBe('');
    expect(screen.queryByText(/Selected vessel/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/At separator conditions/i)).not.toBeInTheDocument();
  });

  it('shows no selected vessel when no candidate is in the L/D band', async () => {
    await renderStudio();
    fireEvent.change(inputFor('Candidate diameters (ft)'), { target: { value: '30' } });
    await waitFor(() => expect(screen.getAllByText(/No candidate in the L\/D band/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Selected vessel/i)).not.toBeInTheDocument();
    expect(screen.queryByText('PREFERRED')).not.toBeInTheDocument();
    // The family table still shows the out-of-band row for the record.
    expect(screen.getAllByText('outside L/D').length).toBeGreaterThan(0);
  });
});
