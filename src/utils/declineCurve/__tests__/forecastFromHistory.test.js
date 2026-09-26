// DCA T1: remaining reserves start at the last history date.
import { forecastFromHistory, producedToDate } from '../forecastFromHistory';

// qi 1000 bbl/d, Di 0.002/day nominal, b 0.5, fit t0 = 2023-01-01
const fit = { qi: 1000, Di: 0.002, b: 0.5, modelType: 'Hyperbolic', t0: '2023-01-01T00:00:00.000Z' };
const q = (t) => fit.qi / (1 + fit.b * fit.Di * t) ** (1 / fit.b);
const Np = (t) => (fit.qi / ((1 - fit.b) * fit.Di)) * (1 - (1 + fit.b * fit.Di * t) ** (1 - 1 / fit.b));
const data = Array.from({ length: 25 }, (_, m) => {
  const d = new Date(Date.UTC(2023, m, 1));
  const t = (d - new Date(fit.t0)) / 86400000;
  return { date: d.toISOString().slice(0, 10), oilRate: q(t) };
});
const histDays = (new Date('2025-01-01') - new Date(fit.t0)) / 86400000; // 731

test('remaining = cum(history end + horizon) - cum(history end), not the curve from first production', () => {
  const r = forecastFromHistory(fit, { forecastDurationDays: 3650, economicLimit: 0, stopAtLimit: false }, data, 'oil');
  const exact = Np(histDays + 3650) - Np(histDays);
  expect(Math.abs(r.remaining - exact) / exact).toBeLessThan(0.002); // daily sum vs integral
  expect(r.remaining).toBeLessThan(Np(histDays + 3650) * 0.8);
  expect(r.rates[0].date.slice(0, 10)).toBe('2025-01-02');
  expect(r.timeToLimit).toBe(3650);
  expect(r.limitReached).toBe(false);
});

test('EUR = produced to date + remaining; produced from the rate history', () => {
  const r = forecastFromHistory(fit, { forecastDurationDays: 3650 }, data, 'oil');
  expect(Math.abs(r.produced - Np(histDays)) / Np(histDays)).toBeLessThan(0.01); // trapezoids on monthly samples
  expect(r.eurTotal).toBeCloseTo(r.produced + r.remaining, 6);
  expect(producedToDate([], 'oil')).toBe(0);
});

test('the economic limit is counted from the last history date', () => {
  const lim = 200; // q(t) = 200 at t = ((1000/200)^0.5 - 1)/(0.5*0.002) = 1236 days
  const r = forecastFromHistory(fit, { forecastDurationDays: 3650, economicLimit: lim, stopAtLimit: true }, data, 'oil');
  expect(r.limitReached).toBe(true);
  expect(Math.abs(r.timeToLimit - (1237 - histDays))).toBeLessThanOrEqual(1);
});
