/**
 * Recovery Factor Estimator: validation gates (RF-U1-001, -002, -005 to -009;
 * practitioner lens PL1). Every gate CALLS the shipped engine
 * (src/utils/recoveryFactorCalculations.js); none restates the formula to
 * compare it with itself. What each gate can and cannot prove is written in
 * docs/upgrade/RecoveryFactorEstimator-UPGRADE.md, "Validation".
 *
 * Negative controls, run by hand on the pre-fix engine (origin/main
 * 8d16c9b27) and recorded in the upgrade doc: the API gates fail (34.8 and
 * 72.0 percent with k in md), the clamp gates fail (0.95 and 0.01 returned).
 */
import {
  apiSolutionGasDrive, apiSolutionGasDriveRF, apiWaterDrive, apiWaterDriveRF,
  gasPZDepletionRF, gasWaterDriveRF, stoiipVolumetric, ogipVolumetric,
  estimateRecovery, API_SOLUTION_GAS, API_WATER_DRIVE, MD_PER_DARCY, ANALOG_BAND_SOURCE,
  correlationInputFlags, volumetricInputFlags, sampleRecoveryData,
} from '../recoveryFactorCalculations';
import { bgRbPerScf } from '../../../packages/engines/engines/fluid/blackOil';
import { convert } from '@/lib/units/registry';

// The sample case of the app (sampleRecoveryData), hand-evaluated in the
// published form (k in darcies) with a calculator, factor by factor:
//   solution gas: 0.41815 x 0.71065 x 0.83911 x 0.62263 x 1.14101 = 0.17714
//   water drive:  0.54898 x 0.91500 x 0.82585 x 1.27411 x 0.80068 = 0.42320
const S = sampleRecoveryData().correlationInputs;

describe('API (Arps et al. 1967) solution-gas drive, k in darcies (RF-U1-001)', () => {
  test('the sample reads 17.71 percent; each factor of the product is the hand value', () => {
    const d = apiSolutionGasDrive(S);
    expect(d.rf).toBeCloseTo(0.17714, 4);
    expect(d.k_darcy).toBe(0.15);
    expect(d.terms.map((t) => +t.value.toFixed(5))).toEqual([0.71065, 0.83911, 0.62263, 1.14101]);
    // the factors close on the estimate to machine precision (RL2: the parts close on the total)
    expect(d.terms.reduce((a, t) => a * t.value, d.constant)).toBe(d.rf);
  });
  test('the published constant and exponents are the ones the engine uses', () => {
    expect(API_SOLUTION_GAS.constant).toBe(0.41815);
    expect(API_SOLUTION_GAS.exponents).toEqual({ storage: 0.1611, mobility: 0.0979, swi: 0.3722, pressure: 0.1741 });
    expect(MD_PER_DARCY).toBe(1000);
  });
  test('a darcy typed as 1000 md moves the estimate by exactly 1000^0.0979 over the md-basis error', () => {
    // the md defect: feeding 150 (md) where the equation wants 0.150 (darcy)
    // multiplies RF by 1000^0.0979 = 1.9666. The engine must not.
    const wrongBasis = apiSolutionGasDriveRF({ ...S, k: S.k * MD_PER_DARCY });
    expect(wrongBasis / apiSolutionGasDriveRF(S)).toBeCloseTo(Math.pow(1000, 0.0979), 10);
    expect(apiSolutionGasDriveRF(S)).not.toBeCloseTo(0.34836, 3);
  });
});

describe('API (Arps et al. 1967) water drive, k in darcies (RF-U1-001)', () => {
  test('the sample reads 42.32 percent; each factor is the hand value', () => {
    const d = apiWaterDrive(S);
    expect(d.rf).toBeCloseTo(0.42320, 4);
    expect(d.terms.map((t) => +t.value.toFixed(5))).toEqual([0.915, 0.82585, 1.27411, 0.80068]);
    expect(d.terms.reduce((a, t) => a * t.value, d.constant)).toBe(d.rf);
    expect(apiWaterDriveRF(S)).not.toBeCloseTo(0.72035, 3);
  });
  test('the published constant and exponents', () => {
    expect(API_WATER_DRIVE.constant).toBe(0.54898);
    expect(API_WATER_DRIVE.exponents).toEqual({ storage: 0.0422, mobility: 0.0770, swi: -0.1903, pressure: -0.2159 });
  });
});

describe('p/z depletion, exact for volumetric gas', () => {
  test('equals 1 - Bgi/Bga from the canonical fluid engine Bg at constant temperature', () => {
    for (const [pi, zi, pa, za] of [[4000, 0.9, 800, 0.95], [6411, 1.159, 1000, 0.9], [3250, 0.91, 500, 0.95]]) {
      const T = 200;
      const viaBg = 1 - bgRbPerScf(pi, T, zi) / bgRbPerScf(pa, T, za);
      expect(gasPZDepletionRF({ pi, zi, pa, za })).toBeCloseTo(viaBg, 12);
    }
  });
});

describe('water-drive gas (trapped gas)', () => {
  test('by volume bookkeeping of one reservoir cubic foot: gas left = swept x Sgr + unswept x (1 - Swi)', () => {
    const swi = 0.25; const sgr = 0.3; const sweep = 0.8;
    const initial = 1 - swi;
    const left = sweep * sgr + (1 - sweep) * initial;
    expect(gasWaterDriveRF({ swi, sgr, sweep })).toBeCloseTo((initial - left) / initial, 12);
  });
});

describe('no silent clamp (RF-U1-002)', () => {
  test('a correlation returns its value above 95 percent and the orchestrator reports it with a band flag', () => {
    // high-permeability, light oil, large pressure ratio: the equation exceeds 0.95
    const c = { ...S, k: 50000, muoi: 0.2, muwi: 1, pi: 4200, pa: 4100 };
    const raw = apiWaterDriveRF(c);
    expect(raw).toBeGreaterThan(0.95);
    expect(raw).toBeLessThan(1);
    const r = estimateRecovery({ method: 'api_water_drive', driveCode: 'water_drive', ooip: 1e6, correlationInputs: c });
    expect(r.rf).toBe(raw);
    expect(r.flags.map((f) => f.text).join(' ')).toMatch(/above the Water drive \(edge\/bottom\) analog band/);
  });
  test('a value at or below zero is withheld with its reason (was shown as 1 percent)', () => {
    const r = estimateRecovery({ method: 'gas_pz', driveCode: 'gas_volumetric', ooip: 1e9, correlationInputs: { pi: 1000, zi: 0.9, pa: 1500, za: 0.92 } });
    expect(r.rf).toBeNull();
    expect(r.reserves).toBeNull();
    expect(r.rfRaw).toBeLessThan(0);
    expect(r.withheld).toMatch(/outside 0 to 100 percent/);
    expect(r.flags.map((f) => f.key)).toContain('pa');
  });
});

describe('domain flags (RF-U1-004)', () => {
  test('abandonment above the bubble point, a percent porosity, Sgr above the gas saturation', () => {
    expect(correlationInputFlags('api_solution_gas', { ...S, pa: 3500 }).map((f) => f.key)).toEqual(['pa']);
    expect(correlationInputFlags('api_water_drive', { ...S, phi: 22 }).map((f) => f.key)).toEqual(['phi']);
    expect(correlationInputFlags('gas_water_drive', { swi: 0.3, sgr: 0.75, sweep: 0.8 }).map((f) => f.key)).toEqual(['sgr']);
    expect(correlationInputFlags('api_water_drive', S)).toEqual([]);
  });
  test('a correlation used under another drive is flagged', () => {
    const r = estimateRecovery({ method: 'api_solution_gas', driveCode: 'water_drive', ooip: 1e6, correlationInputs: S });
    expect(r.flags.find((f) => f.key === 'driveCode').text).toMatch(/derived for Solution-gas drive/);
  });
  test('a Bgi in ft3/scf is not flagged, a value in bbl/Mscf is', () => {
    expect(volumetricInputFlags({ area: 1, thickness: 1, phi: 0.2, sw: 0.3, ntg: 1, bgi: 0.0045 }, 'gas')).toEqual([]);
    expect(volumetricInputFlags({ area: 1, thickness: 1, phi: 0.2, sw: 0.3, ntg: 1, bgi: 0.8 }, 'gas').map((f) => f.key)).toEqual(['bgi']);
  });
});

describe('volumetric in-place', () => {
  test('7758 bbl per acre-ft is 43,560 ft3 over 5.6146 ft3/bbl, pinned through the unit registry', () => {
    const bblPerAcreFt = convert('liquidVolume', 43560 * 0.3048 ** 3, 'm3', 'bbl');
    expect(bblPerAcreFt).toBeCloseTo(7758.37, 2);
    // the engine's rounded constant is within 0.005 percent of it
    const ooip = stoiipVolumetric({ area: 1, thickness: 1, phi: 1, sw: 0, boi: 1, ntg: 1 });
    expect(Math.abs(ooip - bblPerAcreFt) / bblPerAcreFt).toBeLessThan(5e-5);
  });
  test('OGIP of one acre-ft at Bgi 1 ft3/scf is 43,560 scf', () => {
    expect(ogipVolumetric({ area: 1, thickness: 1, phi: 1, sw: 0, bgi: 1, ntg: 1 })).toBe(43560);
  });
});

test('the analog band source says it is not validated (RF-U1-003)', () => {
  expect(ANALOG_BAND_SOURCE).toMatch(/not checked against a published table/);
  expect(ANALOG_BAND_SOURCE).toMatch(/not P90 and P10/);
});

// RF-U2-010: water-drive gas with the swept volume abandoned at pa (Bga).
// The relation RF = 1 - (Bgi/Bga)[Ev Sgr/Sgi + (1 - Ev)] is gated by the
// shipped engine against three independent truths: the volume bookkeeping of
// the swept and unswept pore volumes at pa (computed here in reservoir volume
// with Bg from the canonical fluid engine), the maintained form at pa = pi,
// and the p/z depletion relation at Ev = 0.
describe('water-drive gas abandoned at pa (RF-U2-010)', () => {
  const base = { swi: 0.25, sgr: 0.3, sweep: 0.7, pi: 4000, zi: 0.9, pa: 1500, za: 0.88 };
  test('equals the volume bookkeeping in scf (Bg from the canonical fluid engine)', () => {
    const { swi, sgr, sweep, pi, zi, pa, za } = base;
    const T = 200; const pv = 1e6; // reservoir bbl
    const bgi = bgRbPerScf(pi, T, zi); const bga = bgRbPerScf(pa, T, za);
    const G = pv * (1 - swi) / bgi;
    const left = pv * sweep * sgr / bga + pv * (1 - sweep) * (1 - swi) / bga;
    expect(gasWaterDriveRF({ ...base, gwdMode: 'abandonment' })).toBeCloseTo((G - left) / G, 12);
  });
  test('reduces to the maintained form at pa = pi, and to p/z at Ev = 0', () => {
    const atPi = gasWaterDriveRF({ ...base, gwdMode: 'abandonment', pa: base.pi, za: base.zi });
    expect(atPi).toBeCloseTo(gasWaterDriveRF({ swi: base.swi, sgr: base.sgr, sweep: base.sweep }), 14);
    const noSweep = gasWaterDriveRF({ ...base, gwdMode: 'abandonment', sweep: 0 });
    expect(noSweep).toBeCloseTo(gasPZDepletionRF(base), 14);
  });
  test('abandoning at pa recovers more than at the initial pressure; the default mode is unchanged', () => {
    expect(gasWaterDriveRF({ ...base, gwdMode: 'abandonment' })).toBeGreaterThan(gasWaterDriveRF(base));
    expect(gasWaterDriveRF(base)).toBe(base.sweep * (1 - base.sgr / (1 - base.swi)));
    // negative control: without pa the abandonment mode cannot run, and says so
    expect(gasWaterDriveRF({ ...base, gwdMode: 'abandonment', pa: '' })).toBeNull();
    expect(correlationInputFlags('gas_water_drive', { ...base, gwdMode: 'abandonment', pa: '' }).map((f) => f.key)).toContain('pa');
    expect(correlationInputFlags('gas_water_drive', { ...base, gwdMode: 'abandonment', pa: 5000 }).map((f) => f.text).join(' ')).toMatch(/not below the initial pressure/);
  });
});
