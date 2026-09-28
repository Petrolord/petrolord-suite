// 2026-09-28 (owner-approved): public.subscriptions is unique on
// (organization_id, quote_id) (migration 20260929140000, index
// subscriptions_org_quote_key). Every writer selects by org + quote, then
// updates or inserts; two finalizers for the same quote (Paystack verify page +
// webhook, Stripe verify + webhook, a double proof upload) can both see "no
// row" and both insert. With the index the second insert gets 23505; the
// writer must then update the winner's row with its own row, never lose the
// write and never throw. The SQL side is proven by
// tools/validation/subscriptions-unique/run.sh.

jest.mock('../nextgen-bridge.ts', () => ({ redeemBridgeForQuote: jest.fn(async () => {}) }));
jest.mock('../promo-codes.ts', () => ({ redeemPromoForQuote: jest.fn(async () => {}) }));
jest.mock('../email.ts', () => ({ sendEmail: jest.fn(async () => {}) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { provisionPaidQuote, upsertSuiteSubscription } from '../provision-quote.ts';
import { writeSubscriptionForQuote, isOrgQuoteConflict, SUBSCRIPTIONS_ORG_QUOTE_KEY } from '../subscription-write.ts';

const DUP = {
  code: '23505',
  message: `duplicate key value violates unique constraint "${SUBSCRIPTIONS_ORG_QUOTE_KEY}"`,
  details: 'Key (organization_id, quote_id)=(org-1, q-uuid-2) already exists.',
};

// In-memory supabase stand-in whose subscriptions table enforces the unique
// index like Postgres (NULL quote_id never conflicts). `race` is a row a
// concurrent finalizer inserts after our select and before our insert.
function fakeSupabase(tables: Record<string, any[]>, opts: { race?: any; rpcResult?: unknown } = {}) {
  const calls: any[] = [];
  let race = opts.race;
  let seq = 0;
  const from = (table: string) => {
    const rows = (tables[table] ||= []);
    const filters: [string, unknown][] = [];
    let op: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    let payload: any = null;
    const match = (r: any) => filters.every(([k, v]) => r[k] === v);
    const run = () => {
      if (op === 'update') {
        const hit = rows.filter(match);
        hit.forEach((r) => Object.assign(r, payload));
        calls.push({ table, op, payload, filters: [...filters], matched: hit.length });
        return { data: null, error: null };
      }
      if (op === 'insert') {
        if (table === 'subscriptions' && race) { rows.push({ id: 'winner-id', ...race }); race = undefined; }
        const clash = table === 'subscriptions' && payload.quote_id != null
          && rows.some((r) => r.organization_id === payload.organization_id && r.quote_id === payload.quote_id);
        calls.push({ table, op, payload, error: clash ? DUP.code : null });
        if (clash) return { data: null, error: { ...DUP } };
        const row = { id: `${table}-${++seq}`, ...payload };
        rows.push(row);
        return { data: [{ id: row.id }], error: null };
      }
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
      maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error ?? null }; },
      single: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error ?? null }; },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  const rpc = jest.fn(async () => ({ data: opts.rpcResult ?? { status: 'success', expiry_date: '2027-12-20T10:00:00Z' }, error: null }));
  return { from, rpc, calls, functions: { invoke: jest.fn(async () => ({})) } };
}

const QUOTE = {
  id: 'q-uuid-2', quote_id: 'QT-RACE', organization_id: 'org-1', total_amount: 100, currency: 'USD',
  billing_term: 'annual', billing_period: 'annual', modules: ['reservoir'], apps: [], seats: 2, user_seats: 2,
};
const HSE_QUOTE = { ...QUOTE, id: 'q-uuid-hse', quote_id: 'QT-HSE', modules: ['hse_professional'], seats: 10, user_seats: 10 };

// The row a concurrent finalizer (the "winner") inserted first.
const winnerRow = (quoteId: string, ref: string) => ({
  organization_id: 'org-1', quote_id: quoteId, status: 'pending', payment_status: 'PENDING',
  quote_details: { provider_reference: ref },
});

const subCalls = (sb: any, op: string) => sb.calls.filter((c: any) => c.table === 'subscriptions' && c.op === op);

describe('isOrgQuoteConflict', () => {
  test('23505 on subscriptions_org_quote_key only', () => {
    expect(isOrgQuoteConflict(DUP)).toBe(true);
    expect(isOrgQuoteConflict({ code: '23505', message: 'duplicate key value violates unique constraint "subscriptions_pkey"' })).toBe(false);
    expect(isOrgQuoteConflict({ code: '23503', message: SUBSCRIPTIONS_ORG_QUOTE_KEY })).toBe(false);
    for (const e of [null, undefined, 'x', {}]) expect(isOrgQuoteConflict(e)).toBe(false);
  });
});

describe('Suite provisioning (provisionPaidQuote / upsertSuiteSubscription)', () => {
  test('insert loses the race (23505): the winner row is updated with our row, one row, no throw', async () => {
    const tables = { quotes: [{ ...QUOTE }], subscriptions: [] as any[] };
    const sb = fakeSupabase(tables, { race: winnerRow('q-uuid-2', 'from-webhook') });
    const r = await provisionPaidQuote(sb, { quoteTextId: 'QT-RACE', provider: 'paystack', reference: 'from-verify-page', paidAt: '2026-12-20T10:00:00Z', sendEmail: false });
    expect(r.ok).toBe(true);
    expect(subCalls(sb, 'insert')).toHaveLength(1);
    expect(subCalls(sb, 'insert')[0].error).toBe('23505');
    const upd = subCalls(sb, 'update');
    expect(upd).toHaveLength(1);
    expect(upd[0].filters).toEqual([['id', 'winner-id']]);
    expect(upd[0].matched).toBe(1);
    expect(tables.subscriptions).toHaveLength(1);
    expect(tables.subscriptions[0]).toMatchObject({ id: 'winner-id', status: 'active', payment_status: 'COMPLETED', end_date: '2027-12-20' });
    expect(tables.subscriptions[0].quote_details.provider_reference).toBe('from-verify-page');
  });

  test('upsertSuiteSubscription (the verify page) also lands on the winner and still grants HSE', async () => {
    const tables = { subscriptions: [] as any[], organization_apps: [] as any[] };
    const sb = fakeSupabase(tables, { race: winnerRow('q-uuid-2', 'x') });
    const r = await upsertSuiteSubscription(sb, { orgId: 'org-1', quote: QUOTE, quoteTextId: 'QT-RACE', paidAt: '2026-01-31T00:00:00Z', provider: 'stripe', reference: 'cs_9', rpcResult: null });
    expect(r).toEqual({ ok: true, endDate: '2027-01-31' });
    expect(tables.subscriptions).toHaveLength(1);
    expect(tables.subscriptions[0]).toMatchObject({ id: 'winner-id', status: 'active', end_date: '2027-01-31' });
    expect(sb.calls.some((c: any) => c.table === 'organization_apps' && c.op === 'upsert')).toBe(true);
  });

  test('no race: one plain insert, no update (unchanged behaviour)', async () => {
    const tables = { quotes: [{ ...QUOTE }], subscriptions: [] as any[] };
    const sb = fakeSupabase(tables);
    await provisionPaidQuote(sb, { quoteTextId: 'QT-RACE', provider: 'stripe', reference: 'cs_1', paidAt: '2026-12-20T10:00:00Z', sendEmail: false });
    expect(subCalls(sb, 'insert')).toHaveLength(1);
    expect(subCalls(sb, 'update')).toHaveLength(0);
    expect(tables.subscriptions).toHaveLength(1);
  });
});

describe('HSE provisioning (provisionPaidQuote on an hse_professional quote)', () => {
  test('insert loses the race (23505): the winner row is updated, one row, provisioning still ok', async () => {
    const tables = { quotes: [{ ...HSE_QUOTE }], subscriptions: [] as any[], organization_apps: [] as any[] };
    const sb = fakeSupabase(tables, { race: winnerRow('q-uuid-hse', 'from-webhook') });
    const r = await provisionPaidQuote(sb, { quoteTextId: 'QT-HSE', provider: 'stripe', reference: 'cs_hse', paidAt: '2026-12-20T10:00:00Z', sendEmail: false });
    expect(r.ok).toBe(true);
    expect(sb.rpc).not.toHaveBeenCalled(); // HSE path, not Suite
    expect(subCalls(sb, 'insert')[0].error).toBe('23505');
    expect(subCalls(sb, 'update')).toHaveLength(1);
    expect(subCalls(sb, 'update')[0].filters).toEqual([['id', 'winner-id']]);
    expect(tables.subscriptions).toHaveLength(1);
    expect(tables.subscriptions[0]).toMatchObject({ id: 'winner-id', status: 'active', modules: ['hse_professional'], user_limit: 10 });
    expect(tables.subscriptions[0].quote_details.provider_reference).toBe('cs_hse');
  });
});

describe('writeSubscriptionForQuote (verify-bank-transfer uses it and returns the id)', () => {
  const pendingRow = (proof: string) => ({
    organization_id: 'org-1', quote_id: 'q-uuid-2', status: 'pending', payment_status: 'PENDING', bank_transfer_proof_url: proof,
  });

  test('race: returns the winner id and writes our proof onto it', async () => {
    const tables = { subscriptions: [] as any[] };
    const sb = fakeSupabase(tables, { race: pendingRow('first.pdf') });
    const r = await writeSubscriptionForQuote(sb, pendingRow('second.pdf'));
    expect(r).toEqual({ id: 'winner-id', error: null, raced: true });
    expect(tables.subscriptions).toHaveLength(1);
    expect(tables.subscriptions[0].bank_transfer_proof_url).toBe('second.pdf');
  });

  test('fresh insert returns the new id; existing row is updated by id', async () => {
    const tables = { subscriptions: [] as any[] };
    const sb = fakeSupabase(tables);
    const a = await writeSubscriptionForQuote(sb, pendingRow('a.pdf'));
    expect(a).toEqual({ id: 'subscriptions-1', error: null, raced: false });
    const b = await writeSubscriptionForQuote(sb, pendingRow('b.pdf'));
    expect(b).toEqual({ id: 'subscriptions-1', error: null, raced: false });
    expect(tables.subscriptions).toHaveLength(1);
    expect(tables.subscriptions[0].bank_transfer_proof_url).toBe('b.pdf');
  });

  test('any other insert error is returned, not swallowed into an update', async () => {
    const sb: any = fakeSupabase({ subscriptions: [] });
    const orig = sb.from;
    sb.from = (t: string) => {
      const b = orig(t);
      const ins = b.insert;
      b.insert = (p: any) => { ins(p); return { select: async () => ({ data: null, error: { code: '23502', message: 'null value in column "modules"' } }) }; };
      return b;
    };
    const r = await writeSubscriptionForQuote(sb, pendingRow('c.pdf'));
    expect(r.id).toBeNull();
    expect((r.error as any).code).toBe('23502');
    expect(r.raced).toBe(false);
  });

  test('NULL quote_id rows never conflict', async () => {
    const tables = { subscriptions: [] as any[] };
    const sb = fakeSupabase(tables, { race: { organization_id: 'org-1', quote_id: null } });
    const r = await writeSubscriptionForQuote(sb, { organization_id: 'org-1', quote_id: null, status: 'active' });
    expect(r.raced).toBe(false);
    expect(tables.subscriptions).toHaveLength(2);
  });

  test('verify-bank-transfer routes its write through the helper and throws on its error', () => {
    const src = readFileSync(join(__dirname, '../../verify-bank-transfer/index.ts'), 'utf8');
    expect(src).toContain('from "../_shared/subscription-write.ts"');
    expect(src).toMatch(/const written = await writeSubscriptionForQuote\(supabase, subRow\);\s*if \(written\.error\) throw written\.error;/);
    expect(src).toContain('subscription_id: subscriptionId');
    expect(src).not.toMatch(/from\("subscriptions"\)\s*\.insert/);
  });

  test('no writer keeps its own select-then-insert on subscriptions', () => {
    for (const f of ['../provision-quote.ts', '../../verify-bank-transfer/index.ts']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      expect(src).not.toMatch(/from\("subscriptions"\)\s*\.insert\(/);
    }
  });
});

describe('negative control: the old select-then-insert loses the write under the index', () => {
  // A verbatim restatement of the origin/main writer (before this change):
  // select by org + quote, update or insert, insert error ignored. Run against
  // the same fake it leaves the winner's row untouched, which the race tests
  // above reject. Proves the fake actually models the race.
  async function oldWriter(supabase: any, subRow: any) {
    const { data: existingSub } = await supabase.from('subscriptions')
      .select('id').eq('organization_id', subRow.organization_id).eq('quote_id', subRow.quote_id).limit(1).maybeSingle();
    if (existingSub?.id) await supabase.from('subscriptions').update(subRow).eq('id', existingSub.id);
    else await supabase.from('subscriptions').insert(subRow);
  }

  test('old code: 23505, no update, our row is lost', async () => {
    const tables = { subscriptions: [] as any[] };
    const sb = fakeSupabase(tables, { race: { organization_id: 'org-1', quote_id: 'q-uuid-2', status: 'pending' } });
    await oldWriter(sb, { organization_id: 'org-1', quote_id: 'q-uuid-2', status: 'active' });
    expect(subCalls(sb, 'insert')[0].error).toBe('23505');
    expect(subCalls(sb, 'update')).toHaveLength(0);
    expect(tables.subscriptions[0].status).toBe('pending'); // the paid 'active' write never landed
  });
});
