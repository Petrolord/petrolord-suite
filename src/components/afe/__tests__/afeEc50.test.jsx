/**
 * EC5-0 gates for the AFE Cost Control Manager (owner decision 2026-09-14).
 *
 * Pins: SPI null reads "Not started" with no verdict; an AFE with no dates
 * labels SPI unavailable; the summary PDF bills from saved partners (and no
 * invented partner literal is left in src); the Integrations tab invents no
 * connection; one EAC rule on the cost breakdown; the edit form never seeds
 * the forecast from the budget; the wizard refuses an end before the start;
 * negative progress and working interest are refused.
 */
import fs from 'fs';
import path from 'path';
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

const mockPdf = jest.fn();
jest.mock('@/utils/afeServices', () => {
  const actual = jest.requireActual('@/utils/afeServices');
  return { ...actual, generateAFESummaryPDF: (...args) => mockPdf(...args) };
});

import AFEDashboard, { spiTile, todayIsoDate } from '@/components/afe/AFEDashboard';
import CostBreakdownTab, { costItemFormValues } from '@/components/afe/CostBreakdownTab';
import ReportingEngine from '@/components/afe/ReportingEngine';
import IntegrationsTab from '@/components/afe/IntegrationsTab';
import AFECreationWizard, { validateAfeWindow } from '@/components/afe/AFECreationWizard';
import { partnerInterestError } from '@/components/afe/JVPartnerManagement';

const SRC = path.resolve(__dirname, '../../..');

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});
beforeEach(() => {
  mockToast.mockClear();
  mockInsert.mockClear();
  mockPdf.mockClear();
});

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const full = path.join(dir, d.name);
  if (d.isDirectory()) return d.name === '__tests__' ? [] : walk(full);
  return /\.(js|jsx|ts|tsx)$/.test(d.name) ? [full] : [];
});

const spiCard = () => screen.getByText('SPI (Schedule Efficiency)').closest('.p-5');

describe('SPI on the dashboard', () => {
  it('renders "Not started" with no verdict and no good or bad colour before the start date', () => {
    const afe = { id: 'a1', start_date: '2099-01-01', end_date: '2099-12-31', currency: 'USD' };
    render(<AFEDashboard afe={afe} costItems={[{ budget: 1000, actual: 0, progress: 10 }]} invoices={[]} />);
    const card = spiCard();
    expect(within(card).getByText('Not started')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/Ahead of Schedule|Behind Schedule/);
    expect(card.innerHTML).not.toMatch(/text-green-400|text-red-400/);
  });

  it('labels SPI unavailable for an AFE without dates instead of "1.00 Ahead of Schedule"', () => {
    const afe = { id: 'a2', currency: 'USD' };
    render(<AFEDashboard afe={afe} costItems={[{ budget: 1000, actual: 0, progress: 100 }]} invoices={[]} />);
    const card = spiCard();
    expect(within(card).getByText('Unavailable')).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/1\.00|Ahead of Schedule/);
  });

  it('keeps a real verdict once there is planned value', () => {
    const tile = spiTile({ start_date: '2020-01-01', end_date: '2020-12-31' }, { spi: 0.5 });
    expect(tile).toEqual(expect.objectContaining({ value: '0.50', subtext: 'Behind Schedule' }));
  });

  it('shows the AfeInputError message instead of crashing on negative progress', () => {
    const afe = { id: 'a3', start_date: '2020-01-01', end_date: '2020-12-31' };
    render(<AFEDashboard afe={afe} costItems={[{ code: 'X1', budget: 10, progress: -5 }]} invoices={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('negative progress');
  });

  it('passes today as a local calendar date', () => {
    expect(todayIsoDate(new Date(2026, 8, 4, 23, 30))).toBe('2026-09-04');
  });

  it('calls the engine with an explicit asOf', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/afe/AFEDashboard.jsx'), 'utf8');
    expect(src).toMatch(/calculateMetrics\(afe, costItems, invoices, asOf\)/);
    expect(src).toMatch(/generateSCurveData\(afe, costItems, invoices, asOf\)/);
  });
});

describe('summary PDF partners', () => {
  const AFE = { id: 'a1', afe_number: 'AFE-1', afe_name: 'Test', currency: 'USD' };

  it('ReportingEngine passes the saved partners to the PDF', () => {
    const saved = [{ id: 'p1', name: 'Real Partner Ltd', working_interest: 25 }];
    render(<ReportingEngine afe={AFE} costItems={[]} partners={saved} />);
    fireEvent.click(screen.getAllByRole('button', { name: /PDF/ })[0]);
    expect(mockPdf).toHaveBeenCalledWith(AFE, [], saved);
  });

  it('passes an empty list when no partners are saved, so the operator carries 100 percent', () => {
    render(<ReportingEngine afe={AFE} costItems={[]} />);
    fireEvent.click(screen.getAllByRole('button', { name: /PDF/ })[0]);
    expect(mockPdf).toHaveBeenCalledWith(AFE, [], []);
  });

  it('leaves no invented partner literal anywhere in src', () => {
    const offenders = walk(SRC).filter((f) => /Partner [AB]\b/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the page loads afe_partners and hands them to the report', () => {
    const page = fs.readFileSync(path.join(SRC, 'pages/apps/AfeCostControlManager.jsx'), 'utf8');
    expect(page).toMatch(/from\('afe_partners'\)/);
    expect(page).toMatch(/<ReportingEngine[^>]*partners=\{partners\}/);
  });
});

describe('Integrations tab', () => {
  it('renders an honest empty state with no invented connection', () => {
    render(<IntegrationsTab afe={{ afe_number: 'AFE-9' }} />);
    expect(screen.getByText(/No integrations are connected for AFE AFE-9/)).toBeInTheDocument();
    const text = document.body.textContent;
    ['Deepwater Horizon', 'Usan', 'mins ago', 'Live', 'Delayed by 14 days', 'Pore Pressure (PPFG)', 'Active']
      .forEach((phrase) => expect(text).not.toContain(phrase));
  });

  it('carries none of the invented phrases in its source', () => {
    const src = fs.readFileSync(path.join(SRC, 'components/afe/IntegrationsTab.jsx'), 'utf8');
    expect(src).not.toMatch(/Deepwater Horizon|Usan|mins ago|lastSync/);
  });
});

describe('one EAC rule on the cost breakdown', () => {
  it('shows EAC 1300 and variance -300 on an overrun line with no forecast', () => {
    const items = [{ id: 'c1', code: 'D1', category: 'Drilling', description: 'Overrun line', budget: 1000, actual: 1300 }];
    render(<CostBreakdownTab afeId="a1" costItems={items} onRefresh={() => {}} />);
    const row = screen.getByText('Overrun line').closest('tr');
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    // WBS, Description, Vendor, Budget, Actuals, Forecast (EAC), Variance
    expect(cells[3]).toBe('$1,000');
    expect(cells[4]).toBe('$1,300');
    expect(cells[5]).toBe('$1,300');
    expect(cells[6]).toBe('-$300');
  });

  it('the edit form does not seed the forecast from the budget', () => {
    expect(costItemFormValues({ code: 'D1', budget: 1000, actual: 1300 }).forecast).toBe('');
    expect(costItemFormValues({ code: 'D1', budget: 1000, forecast: 0 }).forecast).toBe('');
    expect(costItemFormValues({ code: 'D1', budget: 1000, forecast: 1200 }).forecast).toBe(1200);
    const src = fs.readFileSync(path.join(SRC, 'components/afe/CostBreakdownTab.jsx'), 'utf8');
    expect(src).not.toMatch(/item\.forecast \|\| item\.budget/);
  });

  it('the dashboard top variances, the PDF and the Excel export use itemForecast', () => {
    const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
    expect(read('components/afe/AFEDashboard.jsx')).toMatch(/\(Number\(item\.budget\)\|\|0\) - itemForecast\(item\)/);
    expect(read('components/afe/ReportingEngine.jsx')).toMatch(/Variance: \(Number\(item\.budget\) \|\| 0\) - itemForecast\(item\)/);
    expect(read('utils/afeServices.js')).toMatch(/totalBudget - totalForecast/);
  });
});

describe('refusals', () => {
  it('the wizard refuses an end date before the start date', async () => {
    expect(validateAfeWindow('2026-05-01', '2026-04-30')).toMatch(/end date is before the start date/);
    expect(validateAfeWindow('2026-05-01', '2026-05-01')).toBeNull();
    expect(validateAfeWindow('', '')).toBeNull();

    render(<AFECreationWizard open onOpenChange={() => {}} projects={[]} onSuccess={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-04-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('end date is before the start date');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: 'Check the AFE dates' }));
    expect(screen.getByText(/Step 2 of 3/)).toBeInTheDocument();
  });

  it('the wizard saves both dates', async () => {
    render(<AFECreationWizard open onOpenChange={() => {}} projects={[]} onSuccess={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create AFE' }));
    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const [table, rows] = mockInsert.mock.calls[0];
    expect(table).toBe('afes');
    expect(rows[0]).toEqual(expect.objectContaining({ start_date: '2026-01-01', end_date: '2026-12-31' }));
  });

  it('the cost item form refuses negative progress', async () => {
    render(<CostBreakdownTab afeId="a1" costItems={[]} onRefresh={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Item/ }));
    const dialog = await screen.findByRole('dialog');
    const progress = within(dialog).getAllByRole('spinbutton')[2];
    expect(progress).toHaveAttribute('min', '0');
    fireEvent.change(progress, { target: { value: '-10' } });
    fireEvent.submit(progress.closest('form'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Progress cannot be negative' })));
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('a negative working interest is refused on add and edit', () => {
    expect(partnerInterestError(-1, 0)).toMatch(/cannot be negative/);
    expect(partnerInterestError(30, 80)).toMatch(/exceed 100%/);
    expect(partnerInterestError(20, 80)).toBeNull();
  });
});
