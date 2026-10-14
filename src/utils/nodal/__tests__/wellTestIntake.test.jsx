/**
 * 2026-10-14: Nodal Analysis Studio reads a Well Test Analysis Studio
 * project by id (wta-1 productivity) and applies pr and J on click only.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

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

import {
  nodalInflowFromWellTest, wellTestProductivityStatus, nodalStudioHref, wellTestIntakeCurrent,
} from '@/utils/nodal/wellTestIntake';
import { NodalAnalysisStudioProvider, useNodalStudio, DEFAULT_INFLOW } from '@/contexts/NodalAnalysisStudioContext';
import { WellTestIntakeCard } from '@/components/nodalstudio/InputCards';

const record = (over = {}) => ({
  contract: 'wta-1',
  app: 'Well Test Analysis Studio',
  project: { id: 'wt-1', name: 'B-12 buildup', well: 'B-12', test_type: 'buildup', test_dates: '2026-09-01 to 2026-09-03' },
  fluid: 'oil',
  permeability: { value: 42, method: 'Horner straight line' },
  pressure: { average_psia: 3000 },
  productivity: {
    q_stb_d: 500, pwf_psia: 2500, pr_psia: 3000, pr_method: 'p*',
    pi_stbd_psi: 1.0, dp_skin_psi: 200, ideal_pi_stbd_psi: 500 / 300, flow_efficiency: 0.6, test_type: 'buildup',
  },
  productivity_withheld: null,
  computed_at: '2026-10-14T09:00:00Z',
  ...over,
});

describe('the Nodal intake reader (record to inflow patch)', () => {
  test('as tested: pr and J, straight-line PI', () => {
    const r = nodalInflowFromWellTest(record(), 'asTested', { ...DEFAULT_INFLOW, model: 'vogel' }, { now: 'T' });
    expect(r.ok).toBe(true);
    expect(r.patch).toEqual({ wellType: 'oil', model: 'pi', calMode: 'pi', pr: '3000', pi: '1' });
    expect(r.provenance).toMatchObject({ project_id: 'wt-1', project_name: 'B-12 buildup', well: 'B-12', choice: 'asTested', pr_method: 'p*', pi_stbd_psi: 1, applied_at: 'T' });
  });

  test('skin removed: the ideal J; a composite model stays composite', () => {
    const r = nodalInflowFromWellTest(record(), 'skinRemoved', { ...DEFAULT_INFLOW, model: 'composite' });
    expect(r.ok).toBe(true);
    expect(r.patch.model).toBe('composite');
    expect(Number(r.patch.pi)).toBeCloseTo(500 / 300, 6);
    expect(r.patch.pr).toBe('3000');
    expect(r.provenance.choice_label).toBe('Skin removed');
  });

  test('refused with a reason: gas test, missing productivity, no ideal J', () => {
    const gas = nodalInflowFromWellTest(record({ fluid: 'gas', productivity: null }), 'asTested');
    expect(gas.ok).toBe(false);
    expect(gas.reason).toMatch(/gas test/);
    expect(gas.patch).toBeNull();
    const none = nodalInflowFromWellTest(record({ productivity: null, productivity_withheld: 'Skin is withheld.' }), 'asTested');
    expect(none.reason).toMatch(/holds no productivity index: Skin is withheld/);
    const old = wellTestProductivityStatus(record({ productivity: undefined, productivity_withheld: undefined }));
    expect(old.reason).toMatch(/save it once/);
    const noIdeal = nodalInflowFromWellTest(record({ productivity: { ...record().productivity, ideal_pi_stbd_psi: null } }), 'skinRemoved');
    expect(noIdeal.reason).toMatch(/no skin-removed productivity index/);
    expect(nodalInflowFromWellTest(null, 'asTested').ok).toBe(false);
  });

  test('href and the edited-since check', () => {
    expect(nodalStudioHref('a b')).toBe('/dashboard/apps/production/nodal-analysis-studio?wellTestProject=a%20b');
    expect(nodalStudioHref('x', { inHarness: true })).toBe('/dev/nodal-analysis-studio?wellTestProject=x');
    expect(nodalStudioHref(null)).toBeNull();
    const { provenance } = nodalInflowFromWellTest(record(), 'asTested');
    expect(wellTestIntakeCurrent(provenance, { wellType: 'oil', pr: '3000', pi: '1' })).toBe(true);
    expect(wellTestIntakeCurrent(provenance, { wellType: 'oil', pr: '3100', pi: '1' })).toBe(false);
  });
});

describe('in the studio: read by id, apply on click, saved with the project', () => {
  const fakeDb = (row) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
  });
  let ctx;
  const Probe = () => { ctx = useNodalStudio(); return null; };

  test('the card names the source; nothing changes until a choice; provenance is serialised', async () => {
    render(<NodalAnalysisStudioProvider><Probe /><WellTestIntakeCard /></NodalAnalysisStudioProvider>);
    expect(screen.queryByTestId('nodal-wt-intake')).toBeNull();
    await act(async () => {
      await ctx.loadWellTestSource('wt-1', fakeDb({ id: 'wt-1', project_name: 'B-12 buildup', inputs_data: { wta: record() } }));
    });
    expect(screen.getByTestId('nodal-wt-project')).toHaveTextContent('B-12 buildup');
    expect(screen.getByTestId('nodal-wt-pr')).toHaveTextContent('3000.0 psia (p* of the Horner line)');
    expect(screen.getByTestId('nodal-wt-test-point')).toHaveTextContent('500 STB/D at 2500.0 psia');
    expect(screen.getByTestId('nodal-wt-j')).toHaveTextContent('1.00 STB/D/psi');
    expect(screen.getByTestId('nodal-wt-j-ideal')).toHaveTextContent('1.67 STB/D/psi (flow efficiency 60%)');
    expect(screen.getByTestId('nodal-wt-intake-note')).toHaveTextContent(/bubble point stays the Nodal entry/);
    // not applied yet
    expect(ctx.inflow.pr).toBe(DEFAULT_INFLOW.pr);
    expect(ctx.inflow.pi).toBe(DEFAULT_INFLOW.pi);
    fireEvent.click(screen.getByTestId('nodal-wt-apply-ideal'));
    await waitFor(() => expect(ctx.inflow.pr).toBe('3000'));
    expect(Number(ctx.inflow.pi)).toBeCloseTo(500 / 300, 6);
    expect(ctx.inflow.model).toBe('composite');
    expect(ctx.inflowSpec.error).toBeNull();
    const saved = ctx.serializeInputs();
    expect(saved.wellTestIntake).toMatchObject({ project_id: 'wt-1', choice: 'skinRemoved', pr_psia: 3000 });
    expect(screen.getByTestId('nodal-wt-applied')).toHaveTextContent(/Applied skin removed on \d{4}-\d{2}-\d{2} from B-12 buildup \(well B-12\)/);
    act(() => ctx.setInflowField('pi', '2'));
    expect(screen.getByTestId('nodal-wt-applied')).toHaveTextContent(/edited since/);
  });

  test('a gas test is refused on the card with its reason, and SI shows kPa', async () => {
    render(<NodalAnalysisStudioProvider><Probe /><WellTestIntakeCard /></NodalAnalysisStudioProvider>);
    await act(async () => {
      await ctx.loadWellTestSource('wt-g', fakeDb({ id: 'wt-g', project_name: 'G-1', inputs_data: { wta: record({ fluid: 'gas', productivity: null, productivity_withheld: 'A gas test.' }) } }));
    });
    expect(screen.getByTestId('nodal-wt-intake-refused')).toHaveTextContent(/gas test/);
    expect(screen.queryByTestId('nodal-wt-apply-tested')).toBeNull();
    await act(async () => {
      await ctx.loadWellTestSource('wt-1', fakeDb({ id: 'wt-1', project_name: 'B-12', inputs_data: { wta: record() } }));
    });
    act(() => ctx.setUnitSystem('si'));
    expect(screen.getByTestId('nodal-wt-pr')).toHaveTextContent('kPa');
  });

  test('a missing project says why', async () => {
    render(<NodalAnalysisStudioProvider><Probe /><WellTestIntakeCard /></NodalAnalysisStudioProvider>);
    await act(async () => { await ctx.loadWellTestSource('nope', fakeDb(null)); });
    expect(screen.getByTestId('nodal-wt-intake-error')).toHaveTextContent(/not found/);
  });
});
