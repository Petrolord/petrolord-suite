/**
 * AS13 hardening — "migration not applied" was detected only from the
 * columns of a loaded row. On an EMPTY register, which is the first use
 * of every organization in production, the new schema was assumed: the
 * full form was offered, the insert failed on an unknown column, and the
 * retry dropped every AS3 field and toasted "Obligation created".
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { makeSchemaFake } from '../../shared/__tests__/fakeSupabaseSchema';
import { useRegulatoryCompliance } from '../hooks/useRegulatoryCompliance';
import { as3SchemaMessage, as3ValuesEntered } from '../utils/obligationPayload';

let mockDb;
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (...args) => mockDb.client.from(...args),
    rpc: (...args) => mockDb.client.rpc(...args),
  },
}));
jest.mock('@/contexts/SupabaseAuthContext', () => ({
  useAuth: () => ({ organization: { id: 'org-1' }, user: { id: 'user-1' } }),
}));

const AS3_MISSING = {
  regulatory_obligations: [
    'description', 'regime', 'obligation_type', 'jurisdiction', 'reference', 'frequency',
    'lifecycle', 'effective_date', 'expiry_date', 'last_submitted_date', 'lead_time_days',
    'consequence', 'notes', 'obligation_code',
  ],
  regulatory_authorities: ['website', 'notes'],
};

const empty = () => ({ regulatory_obligations: [], regulatory_authorities: [], regulatory_evidence: [] });

const setup = async (missing = {}) => {
  mockDb = makeSchemaFake(empty(), { missing });
  const view = renderHook(() => useRegulatoryCompliance());
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
};

const FORM = {
  title: 'Discharge return', due_date: '2026-12-31', frequency: 'Annual', lifecycle: 'Active',
  lead_time_days: 30,
};

describe('an empty register on a database without migration 20260917100000', () => {
  it('is detected by asking, so the form is not offered in full', async () => {
    const { result } = await setup(AS3_MISSING);
    expect(result.current.hasAs3Schema).toBe(false);
  });

  it('an up to date empty register keeps the full form', async () => {
    const { result } = await setup();
    expect(result.current.hasAs3Schema).toBe(true);
  });

  it('a create that could not store AS3 values says what was lost', async () => {
    const { result } = await setup(AS3_MISSING);
    let out;
    await act(async () => {
      out = await result.current.createObligation({ ...FORM, regime: 'Water', expiry_date: '2027-03-01' });
    });
    expect(out.success).toBe(true);
    expect(out.warning).toMatch(/regime and expiry date/);
    expect(out.warning).toMatch(/20260917100000/);
    expect(mockDb.tables.regulatory_obligations[0]).not.toHaveProperty('regime');
  });

  it('a create carrying only the form defaults carries no warning', async () => {
    const { result } = await setup(AS3_MISSING);
    let out;
    await act(async () => { out = await result.current.createObligation(FORM); });
    expect(out.success).toBe(true);
    expect(out.warning).toBeFalsy();
  });

  it('a regulator saved without its website says so', async () => {
    const { result } = await setup(AS3_MISSING);
    let out;
    await act(async () => {
      out = await result.current.createAuthority({ name: 'Agency', website: 'https://example.org' });
    });
    expect(out.success).toBe(true);
    expect(out.warning).toMatch(/website/);
  });
});

describe('what counts as lost', () => {
  it('ignores defaults and blanks, names everything else', () => {
    expect(as3ValuesEntered(FORM)).toEqual([]);
    expect(as3ValuesEntered({ ...FORM, frequency: 'Monthly', notes: ' ', lead_time_days: 14 }))
      .toEqual(['frequency', 'warning lead time']);
  });

  it('the message has no dashes', () => {
    expect(as3SchemaMessage(['regime', 'notes'])).not.toMatch(/[–—]| -- /);
  });
});
