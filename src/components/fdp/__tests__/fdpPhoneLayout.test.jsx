/**
 * W7F: FDP Accelerator at phone width. At 390 px the 256 px section rail and
 * the 320 px Plan status rail sat beside the content, which was left a clipped
 * sliver; the sticky 300 px activity column then filled the Gantt's whole
 * scroller. On a phone the rails open as sheets from the header buttons
 * (the section sheet always shows labels), and the Gantt keeps its own
 * sideways scroller with a narrower label column.
 * Negative control: on the old layout the inline rails render at phone
 * width and the Sections button opens no dialog.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn(() => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) })),
      })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import FDPAccelerator from '@/pages/apps/FDPAccelerator';
import GanttChart from '@/components/fdp/modules/schedule/GanttChart';

const setPhone = (phone) => {
  window.matchMedia = (q) => ({
    matches: phone && q.includes('max-width: 767px'),
    media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  });
};

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
});
beforeEach(() => { localStorage.clear(); });

test('at phone width the rails are sheets opened from the header', async () => {
  setPhone(true);
  render(<MemoryRouter><FDPAccelerator /></MemoryRouter>);
  await screen.findByRole('button', { name: 'Sections' });
  // no inline rails: the plan status panel is not on the page until asked for
  expect(screen.queryByText('Plan status')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Sections' }));
  const sheet = await screen.findByTestId('fdp-phone-sections');
  // labels shown even though the toggle collapsed the desktop rail
  fireEvent.click(within(sheet).getByText('Schedule'));
  await screen.findByText('Project Schedule');
  await waitFor(() => expect(screen.queryByTestId('fdp-phone-sections')).toBeNull());

  fireEvent.click(screen.getByRole('button', { name: 'Plan status' }));
  const status = await screen.findByTestId('fdp-phone-status');
  expect(within(status).getAllByText('Plan status').length).toBeGreaterThan(0);
});

test('at desktop width the rails stay inline', async () => {
  setPhone(false);
  render(<MemoryRouter><FDPAccelerator /></MemoryRouter>);
  await screen.findByRole('button', { name: 'Sections' });
  expect(screen.getByText('Plan status')).toBeInTheDocument();
  expect(screen.queryByTestId('fdp-phone-sections')).toBeNull();
});

test('the Gantt scrolls in its own container with a phone-width label column', () => {
  render(<GanttChart activities={[
    { id: 'a', name: 'Engineering', start: '2026-01-01', end: '2026-06-30', type: 'Engineering', progress: 10 },
  ]} />);
  const scroller = screen.getByTestId('fdp-gantt-scroller');
  expect(scroller).toHaveClass('overflow-auto', 'max-w-full');
  const inner = scroller.firstElementChild;
  // 40 px a day: the timeline is far wider than a phone, so it must scroll here
  expect(parseInt(inner.style.width, 10)).toBeGreaterThan(5000);
  expect(screen.getByText('Engineering').parentElement).toHaveClass('w-[140px]', 'sm:w-[300px]');
});
