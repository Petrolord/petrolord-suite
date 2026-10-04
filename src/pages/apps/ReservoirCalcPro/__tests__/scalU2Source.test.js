// SCAL-U2-009: the ReservoirCalc Pro report prints the kr-1 source of the
// saturation height its Sw came from, in the Source column of the Sw row.
import { VolumeCalculationEngine } from '../services/VolumeCalculationEngine';
import { deterministicInputRows } from '../services/reportInfo';
import { SCAL_SAMPLE } from '../services/rcpBackend';
import { shmFromScalProject } from '@/pages/apps/PetrophysicsStudio/services/saturationHeight';

const shm = shmFromScalProject(SCAL_SAMPLE);
const base = { ntg: 1, porosity: 0.2, sw: 0.3, fvf: 1.25, bg: 0.005, recovery: 30, recoveryGas: 70 };
const fwl = -6758.53;
// the cone of upgradeU2Hydrocarbons.test.js: Sw from saturation height applies with Area-depth
const coneRows = Array.from({ length: 61 }, (_, k) => ({ depth: -6000 - 10 * k, areaTop: (Math.PI * (10 * 10 * k) ** 2) / 43560, areaBase: null }));
const shmCase = (sh) => VolumeCalculationEngine.calculateDeterministic({ ...base, fluidType: 'oil', owc: -6550, areaDepth: { rows: coneRows }, swSource: 'shm', saturationHeight: sh }, 'field', 'areadepth');

test('Sw from saturation height: the Sw row names the SCAL source', () => {
  const r = shmCase({ ...shm, fwl });
  expect(r.inputs.swSource).toBe('saturation height');
  expect(r.saturationHeight.source).toBe(shm.sourceText);
  const sw = deterministicInputRows({ inputs: r.inputs, fluidType: 'oil' }).find((row) => row[0] === 'Water saturation (Sw)');
  expect(sw[3]).toBe(`Saturation height, averaged over the leg; SCAL source: ${shm.sourceText}`);
});

test('a saturation height picked before the source was stored says so', () => {
  const { sourceText, ...old } = shm;
  const r = shmCase({ ...old, fwl });
  const sw = deterministicInputRows({ inputs: r.inputs, fluidType: 'oil' }).find((row) => row[0] === 'Water saturation (Sw)');
  expect(sw[3]).toMatch(/SCAL source: not stored with this case; pick the SCAL project again to record it/);
});

test('negative control: a typed Sw keeps its own source', () => {
  const r = VolumeCalculationEngine.calculateDeterministic({ ...base, fluidType: 'oil', owc: -6550, areaDepth: { rows: coneRows } }, 'field', 'areadepth');
  const sw = deterministicInputRows({ inputs: r.inputs, fluidType: 'oil' }).find((row) => row[0] === 'Water saturation (Sw)');
  expect(sw[3]).toBe('Entered, source not stated');
});
