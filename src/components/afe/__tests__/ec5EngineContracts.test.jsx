/**
 * EC5 (engines #185) in the AFE Cost Control Manager.
 *
 * CPI and SPI are null whenever the ratio is undefined, with a status naming
 * why, where CPI used to read a flattering 1.00 with nothing spent. The
 * dashboard tiles read N/A with the reason. Progress above 100 percent is
 * refused like negative progress, and the cost item form shows the engine's
 * own message rather than restating the rule.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args) => mockToast(...args),
}));

const mockInsert = jest.fn();
jest.mock('@/lib/customSupabaseClient', () => {
  const makeQuery = (table) => {
    const q = {};
    const chain = () => q;
    ['select', 'eq', 'order', 'limit', 'update', 'upsert', 'delete', 'in'].forEach((m) => { q[m] = jest.fn(chain); });
    q.insert = jest.fn((...args) => { mockInsert(table, ...args); return q; });
    q.then = (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
    return q;
  };
  return {
    supabase: {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: jest.fn((table) => makeQuery(table)),
    },
  };
});

import AFEDashboard, { spiTile, cpiTile, eacTrendPct } from '@/components/afe/AFEDashboard';
import CostBreakdownTab, { progressRefusal } from '@/components/afe/CostBreakdownTab';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});
beforeEach(() => {
  mockToast.mockClear();
  mockInsert.mockClear();
});

const AFE = { start_date: '2026-01-01', end_date: '2026-12-31', currency: 'USD' };

describe('the CPI tile', () => {
  it('reads N/A with the reason when nothing has been spent', () => {
    const tile = cpiTile({ cpi: null, cpiStatus: 'no-spend' });
    expect(tile.value).toBe('N/A');
    expect(tile.subtext).toBe('Nothing spent yet, so no cost efficiency');
    expect(tile.colorClass).not.toMatch(/green|red/);
  });

  it('negative control: a real ratio keeps its number and its verdict', () => {
    expect(cpiTile({ cpi: 1.25, cpiStatus: 'ok' })).toEqual(expect.objectContaining({
      value: '1.25', subtext: 'Under Budget',
    }));
    expect(cpiTile({ cpi: 0.8, cpiStatus: 'ok' }).subtext).toBe('Over Budget');
  });
});

describe('the SPI tile', () => {
  it('reads N/A with the reason when the AFE has no budget', () => {
    const tile = spiTile(AFE, { spi: null, spiStatus: 'no-budget' });
    expect(tile.value).toBe('N/A');
    expect(tile.subtext).toBe('No budget to measure schedule against');
  });

  it('keeps "Not started" before the start day, and the verdict when it has one', () => {
    expect(spiTile(AFE, { spi: null, spiStatus: 'no-planned-value' }).value).toBe('Not started');
    expect(spiTile(AFE, { spi: 0.5, spiStatus: 'ok' }).subtext).toBe('Behind Schedule');
  });
});

describe('the dashboard on an AFE with no budget and no spend', () => {
  it('shows N/A on both ratio tiles and prints no NaN anywhere', () => {
    render(<AFEDashboard afe={AFE} costItems={[]} invoices={[]} />);
    const cpiCard = screen.getByText('CPI (Cost Efficiency)').closest('.p-5');
    const spiCard = screen.getByText('SPI (Schedule Efficiency)').closest('.p-5');
    expect(within(cpiCard).getByText('N/A')).toBeInTheDocument();
    expect(within(cpiCard).getByText('Nothing spent yet, so no cost efficiency')).toBeInTheDocument();
    expect(within(spiCard).getByText('N/A')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);
    expect(eacTrendPct({ totalBudget: 0, totalForecast: 0 })).toBeNull();
  });

  it('negative control: a funded, spent AFE still shows both ratios and a trend', () => {
    render(<AFEDashboard afe={AFE} costItems={[{ budget: 1000, actual: 400, progress: 50 }]} invoices={[]} />);
    const cpiCard = screen.getByText('CPI (Cost Efficiency)').closest('.p-5');
    expect(within(cpiCard).queryByText('N/A')).not.toBeInTheDocument();
    expect(eacTrendPct({ totalBudget: 1000, totalForecast: 1100 })).toBe('10.0');
  });
});

describe('progress above 100 percent', () => {
  it('is refused with the engine message, and 100 exactly is accepted', () => {
    expect(progressRefusal({ code: 'X1', budget: 10, progress: 140 }))
      .toBe('Cost item "X1" has progress above 100 percent (140 percent). Progress runs from 0 to 100 percent.');
    expect(progressRefusal({ code: 'X1', budget: 10, progress: -5 })).toMatch(/negative progress/);
    expect(progressRefusal({ code: 'X1', budget: 10, progress: 100 })).toBeNull();
    expect(progressRefusal({ code: 'X1', budget: 10, progress: 0 })).toBeNull();
  });

  it('is capped in the form: the field maxes at 100, the message shows and Save is off', async () => {
    render(<CostBreakdownTab afeId="a1" costItems={[]} onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Item/ }));
    const dialog = await screen.findByRole('dialog');
    const progress = within(dialog).getAllByRole('spinbutton')[2];
    expect(progress).toHaveAttribute('max', '100');

    fireEvent.change(progress, { target: { value: '150' } });
    expect(await within(dialog).findByRole('alert'))
      .toHaveTextContent('has progress above 100 percent (150 percent)');
    expect(within(dialog).getByRole('button', { name: /Save Item/ })).toBeDisabled();
    fireEvent.submit(progress.closest('form'));
    await waitFor(() => expect(mockInsert).not.toHaveBeenCalled());

    // Negative control: back inside the range, the message goes and Save returns.
    fireEvent.change(progress, { target: { value: '80' } });
    await waitFor(() => expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument());
    expect(within(dialog).getByRole('button', { name: /Save Item/ })).not.toBeDisabled();
  });
});
