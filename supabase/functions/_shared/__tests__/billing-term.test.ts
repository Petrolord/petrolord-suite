// 2026-09-07: the term a customer pays for is the term they get. A quarterly
// quote must provision three months, never twelve.

import { termMonths, billingPeriodOf, addMonths, subscriptionWindow, TERM_MONTHS } from '../billing-term.ts';

describe('termMonths / billingPeriodOf', () => {
  test('mirrors the generate-quote PERIODS table', () => {
    expect(termMonths('monthly')).toBe(1);
    expect(termMonths('quarterly')).toBe(3);
    expect(termMonths('annual')).toBe(12);
    expect(termMonths('2year')).toBe(24);
    expect(termMonths('3year')).toBe(36);
  });
  test('unknown, empty and legacy spellings fall back sanely', () => {
    expect(termMonths(undefined)).toBe(12);
    expect(termMonths('')).toBe(12);
    expect(termMonths('Yearly')).toBe(12);
    expect(billingPeriodOf('yearly')).toBe('annual');
    expect(billingPeriodOf('QUARTERLY')).toBe('quarterly');
    expect(billingPeriodOf('nonsense')).toBe('annual');
  });
  test('an explicit stored billing_period wins over the term', () => {
    expect(billingPeriodOf('annual', 'quarterly')).toBe('quarterly');
    expect(billingPeriodOf('quarterly', 'garbage')).toBe('quarterly');
  });
  test('every table entry round-trips', () => {
    for (const k of Object.keys(TERM_MONTHS)) expect(termMonths(billingPeriodOf(k))).toBe(TERM_MONTHS[k]);
  });
});

describe('addMonths', () => {
  test('clamps to the end of a shorter month', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(new Date('2028-01-31T10:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2028-02-29');
    expect(addMonths(new Date('2026-03-31T00:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-06-30');
  });
  test('keeps the day otherwise and crosses years', () => {
    expect(addMonths(new Date('2026-09-07T12:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-12-07');
    expect(addMonths(new Date('2026-09-07T12:00:00Z'), 12).toISOString().slice(0, 10)).toBe('2027-09-07');
    expect(addMonths(new Date('2026-11-15T12:00:00Z'), 24).toISOString().slice(0, 10)).toBe('2028-11-15');
  });
});

describe('subscriptionWindow', () => {
  test('the Breeze case: a quarterly purchase ends three months after payment', () => {
    const w = subscriptionWindow('2026-09-07T12:00:00Z', 'quarterly');
    expect(w.months).toBe(3);
    expect(w.billingPeriod).toBe('quarterly');
    expect(w.startDate).toBe('2026-09-07');
    expect(w.endDate).toBe('2026-12-07');
  });
  test('monthly and annual behave as before; a null term is annual', () => {
    expect(subscriptionWindow('2026-09-07T00:00:00Z', 'monthly').endDate).toBe('2026-10-07');
    expect(subscriptionWindow('2026-09-07T00:00:00Z', 'annual').endDate).toBe('2027-09-07');
    expect(subscriptionWindow('2026-09-07T00:00:00Z', null).endDate).toBe('2027-09-07');
  });
  test('accepts a Date and does not mutate it', () => {
    const d = new Date('2026-02-28T00:00:00Z');
    const w = subscriptionWindow(d, '2year');
    expect(w.endDate).toBe('2028-02-28');
    expect(d.toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});
