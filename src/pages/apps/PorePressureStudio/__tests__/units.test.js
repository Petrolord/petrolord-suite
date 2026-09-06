import {
  readUnits, depthToDisplay, pressureToDisplay, pressureFromDisplay, emwPpg, emwReferenceDepthM, emwDatumLabel,
  fmtPressure, slownessToDisplay, compactionToDisplay, densityToDisplay, densityFromDisplay, densityUnit, prognosisCsv,
  PPG_PER_SG,
} from '../services/units';
import { PA_PER_PSI, M_PER_FT } from '../engine/constants';

test('pressure converts to psi and to EMW at a reference depth, and back', () => {
  expect(pressureToDisplay(10e6, 'MPa')).toBe(10);
  expect(pressureToDisplay(10e6, 'psi')).toBeCloseTo(10e6 / PA_PER_PSI, 6);
  // 10 MPa at 1000 m below datum: psi / (0.052 x ft)
  const ppg = (10e6 / PA_PER_PSI) / (0.052 * (1000 / M_PER_FT));
  expect(pressureToDisplay(10e6, 'ppg', 1000)).toBeCloseTo(ppg, 9);
  expect(pressureToDisplay(10e6, 'sg', 1000)).toBeCloseTo(ppg / PPG_PER_SG, 9);
  expect(pressureFromDisplay(ppg, 'ppg', 1000)).toBeCloseTo(10e6, 3);
  expect(pressureFromDisplay(ppg / PPG_PER_SG, 'sg', 1000)).toBeCloseTo(10e6, 3);
  expect(Number.isNaN(emwPpg(10e6, 0))).toBe(true); // no depth, no EMW
  expect(fmtPressure(10e6, 'sg', 1000)).toBe((ppg / PPG_PER_SG).toFixed(3));
  // hydrostatic seawater reads about 8.55 ppg whatever the depth
  const hydro = 1025 * 9.80665 * 2000;
  expect(emwPpg(hydro, 2000)).toBeCloseTo(8.55, 1);
});

test('the EMW datum is the rotary table when the mudline MD is set, else sea level', () => {
  expect(emwReferenceDepthM(3500, { mudlineMdM: 0, waterDepthM: 100 })).toBe(3600);
  expect(emwDatumLabel({ mudlineMdM: 0, waterDepthM: 100 })).toBe('sea level');
  expect(emwReferenceDepthM(3500, { mudlineMdM: 125, waterDepthM: 100 })).toBe(3625);
  expect(emwDatumLabel({ mudlineMdM: 125 })).toBe('RKB');
});

test('sonic, compaction and density follow the depth and pressure units', () => {
  expect(slownessToDisplay(656, 'ft')).toBeCloseTo(656 * M_PER_FT, 9);
  expect(compactionToDisplay(6e-4, 'ft')).toBeCloseTo(6e-4 * M_PER_FT, 12);
  expect(densityUnit('MPa')).toBe('kg/m3');
  expect(densityToDisplay(1025, 'ppg')).toBeCloseTo(1.025 * PPG_PER_SG, 9);
  expect(densityToDisplay(1025, 'sg')).toBe(1.025);
  expect(densityFromDisplay(8.6, 'psi')).toBeCloseTo((8.6 / PPG_PER_SG) * 1000, 9);
  expect(depthToDisplay(304.8, 'ft')).toBeCloseTo(1000, 9);
  expect(readUnits({ getItem: () => JSON.stringify({ pressure: 'bogus', depth: 'm' }) })).toEqual({ pressure: 'MPa', depth: 'm' });
});

test('prognosisCsv carries the display units, the EMW columns and the datum', () => {
  const input = { zBmlM: [1000, 2000] };
  const result = {
    overburdenPa: [20e6, 42e6], hydrostaticPa: [11e6, 21e6], porePressurePa: [11e6, 25e6], fracPressurePa: [17e6, 36e6],
  };
  const params = { method: 'eaton', eatonN: 3, nu: 0.4, nct: { dtMlUsPerM: 656, dtMaUsPerM: 220, cPerM: 6e-4 }, waterDepthM: 100, mudlineMdM: 0 };
  const csv = prognosisCsv(input, result, params, { pressure: 'psi', depth: 'ft' }, { source: 'ORACLE PP-1' });
  const lines = csv.trim().split('\n');
  expect(lines[1]).toContain('method: eaton n=3');
  expect(lines[3]).toContain('EMW datum: sea level');
  expect(lines[4]).toBe('Depth bml (ft),Depth below sea level (ft),OBG (psi),Ph (psi),PP (psi),FP (psi),OBG EMW (ppg),PP EMW (ppg),FP EMW (ppg),PP EMW (sg),FP EMW (sg)');
  const row = lines[5].split(',');
  expect(Number(row[0])).toBeCloseTo(1000 / M_PER_FT, 2);
  expect(Number(row[1])).toBeCloseTo(1100 / M_PER_FT, 2);
  expect(row[4]).toBe((11e6 / PA_PER_PSI).toFixed(0));
  expect(Number(row[7])).toBeCloseTo(emwPpg(11e6, 1100), 2);
  expect(lines).toHaveLength(7);
});
