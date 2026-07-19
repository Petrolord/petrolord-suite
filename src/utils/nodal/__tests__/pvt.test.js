import {
  buildFluidModel, pvtAt, bubblePointAt, waterFvf, waterViscosity, brineDensitySc,
  gasOilSurfaceTension, gasWaterSurfaceTension,
} from '../pvt';

const MODEL = buildFluidModel({
  api: 35, gasSg: 0.75, gor: 600, salinityPpm: 30000,
  correlations: { pb_rs_bo: 'standing', viscosity: 'beggs_robinson' },
});

describe('nodal PVT adapter', () => {
  test('model normalizes and derives oil specific gravity', () => {
    expect(MODEL.gammaO).toBeCloseTo(141.5 / 166.5, 12);
    expect(MODEL.warnings).toEqual([]);
  });

  test('Rs is clamped to produced GOR above the bubble point', () => {
    const pb = bubblePointAt(MODEL, 190);
    const above = pvtAt(MODEL, pb + 500, 190);
    expect(above.rs).toBeCloseTo(600, 6);
    const below = pvtAt(MODEL, pb * 0.5, 190);
    expect(below.rs).toBeLessThan(600);
    expect(below.rs).toBeGreaterThan(0);
  });

  test('properties are physically ordered across the bubble point', () => {
    const pb = bubblePointAt(MODEL, 190);
    const sat = pvtAt(MODEL, pb - 1, 190);
    const under = pvtAt(MODEL, pb + 1000, 190);
    // Undersaturated oil is denser and more viscous than at the bubble point.
    expect(under.bo).toBeLessThan(sat.bo * 1.0001);
    expect(under.muO).toBeGreaterThan(sat.muO);
    expect(under.rhoO).toBeGreaterThan(sat.rhoO * 0.999);
  });

  test('gas density follows the real-gas law', () => {
    const p = 2000;
    const t = 190;
    const pvt = pvtAt(MODEL, p, t);
    const expected = (28.97 / 10.732) * (p * 0.75) / (pvt.z * (t + 460));
    expect(pvt.rhoG).toBeCloseTo(expected, 9);
  });

  test('water properties are in physical bands', () => {
    expect(waterFvf(3000, 190)).toBeGreaterThan(1.0);
    expect(waterFvf(3000, 190)).toBeLessThan(1.1);
    const muw = waterViscosity(3000, 190, 30000);
    expect(muw).toBeGreaterThan(0.2);
    expect(muw).toBeLessThan(1.5);
    expect(brineDensitySc(0)).toBeCloseTo(62.368, 3);
    expect(brineDensitySc(100000)).toBeGreaterThan(62.368);
  });

  test('surface tensions decrease with pressure and stay floored', () => {
    expect(gasOilSurfaceTension(100, 100, 35)).toBeGreaterThan(gasOilSurfaceTension(3000, 100, 35));
    expect(gasOilSurfaceTension(20000, 100, 35)).toBeGreaterThanOrEqual(1);
    expect(gasWaterSurfaceTension(100, 100)).toBeGreaterThan(gasWaterSurfaceTension(5000, 100));
  });

  test('bubble point solve is consistent with Rs route', () => {
    const pb = bubblePointAt(MODEL, 190);
    expect(pb).toBeGreaterThan(1500);
    expect(pb).toBeLessThan(3500);
    const atPb = pvtAt(MODEL, pb, 190);
    expect(atPb.rs / 600).toBeCloseTo(1, 2);
  });
});
