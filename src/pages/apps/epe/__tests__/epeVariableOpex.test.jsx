/**
 * Engine 3.12.2: variable opex rates in the Run Console. The four rates are
 * optional, saved into the run config (blank = null = off), carried by an
 * assumption set, labelled in the report, and the Year-by-Year table shows the
 * variable part when a run used them. Negative control: before this change
 * the console had no such fields and the payload carried no rates.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const inserts = [];
const makeQuery = (table) => {
  const q = {};
  const chain = () => q;
  ['select', 'eq', 'order', 'limit', 'update', 'upsert', 'delete', 'in', 'gte', 'lte', 'not', 'is', 'or']
    .forEach((m) => { q[m] = jest.fn(chain); });
  q.insert = jest.fn((row) => { inserts.push({ table, row }); return q; });
  const one = () => (table === 'epe_cases' ? { data: { id: 'c1', user_id: 'u1', case_name: 'Ekene' }, error: null } : { data: { id: `${table}-1` }, error: null });
  q.single = jest.fn(() => Promise.resolve(one()));
  q.maybeSingle = jest.fn(() => Promise.resolve(one()));
  q.then = (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
  return q;
};
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn((t) => makeQuery(t)),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    functions: { invoke: jest.fn().mockResolvedValue({ data: { kpis: { npv: 1 } }, error: null }) },
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'tester@example.com' }, session: null, loading: false }),
}));

// eslint-disable-next-line import/first
import EpeRunConsole, { VARIABLE_OPEX_FIELDS } from '../EpeRunConsole';
// eslint-disable-next-line import/first
import { labelForConfigKey, formatConfigValue } from '../epeConfigLabels';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
});

const mountConsole = () => render(
  <MemoryRouter initialEntries={['/cases/c1/run']}>
    <Routes><Route path="/cases/:caseId/run" element={<EpeRunConsole />} /></Routes>
  </MemoryRouter>,
);

describe('variable opex in the Run Console', () => {
  beforeEach(() => { inserts.length = 0; });

  it('shows four optional rates and saves them into the run config (blank stays null)', async () => {
    mountConsole();
    expect(await screen.findByTestId('epe-variable-opex')).toBeInTheDocument();
    expect(VARIABLE_OPEX_FIELDS.map(([k]) => k)).toEqual([
      'opex_variable_usd_per_bbl_liquid', 'opex_variable_usd_per_bbl_oil', 'opex_variable_usd_per_bbl_water', 'opex_variable_usd_per_mscf_gas',
    ]);
    const liquid = screen.getByLabelText(/Per barrel of liquid/);
    await userEvent.type(liquid, '4');
    expect(liquid).toHaveValue(4);
    fireEvent.change(screen.getByLabelText(/Run Name/), { target: { value: 'Rates' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run Economic Analysis' }));
    await waitFor(() => expect(inserts.some((i) => i.table === 'epe_run_configs')).toBe(true));
    const cfg = inserts.find((i) => i.table === 'epe_run_configs').row;
    expect(cfg.opex_variable_usd_per_bbl_liquid).toBe(4);
    expect(cfg.opex_variable_usd_per_bbl_oil).toBeNull();
    expect(cfg.opex_variable_usd_per_bbl_water).toBeNull();
    expect(cfg.opex_variable_usd_per_mscf_gas).toBeNull();
  });

  it('refuses a negative rate', async () => {
    mountConsole();
    const gas = await screen.findByLabelText(/Per Mscf of gas/);
    fireEvent.change(gas, { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText(/Run Name/), { target: { value: 'Bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run Economic Analysis' }));
    expect(await screen.findByText('Leave blank or enter zero or more')).toBeInTheDocument();
    expect(inserts.some((i) => i.table === 'epe_run_configs')).toBe(false);
  });

  it('labels the rates for the report and leaves blanks out', () => {
    expect(labelForConfigKey('opex_variable_usd_per_bbl_liquid')).toBe('Variable opex per barrel of liquid');
    expect(labelForConfigKey('opex_variable_usd_per_mscf_gas')).toBe('Variable opex per Mscf of gas');
    expect(formatConfigValue('opex_variable_usd_per_bbl_oil', null)).toBeNull();
  });
});
