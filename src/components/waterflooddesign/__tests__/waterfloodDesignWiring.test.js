// W3 wiring tests (docs/scope/WaterfloodDesignStudio-STATUS.md): the pure
// glue between the studio's form state and the golden-tested engines.
//  - buildDisplacementSpec: string form inputs -> engine displacement spec
//    (or a user-facing error), including the gravity and polymer gates.
//  - annualProfileFromSeries: the forecast series -> annual bbl aggregation
//    behind the NPV Scenario Builder CSV handoff (year, production_bbl).
jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { buildDisplacementSpec, buildPatternInputs, DEFAULT_DISPLACEMENT, DEFAULT_PATTERN } from '@/contexts/WaterfloodDesignContext';
import { annualProfileFromSeries } from '@/components/waterflooddesign/PatternResults';

describe('buildDisplacementSpec', () => {
  it('builds a Corey spec from the default form state', () => {
    const { spec, error } = buildDisplacementSpec(DEFAULT_DISPLACEMENT);
    expect(error).toBeNull();
    expect(spec).toEqual({
      krSpec: { type: 'corey', Swc: 0.2, Sor: 0.2, krwMax: 0.4, kroMax: 1.0, nw: 2, no: 2 },
      muW: 0.5,
      muO: 5.0,
    });
    expect(spec.gravity).toBeUndefined();
    expect(spec.polymerMuMult).toBeUndefined();
  });

  it('rejects non-positive viscosities', () => {
    const { spec, error } = buildDisplacementSpec({ ...DEFAULT_DISPLACEMENT, muW: '0' });
    expect(spec).toBeNull();
    expect(error).toMatch(/Viscosities must be positive/);
  });

  it('rejects Corey endpoints with no mobile saturation window (1 - Swc - Sor <= 0.01)', () => {
    const { spec, error } = buildDisplacementSpec({ ...DEFAULT_DISPLACEMENT, Swc: '0.5', Sor: '0.5' });
    expect(spec).toBeNull();
    expect(error).toMatch(/1 - Swc - Sor/);
  });

  it('surfaces the first table validation error for a bad kr table', () => {
    const { spec, error } = buildDisplacementSpec({ ...DEFAULT_DISPLACEMENT, krSource: 'table', krTable: [] });
    expect(spec).toBeNull();
    expect(error).toMatch(/at least 3 rows/);
  });

  it('passes a valid kr table through as a table spec', () => {
    const krTable = [
      { Sw: 0.2, krw: 0, kro: 1 },
      { Sw: 0.5, krw: 0.1, kro: 0.3 },
      { Sw: 0.8, krw: 0.4, kro: 0 },
    ];
    const { spec, error } = buildDisplacementSpec({ ...DEFAULT_DISPLACEMENT, krSource: 'table', krTable });
    expect(error).toBeNull();
    expect(spec.krSpec).toEqual({ type: 'table', rows: krTable });
  });

  it('attaches the gravity block only when every field is numeric and qt > 0', () => {
    const on = buildDisplacementSpec({ ...DEFAULT_DISPLACEMENT, gravityOn: true, dipDeg: '10' });
    expect(on.error).toBeNull();
    expect(on.spec.gravity).toEqual({ k_md: 500, A_ft2: 50000, qt_rbd: 1000, dipDeg: 10, gammaW: 1.05, gammaO: 0.85 });

    const bad = buildDisplacementSpec({ ...DEFAULT_DISPLACEMENT, gravityOn: true, k_md: 'abc' });
    expect(bad.spec).toBeNull();
    expect(bad.error).toMatch(/Gravity term/);
  });

  it('attaches the polymer multiplier only when positive', () => {
    const on = buildDisplacementSpec({ ...DEFAULT_DISPLACEMENT, polymerOn: true, polymerMuMult: '4' });
    expect(on.error).toBeNull();
    expect(on.spec.polymerMuMult).toBe(4);

    const bad = buildDisplacementSpec({ ...DEFAULT_DISPLACEMENT, polymerOn: true, polymerMuMult: '0' });
    expect(bad.spec).toBeNull();
    expect(bad.error).toMatch(/Polymer viscosity multiplier/);
  });
});

describe('buildPatternInputs', () => {
  // W4 shares this builder between the deterministic Pattern tab memo and
  // the Monte Carlo base case, so its gates are load-bearing twice.
  it('parses the default pattern form into numbers with defaults applied', () => {
    const p = buildPatternInputs(DEFAULT_PATTERN);
    expect(p).not.toBeNull();
    expect(p.area_acres).toBeGreaterThan(0);
    expect(p.Sgi).toBe(0);
    expect(p.EV).toBe(1);
    expect(p.worLimit).toBe(25);
    expect(p.maxYears).toBe(30);
  });

  it('returns null when any required positive input is missing or non-positive', () => {
    expect(buildPatternInputs({ ...DEFAULT_PATTERN, h_ft: '0' })).toBeNull();
    expect(buildPatternInputs({ ...DEFAULT_PATTERN, Bo: 'abc' })).toBeNull();
    expect(buildPatternInputs({ ...DEFAULT_PATTERN, iw_bpd: '-100' })).toBeNull();
  });
});

describe('annualProfileFromSeries', () => {
  it('integrates rate x dt into calendar-year bins', () => {
    // Hand arithmetic:
    //   p0 t=100 d, qo=500 stb/d, dt=100  -> 50,000 bbl, year floor(99.99/365.25)=0
    //   p1 t=300 d, qo=400 stb/d, dt=200  -> 80,000 bbl, year 0
    //   p2 t=400 d, qo=300 stb/d, dt=100  -> 30,000 bbl, year floor(399.99/365.25)=1
    const annual = annualProfileFromSeries([
      { t_days: 100, qo_stbd: 500 },
      { t_days: 300, qo_stbd: 400 },
      { t_days: 400, qo_stbd: 300 },
    ]);
    expect(annual).toHaveLength(2);
    expect(annual[0]).toBeCloseTo(130000, 6);
    expect(annual[1]).toBeCloseTo(30000, 6);
  });

  it('bins a point landing exactly on a year boundary into the year it closes', () => {
    // t = 365.25 d: floor((365.25 - 0.01)/365.25) = 0 -> the volume belongs to year 1.
    const annual = annualProfileFromSeries([{ t_days: 365.25, qo_stbd: 100 }]);
    expect(annual).toHaveLength(1);
    expect(annual[0]).toBeCloseTo(36525, 6);
  });

  it('zero-fills skipped years so the CSV rows stay consecutive', () => {
    // p0 t=100 d (year 0) -> 10,000 bbl; p1 t=800 d, dt=700, year floor(799.99/365.25)=2 -> 7,000 bbl.
    const annual = annualProfileFromSeries([
      { t_days: 100, qo_stbd: 100 },
      { t_days: 800, qo_stbd: 10 },
    ]);
    expect(annual).toEqual([10000, 0, 7000]);
  });
});
