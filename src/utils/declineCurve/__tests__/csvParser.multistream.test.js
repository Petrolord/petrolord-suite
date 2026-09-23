// Multi-stream CSV mapping regression tests.
//
// Bug this pins down: the parser used to map a single `rate` column via one
// alias list ('rate','oil','gas','water',...), so a CSV carrying oil, gas
// and water columns collapsed to one stream, and the fit path fell back to
// oil data for the gas and water tabs ("all three curves look identical").
import {
  detectColumns,
  mapColumns,
  validateData,
  getStreamRate,
} from '../csvParser';

const MULTI_HEADERS = ['Date', 'Oil Rate (bbl/d)', 'Gas Rate (Mscf/d)', 'Water Rate (bbl/d)'];
const MULTI_ROWS = [
  { 'Date': '2025-01-01', 'Oil Rate (bbl/d)': 1000, 'Gas Rate (Mscf/d)': 5000, 'Water Rate (bbl/d)': 50 },
  { 'Date': '2025-02-01', 'Oil Rate (bbl/d)': 900, 'Gas Rate (Mscf/d)': 4600, 'Water Rate (bbl/d)': 80 },
  { 'Date': '2025-03-01', 'Oil Rate (bbl/d)': 810, 'Gas Rate (Mscf/d)': 4200, 'Water Rate (bbl/d)': 120 },
];

describe('detectColumns (multi-stream)', () => {
  it('maps oil, gas and water rate columns independently', () => {
    const mapping = detectColumns(MULTI_HEADERS);
    expect(mapping.date).toBe('Date');
    expect(mapping.oilRate).toBe('Oil Rate (bbl/d)');
    expect(mapping.gasRate).toBe('Gas Rate (Mscf/d)');
    expect(mapping.waterRate).toBe('Water Rate (bbl/d)');
  });

  it('never claims the same header for two fields', () => {
    const mapping = detectColumns(MULTI_HEADERS);
    const assigned = Object.values(mapping).filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('still maps a legacy single generic rate column', () => {
    const mapping = detectColumns(['Date', 'Rate']);
    expect(mapping.rate).toBe('Rate');
    expect(mapping.oilRate).toBeNull();
    expect(mapping.gasRate).toBeNull();
    expect(mapping.waterRate).toBeNull();
  });

  it('maps a bwpd water column to waterRate, not cum (wp is a substring of bwpd)', () => {
    const mapping = detectColumns(['date', 'oil_rate (bopd)', 'gas_rate (Mscf/d)', 'water_rate (bwpd)']);
    expect(mapping.waterRate).toBe('water_rate (bwpd)');
    expect(mapping.cum).toBeNull();
  });

  it('still maps a genuine cumulative column alongside stream rates', () => {
    const mapping = detectColumns(['Date', 'Oil Rate (bopd)', 'Cum Oil (stb)']);
    expect(mapping.oilRate).toBe('Oil Rate (bopd)');
    expect(mapping.cum).toBe('Cum Oil (stb)');
  });
});

describe('mapColumns (multi-stream)', () => {
  const mapping = detectColumns(MULTI_HEADERS);
  const mapped = mapColumns(MULTI_ROWS, mapping);

  it('carries each stream separately with oil as the primary rate', () => {
    expect(mapped[0].rate).toBe(1000);
    expect(mapped[0].oilRate).toBe(1000);
    expect(mapped[0].gasRate).toBe(5000);
    expect(mapped[0].waterRate).toBe(50);
  });

  it('keeps the streams distinct across rows', () => {
    const gas = mapped.map((r) => r.gasRate);
    const water = mapped.map((r) => r.waterRate);
    const oil = mapped.map((r) => r.oilRate);
    expect(gas).toEqual([5000, 4600, 4200]);
    expect(water).toEqual([50, 80, 120]);
    expect(oil).not.toEqual(gas);
    expect(oil).not.toEqual(water);
  });

  it('uses the single stream as primary rate for a gas-only CSV', () => {
    const gasMapping = detectColumns(['Date', 'Gas Rate (Mscf/d)']);
    const rows = mapColumns(
      [{ 'Date': '2025-01-01', 'Gas Rate (Mscf/d)': 5000 }],
      gasMapping,
    );
    expect(rows[0].rate).toBe(5000);
    expect(rows[0].gasRate).toBe(5000);
    expect(rows[0].oilRate).toBeNull();
  });

  it('passes validation for multi-stream rows', () => {
    const validation = validateData(mapped);
    expect(validation.valid).toBe(true);
    expect(validation.validCount).toBe(3);
  });
});

describe('getStreamRate', () => {
  const point = { rate: 1000, oilRate: 1000, gasRate: 5000, waterRate: 50 };

  it('returns the requested stream', () => {
    expect(getStreamRate(point, 'oil')).toBe(1000);
    expect(getStreamRate(point, 'gas')).toBe(5000);
    expect(getStreamRate(point, 'water')).toBe(50);
  });

  it('returns null for gas/water when the stream is absent, never oil data', () => {
    const oilOnly = { rate: 1000 };
    expect(getStreamRate(oilOnly, 'gas')).toBeNull();
    expect(getStreamRate(oilOnly, 'water')).toBeNull();
  });

  it('falls back to the legacy primary rate for oil on old saved projects', () => {
    expect(getStreamRate({ rate: 1000 }, 'oil')).toBe(1000);
  });
});

describe('header matching: short aliases are whole words, and one well per file', () => {
  // Found by the Ekene demo kit import check (2026-09-23): the cumulative
  // alias 'np' matched inside 'injection_rate_bwpd', and a six-well file
  // was loaded into the one selected well.
  const { headerMatches } = require('../csvParser');

  it('an injection column is not read as cumulative oil', () => {
    const mapping = detectColumns(['well', 'date', 'oil_rate_bopd', 'water_rate_bwpd', 'gas_rate_mscfd', 'injection_rate_bwpd']);
    expect(mapping.cum).toBeNull();
    expect(mapping.oilRate).toBe('oil_rate_bopd');
    expect(mapping.waterRate).toBe('water_rate_bwpd');
    expect(mapping.gasRate).toBe('gas_rate_mscfd');
  });

  it('short aliases still match as words, long ones anywhere', () => {
    expect(headerMatches('Np (stb)', 'np')).toBe(true);
    expect(headerMatches('Cum_Oil', 'cum')).toBe(true);
    expect(headerMatches('OilRate', 'oil')).toBe(true);
    expect(headerMatches('injection_rate_bwpd', 'np')).toBe(false);
    expect(headerMatches('capital', 'api')).toBe(false);
    expect(headerMatches('API number', 'api')).toBe(true);
    expect(headerMatches('oil_bopd_daily', 'bopd')).toBe(true);
    expect(headerMatches('Oil Rate (bbl/d)', 'oil rate')).toBe(true);
    expect(headerMatches('oil_rate', 'oil rate')).toBe(true);
    expect(headerMatches('rate of oil', 'oil rate')).toBe(false);
  });

  it('a file with several wells is refused with the reason first', () => {
    const rows = [
      { well: 'Ekene-1', date: '2020-01-01', oilRate: 100, rate: 100 },
      { well: 'Ekene-3', date: '2020-01-01', oilRate: 90, rate: 90 },
    ];
    const v = validateData(rows);
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/holds 2 wells \(Ekene-1, Ekene-3\)/);
  });

  it('one named well, or no well column, imports as before', () => {
    expect(validateData([{ well: 'Ekene-1', date: '2020-01-01', rate: 1 }, { well: 'Ekene-1', date: '2020-02-01', rate: 1 }]).valid).toBe(true);
    expect(validateData([{ well: 'Unknown Well', date: '2020-01-01', rate: 1 }]).valid).toBe(true);
  });
});
