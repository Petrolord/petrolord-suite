/**
 * Engine v3.10 (engines #193) in the EPE screens.
 *
 * EC1-2: the cash flow engine adopted the module IRR contract, so a rate is
 * reported only when it is a verified root inside the band. The viewer
 * printed a bare N/A, which does not say which of three different answers it
 * is.
 * EC1-5, EC1-6, EC1-9: new KPIs (profitability index, the PSC cost and the
 * CIT allowance left at cessation) and new row fields.
 * The stored basis moved: below 100 percent working interest a run saved
 * before 3.10 holds field-level lines and a 3.10 run holds them at share, so
 * comparing one against the other differences two different bases.
 */
import { epeIrrReason } from '@/pages/apps/epe/epeIrrReason';
import { cashFlowColumns, KPI_EXPORT_ROWS } from '@/pages/apps/epe/EpeResultsViewer';
import { atShareBasis, engineLabel, SHARE_BASIS_VERSION } from '@/pages/apps/epe/EpeRunComparison';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({ select: jest.fn(() => ({ eq: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
  },
}));

describe('why a run has no IRR', () => {
  it('names each case the contract reports', () => {
    expect(epeIrrReason({ irr: null, irr_status: 'no-sign-change' }))
      .toBe('No IRR: the net cash flow never changes sign, so no rate brings it to zero.');
    expect(epeIrrReason({ irr: null, irr_status: 'no-root' }))
      .toMatch(/no rate from -99 to 1000 percent/);
    expect(epeIrrReason({ irr: null, irr_status: 'above-clamp' }))
      .toMatch(/above 1000 percent/);
    expect(epeIrrReason({ irr: null, irr_status: 'multiple-roots', irr_roots: [-12.5, 34.25] }))
      .toBe('No single IRR: the net present value is zero at -12.50% and 34.25%, so no one rate is the return.');
    expect(epeIrrReason({
      irr: null, irr_status: 'multiple-roots', irr_roots: [15], irr_root_above_band: true,
    })).toMatch(/zero at 15\.00% and a rate above 1000 percent/);
  });

  it('negative controls: a reported rate, and a run saved before v3.10', () => {
    expect(epeIrrReason({ irr: 18.4, irr_status: 'ok' })).toBeNull();
    expect(epeIrrReason({ irr: 0, irr_status: 'ok' })).toBeNull();
    // A pre-3.10 run carries no status, and an IRR of null on it means only
    // that the old solver found none: no reason is invented for it.
    expect(epeIrrReason({ irr: null })).toBeNull();
    expect(epeIrrReason(null)).toBeNull();
  });
});

describe('the new KPIs and row fields reach the screen', () => {
  it('exports the v3.10 KPIs', () => {
    const keys = KPI_EXPORT_ROWS.map(([k]) => k);
    expect(keys).toEqual(expect.arrayContaining([
      'profitability_index', 'psc_unrecovered_cost_at_cessation',
      'cit_allowance_unused_at_cessation', 'irr_status',
    ]));
    // The published keys are untouched, so an old run exports as it did.
    expect(keys).toEqual(expect.arrayContaining(['npv', 'irr', 'dpi', 'government_take_pct']));
  });

  it('adds the new cash flow columns only for a run that carries them', () => {
    const v310Rows = [{
      year: 2027,
      psc_cost_pool_after: 1200,
      cit_allowance_claimed: 300,
      cit_allowance_carryforward: 50,
      working_interest_pct: 45,
    }];
    const labels = cashFlowColumns(true, v310Rows).map((c) => c.key);
    expect(labels).toEqual(expect.arrayContaining([
      'psc_cost_pool_after', 'cit_allowance_claimed', 'cit_allowance_carryforward', 'working_interest_pct',
    ]));

    // Negative control: an older run carries none of them and its columns
    // are exactly what they were.
    const oldRows = [{ year: 2020, oil_bbl: 100, net_cash_flow: 5 }];
    const oldKeys = cashFlowColumns(true, oldRows).map((c) => c.key);
    ['psc_cost_pool_after', 'cit_allowance_claimed', 'cit_allowance_carryforward', 'working_interest_pct']
      .forEach((k) => expect(oldKeys).not.toContain(k));
  });
});

describe('comparing runs across the basis change', () => {
  it('tells a run stored at share from one stored at field level', () => {
    expect(SHARE_BASIS_VERSION).toBe('3.10.0');
    expect(atShareBasis({ engine_version: '3.10.0' })).toBe(true);
    expect(atShareBasis({ engine_version: '3.11.2' })).toBe(true);
    expect(atShareBasis({ engine_version: '4.0.0' })).toBe(true);
    expect(atShareBasis({ engine_version: '3.9.0' })).toBe(false);
    expect(atShareBasis({ engine_version: '3.8.1' })).toBe(false);
    // A run that recorded no version cannot be assumed to be the new one.
    expect(atShareBasis({})).toBe(false);
    expect(atShareBasis(null)).toBe(false);
  });

  it('names each side by its engine version', () => {
    expect(engineLabel({ engine_version: '3.9.0' })).toBe('v3.9.0');
    expect(engineLabel({})).toBe('an engine version it did not record');
  });

  it('a mismatch is exactly a pair that straddles the change', () => {
    const straddles = (a, b) => atShareBasis({ engine_version: a }) !== atShareBasis({ engine_version: b });
    expect(straddles('3.9.0', '3.10.0')).toBe(true);
    // Negative controls: two runs on the same side are comparable.
    expect(straddles('3.10.0', '3.11.0')).toBe(false);
    expect(straddles('3.8.0', '3.9.0')).toBe(false);
  });
});
