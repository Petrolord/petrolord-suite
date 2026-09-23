// Monthly production CSV -> annual oil for the Probabilistic Breakeven
// Analyzer. Each row is one month at a daily oil rate (bopd); the month's
// volume is the rate times the average month length.
//
// The year is read from the date TEXT where the text says it: new Date() on
// an ISO date is midnight UTC, and getFullYear() reads the local year, so for
// anyone west of UTC "2025-01-01" landed in 2024 and a month's barrels moved
// to the wrong year.

export const DAYS_PER_MONTH = 30.44;

/** Calendar year of a date cell, or NaN. */
export function yearOf(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1900 && value <= 2200 ? value : NaN;
  }
  const s = String(value ?? '').trim();
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?/);        // 2025-01-01, 2025/01
  if (iso) return Number(iso[1]);
  const trailing = s.match(/^\d{1,2}[-/.]\d{1,2}[-/.](\d{4})$/);          // 01/15/2025, 15.01.2025
  if (trailing) return Number(trailing[1]);
  const d = new Date(s);                                                  // "Jan 2025" and the like
  return Number.isNaN(d.getTime()) ? NaN : d.getFullYear();
}

/**
 * @param {Object[]} rows parsed CSV rows
 * @returns {Array<{year: number, oil_production_bbl: number}>}
 * @throws when there is no date or oil rate column
 */
export function aggregateAnnualProduction(rows) {
  if (!rows?.length) throw new Error('CSV file is empty.');
  const keys = Object.keys(rows[0]);
  const dateKey = keys.find((k) => k.toLowerCase().includes('date'));
  const oilRateKey = keys.find((k) => k.toLowerCase().includes('oil_rate'));
  if (!dateKey || !oilRateKey) {
    throw new Error("CSV must contain 'date' and 'oil_rate_bpd' (or similar) columns.");
  }
  const annual = new Map();
  for (const row of rows) {
    const year = yearOf(row[dateKey]);
    const rate = parseFloat(row[oilRateKey]);
    if (Number.isNaN(year) || Number.isNaN(rate)) continue;
    annual.set(year, (annual.get(year) || 0) + rate * DAYS_PER_MONTH);
  }
  return [...annual.entries()].sort((a, b) => a[0] - b[0])
    .map(([year, oil]) => ({ year, oil_production_bbl: oil }));
}
