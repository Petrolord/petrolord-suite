/**
 * DCA U2-004 (and the Dmin entry of U2-001): a typed decline on a stated
 * basis to the engine's nominal per day, through the registry's declineRate
 * family. Known values pinned:
 *   SPEE REP #6 Table 1 (tangent and secant effective against nominal, b 0 to 2),
 *   CED P03-004 p. 18 (48 %/yr and 8 %/yr effective to monthly nominal),
 *   the registry's year of 365.25 days.
 * Negative control: reading an effective decline as nominal (the label-only
 * conversion this module exists to prevent) misses every pin.
 */
import fs from 'fs';
import path from 'path';
import {
  nominalPerDayFromTyped, typedFromNominalPerDay, nominalFromSecant, secantFromNominal, describeTypedDecline,
  normaliseTerminalDecline, terminalDeclinePerDay,
} from '@/utils/declineCurve/declineInput';

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../packages/engines/test-data/dca/dca-literature-fixtures.json'), 'utf8'));
const rep6 = fixtures.cases.find((c) => c.id === 'spee-rep6-table1-effective-nominal').published_table;
const YEAR = 365.25;

describe('SPEE REP #6 Table 1, every row', () => {
  // Forward (nominal to effective) on all 37 rows to the printed precision;
  // the inverse (what a person types to what the engine takes) where the
  // printed figures can carry it (an effective decline near 100 percent
  // cannot be inverted from six printed figures).
  it.each(rep6.map((r) => [r.nominal_pct, r]))('nominal %d %%/yr', (nominalPct, row) => {
    const perDay = nominalPct / 100 / YEAR;
    expect(Math.abs(typedFromNominalPerDay(perDay, { unit: '%/yr', basis: 'effective-tangent' }) - Number(row.tangent_effective_pct))).toBeLessThan(1e-9);
    for (const [b, secant] of Object.entries(row.secant_effective_pct)) {
      expect(Math.abs(typedFromNominalPerDay(perDay, { unit: '%/yr', basis: 'effective-secant' }, Number(b)) - Number(secant))).toBeLessThan(6e-7);
    }
    if (nominalPct <= 100) {
      const tangent = nominalPerDayFromTyped({ value: Number(row.tangent_effective_pct), unit: '%/yr', basis: 'effective-tangent' });
      expect(Math.abs(tangent - perDay) / perDay).toBeLessThan(1e-9);
      for (const [b, secant] of Object.entries(row.secant_effective_pct)) {
        const got = nominalPerDayFromTyped({ value: Number(secant), unit: '%/yr', basis: 'effective-secant' }, Number(b));
        expect(Math.abs(got - perDay) / perDay).toBeLessThan(2e-5);
      }
    }
  });
});

describe('CED P03-004 p. 18', () => {
  it('48 %/yr effective is 0.0545 per month nominal; 8 %/yr effective is 0.006948 per month nominal', () => {
    const di = nominalPerDayFromTyped({ value: 48, unit: '%/yr', basis: 'effective-tangent' });
    expect(typedFromNominalPerDay(di, { unit: '1/month', basis: 'nominal' })).toBeCloseTo(0.0545, 4);
    const dm = nominalPerDayFromTyped({ value: 8, unit: '%/yr', basis: 'effective-tangent' });
    expect(typedFromNominalPerDay(dm, { unit: '1/month', basis: 'nominal' })).toBeCloseTo(-Math.log(1 - 0.006924), 6);
    // and the monthly effective of the printed example
    expect(typedFromNominalPerDay(dm, { unit: '1/month', basis: 'effective-tangent' })).toBeCloseTo(0.006924, 6);
  });
});

describe('the time basis goes through the registry', () => {
  it('nominal %/yr, 1/yr, 1/month and 1/d of one decline agree', () => {
    const d = 0.0012;
    expect(nominalPerDayFromTyped({ value: d * YEAR * 100, unit: '%/yr', basis: 'nominal' })).toBeCloseTo(d, 15);
    expect(nominalPerDayFromTyped({ value: d * YEAR, unit: '1/yr', basis: 'nominal' })).toBeCloseTo(d, 15);
    expect(nominalPerDayFromTyped({ value: d * YEAR / 12, unit: '1/month', basis: 'nominal' })).toBeCloseTo(d, 15);
    expect(nominalPerDayFromTyped({ value: d, unit: '1/d', basis: 'nominal' })).toBe(d);
    // 43.83 %/yr nominal is the sample well's 0.0012 per day (DCA-U1 basis)
    expect(typedFromNominalPerDay(0.0012, { unit: '%/yr', basis: 'nominal' })).toBeCloseTo(43.83, 2);
  });

  it('an effective decline is NOT linear in the period: 8 %/yr is not 8/12 % a month', () => {
    const perYear = nominalPerDayFromTyped({ value: 8, unit: '%/yr', basis: 'effective-tangent' });
    const perMonthLinear = nominalPerDayFromTyped({ value: 0.08 / 12, unit: '1/month', basis: 'effective-tangent' });
    expect(Math.abs(perYear - perMonthLinear) / perYear).toBeGreaterThan(0.03);
  });

  it('negative control: an effective value read as nominal misses the pin by its basis gap', () => {
    const asNominal = nominalPerDayFromTyped({ value: 48, unit: '%/yr', basis: 'nominal' });
    const right = nominalPerDayFromTyped({ value: 48, unit: '%/yr', basis: 'effective-tangent' });
    expect(Math.abs(asNominal - right) / right).toBeGreaterThan(0.25);
  });
});

describe('secant forms and limits', () => {
  it('b = 0 secant is the tangent form; round trips hold', () => {
    expect(nominalFromSecant(0.3, 0)).toBeCloseTo(-Math.log(0.7), 15);
    for (const b of [0.3, 1, 1.7]) expect(secantFromNominal(nominalFromSecant(0.42, b), b)).toBeCloseTo(0.42, 12);
    expect(Number.isNaN(nominalFromSecant(1, 0.5))).toBe(true);
    expect(Number.isNaN(nominalPerDayFromTyped({ value: -1, unit: '%/yr', basis: 'nominal' }))).toBe(true);
  });

  it('a terminal decline: blank or zero is none (no default); basis defaults to effective', () => {
    expect(normaliseTerminalDecline(null)).toBeNull();
    expect(normaliseTerminalDecline({ value: 0 })).toBeNull();
    expect(normaliseTerminalDecline({ value: 6 })).toEqual({ value: 6, unit: '%/yr', basis: 'effective-tangent' });
    expect(terminalDeclinePerDay({})).toBeNull();
    expect(terminalDeclinePerDay({ terminalDecline: { value: 6, unit: '%/yr', basis: 'nominal' } })).toBeCloseTo(0.06 / YEAR, 15);
    expect(describeTypedDecline({ value: 8, unit: '%/yr', basis: 'effective-tangent' })).toBe('8 %/yr effective (tangent, the exponential form), nominal 8.338 %/yr (0.0002283 per day)');
  });
});
