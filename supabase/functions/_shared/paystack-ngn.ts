// Suite quotes are priced in US dollars and paid on Paystack in naira.
//
// Until 2026-09-27 generate-quote sent the USD total to Paystack as if it were
// already naira ($1,247 was charged as ₦1,247), renewals did the same, and no
// verifier compared the amount paid with the quote. This module is the one
// place that turns a USD total into the naira charge, and the one check every
// Paystack finaliser runs before it grants access.
//
// The rate is owner-tunable without a deploy: pricing_config.suite_ngn_per_usd,
// falling back to the HSE rate (hse_ngn_per_usd) and then to DEFAULT_NGN_PER_USD.
// A quote stores the naira total and the rate it used in pricing_breakdown, so
// the customer pays exactly what the quote showed even if the rate moves while
// the quote is open.

export const DEFAULT_NGN_PER_USD = 1500;

// Paystack amounts are integers in kobo. Allow one naira of rounding slack
// between what we computed and what the gateway reports.
export const KOBO_TOLERANCE = 100;

export const validRate = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
};

// Reads the rate from pricing_config rows already loaded as { key: value }.
export function ngnPerUsdFromConfig(configMap: Record<string, unknown>): number {
  return validRate(configMap?.['suite_ngn_per_usd'])
    ?? validRate(configMap?.['hse_ngn_per_usd'])
    ?? DEFAULT_NGN_PER_USD;
}

// Loads the rate straight from the table (for functions that do not already
// read pricing_config).
// deno-lint-ignore no-explicit-any
export async function loadNgnPerUsd(supabase: any): Promise<number> {
  const { data } = await supabase
    .from('pricing_config')
    .select('key, value')
    .in('key', ['suite_ngn_per_usd', 'hse_ngn_per_usd']);
  const map: Record<string, unknown> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return ngnPerUsdFromConfig(map);
}

// Whole naira, rounded up so the charge never falls short of the USD price.
export function usdToNgn(usd: number, ngnPerUsd: number): number {
  if (!(usd >= 0) || !validRate(ngnPerUsd)) throw new Error('usdToNgn needs a non-negative amount and a positive rate');
  return Math.ceil(Math.round(usd * ngnPerUsd * 100) / 100);
}

export const ngnToKobo = (ngn: number): number => Math.round(ngn * 100);

// The naira a quote expects. Quotes created since this fix carry
// pricing_breakdown.ngn_total; older quotes are converted at today's rate, so
// a payment made against a stale link at the old ₦X-for-$X amount fails.
export function expectedNgnForQuote(
  quote: { total_amount?: number | string | null; pricing_breakdown?: Record<string, unknown> | null },
  ngnPerUsd: number,
): number {
  const stored = validRate(quote?.pricing_breakdown?.['ngn_total']);
  if (stored) return stored;
  const usd = Number(quote?.total_amount);
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('Quote has no payable total');
  return usdToNgn(usd, ngnPerUsd);
}

export type AmountCheck = { ok: true } | { ok: false; reason: string };

// Paid must be in NGN and at least the expected amount (less rounding slack).
export function checkPaystackAmount(opts: { paidKobo: number; currency?: string | null; expectedNgn: number }): AmountCheck {
  const currency = String(opts.currency || '').toUpperCase();
  if (currency !== 'NGN') return { ok: false, reason: `Paid in ${currency || 'an unknown currency'}, expected NGN` };
  const expectedKobo = ngnToKobo(opts.expectedNgn);
  if (!(opts.paidKobo >= expectedKobo - KOBO_TOLERANCE)) {
    return { ok: false, reason: `Paid ₦${(opts.paidKobo / 100).toLocaleString('en-US')}, expected ₦${opts.expectedNgn.toLocaleString('en-US')}` };
  }
  return { ok: true };
}
