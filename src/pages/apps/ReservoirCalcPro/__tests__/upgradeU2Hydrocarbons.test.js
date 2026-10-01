// ReservoirCalc Pro upgrade U2-007: solution gas (Rs), vaporised oil (Rv)
// and Sw from saturation height. The saturation-height gate integrates the
// shipped Petrophysics chain (swAtHeight) independently and compares.

import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import { solutionGasFrom, swHeightTable, weightedSw } from '../services/hydrocarbons';
import { checkAreaDepthRows, areaDepthHypsometry } from '../services/areaDepth';
import { convertInputsOnSystemChange } from '../services/unitsCatalog';
import { SCAL_SAMPLE } from '../services/rcpBackend';
import { shmFromScalProject, swAtHeight } from '@/pages/apps/PetrophysicsStudio/services/saturationHeight';

jest.setTimeout(120000);

const shm = shmFromScalProject(SCAL_SAMPLE);
const base = { ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.25, bg: 0.005, recovery: 30, recoveryGas: 70 };
// a slab: constant area 1000 acres from -6000 ft, 400 ft gross
const slabRows = [{ depth: -6000, areaTop: 1000, areaBase: null }, { depth: -7000, areaTop: 1000, areaBase: null }];
// a cone, area pi (10 d)^2 ft^2 in acres, crest -6000 ft
const coneRows = Array.from({ length: 61 }, (_, k) => ({ depth: -6000 - 10 * k, areaTop: (Math.PI * (10 * 10 * k) ** 2) / 43560, areaBase: null }));

/** Direct integral of SCAL Sw over the column, weighted by w(depth below crest). */
const direct = (crest, owc, fwl, w, n = 4000) => {
  let sw = 0; let sv = 0;
  for (let i = 0; i < n; i++) {
    const z = crest - ((i + 0.5) / n) * (crest - owc); // elevation
    const d = crest - z;
    const h = z - fwl;
    const s = swAtHeight(shm.jSpec, shm.reservoir, shm.fluids, h);
    sw += w(d) * s; sv += w(d);
  }
  return sw / sv;
};

describe('U2-007 solution gas and vaporised oil', () => {
  it('solution gas = STOIIP x Rs, recoverable at the oil RF', () => {
    expect(solutionGasFrom(100e6, 500, 30e6)).toEqual({ inPlace: 5e10, recoverable: 1.5e10, rs: 500 });
    expect(solutionGasFrom(100e6, null, 30e6).inPlace).toBeNull();
    const r = VolumeCalculationEngine.calculateDeterministic({ ...base, fluidType: 'oil', area: 1000, thickness: 50, rs: 600 }, 'field', 'simple');
    expect(r.solutionGas).toBeCloseTo(r.stooip * 600, 3);
    expect(r.recoverableSolutionGas).toBeCloseTo(r.recoverableOil * 600, 3);
    expect(r.totalGasInPlace).toBeCloseTo(r.giip + r.solutionGas, 3);
  });

  it('a gas reservoir has no solution gas; oil with a gas cap reports its vaporised oil (Rv)', () => {
    const g = VolumeCalculationEngine.calculateDeterministic({ ...base, fluidType: 'gas', area: 1000, thickness: 50, rs: 600, cgr: 20 }, 'field', 'simple');
    expect(g.solutionGas).toBeNull();
    expect(g.condensateKind).toBe('condensate');
    const og = VolumeCalculationEngine.calculateDeterministic({ ...base, fluidType: 'oil_gas', gasCapFraction: 0.3, area: 1000, thickness: 50, rs: 600, cgr: 20 }, 'field', 'simple');
    expect(og.condensateKind).toBe('vaporised oil');
    expect(og.condensate).toBeCloseTo((og.giip / 1e6) * 20, 3);
    expect(og.totalOilInPlace).toBeCloseTo(og.stooip + og.condensate, 3);
  });

  it('Rs converts with the unit system (scf/STB to sm3/sm3) and the solution gas is one quantity', () => {
    const field = { ...base, fluidType: 'oil', area: 1000, thickness: 50, rs: 600 };
    const metric = convertInputsOnSystemChange(field, 'field', 'metric');
    expect(metric.rs).toBeCloseTo(600 * 0.0283168 / 0.158987, 6);
    const rf = VolumeCalculationEngine.calculateDeterministic(field, 'field', 'simple');
    const rm = VolumeCalculationEngine.calculateDeterministic(metric, 'metric', 'simple');
    expect(Math.abs((rm.solutionGas * 35.3147) / rf.solutionGas - 1)).toBeLessThan(1e-3);
  });
});

describe('U2-007 Sw from saturation height (SCAL chain)', () => {
  const fwl = -6758.53; // the sample project's FWL, ft TVDSS
  it('a slab: the column Sw equals the direct height average of the SCAL chain (0.5 percent)', () => {
    const h = areaDepthHypsometry(checkAreaDepthRows(slabRows).rows, { unitSystem: 'field', thickness: 1000 });
    const t = swHeightTable(shm, 6000 - 6758.53 + 2000);
    const sw = weightedSw(h, t.at, { fwlElev: fwl, baseElev: -6700, isField: true });
    const ref = direct(-6000, -6700, fwl, () => 1);
    expect(Math.abs(sw / ref - 1)).toBeLessThan(0.005);
  });

  it('a cone weights the deep, wet part by its larger area (and differs from a plain height mean: negative control)', () => {
    const h = areaDepthHypsometry(checkAreaDepthRows(coneRows).rows, { unitSystem: 'field' });
    const t = swHeightTable(shm, 2000);
    const sw = weightedSw(h, t.at, { fwlElev: fwl, baseElev: -6550, isField: true });
    const ref = direct(-6000, -6550, fwl, (d) => d * d);
    expect(Math.abs(sw / ref - 1)).toBeLessThan(0.005);
    const plain = direct(-6000, -6550, fwl, () => 1);
    expect(Math.abs(sw / plain - 1)).toBeGreaterThan(0.02);
  });

  it('the deterministic case takes Sw per leg and says so; STOIIP follows (1 - Sw)', () => {
    const inputs = { ...base, fluidType: 'oil', owc: -6550, areaDepth: { rows: coneRows }, swSource: 'shm', saturationHeight: { ...shm, fwl } };
    const typed = VolumeCalculationEngine.calculateDeterministic({ ...inputs, swSource: 'typed' }, 'field', 'areadepth');
    const shmRes = VolumeCalculationEngine.calculateDeterministic(inputs, 'field', 'areadepth');
    const swOil = shmRes.saturationHeight.swOil;
    expect(swOil).toBeGreaterThan(0.15);
    expect(swOil).toBeLessThan(1);
    expect(shmRes.stooip / typed.stooip).toBeCloseTo((1 - swOil) / (1 - base.sw), 6);
  });

  it('a gas cap and an oil leg each get their own Sw (higher in the oil leg, nearer the FWL)', () => {
    const inputs = { ...base, fluidType: 'oil_gas', goc: -6300, owc: -6550, areaDepth: { rows: coneRows }, swSource: 'shm', saturationHeight: { ...shm, fwl } };
    const r = VolumeCalculationEngine.calculateDeterministic(inputs, 'field', 'areadepth');
    expect(r.saturationHeight.swGas).toBeLessThan(r.saturationHeight.swOil);
  });

  it('the Simple method has no depths: the typed Sw is used and that is said', () => {
    const r = VolumeCalculationEngine.calculateDeterministic({ ...base, fluidType: 'oil', area: 1000, thickness: 50, swSource: 'shm', saturationHeight: { ...shm, fwl } }, 'field', 'simple');
    expect(r.saturationHeight).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/Saturation height needs depths/);
  });
});
