/**
 * W2 displacement extensions: tabular kr, endpoint scaling, the gravity/dip
 * fw term, polymer screening, PV/time conversion.
 *
 * Validation style follows the module rule (validation-first, hand-checkable
 * goldens): every fixture value is derived in a comment from the published
 * formula it implements. The gravity fractional-flow form is the field-unit
 * equation of Willhite ("Waterflooding", SPE Textbook Vol.3, eq. 3.4) as
 * reproduced in Ahmed ("Reservoir Engineering Handbook", Ch.14):
 *   fw = [1 - 0.001127*0.433*k*kro*A*(gw-go)*sin(a) / (muO*qt)]
 *        / [1 + (kro*muW)/(krw*muO)]
 */
import {
  analyzeFractionalFlow,
  analyzeDisplacement,
  buildCurves,
  coreyKr,
  daysToPv,
  makeFwFunction,
  makeKrFunction,
  pvToDays,
  sampleFractionalFlowData,
  scaleKrTable,
  validateKrTable,
  welgeTangent,
  welgeTangentGeneral,
} from '../fractionalFlowCalculations';

const SAMPLE = sampleFractionalFlowData(); // Swc=0.2 Sor=0.2 krwMax=0.4 kroMax=1 nw=no=2, muW=0.5, muO=5

describe('validateKrTable', () => {
  const good = [
    { Sw: 0.2, krw: 0, kro: 1 },
    { Sw: 0.5, krw: 0.2, kro: 0.4 },
    { Sw: 0.8, krw: 0.6, kro: 0 },
  ];

  it('accepts a physical table and sorts it', () => {
    const shuffled = [good[2], good[0], good[1]];
    const res = validateKrTable(shuffled);
    expect(res.ok).toBe(true);
    expect(res.table.map((r) => r.Sw)).toEqual([0.2, 0.5, 0.8]);
  });

  it('rejects fewer than 3 rows, out-of-range values, and non-monotone curves', () => {
    expect(validateKrTable(good.slice(0, 2)).ok).toBe(false);
    expect(validateKrTable([{ Sw: 0.2, krw: 0, kro: 1.2 }, ...good.slice(1)]).ok).toBe(false);
    expect(validateKrTable([
      { Sw: 0.2, krw: 0, kro: 1 },
      { Sw: 0.5, krw: 0.4, kro: 0.4 },
      { Sw: 0.8, krw: 0.2, kro: 0 }, // krw decreasing
    ]).ok).toBe(false);
    expect(validateKrTable([
      { Sw: 0.2, krw: 0, kro: 0.5 },
      { Sw: 0.5, krw: 0.2, kro: 0.8 }, // kro increasing
      { Sw: 0.8, krw: 0.6, kro: 0 },
    ]).ok).toBe(false);
  });

  it('requires immobile endpoints (krw=0 at Swc, kro=0 at 1-Sor)', () => {
    expect(validateKrTable([
      { Sw: 0.2, krw: 0.05, kro: 1 },
      { Sw: 0.5, krw: 0.2, kro: 0.4 },
      { Sw: 0.8, krw: 0.6, kro: 0 },
    ]).ok).toBe(false);
  });
});

describe('makeKrFunction (tabular)', () => {
  it('linear interpolation hand-check: midway between rows', () => {
    // Between (0.2, krw 0, kro 1) and (0.5, krw 0.2, kro 0.4) at Sw=0.35:
    // t = (0.35-0.2)/(0.5-0.2) = 0.5 -> krw = 0.1, kro = 0.7.
    const { kr } = makeKrFunction({
      type: 'table',
      rows: [
        { Sw: 0.2, krw: 0, kro: 1 },
        { Sw: 0.5, krw: 0.2, kro: 0.4 },
        { Sw: 0.8, krw: 0.6, kro: 0 },
      ],
    });
    const { krw, kro } = kr(0.35);
    expect(krw).toBeCloseTo(0.1, 10);
    expect(kro).toBeCloseTo(0.7, 10);
  });

  it('a Corey-sampled table reproduces the Corey analysis (self-consistency golden)', () => {
    const rows = buildCurves(SAMPLE.params, SAMPLE.muW, SAMPLE.muO, 100).map(({ Sw, krw, kro }) => ({ Sw, krw, kro }));
    const corey = analyzeFractionalFlow(SAMPLE.params, SAMPLE.muW, SAMPLE.muO);
    const table = analyzeDisplacement({ krSpec: { type: 'table', rows }, muW: SAMPLE.muW, muO: SAMPLE.muO });
    expect(table.M).toBeCloseTo(corey.M, 6);
    expect(table.bl.Swf).toBeCloseTo(corey.bl.Swf, 2);
    expect(table.bl.QiBt).toBeCloseTo(corey.bl.QiBt, 2);
    expect(table.bl.EDbt).toBeCloseTo(corey.bl.EDbt, 2);
  });

  it('throws on an invalid table', () => {
    expect(() => makeKrFunction({ type: 'table', rows: [] })).toThrow(/Invalid rel-perm table/);
  });
});

describe('scaleKrTable', () => {
  it('moves endpoints and rescales curve maxima', () => {
    const rows = buildCurves(SAMPLE.params, SAMPLE.muW, SAMPLE.muO, 50).map(({ Sw, krw, kro }) => ({ Sw, krw, kro }));
    const target = { Swc: 0.25, Sor: 0.3, krwMax: 0.3, kroMax: 0.8 };
    const scaled = scaleKrTable(rows, target);
    expect(scaled[0].Sw).toBeCloseTo(0.25, 10);
    expect(scaled[scaled.length - 1].Sw).toBeCloseTo(0.7, 10);
    expect(scaled[scaled.length - 1].krw).toBeCloseTo(0.3, 6);
    expect(scaled[0].kro).toBeCloseTo(0.8, 6);
    expect(scaled[0].krw).toBeCloseTo(0, 6);
    expect(scaled[scaled.length - 1].kro).toBeCloseTo(0, 6);
  });
});

describe('gravity/dip fractional flow', () => {
  // Hand-computed golden. k=500 md, A=50,000 ft2, qt=1000 rb/d, muO=5 cp,
  // gammaW=1.05, gammaO=0.85, dip=30 deg (updip displacement):
  //   coef = 0.001127*0.433 * 500 * 50000 * 0.20 * sin(30deg) / (5 * 1000)
  //        = 4.880e-4 * 500 * 50000 * 0.2 * 0.5 / 5000 = 0.24402
  // At Sw=0.5 with the sample Corey set: Swn=0.5, krw=0.1, kro=0.25.
  //   horizontal fw = 1 / (1 + 0.25*0.5/(0.1*5)) = 1/1.25 = 0.8
  //   with gravity  fw = (1 - 0.24402*0.25) / 1.25 = 0.938995/1.25 = 0.75120
  const gravity = { k_md: 500, A_ft2: 50000, qt_rbd: 1000, dipDeg: 30, gammaW: 1.05, gammaO: 0.85 };
  const spec = { krSpec: { type: 'corey', ...SAMPLE.params }, muW: SAMPLE.muW, muO: SAMPLE.muO };

  it('matches the hand-computed field-unit value', () => {
    const { krw, kro } = coreyKr(0.5, SAMPLE.params);
    expect(krw).toBeCloseTo(0.1, 10);
    expect(kro).toBeCloseTo(0.25, 10);
    const { fw } = makeFwFunction({ ...spec, gravity });
    expect(fw(0.5)).toBeCloseTo(0.751196, 4);
  });

  it('reduces to the horizontal fw at zero dip and increases fw downdip', () => {
    const { fw: fwFlat } = makeFwFunction({ ...spec, gravity: { ...gravity, dipDeg: 0 } });
    const { fw: fwUp } = makeFwFunction({ ...spec, gravity });
    const { fw: fwDown } = makeFwFunction({ ...spec, gravity: { ...gravity, dipDeg: -30 } });
    expect(fwFlat(0.5)).toBeCloseTo(0.8, 10);
    expect(fwUp(0.5)).toBeLessThan(0.8);
    expect(fwDown(0.5)).toBeGreaterThan(0.8);
  });

  it('gravity-assisted displacement raises breakthrough recovery (later, more efficient front)', () => {
    const flat = analyzeDisplacement(spec);
    const updip = analyzeDisplacement({ ...spec, gravity });
    expect(updip.bl.EDbt).toBeGreaterThan(flat.bl.EDbt);
    expect(updip.bl.QiBt).toBeGreaterThan(flat.bl.QiBt);
  });

  it('clamps fw to [0, 1] under a strong gravity assist', () => {
    const strong = { ...gravity, k_md: 5000, qt_rbd: 100 };
    const { fw } = makeFwFunction({ ...spec, gravity: strong });
    const curve = [];
    for (let Sw = 0.2; Sw <= 0.8; Sw += 0.05) curve.push(fw(Sw));
    expect(curve.every((f) => f >= 0 && f <= 1)).toBe(true);
  });
});

describe('polymer screening (viscosified water)', () => {
  const spec = { krSpec: { type: 'corey', ...SAMPLE.params }, muW: SAMPLE.muW, muO: SAMPLE.muO };

  it('multiplying muW by 4 divides the endpoint mobility ratio by 4 and shifts fw down', () => {
    const base = analyzeDisplacement(spec);
    const polymer = analyzeDisplacement({ ...spec, polymerMuMult: 4 });
    expect(polymer.M).toBeCloseTo(base.M / 4, 8);
    expect(polymer.muWeff).toBeCloseTo(SAMPLE.muW * 4, 10);
    const mid = (pts) => pts[Math.floor(pts.length / 2)];
    expect(mid(polymer.curves).fw).toBeLessThan(mid(base.curves).fw);
    expect(polymer.warnings.join(' ')).toMatch(/Polymer/);
  });

  it('improves breakthrough displacement efficiency', () => {
    const base = analyzeDisplacement(spec);
    const polymer = analyzeDisplacement({ ...spec, polymerMuMult: 4 });
    expect(polymer.bl.EDbt).toBeGreaterThan(base.bl.EDbt);
  });
});

describe('generalized Welge locks to the legacy Corey implementation', () => {
  it('welgeTangentGeneral(fw) reproduces welgeTangent(p) on the sample case', () => {
    const legacy = welgeTangent(SAMPLE.params, SAMPLE.muW, SAMPLE.muO);
    const { fw } = makeFwFunction({ krSpec: { type: 'corey', ...SAMPLE.params }, muW: SAMPLE.muW, muO: SAMPLE.muO });
    const general = welgeTangentGeneral(fw, SAMPLE.params.Swc, SAMPLE.params.Sor);
    expect(general.Swf).toBeCloseTo(legacy.Swf, 10);
    expect(general.QiBt).toBeCloseTo(legacy.QiBt, 10);
    expect(general.EDbt).toBeCloseTo(legacy.EDbt, 10);
    expect(general.EDmax).toBeCloseTo(legacy.EDmax, 10);
  });
});

describe('PV/time conversion', () => {
  it('round-trips and hand-checks: 0.5 PV of a 1,000,000 bbl PV at 500 bpd = 1000 days', () => {
    const basis = { pvBbl: 1_000_000, iw_bpd: 500 };
    expect(pvToDays(0.5, basis)).toBeCloseTo(1000, 10);
    expect(daysToPv(1000, basis)).toBeCloseTo(0.5, 10);
    expect(daysToPv(pvToDays(0.123, basis), basis)).toBeCloseTo(0.123, 10);
    expect(pvToDays(0.5, { pvBbl: 0, iw_bpd: 500 })).toBeNull();
  });
});
