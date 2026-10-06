// 2026-09-28 (Suite #769, owner-approved): manual_verify_quote is the one place
// that sets purchased_modules end dates (renewals stack, top-ups never shorten,
// re-runs change nothing). The finalizers pass it the paid date, write the
// subscriptions row with the end date it returns, keyed by org + quote so a
// second finalizer never adds a row, and never run their own expiry update.
// The SQL rules are gated by tools/validation/renewal-expiry/run.sh.

jest.mock('../nextgen-bridge.ts', () => ({ redeemBridgeForQuote: jest.fn(async () => {}) }));
jest.mock('../promo-codes.ts', () => ({ redeemPromoForQuote: jest.fn(async () => {}) }));
jest.mock('../email.ts', () => ({ sendEmail: jest.fn(async () => {}) }));

import { provisionedEnd } from '../billing-term.ts';
import { paymentAlreadyProcessed } from '../payment-status.ts';
import { provisionPaidQuote, upsertSuiteSubscription } from '../provision-quote.ts';
import { grantSeismicStorage, seismicTierOf } from '../seismic-storage.ts';

// Minimal in-memory stand-in for the supabase-js query builder.
function fakeSupabase(tables: Record<string, any[]>, rpcResult: unknown) {
  const calls: any[] = [];
  const from = (table: string) => {
    const rows = (tables[table] ||= []);
    const filters: [string, unknown][] = [];
    let op: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    let payload: any = null;
    const match = (r: any) => filters.every(([k, v]) => r[k] === v);
    const run = () => {
      if (op === 'update') { rows.filter(match).forEach((r) => Object.assign(r, payload)); calls.push({ table, op, payload, filters: [...filters] }); return { data: null, error: null }; }
      if (op === 'insert') { rows.push({ id: `${table}-${rows.length + 1}`, ...payload }); calls.push({ table, op, payload }); return { data: null, error: null }; }
      if (op === 'upsert') { calls.push({ table, op, payload }); return { data: null, error: null }; }
      return { data: rows.filter(match), error: null };
    };
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
      limit: () => b,
      update: (p: any) => { op = 'update'; payload = p; return b; },
      insert: (p: any) => { op = 'insert'; payload = p; return b; },
      upsert: (p: any) => { op = 'upsert'; payload = p; return b; },
      maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: null }; },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  const rpc = jest.fn(async () => ({ data: rpcResult, error: null }));
  return { from, rpc, calls, functions: { invoke: jest.fn(async () => ({})) } };
}

const QUOTE = {
  id: 'q-uuid-2', quote_id: 'QT-RENEW', organization_id: 'org-1', total_amount: 100, currency: 'USD',
  billing_term: 'annual', billing_period: 'annual', modules: ['reservoir'], apps: [], seats: 2, user_seats: 2,
};

describe('provisionedEnd', () => {
  const windowEnd = new Date('2027-12-20T10:00:00Z');
  test('a later end from the RPC (a stacked renewal) wins', () => {
    expect(provisionedEnd(windowEnd, { expiry_date: '2028-06-01T00:00:00+00:00' }).toISOString()).toBe('2028-06-01T00:00:00.000Z');
  });
  test('never earlier than the paid window', () => {
    expect(provisionedEnd(windowEnd, { expiry_date: '2027-01-01T00:00:00Z' }).toISOString()).toBe(windowEnd.toISOString());
  });
  test('missing, null or invalid falls back to the window end', () => {
    for (const r of [null, undefined, {}, { expiry_date: null }, { expiry_date: 'garbage' }, { status: 'error' }]) {
      expect(provisionedEnd(windowEnd, r).toISOString()).toBe(windowEnd.toISOString());
    }
  });
});

describe('paymentAlreadyProcessed (webhook idempotency)', () => {
  test('the verify page spelling counts (the bug: webhook re-ran provisioning after verify)', () => {
    expect(paymentAlreadyProcessed({ status: 'success', local_status: 'success' })).toBe(true);
    expect(paymentAlreadyProcessed({ status: 'pending', local_status: 'success' })).toBe(true);
  });
  test('the webhook spelling still counts', () => {
    expect(paymentAlreadyProcessed({ status: 'COMPLETED' })).toBe(true);
  });
  test('unpaid or unknown payments do not', () => {
    for (const p of [null, undefined, {}, { status: 'pending' }, { status: 'failed', local_status: 'failed' }, { status: 'abandoned' }]) {
      expect(paymentAlreadyProcessed(p)).toBe(false);
    }
  });
});

describe('provisionPaidQuote (Stripe and the Paystack webhook)', () => {
  test('passes the paid date to the RPC and writes the subscription with the end it returns', async () => {
    const sb = fakeSupabase({ quotes: [{ ...QUOTE }], subscriptions: [] }, { status: 'success', expiry_date: '2028-06-01T00:00:00+00:00' });
    const r = await provisionPaidQuote(sb, { quoteTextId: 'QT-RENEW', provider: 'paystack', reference: 'QT-RENEW', paidAt: '2026-12-20T10:00:00Z', sendEmail: false });
    expect(r.ok).toBe(true);
    expect(sb.rpc).toHaveBeenCalledWith('manual_verify_quote', { p_quote_id: 'QT-RENEW', p_organization_id: 'org-1', p_paid_at: '2026-12-20T10:00:00Z' });
    const subs = (sb as any).calls.filter((c: any) => c.table === 'subscriptions' && c.op === 'insert');
    expect(subs).toHaveLength(1);
    expect(subs[0].payload.start_date).toBe('2026-12-20');
    expect(subs[0].payload.end_date).toBe('2028-06-01');
    expect(subs[0].payload.quote_id).toBe('q-uuid-2');
  });

  test('never runs its own purchased_modules expiry update (the RPC is the one place)', async () => {
    const sb = fakeSupabase({ quotes: [{ ...QUOTE }], subscriptions: [] }, { status: 'success', expiry_date: '2027-12-20T10:00:00Z' });
    await provisionPaidQuote(sb, { quoteTextId: 'QT-RENEW', provider: 'stripe', reference: 'cs_1', paidAt: '2026-12-20T10:00:00Z', sendEmail: false });
    expect((sb as any).calls.filter((c: any) => c.table === 'purchased_modules')).toHaveLength(0);
  });

  test('a second finalizer for the same quote updates the one subscription row', async () => {
    const tables = { quotes: [{ ...QUOTE }], subscriptions: [] as any[] };
    const sb = fakeSupabase(tables, { status: 'success', expiry_date: '2027-12-20T10:00:00Z' });
    await provisionPaidQuote(sb, { quoteTextId: 'QT-RENEW', provider: 'paystack', reference: 'QT-RENEW', paidAt: '2026-12-20T10:00:00Z', sendEmail: false });
    await provisionPaidQuote(sb, { quoteTextId: 'QT-RENEW', provider: 'paystack', reference: 'QT-RENEW', paidAt: '2026-12-20T10:00:00Z', sendEmail: false });
    expect(tables.subscriptions).toHaveLength(1);
    expect(tables.subscriptions[0].end_date).toBe('2027-12-20');
  });
});

describe('upsertSuiteSubscription (the verify page uses it too)', () => {
  test('same row shape on every rail, HSE granted with Suite', async () => {
    const tables = { subscriptions: [] as any[], organization_apps: [] as any[] };
    const sb = fakeSupabase(tables, null);
    const r = await upsertSuiteSubscription(sb, { orgId: 'org-1', quote: QUOTE, quoteTextId: 'QT-RENEW', paidAt: '2026-01-31T00:00:00Z', provider: 'paystack', reference: 'ref', rpcResult: null });
    expect(r).toEqual({ ok: true, endDate: '2027-01-31' });
    expect(tables.subscriptions[0]).toMatchObject({ organization_id: 'org-1', status: 'active', payment_status: 'COMPLETED', modules: ['reservoir', 'hse_professional'] });
    expect(tables.subscriptions[0].quote_details).toMatchObject({ payment_method: 'paystack', provider_reference: 'ref', paystack_reference: 'ref' });
    expect((sb as any).calls.some((c: any) => c.table === 'organization_apps' && c.op === 'upsert')).toBe(true);
  });
});

describe('seismic storage tier on a paid quote (owner-approved 2026-10-06)', () => {
  const TIERED = { ...QUOTE, pricing_breakdown: { usd_total: 100, seismic_storage: { tier_key: 'survey', quota_gib: 1024, price_usd: 299 } } };

  test('the payment grants the tier until the end of the paid term, and the subscription remembers it for renewals', async () => {
    const tables = { subscriptions: [] as any[], organization_apps: [] as any[] };
    const sb = fakeSupabase(tables, null);
    await upsertSuiteSubscription(sb, { orgId: 'org-1', quote: TIERED, quoteTextId: 'QT-RENEW', paidAt: '2026-01-31T00:00:00Z', provider: 'paystack', reference: 'ref', rpcResult: null });
    expect(sb.rpc).toHaveBeenCalledWith('seismic_storage_set_tier', {
      p_organization_id: 'org-1', p_tier_key: 'survey', p_active_until: '2027-01-31T23:59:59Z', p_source_quote_id: 'q-uuid-2',
    });
    expect(tables.subscriptions[0].quote_details.seismic_storage).toEqual({ tier_key: 'survey', quota_gib: 1024, price_usd: 299 });
  });

  test('a quote without a tier grants none (negative control)', async () => {
    const sb = fakeSupabase({ subscriptions: [], organization_apps: [] }, null);
    await upsertSuiteSubscription(sb, { orgId: 'org-1', quote: QUOTE, quoteTextId: 'QT-RENEW', paidAt: '2026-01-31T00:00:00Z', provider: 'paystack', reference: 'ref', rpcResult: null });
    expect(sb.rpc.mock.calls.some((c: any[]) => c[0] === 'seismic_storage_set_tier')).toBe(false);
  });

  test('a failed grant never fails the payment', async () => {
    const sb = fakeSupabase({ subscriptions: [], organization_apps: [] }, null);
    sb.rpc.mockImplementation(async (name: string) => (name === 'seismic_storage_set_tier' ? { data: null, error: { message: 'boom' } } : { data: null, error: null }));
    const r = await upsertSuiteSubscription(sb, { orgId: 'org-1', quote: TIERED, quoteTextId: 'QT-RENEW', paidAt: '2026-01-31T00:00:00Z', provider: 'paystack', reference: 'ref', rpcResult: null });
    expect(r.ok).toBe(true);
    expect(await grantSeismicStorage(sb, 'org-1', 'survey', '2027-01-31', 'q', '[t]')).toBe(false);
  });

  test('provisionPaidQuote reads the breakdown, so Stripe and the webhook grant it too', async () => {
    const sb = fakeSupabase({ quotes: [{ ...TIERED }], subscriptions: [] }, { status: 'success', expiry_date: '2027-12-20T10:00:00Z' });
    await provisionPaidQuote(sb, { quoteTextId: 'QT-RENEW', provider: 'stripe', reference: 'cs_1', paidAt: '2026-12-20T10:00:00Z', sendEmail: false });
    expect(sb.rpc).toHaveBeenCalledWith('seismic_storage_set_tier', expect.objectContaining({ p_tier_key: 'survey', p_active_until: '2027-12-20T23:59:59Z' }));
  });

  test('seismicTierOf', () => {
    expect(seismicTierOf(TIERED)).toBe('survey');
    expect(seismicTierOf(QUOTE)).toBeNull();
    expect(seismicTierOf({ pricing_breakdown: { seismic_storage: { tier_key: '' } } })).toBeNull();
  });
});
