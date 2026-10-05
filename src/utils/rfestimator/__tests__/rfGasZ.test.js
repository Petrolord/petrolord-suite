/**
 * RF-U2-003: gas z and Bgi from the canonical engines (Dranchuk-Abou-Kassem
 * on Sutton pseudo-criticals). Every gate runs the app path (deriveRf ->
 * rfGasZ -> gasZDetail of packages/engines) and compares with published
 * truth: Standing-Katz chart readings (packages/engines/test-data/fluid/
 * standingKatzChart.json, digitised from Standing and Katz 1942) and the
 * textbook Bg = 0.02827 z T / p ft3/scf.
 *
 * Negative control: the temperature fed in degC where degF is expected
 * moves z outside the chart tolerance at the same points (the gate can see a
 * unit error); the typed method leaves the typed values in place.
 */
import fs from 'fs';
import path from 'path';
import { deriveRf } from '../workspace';
import { sampleInputs, inputsFromPayload, zKeptNote } from '../model';
import { rfGasZ, Z_METHOD_DAK, Z_KEPT_NOTE } from '../gasZ';
import { suttonPseudoCriticals, GAS_Z_METHODS } from '../../../../packages/engines/engines/fluid/blackOil';
import { gasPayload, reportOf } from './rfTestKit';

const chart = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'packages', 'engines', 'test-data', 'fluid', 'standingKatzChart.json'), 'utf8'));
const SG = 0.65;
const { ppc, tpc } = suttonPseudoCriticals(SG);
const gasCase = (o = {}) => ({ ...sampleInputs(), phase: 'gas', method: 'gas_pz', driveCode: 'gas_volumetric', zMethod: Z_METHOD_DAK, ...o, corr: { ...sampleInputs().corr, gasGravity: String(SG), ...(o.corr || {}) } });
// chart points inside the window where the method was checked (Tpr 1.2 to 3, Ppr 0.2 to 15)
const W = GAS_Z_METHODS.dranchuk_abou_kassem;
const points = chart.points.filter(([tpr, ppr]) => [1.3, 1.5, 1.7, 2.0].includes(tpr) && ppr >= 1 && ppr <= 8);

describe('z by Dranchuk-Abou-Kassem through the app (RF-U2-003)', () => {
  test(`zi read by the estimator holds the Standing-Katz chart within ${W.chartError * 100} percent (${points.length} readings)`, () => {
    expect(points.length).toBeGreaterThan(12);
    for (const [tpr, ppr, z] of points) {
      const tempF = tpr * tpc - 459.67;
      const d = deriveRf(gasCase({ corr: { pi: String(ppr * ppc), tempF: String(tempF), pa: '500' } }));
      expect(d.gasZ.ok).toBe(true);
      const used = Number(d.inputsUsed.corr.zi);
      expect(Math.abs(used - z) / z).toBeLessThan(W.chartError);
    }
  });

  test('negative control: the temperature in degC where degF is expected misses the chart', () => {
    let misses = 0;
    for (const [tpr, ppr, z] of points) {
      const tempC = ((tpr * tpc - 459.67) - 32) / 1.8;
      const d = deriveRf(gasCase({ corr: { pi: String(ppr * ppc), tempF: String(tempC) } }));
      if (Math.abs(Number(d.inputsUsed.corr.zi) - z) / z > W.chartError) misses += 1;
    }
    expect(misses).toBeGreaterThan(points.length / 2);
  });

  test('Bgi is the textbook 0.02827 z T / p ft3/scf at pi (within 0.01 percent)', () => {
    const d = deriveRf(gasCase());
    const { zi } = d.gasZ;
    const book = (0.02827 * zi.z * (180 + 459.67)) / 4200;
    expect(Math.abs(d.gasZ.bgi - book) / book).toBeLessThan(1e-4);
    expect(Number(d.inputsUsed.vol.bgi)).toBe(d.gasZ.bgi);
  });

  test('before and after on the gas sample (pi 4,200, pa 1,500 psia, gravity 0.65, 180 degF)', () => {
    const before = deriveRf(gasCase({ zMethod: 'typed' }));
    const after = deriveRf(gasCase());
    // typed: zi 0.92, za 0.95, Bgi 0.005 ft3/scf
    expect(before.result.rf).toBeCloseTo(0.654135, 6);
    expect(before.inPlace / 1e9).toBeCloseTo(63.3411, 4);
    expect(after.gasZ.zi.z).toBeCloseTo(0.94360, 5);
    expect(after.gasZ.za.z).toBeCloseTo(0.89675, 5);
    expect(after.gasZ.bgi).toBeCloseTo(0.0040627, 7);
    expect(after.result.rf).toBeCloseTo(0.624198, 6);
    expect(after.inPlace / 1e9).toBeCloseTo(77.9546, 4);
    // the recovery factor is the p/z relation of the z values used
    const c = after.inputsUsed.corr;
    expect(after.result.rf).toBeCloseTo(1 - (1500 / Number(c.za)) / (4200 / Number(c.zi)), 12);
  });

  test('outside the chart window or the Sutton gravity range is flagged; missing inputs say so', () => {
    const near = deriveRf(gasCase({ corr: { gasGravity: '1.9', tempF: '60' } }));
    expect(near.flags.map((f) => f.text).join(' ')).toMatch(/outside 0.57 to 1.68/);
    expect(near.flags.map((f) => f.text).join(' ')).toMatch(/reduced temperature Tpr/);
    const blank = deriveRf(gasCase({ corr: { gasGravity: '' } }));
    expect(blank.gasZ.ok).toBe(false);
    expect(blank.flags.map((f) => f.text).join(' ')).toMatch(/Gas gravity is blank/);
    expect(rfGasZ({ ...gasCase(), phase: 'oil' })).toBeNull();
  });

  test('a saved project keeps its typed z with a note; a new case opens on Dranchuk-Abou-Kassem', () => {
    const saved = { payloadVersion: 2, inputs: { ...gasPayload().inputs, zMethod: undefined } };
    const inputs = inputsFromPayload(saved);
    expect(inputs.zMethod).toBe('typed');
    expect(zKeptNote(saved)).toBe(Z_KEPT_NOTE);
    expect(Number(deriveRf(inputs).inputsUsed.corr.zi)).toBe(0.9);
    expect(sampleInputs().zMethod).toBe(Z_METHOD_DAK);
    expect(zKeptNote({ inputs: sampleInputs() })).toBeNull();
    expect(zKeptNote({ inputs: { phase: 'oil' } })).toBeNull();
  });

  test('the report prints the computed z with its source, gravity and temperature, and the completeness guard holds', async () => {
    const p = gasPayload();
    p.inputs = { ...p.inputs, zMethod: Z_METHOD_DAK, corr: { ...p.inputs.corr, gasGravity: '0.65', tempF: '180' } };
    const r = reportOf(p);
    const rows = Object.fromEntries(r.model.inputs.rows.map((x) => [x.key, x]));
    expect(rows['corr.zi'].source).toMatch(/^Computed \(z at pi\): Dranchuk and Abou-Kassem \(1975\)/);
    expect(rows['vol.bgi'].source).toMatch(/^Computed \(Bgi at pi\)/);
    expect(rows['corr.gasGravity'].value).toBe('0.65');
    expect(rows['corr.tempF'].unit).toBe('degF');
    const { missingInputRows } = await import('@/lib/reportKit/completeness');
    expect(missingInputRows(r.model.engineInput, r.model.inputs.rows)).toEqual([]);
    expect(missingInputRows(r.model.engineInput, r.model.inputs.rows.filter((x) => x.key !== 'corr.tempF'))).toEqual(['gasZ.tempF']);
    expect(r.model.basis.find((b) => b[0] === 'Gas z factor and Bgi')[1]).toMatch(/Dranchuk-Abou-Kassem from gas gravity and temperature/);
  });
});
