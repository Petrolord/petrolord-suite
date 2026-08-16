import { buildExampleCaseData } from '../epeExampleCase';

describe('buildExampleCaseData', () => {
  const data = buildExampleCaseData();

  it('returns case name and description', () => {
    expect(data.caseName).toBe('Example: Ilara Field 10-yr oil development');
    expect(typeof data.caseDescription).toBe('string');
    expect(data.caseDescription.length).toBeGreaterThan(0);
  });

  it('has 10 production rows', () => {
    expect(Array.isArray(data.production)).toBe(true);
    expect(data.production).toHaveLength(10);
  });

  it('every production row has a year and positive oil_bbl', () => {
    for (const row of data.production) {
      expect(Number.isInteger(row.year)).toBe(true);
      expect(typeof row.oil_bbl).toBe('number');
      expect(row.oil_bbl).toBeGreaterThan(0);
    }
  });

  it('capex rows all have positive cost_usd', () => {
    expect(data.capex.length).toBeGreaterThan(0);
    for (const row of data.capex) {
      expect(typeof row.cost_usd).toBe('number');
      expect(row.cost_usd).toBeGreaterThan(0);
    }
  });

  it('every opex row total equals fixed plus variable within 1 dollar', () => {
    expect(data.opex).toHaveLength(10);
    for (const row of data.opex) {
      expect(
        Math.abs(row.total_opex_usd - (row.fixed_opex_usd + row.variable_opex_usd))
      ).toBeLessThanOrEqual(1);
    }
  });

  it('years span 2027 through 2036', () => {
    const prodYears = data.production.map((r) => r.year);
    expect(Math.min(...prodYears)).toBe(2027);
    expect(Math.max(...prodYears)).toBe(2036);

    const opexYears = data.opex.map((r) => r.year);
    expect(Math.min(...opexYears)).toBe(2027);
    expect(Math.max(...opexYears)).toBe(2036);

    for (const row of data.capex) {
      expect(row.year).toBeGreaterThanOrEqual(2027);
      expect(row.year).toBeLessThanOrEqual(2036);
    }
  });
});
