// Billing term arithmetic shared by quoting, provisioning and renewals
// (2026-09-07, Breeze Energy onboarding). generate-quote prices a term as
// N months (PERIODS), but provisioning used to know only "monthly" and
// "everything else is a year", so a quarterly purchase was granted twelve
// months of access. One table, used everywhere, so the term the customer
// paid for is the term they get.

export const TERM_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
  yearly: 12,
  "2year": 24,
  "3year": 36,
};

/** Months in a billing term; unknown or empty terms count as annual (the historical default). */
export function termMonths(term: unknown): number {
  const key = String(term ?? "").trim().toLowerCase();
  return TERM_MONTHS[key] ?? 12;
}

/** The billing_period label stored beside the term: monthly, quarterly, annual, 2year, 3year. */
export function billingPeriodOf(term: unknown, explicit?: unknown): string {
  const given = String(explicit ?? "").trim().toLowerCase();
  if (given && TERM_MONTHS[given] != null) return given === "yearly" ? "annual" : given;
  const key = String(term ?? "").trim().toLowerCase();
  if (TERM_MONTHS[key] == null) return "annual";
  return key === "yearly" ? "annual" : key;
}

/** Add calendar months, clamping the day to the target month's length (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export interface SubscriptionWindow {
  months: number;
  billingPeriod: string;
  start: Date;
  end: Date;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

/** The access window a paid quote buys: start at payment, end after the term's months. */
export function subscriptionWindow(paidAt: string | Date, term: unknown, explicitPeriod?: unknown): SubscriptionWindow {
  const start = paidAt instanceof Date ? new Date(paidAt.getTime()) : new Date(paidAt);
  const billingPeriod = billingPeriodOf(term, explicitPeriod);
  const months = termMonths(billingPeriod);
  const end = addMonths(start, months);
  return { months, billingPeriod, start, end, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
