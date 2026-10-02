/**
 * FLUID-U1 (Reservoir round, app 1): what the black-oil engine used travels
 * with its result. The method name of every property comes from the same
 * record the calculation called, the bubble point says how it was reached,
 * an entered bubble point is honoured by the table, and every input outside
 * a published range is flagged. Each gate calls the engine; the negative
 * controls re-break the defect in the test.
 */
import {
  analyzeFluidSystem, sampleFluidStudioData, normalizeFluid, computePvtRow, computePvtTable,
  PB_RS_BO_METHODS, OIL_VISCOSITY_METHODS, pbRsBoMethod, rsAt, boAt, muObAt, muOdAt,
  solveBubblePointDetail, solveBubblePoint, enteredBubblePoint, blackOilMethods, blackOilRangeFlags,
  publishedRange, bwAt, muWaterAt, zFactor, Z_CLAMP,
} from '../fluidStudioCalculations';
import { pvtCalcs } from '../pvtCalculations';
import { mccainBw, mccainMuW } from '../../../packages/engines/engines/fluid/blackOil';

const withInputs = (patch = {}, corr = {}) => {
  const i = sampleFluidStudioData();
  i.streamA.blackOil = { ...i.streamA.blackOil, ...patch };
  i.correlations = { ...i.correlations, ...corr };
  return i;
};
const method = (res, key) => res.meta.methods.find((m) => m.key === key);

describe('the method named is the method called', () => {
  const primitives = {
    standing: [pvtCalcs.standing_rs, pvtCalcs.standing_bo],
    vasquez_beggs: [pvtCalcs.vasquez_beggs_rs, pvtCalcs.vasquez_beggs_bo],
    glaso: [pvtCalcs.glaso_rs, pvtCalcs.glaso_bo],
  };
  test.each(Object.keys(PB_RS_BO_METHODS))('%s: Rs and Bo of the table are the named correlation, to the digit', (key) => {
    const res = analyzeFluidSystem(withInputs({}, { pb_rs_bo: key }));
    const f = res.meta.fluid;
    const [rsFn, boFn] = primitives[key];
    const row = res.pvt.table.find((r) => r.phase === 'saturated' && r.pressure < res.pvt.pb * 0.6);
    const rs = Math.min(rsFn(row.pressure, f.api, f.gasGravity, f.temp), f.rsb);
    // the table rounds the pressure for display; the row is recomputed at that pressure
    const again = computePvtRow(row.pressure, f, res.pvt.pb);
    expect(again.Rs).toBe(Number(rs.toFixed(2)));
    expect(again.Bo).toBe(Number(boFn(rs, f.api, f.gasGravity, f.temp).toFixed(4)));
    expect(method(res, 'rs').method).toBe(PB_RS_BO_METHODS[key].label);
    expect(method(res, 'bo').method).toBe(PB_RS_BO_METHODS[key].label);
    expect(method(res, 'pb').method).toBe(`${PB_RS_BO_METHODS[key].label} Rs(p) solved for the solution GOR`);
  });

  test('the three correlations give three different tables, so a wrong name would be a wrong number', () => {
    const at = (key) => rsAt(1500, normalizeFluid(withInputs({}, { pb_rs_bo: key })));
    const values = Object.keys(PB_RS_BO_METHODS).map(at);
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBe(3);
  });

  test('an unknown correlation key runs Standing and is named Standing', () => {
    const res = analyzeFluidSystem(withInputs({}, { pb_rs_bo: 'lasater' }));
    const f = res.meta.fluid;
    expect(pbRsBoMethod(f)).toBe(PB_RS_BO_METHODS.standing);
    expect(method(res, 'rs').method).toBe('Standing');
    expect(rsAt(1500, f)).toBe(pvtCalcs.standing_rs(1500, f.api, f.gasGravity, f.temp));
  });

  test.each(Object.keys(OIL_VISCOSITY_METHODS))('%s: live and dead oil viscosity carry the name of the function called', (key) => {
    const res = analyzeFluidSystem(withInputs({}, { viscosity: key }));
    const f = res.meta.fluid;
    const live = key === 'beggs_robinson'
      ? pvtCalcs.beggs_robinson_viscosity(f.api, f.temp, true, f.rsb)
      : pvtCalcs.beal_cook_spillman_viscosity(f.api, f.temp, true, null, f.rsb);
    const dead = key === 'beggs_robinson'
      ? pvtCalcs.beggs_robinson_viscosity(f.api, f.temp, false)
      : pvtCalcs.beal_cook_spillman_viscosity(f.api, f.temp, false);
    expect(muObAt(f.rsb, f)).toBe(live);
    expect(muOdAt(f)).toBe(dead);
    expect(res.pvt.kpis.mu_o_at_pb).toBe(Number(live.toFixed(4)));
    expect(res.pvt.kpis.mu_od).toBe(Number(dead.toFixed(4)));
    expect(method(res, 'mu_o').method).toBe(OIL_VISCOSITY_METHODS[key].label);
    expect(method(res, 'mu_od').method).toBe(OIL_VISCOSITY_METHODS[key].label);
  });

  test('every property of the table has a method, and the list is the contract list', () => {
    const res = analyzeFluidSystem(sampleFluidStudioData());
    expect(res.meta.methods.map((m) => m.key)).toEqual([
      'pb', 'rs', 'bo', 'co', 'mu_od', 'mu_o', 'mu_o_undersaturated', 'z', 'mu_g', 'bg', 'bw', 'mu_w',
    ]);
    for (const m of res.meta.methods) expect(m.method).toBeTruthy();
    expect(blackOilMethods(res.meta.fluid, { route: 'solved' })).toEqual(res.meta.methods);
  });
});

describe('the bubble point says how it was reached', () => {
  test('solved from the solution GOR', () => {
    const res = analyzeFluidSystem(sampleFluidStudioData());
    expect(res.meta.pbSource).toBe('solved');
    expect(res.meta.fluid.rsScale).toBe(1);
    expect(solveBubblePoint(normalizeFluid(sampleFluidStudioData()))).toBe(res.pvt.pb);
  });

  test('the silent Standing fallback is named when the chosen correlation cannot reach the GOR', () => {
    // a heavy oil with a very high GOR: Vasquez-Beggs Rs stays below it to 15,000 psia
    const inputs = withInputs({ api: 12, gor: 6000, gasSg: 0.6, temp: 300 }, { pb_rs_bo: 'vasquez_beggs' });
    const f = normalizeFluid(inputs);
    expect(rsAt(15000, f)).toBeLessThan(f.rsb);
    expect(solveBubblePointDetail(f).route).toBe('standing-explicit');
    const res = analyzeFluidSystem(inputs);
    expect(res.meta.pbSource).toBe('standing-explicit');
    expect(method(res, 'pb').method).toBe('Standing explicit bubble point');
    expect(method(res, 'pb').note).toMatch(/Vasquez-Beggs Rs could not reach the solution GOR/);
    // Rs and Bo are still Vasquez-Beggs and say so
    expect(method(res, 'rs').method).toBe('Vasquez-Beggs');
  });

  test('a bubble point that is zero, negative or blank is solved, never used', () => {
    for (const pb of [0, -50, '', null, undefined]) {
      const res = analyzeFluidSystem(withInputs({ pb }));
      expect(res.meta.pbSource).toBe('solved');
      expect(res.pvt.kpis.pb).toBe(2998);
    }
  });
});

describe('an entered bubble point is honoured by the table (FLUID-U1-005)', () => {
  test.each([2000, 4000])('Pb entered as %i psia: Rs, Bo and viscosity are continuous there and equal the headline values', (pb) => {
    const res = analyzeFluidSystem(withInputs({ pb }));
    expect(res.meta.pbSource).toBe('entered');
    const at = res.pvt.table.find((r) => r.pressure === pb);
    expect(at.phase).toBe('saturated');
    expect(at.Rs).toBe(650);
    expect(at.Bo).toBe(res.pvt.kpis.bo_at_pb);
    expect(at.mu_o).toBe(res.pvt.kpis.mu_o_at_pb);
    // just below: within the step the correlation makes over a few psi, no jump
    const f = res.meta.fluid;
    const below = computePvtRow(pb - 1, f, pb);
    expect(Math.abs(below.Rs - 650) / 650).toBeLessThan(0.002);
    expect(Math.abs(below.Bo - at.Bo)).toBeLessThan(0.001);
    // Rs falls monotonically below the bubble point
    const sat = res.pvt.table.filter((r) => r.phase === 'saturated');
    for (let i = 1; i < sat.length; i += 1) expect(sat[i].Rs).toBeLessThanOrEqual(sat[i - 1].Rs);
    // the scale and the correlation's own bubble point are reported
    expect(res.meta.pbDetail.rsScale).toBeCloseTo(650 / rsAt(pb, { ...f, rsScale: 1 }), 12);
    expect(Math.round(res.meta.pbDetail.correlationPb)).toBe(2998);
    expect(method(res, 'pb').note).toMatch(/Standing alone puts the bubble point at 2998 psia/);
    expect(method(res, 'rs').method).toBe('Standing, scaled to the entered bubble point');
    expect(res.meta.warnings.join(' ')).toMatch(/multiplied by \d\.\d{3} below the entered bubble point/);
  });

  test('negative control: without the scale the table jumps by more than a third at 2,000 psia', () => {
    const f = { ...normalizeFluid(withInputs({ pb: 2000 })), rsScale: 1 };
    const at = computePvtRow(2000, f, 2000);
    expect(at.Rs).toBeLessThan(650 * 0.65);
    expect(boAt(f.rsb, f) - at.Bo).toBeGreaterThan(0.1);
  });

  test('entering the solved bubble point changes nothing', () => {
    const solved = analyzeFluidSystem(sampleFluidStudioData());
    const f = solved.meta.fluid;
    const typed = enteredBubblePoint({ ...f, pb: solved.pvt.pb });
    expect(typed.rsScale).toBeCloseTo(1, 3);
    // other callers of the table (no rsScale on the fluid) are untouched
    const { rsScale: _omit, ...plain } = f;
    expect(computePvtTable(plain).table).toEqual(solved.pvt.table);
  });
});

describe('inputs outside a published range are flagged, each once, with the properties they reach', () => {
  test('the sample: only the 14.7 psia row leaves a pressure range', () => {
    const res = analyzeFluidSystem(sampleFluidStudioData());
    expect(res.meta.rangeFlags.filter((f) => f.scope === 'input')).toEqual([]);
    const table = res.meta.rangeFlags.filter((f) => f.scope === 'table');
    expect(table.map((f) => f.method)).toEqual(['Standing', 'Lee-Gonzalez-Eakin']);
    expect(table[0].properties).toEqual(['Solution GOR Rs', 'Oil formation volume factor Bo']);
    expect(table[0].text).toBe('Standing: 1 table row (15 psia) outside its published pressure range (130 to 7000 psia).');
  });

  test('a GOR outside Standing is one flag that names Pb, Rs and Bo', () => {
    const res = analyzeFluidSystem(withInputs({ gor: 2000 }));
    const flag = res.meta.rangeFlags.find((f) => f.id === 'standing:rs');
    expect(flag).toMatchObject({ scope: 'input', value: 2000, low: 20, high: 1425, unit: 'scf/STB', family: 'gor' });
    expect(flag.properties).toEqual(['Bubble point pressure', 'Solution GOR Rs', 'Oil formation volume factor Bo']);
    // and the bubble point it produces is itself outside Standing's pressures
    expect(res.meta.rangeFlags.find((f) => f.id === 'standing:pressure:pb').text).toMatch(/the bubble point \d+ psia is outside/);
  });

  test('each fixed correlation flags its own inputs', () => {
    const hot = analyzeFluidSystem(withInputs({ temp: 360, gasSg: 1.1, api: 12 }));
    const ids = hot.meta.rangeFlags.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining([
      'beggs_robinson:api', 'beggs_robinson:temp', 'vasquez_beggs_co:temp', 'lee_gonzalez_eakin:temp',
      'lee_gonzalez_eakin:gasGravity', 'mccain_bw:temp',
    ]));
    // negative control: the same engine on the sample raises none of them
    const ok = analyzeFluidSystem(sampleFluidStudioData()).meta.rangeFlags.map((f) => f.id);
    for (const id of ['beggs_robinson:api', 'lee_gonzalez_eakin:temp', 'mccain_bw:temp']) expect(ok).not.toContain(id);
  });

  test('a Z held on the engine limit is flagged', () => {
    const res = analyzeFluidSystem(withInputs({ gasSg: 1.6, temp: 80 }));
    const onLimit = res.pvt.table.filter((r) => r.Z <= Z_CLAMP[0] || r.Z >= Z_CLAMP[1]).length;
    expect(onLimit).toBeGreaterThan(0);
    expect(res.meta.rangeFlags.find((f) => f.id === 'papay:z').rows).toBe(onLimit);
    expect(zFactor(3000, 80, 1.6)).toBeGreaterThanOrEqual(Z_CLAMP[0]);
  });

  test('every method with a range key has a published range record', () => {
    const res = analyzeFluidSystem(withInputs({}, { viscosity: 'beal_cook_spillman', pb_rs_bo: 'glaso' }));
    for (const m of res.meta.methods) {
      if (m.kind === 'correlation') expect(publishedRange(m.rangeKey)).toBeTruthy();
    }
    expect(blackOilRangeFlags(res.meta.fluid, res.meta.methods, res.pvt.table)).toEqual(res.meta.rangeFlags);
  });
});

describe('water properties come from the canonical engine', () => {
  test('Bw and water viscosity of the table are the engine functions at the row conditions', () => {
    const res = analyzeFluidSystem(sampleFluidStudioData());
    for (const shown of res.pvt.table.filter((_, i) => i % 7 === 0)) {
      // the table rounds the pressure for display; recompute the row at that pressure
      const r = computePvtRow(shown.pressure, res.meta.fluid, res.pvt.pb);
      expect(r.Bw).toBe(Number(mccainBw(r.pressure, 200).toFixed(4)));
      expect(r.mu_w).toBe(Number(mccainMuW(r.pressure, 200, 35000).toFixed(4)));
      expect(Math.abs(shown.mu_w - r.mu_w)).toBeLessThan(2e-4);
    }
    expect(res.pvt.kpis.bw_at_pb).toBe(Number(bwAt(res.pvt.pb, 200).toFixed(4)));
  });

  test('McCain Bw from a second transcription of the published coefficients', () => {
    // McCain (1990): Bw = (1 + dVwp)(1 + dVwT), T in degF, p in psia
    const T = 165; const p = 3176;
    const dVwT = -1.0001e-2 + 1.33391e-4 * T + 5.50654e-7 * T * T;
    const dVwp = -1.95301e-9 * p * T - 1.72834e-13 * p * p * T - 3.58922e-7 * p - 2.25341e-10 * p * p;
    expect(bwAt(p, T)).toBeCloseTo((1 + dVwp) * (1 + dVwT), 12);
    expect(bwAt(p, T)).toBeCloseTo(1.0221, 3);
    // negative control: the quotient form some summaries print is a different number
    expect(Math.abs((1 + dVwT) / (1 + dVwp) - bwAt(p, T))).toBeGreaterThan(0.005);
  });

  test('salinity moves the water viscosity and leaves Bw alone, as the method note says', () => {
    const fresh = analyzeFluidSystem(withInputs({ salinity: 0 }));
    const brine = analyzeFluidSystem(withInputs({ salinity: 150000 }));
    expect(brine.pvt.kpis.mu_w_at_pb).toBeGreaterThan(fresh.pvt.kpis.mu_w_at_pb);
    expect(brine.pvt.kpis.bw_at_pb).toBe(fresh.pvt.kpis.bw_at_pb);
    expect(method(brine, 'bw').note).toMatch(/salinity is not applied to Bw/);
    expect(muWaterAt(3000, 200, null)).toBe(mccainMuW(3000, 200, 0));
  });
});
