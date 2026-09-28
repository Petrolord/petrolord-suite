// 2026-09-27: a Suite quote priced at $1,247 was sent to Paystack as ₦1,247.
// These pin the conversion and the amount check every finaliser now runs.
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_NGN_PER_USD, ngnPerUsdFromConfig, usdToNgn, ngnToKobo,
  expectedNgnForQuote, checkPaystackAmount,
} from '../paystack-ngn.ts';

const fn = (name: string) => fs.readFileSync(path.resolve(__dirname, '../..', name, 'index.ts'), 'utf8');

describe('the naira rate', () => {
  test('prefers the Suite rate, then the HSE rate, then the default', () => {
    expect(ngnPerUsdFromConfig({ suite_ngn_per_usd: 1600, hse_ngn_per_usd: 1500 })).toBe(1600);
    expect(ngnPerUsdFromConfig({ hse_ngn_per_usd: 1450 })).toBe(1450);
    expect(ngnPerUsdFromConfig({ suite_ngn_per_usd: '1550' })).toBe(1550);
    expect(ngnPerUsdFromConfig({})).toBe(DEFAULT_NGN_PER_USD);
  });
  test('ignores zero, negative and junk rates', () => {
    expect(ngnPerUsdFromConfig({ suite_ngn_per_usd: 0, hse_ngn_per_usd: -5 })).toBe(DEFAULT_NGN_PER_USD);
    expect(ngnPerUsdFromConfig({ suite_ngn_per_usd: 'abc' })).toBe(DEFAULT_NGN_PER_USD);
  });
});

describe('usdToNgn', () => {
  test('converts, and the defect case is no longer ₦ for $', () => {
    expect(usdToNgn(1247, 1500)).toBe(1_870_500);
    expect(ngnToKobo(usdToNgn(1247, 1500))).toBe(187_050_000);
    expect(usdToNgn(1247, 1500)).not.toBe(1247);
  });
  test('rounds up to whole naira so the charge never falls short', () => {
    expect(usdToNgn(10.01, 1500)).toBe(15_015);
    expect(usdToNgn(0.333, 1500)).toBe(500);
  });
  test('refuses a bad rate', () => {
    expect(() => usdToNgn(100, 0)).toThrow();
  });
});

describe('expectedNgnForQuote', () => {
  test('uses the naira total the quote stored', () => {
    expect(expectedNgnForQuote({ total_amount: 1247, pricing_breakdown: { ngn_total: 1_800_000 } }, 1500)).toBe(1_800_000);
  });
  test('converts a legacy quote at the current rate', () => {
    expect(expectedNgnForQuote({ total_amount: 1247, pricing_breakdown: null }, 1500)).toBe(1_870_500);
  });
  test('refuses a quote with no total', () => {
    expect(() => expectedNgnForQuote({ total_amount: null }, 1500)).toThrow();
  });
});

describe('checkPaystackAmount', () => {
  const expectedNgn = 1_870_500;
  test('accepts the full naira amount', () => {
    expect(checkPaystackAmount({ paidKobo: 187_050_000, currency: 'NGN', expectedNgn })).toEqual({ ok: true });
  });
  test('tolerates one naira of rounding', () => {
    expect(checkPaystackAmount({ paidKobo: 187_049_950, currency: 'ngn', expectedNgn }).ok).toBe(true);
  });
  test('rejects the old ₦-for-$ payment against a converted quote (negative control)', () => {
    const r = checkPaystackAmount({ paidKobo: 124_700, currency: 'NGN', expectedNgn });
    expect(r.ok).toBe(false);
  });
  test('rejects the wrong currency', () => {
    expect(checkPaystackAmount({ paidKobo: 187_050_000, currency: 'USD', expectedNgn }).ok).toBe(false);
    expect(checkPaystackAmount({ paidKobo: 187_050_000, currency: undefined, expectedNgn }).ok).toBe(false);
  });
});

describe('the Paystack callers', () => {
  test('generate-quote charges the converted naira amount', () => {
    const src = fn('generate-quote');
    expect(src).toContain("from '../_shared/paystack-ngn.ts'");
    expect(src).toMatch(/currency: 'NGN'/);
    expect(src).not.toMatch(/amount: Math\.round\(totalAmount \* 100\)/);
  });
  test('both finalisers check the amount before granting access', () => {
    for (const name of ['verify-paystack-payment', 'paystack-webhook']) {
      const src = fn(name);
      expect(src).toContain('checkPaystackAmount');
      // The grant is the RPC (verify page) or provisionPaidQuote (webhook, 2026-09-28).
      const grants = [src.indexOf("rpc('manual_verify_quote'"), src.indexOf('provisionPaidQuote(')].filter((i) => i >= 0);
      expect(grants.length).toBeGreaterThan(0);
      expect(src.indexOf('checkPaystackAmount(')).toBeLessThan(Math.min(...grants));
    }
  });
  test('renewals charge naira, not the raw USD figure', () => {
    const src = fn('process-subscription-renewals');
    expect(src).toContain('usdToNgn');
    expect(src).not.toMatch(/amount: amount \* 100/);
  });
});
